import { Injectable } from '@nestjs/common';
import { Prisma, Role, TaskStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type Actor = { userId: string; role: Role };

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  private siteFilter(actor: Actor): Prisma.SiteWhereInput {
    const global = actor.role === Role.ADMIN || actor.role === Role.DIRECTEUR_PROJET;
    return global ? {} : { members: { some: { userId: actor.userId } } };
  }

  async getAlerts(actor: Actor) {
    const filter = this.siteFilter(actor);
    const now = new Date();

    const sites = await this.prisma.site.findMany({
      where: { ...filter, status: 'ACTIVE' },
      select: { id: true, name: true, reference: true },
    });

    if (sites.length === 0) return [];

    const siteIds = sites.map((s) => s.id);
    const siteMap = new Map(sites.map((s) => [s.id, s]));

    const [lateTasksRaw, situBrouillon, tsBrouillon] = await Promise.all([
      this.prisma.task.findMany({
        where: {
          lot: { siteId: { in: siteIds } },
          status: { not: 'DONE' },
          endDate: { lt: now },
        },
        select: { lot: { select: { siteId: true } } },
      }),
      this.prisma.situation.groupBy({
        by: ['siteId'],
        where: { siteId: { in: siteIds }, status: 'BROUILLON' },
        _count: { id: true },
      }),
      this.prisma.travauxSupp.groupBy({
        by: ['siteId'],
        where: { siteId: { in: siteIds }, status: 'BROUILLON' },
        _count: { id: true },
      }),
    ]);

    const lateTasksBySite = new Map<string, number>();
    for (const t of lateTasksRaw) {
      const sid = t.lot.siteId;
      lateTasksBySite.set(sid, (lateTasksBySite.get(sid) ?? 0) + 1);
    }

    const alerts: Array<{
      type: string;
      severity: string;
      siteId: string;
      siteName: string;
      siteReference: string;
      count: number;
    }> = [];

    for (const [siteId, count] of lateTasksBySite) {
      const site = siteMap.get(siteId);
      if (!site) continue;
      alerts.push({
        type: 'TASKS_LATE',
        severity: 'WARNING',
        siteId,
        siteName: site.name,
        siteReference: site.reference,
        count,
      });
    }

    for (const g of situBrouillon) {
      const site = siteMap.get(g.siteId);
      if (!site) continue;
      alerts.push({
        type: 'SITUATION_BROUILLON',
        severity: 'INFO',
        siteId: g.siteId,
        siteName: site.name,
        siteReference: site.reference,
        count: g._count.id,
      });
    }

    for (const g of tsBrouillon) {
      const site = siteMap.get(g.siteId);
      if (!site) continue;
      alerts.push({
        type: 'TS_BROUILLON',
        severity: 'INFO',
        siteId: g.siteId,
        siteName: site.name,
        siteReference: site.reference,
        count: g._count.id,
      });
    }

    alerts.sort((a, b) => (a.severity === 'WARNING' ? -1 : 1) - (b.severity === 'WARNING' ? -1 : 1));

    return alerts;
  }

  async getPlanningGlobal(actor: Actor) {
    const now = new Date();
    const filter = this.siteFilter(actor);

    const sites = await this.prisma.site.findMany({
      where: { ...filter, status: 'ACTIVE' },
      select: {
        id: true,
        name: true,
        reference: true,
        lots: {
          orderBy: [{ position: 'asc' }, { code: 'asc' }],
          select: {
            id: true,
            code: true,
            name: true,
            startDate: true,
            endDate: true,
            tasks: {
              orderBy: [{ position: 'asc' }],
              select: {
                id: true,
                name: true,
                status: true,
                progressPct: true,
                startDate: true,
                endDate: true,
                weight: true,
                position: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return sites.map((s) => ({
      siteId: s.id,
      siteName: s.name,
      siteReference: s.reference,
      lots: s.lots.map((l) => ({
        id: l.id,
        code: l.code,
        name: l.name,
        startDate: l.startDate,
        endDate: l.endDate,
        tasks: l.tasks.map((t) => {
          const enRetard =
            t.status !== TaskStatus.DONE &&
            t.endDate !== null &&
            t.endDate < now;
          return {
            id: t.id,
            name: t.name,
            status: t.status,
            progressPct: t.progressPct,
            startDate: t.startDate,
            endDate: t.endDate,
            enRetard,
          };
        }),
      })),
    }));
  }

  async getFinanceGlobal(actor: Actor) {
    const sites = await this.prisma.site.findMany({
      where: this.siteFilter(actor),
      select: {
        id: true,
        name: true,
        reference: true,
        status: true,
        marcheHt: true,
        tvaRate: true,
        tauxRg: true,
        avanceForfaitaire: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (sites.length === 0) {
      return {
        totalBudgetHt: 0,
        totalHtCumul: 0,
        pctEngagement: 0,
        totalRgRetenu: 0,
        totalNetEnAttente: 0,
        totalTsApprouveHt: 0,
        totalSituationsBrouillon: 0,
        parSite: [],
      };
    }

    const siteIds = sites.map((s) => s.id);

    const [situations, tsGroups] = await Promise.all([
      this.prisma.situation.findMany({
        where: { siteId: { in: siteIds } },
        include: {
          lignes: {
            include: { lot: { select: { montantMarcheHt: true } } },
          },
        },
        orderBy: { numero: 'desc' },
      }),
      this.prisma.travauxSupp.groupBy({
        by: ['siteId'],
        where: { siteId: { in: siteIds }, status: { not: 'BROUILLON' } },
        _sum: { montantHt: true },
      }),
    ]);

    const tsBySite = new Map(
      tsGroups.map((g) => [g.siteId, Number(g._sum.montantHt ?? 0)]),
    );

    const parSite = sites.map((site) => {
      const all = situations.filter((s) => s.siteId === site.id);
      const validated = all.filter((s) => s.status === 'VALIDEE' || s.status === 'PAYEE');
      const brouillonCount = all.filter((s) => s.status === 'BROUILLON').length;
      const latestSit = validated[0] ?? null;

      const tvaRate = site.tvaRate.toNumber();
      const tauxRg = site.tauxRg.toNumber();
      const marcheHt = Number(site.marcheHt);

      let htCumul = 0;
      let montantRg = 0;
      let deductionAvance = 0;
      let netAPayer = 0;
      let totalTtc = 0;
      let lastNum: number | null = null;
      let lastPeriode: string | null = null;
      let lastStatus: string | null = null;

      if (latestSit) {
        htCumul = +(
          latestSit.lignes.reduce(
            (sum, l) =>
              sum + Number(l.avancementCumul) * Number(l.lot.montantMarcheHt),
            0,
          ) / 100
        ).toFixed(2);
        const totalTva = htCumul * tvaRate;
        totalTtc = htCumul + totalTva;
        montantRg = totalTtc * tauxRg;
        deductionAvance = Number(latestSit.deductionAvance);
        netAPayer = Math.max(0, totalTtc - montantRg - deductionAvance);
        lastNum = latestSit.numero;
        lastPeriode = latestSit.periode;
        lastStatus = latestSit.status;
      }

      const tsHt = tsBySite.get(site.id) ?? 0;

      return {
        siteId: site.id,
        siteName: site.name,
        siteReference: site.reference,
        siteStatus: site.status,
        marcheHt,
        tvaRate,
        tauxRg,
        htCumul,
        pctAvancement: marcheHt > 0 ? +((htCumul / marcheHt) * 100).toFixed(1) : 0,
        montantRg,
        netAPayer,
        totalTtc,
        lastSituationNumero: lastNum,
        lastSituationPeriode: lastPeriode,
        lastSituationStatus: lastStatus,
        situationsBrouillon: brouillonCount,
        tsApprouveHt: tsHt,
      };
    });

    const totalBudgetHt = parSite.reduce((a, s) => a + s.marcheHt, 0);
    const totalHtCumul = parSite.reduce((a, s) => a + s.htCumul, 0);
    const totalRgRetenu = parSite.reduce((a, s) => a + s.montantRg, 0);
    const totalNetEnAttente = parSite
      .filter((s) => s.lastSituationStatus === 'VALIDEE')
      .reduce((a, s) => a + s.netAPayer, 0);
    const totalTsHt = parSite.reduce((a, s) => a + s.tsApprouveHt, 0);
    const totalBrouillon = parSite.reduce((a, s) => a + s.situationsBrouillon, 0);

    return {
      totalBudgetHt,
      totalHtCumul,
      pctEngagement:
        totalBudgetHt > 0 ? +((totalHtCumul / totalBudgetHt) * 100).toFixed(1) : 0,
      totalRgRetenu,
      totalNetEnAttente,
      totalTsApprouveHt: totalTsHt,
      totalSituationsBrouillon: totalBrouillon,
      parSite,
    };
  }
}
