import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { ContratSTStatus, Role, SituationSTStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SitesService } from '../sites/sites.service';
import { CreateSousTraitantDto } from './dto/create-sous-traitant.dto';
import { UpdateSousTraitantDto } from './dto/update-sous-traitant.dto';
import { CreateContratSTDto } from './dto/create-contrat-st.dto';
import { UpdateContratSTDto } from './dto/update-contrat-st.dto';
import { CreateSituationSTDto } from './dto/create-situation-st.dto';
import { UpdateSituationSTDto } from './dto/update-situation-st.dto';

const WRITER_ROLES: Role[] = [
  Role.ADMIN,
  Role.DIRECTEUR_PROJET,
  Role.DIRECTEUR_TRAVAUX,
];

type Actor = { userId: string; role: Role };

function bigToNum(v: bigint): number {
  return Number(v);
}
function decToNum(v: Decimal): number {
  return Number(v.toString());
}

type SituationSTRow = {
  id: string;
  contratId: string;
  siteId: string;
  numero: number;
  periode: string;
  dateEmission: Date;
  status: SituationSTStatus;
  montantHtPeriode: bigint;
  deductionAvance: bigint;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type ContratSTRow = {
  id: string;
  siteId: string;
  sousTraitantId: string;
  lotId: string | null;
  reference: string;
  intitule: string;
  montantHt: bigint;
  tvaRate: Decimal;
  tauxRg: Decimal;
  avanceForfaitaire: bigint;
  status: ContratSTStatus;
  startDate: Date | null;
  endDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
  lot: { code: string; name: string } | null;
  situations: SituationSTRow[];
};

@Injectable()
export class SousTraitanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sites: SitesService,
  ) {}

  private canWrite(actor: Actor) {
    if (!WRITER_ROLES.includes(actor.role))
      throw new ForbiddenException('Droits insuffisants');
  }

  /* ── Mapper situation ST ─────────────────────────────────────────── */
  private mapSituationST(st: SituationSTRow, contrat: ContratSTRow) {
    const tauxRg = decToNum(contrat.tauxRg);
    const tvaRate = decToNum(contrat.tvaRate);
    const montantHtPeriode = bigToNum(st.montantHtPeriode);
    const deductionAvance = bigToNum(st.deductionAvance);

    const rgHt = Math.round(montantHtPeriode * tauxRg);
    const totalHtva = Math.max(0, montantHtPeriode - rgHt - deductionAvance);
    const tvaAmount = Math.round(totalHtva * tvaRate);
    const totalTtc = totalHtva + tvaAmount;

    return {
      id: st.id,
      contratId: st.contratId,
      siteId: st.siteId,
      numero: st.numero,
      periode: st.periode,
      dateEmission: st.dateEmission,
      status: st.status,
      notes: st.notes,
      createdAt: st.createdAt,
      updatedAt: st.updatedAt,
      montantHtPeriode,
      rgHt,
      deductionAvance,
      totalHtva,
      tvaAmount,
      totalTtc,
      netAPayer: totalTtc,
    };
  }

  /* ── Mapper contrat ST ───────────────────────────────────────────── */
  private mapContratST(c: ContratSTRow) {
    const montantHt = bigToNum(c.montantHt);
    const avanceForfaitaire = bigToNum(c.avanceForfaitaire);
    const tauxRg = decToNum(c.tauxRg);
    const tvaRate = decToNum(c.tvaRate);

    const situations = c.situations.map((s) => this.mapSituationST(s, c));

    const montantHtCumul = situations.reduce((a, s) => a + s.montantHtPeriode, 0);
    const pctAvancement = montantHt > 0 ? (montantHtCumul / montantHt) * 100 : 0;

    const totalRgRetenu = situations
      .filter((s) => s.status !== SituationSTStatus.BROUILLON)
      .reduce((a, s) => a + s.rgHt, 0);
    const totalPaye = situations
      .filter((s) => s.status === SituationSTStatus.PAYEE)
      .reduce((a, s) => a + s.netAPayer, 0);
    const totalARecouvrer = situations
      .filter((s) => s.status === SituationSTStatus.VALIDEE)
      .reduce((a, s) => a + s.netAPayer, 0);
    const totalDeductionAvance = situations
      .filter((s) => s.status !== SituationSTStatus.BROUILLON)
      .reduce((a, s) => a + s.deductionAvance, 0);
    const avanceRestante = avanceForfaitaire - totalDeductionAvance;

    return {
      id: c.id,
      siteId: c.siteId,
      sousTraitantId: c.sousTraitantId,
      lotId: c.lotId,
      lotCode: c.lot?.code ?? null,
      lotName: c.lot?.name ?? null,
      reference: c.reference,
      intitule: c.intitule,
      montantHt,
      tvaRate,
      tauxRg,
      avanceForfaitaire,
      avanceRestante,
      status: c.status,
      startDate: c.startDate,
      endDate: c.endDate,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      montantHtCumul,
      pctAvancement,
      totalRgRetenu,
      totalPaye,
      totalARecouvrer,
      situations,
    };
  }

  private contratInclude = {
    lot: { select: { code: true, name: true } },
    situations: { orderBy: { numero: 'asc' as const } },
  };

  /* ── Sous-traitants ──────────────────────────────────────────────── */

  async listSousTraitants(siteId: string, actor: Actor) {
    await this.sites.assertCanAccess(siteId, actor);
    const sts = await this.prisma.sousTraitant.findMany({
      where: { siteId },
      orderBy: { nom: 'asc' },
      include: {
        contrats: {
          orderBy: { createdAt: 'asc' },
          include: this.contratInclude,
        },
      },
    });
    return sts.map((st) => ({
      id: st.id,
      siteId: st.siteId,
      nom: st.nom,
      contact: st.contact,
      createdAt: st.createdAt,
      updatedAt: st.updatedAt,
      contrats: st.contrats.map((c) => this.mapContratST(c)),
    }));
  }

  async createSousTraitant(siteId: string, dto: CreateSousTraitantDto, actor: Actor) {
    await this.sites.assertCanAccess(siteId, actor);
    this.canWrite(actor);
    return this.prisma.sousTraitant.create({
      data: { siteId, nom: dto.nom, contact: dto.contact },
    });
  }

  async updateSousTraitant(
    siteId: string,
    stId: string,
    dto: UpdateSousTraitantDto,
    actor: Actor,
  ) {
    await this.sites.assertCanAccess(siteId, actor);
    this.canWrite(actor);
    const st = await this.prisma.sousTraitant.findFirst({ where: { id: stId, siteId } });
    if (!st) throw new NotFoundException('Sous-traitant introuvable');
    return this.prisma.sousTraitant.update({
      where: { id: stId },
      data: { nom: dto.nom, contact: dto.contact },
    });
  }

  async deleteSousTraitant(siteId: string, stId: string, actor: Actor) {
    await this.sites.assertCanAccess(siteId, actor);
    this.canWrite(actor);
    const st = await this.prisma.sousTraitant.findFirst({
      where: { id: stId, siteId },
      include: { contrats: { select: { id: true } } },
    });
    if (!st) throw new NotFoundException('Sous-traitant introuvable');
    if (st.contrats.length > 0)
      throw new BadRequestException('Supprimez les contrats avant de supprimer le sous-traitant');
    await this.prisma.sousTraitant.delete({ where: { id: stId } });
  }

  /* ── Contrats ST ─────────────────────────────────────────────────── */

  async createContrat(siteId: string, dto: CreateContratSTDto, actor: Actor) {
    await this.sites.assertCanAccess(siteId, actor);
    this.canWrite(actor);

    const st = await this.prisma.sousTraitant.findFirst({
      where: { id: dto.sousTraitantId, siteId },
    });
    if (!st) throw new NotFoundException('Sous-traitant introuvable');

    if (dto.lotId) {
      const lot = await this.prisma.lot.findFirst({ where: { id: dto.lotId, siteId } });
      if (!lot) throw new NotFoundException('Lot introuvable');
    }

    const contrat = await this.prisma.contratST.create({
      data: {
        siteId,
        sousTraitantId: dto.sousTraitantId,
        lotId: dto.lotId ?? null,
        reference: dto.reference,
        intitule: dto.intitule,
        montantHt: BigInt(Math.round(dto.montantHt)),
        tvaRate: dto.tvaRate !== undefined ? new Decimal(dto.tvaRate) : undefined,
        tauxRg: dto.tauxRg !== undefined ? new Decimal(dto.tauxRg) : undefined,
        avanceForfaitaire:
          dto.avanceForfaitaire !== undefined
            ? BigInt(Math.round(dto.avanceForfaitaire))
            : undefined,
        status: (dto.status as ContratSTStatus) ?? undefined,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
      },
      include: this.contratInclude,
    });

    return this.mapContratST(contrat);
  }

  async updateContrat(
    siteId: string,
    contratId: string,
    dto: UpdateContratSTDto,
    actor: Actor,
  ) {
    await this.sites.assertCanAccess(siteId, actor);
    this.canWrite(actor);

    const contrat = await this.prisma.contratST.findFirst({
      where: { id: contratId, siteId },
    });
    if (!contrat) throw new NotFoundException('Contrat introuvable');

    if (dto.lotId !== undefined && dto.lotId !== null) {
      const lot = await this.prisma.lot.findFirst({ where: { id: dto.lotId, siteId } });
      if (!lot) throw new NotFoundException('Lot introuvable');
    }

    const data: Parameters<typeof this.prisma.contratST.update>[0]['data'] = {};
    if (dto.lotId !== undefined) data.lotId = dto.lotId;
    if (dto.reference !== undefined) data.reference = dto.reference;
    if (dto.intitule !== undefined) data.intitule = dto.intitule;
    if (dto.montantHt !== undefined) data.montantHt = BigInt(Math.round(dto.montantHt));
    if (dto.tvaRate !== undefined) data.tvaRate = new Decimal(dto.tvaRate);
    if (dto.tauxRg !== undefined) data.tauxRg = new Decimal(dto.tauxRg);
    if (dto.avanceForfaitaire !== undefined)
      data.avanceForfaitaire = BigInt(Math.round(dto.avanceForfaitaire));
    if (dto.status !== undefined) data.status = dto.status as ContratSTStatus;
    if (dto.startDate !== undefined) data.startDate = dto.startDate ? new Date(dto.startDate) : null;
    if (dto.endDate !== undefined) data.endDate = dto.endDate ? new Date(dto.endDate) : null;

    const updated = await this.prisma.contratST.update({
      where: { id: contratId },
      data,
      include: this.contratInclude,
    });

    return this.mapContratST(updated);
  }

  async deleteContrat(siteId: string, contratId: string, actor: Actor) {
    await this.sites.assertCanAccess(siteId, actor);
    this.canWrite(actor);

    const contrat = await this.prisma.contratST.findFirst({
      where: { id: contratId, siteId },
      include: {
        situations: { where: { status: { not: SituationSTStatus.BROUILLON } }, select: { id: true } },
      },
    });
    if (!contrat) throw new NotFoundException('Contrat introuvable');
    if (contrat.situations.length > 0)
      throw new BadRequestException('Ce contrat a des situations validées ou payées');

    await this.prisma.contratST.delete({ where: { id: contratId } });
  }

  /* ── Situations ST ───────────────────────────────────────────────── */

  async createSituationST(
    siteId: string,
    contratId: string,
    dto: CreateSituationSTDto,
    actor: Actor,
  ) {
    await this.sites.assertCanAccess(siteId, actor);
    this.canWrite(actor);

    const contrat = await this.prisma.contratST.findFirst({
      where: { id: contratId, siteId },
      include: this.contratInclude,
    });
    if (!contrat) throw new NotFoundException('Contrat introuvable');

    const exists = await this.prisma.situationST.findUnique({
      where: { contratId_numero: { contratId, numero: dto.numero } },
    });
    if (exists) throw new BadRequestException(`La situation n° ${dto.numero} existe déjà`);

    const updated = await this.prisma.contratST.update({
      where: { id: contratId },
      data: {
        situations: {
          create: {
            siteId,
            numero: dto.numero,
            periode: dto.periode,
            dateEmission: new Date(dto.dateEmission),
            montantHtPeriode:
              dto.montantHtPeriode !== undefined
                ? BigInt(Math.round(dto.montantHtPeriode))
                : BigInt(0),
            notes: dto.notes,
          },
        },
      },
      include: this.contratInclude,
    });

    return this.mapContratST(updated);
  }

  async updateSituationST(
    siteId: string,
    contratId: string,
    situationId: string,
    dto: UpdateSituationSTDto,
    actor: Actor,
  ) {
    await this.sites.assertCanAccess(siteId, actor);
    this.canWrite(actor);

    const st = await this.prisma.situationST.findFirst({
      where: { id: situationId, contratId, siteId },
    });
    if (!st) throw new NotFoundException('Situation introuvable');

    if (
      st.status === SituationSTStatus.PAYEE &&
      dto.status !== SituationSTStatus.PAYEE
    )
      throw new BadRequestException('Une situation payée ne peut pas être modifiée');

    const data: Parameters<typeof this.prisma.situationST.update>[0]['data'] = {};
    if (dto.status !== undefined) data.status = dto.status as SituationSTStatus;
    if (dto.notes !== undefined) data.notes = dto.notes;
    if (dto.montantHtPeriode !== undefined && st.status === SituationSTStatus.BROUILLON)
      data.montantHtPeriode = BigInt(Math.round(dto.montantHtPeriode));
    if (dto.deductionAvance !== undefined && st.status === SituationSTStatus.BROUILLON)
      data.deductionAvance = BigInt(Math.round(dto.deductionAvance));

    await this.prisma.situationST.update({ where: { id: situationId }, data });

    const contrat = await this.prisma.contratST.findUniqueOrThrow({
      where: { id: contratId },
      include: this.contratInclude,
    });

    return this.mapContratST(contrat);
  }

  async deleteSituationST(
    siteId: string,
    contratId: string,
    situationId: string,
    actor: Actor,
  ) {
    await this.sites.assertCanAccess(siteId, actor);
    this.canWrite(actor);

    const st = await this.prisma.situationST.findFirst({
      where: { id: situationId, contratId, siteId },
    });
    if (!st) throw new NotFoundException('Situation introuvable');
    if (st.status !== SituationSTStatus.BROUILLON)
      throw new BadRequestException('Seul un brouillon peut être supprimé');

    await this.prisma.situationST.delete({ where: { id: situationId } });
  }
}
