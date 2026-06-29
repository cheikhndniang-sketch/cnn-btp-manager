import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { Role, SituationStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SitesService } from '../sites/sites.service';
import { CreateSituationDto } from './dto/create-situation.dto';
import { UpdateSituationDto } from './dto/update-situation.dto';
import { UpdateLigneDto } from './dto/update-ligne.dto';

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

@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sites: SitesService,
  ) {}

  private canWrite(actor: Actor) {
    if (!WRITER_ROLES.includes(actor.role))
      throw new ForbiddenException('Droits insuffisants');
  }

  /* ── Situations ──────────────────────────────────────────────────── */

  async listSituations(siteId: string, actor: Actor) {
    await this.sites.assertCanAccess(siteId, actor);

    const situations = await this.prisma.situation.findMany({
      where: { siteId },
      orderBy: { numero: 'asc' },
      include: { lignes: { include: { lot: true } } },
    });

    const site = await this.prisma.site.findUniqueOrThrow({ where: { id: siteId } });

    return situations.map((s) => this.mapSituation(s, site.tvaRate));
  }

  async getSituation(siteId: string, situationId: string, actor: Actor) {
    await this.sites.assertCanAccess(siteId, actor);

    const s = await this.prisma.situation.findFirst({
      where: { id: situationId, siteId },
      include: { lignes: { include: { lot: true } } },
    });
    if (!s) throw new NotFoundException('Situation introuvable');

    const site = await this.prisma.site.findUniqueOrThrow({ where: { id: siteId } });
    return this.mapSituation(s, site.tvaRate);
  }

  async createSituation(siteId: string, dto: CreateSituationDto, actor: Actor) {
    await this.sites.assertCanAccess(siteId, actor);
    this.canWrite(actor);

    const exists = await this.prisma.situation.findUnique({
      where: { siteId_numero: { siteId, numero: dto.numero } },
    });
    if (exists) throw new BadRequestException(`La situation n° ${dto.numero} existe déjà`);

    const lots = await this.prisma.lot.findMany({
      where: { siteId },
      orderBy: { position: 'asc' },
    });

    const situation = await this.prisma.situation.create({
      data: {
        siteId,
        numero: dto.numero,
        periode: dto.periode,
        dateEmission: new Date(dto.dateEmission),
        notes: dto.notes,
        lignes: {
          create: lots.map((l) => ({ lotId: l.id })),
        },
      },
      include: { lignes: { include: { lot: true } } },
    });

    const site = await this.prisma.site.findUniqueOrThrow({ where: { id: siteId } });
    return this.mapSituation(situation, site.tvaRate);
  }

  async updateSituation(
    siteId: string,
    situationId: string,
    dto: UpdateSituationDto,
    actor: Actor,
  ) {
    await this.sites.assertCanAccess(siteId, actor);
    this.canWrite(actor);

    const s = await this.prisma.situation.findFirst({
      where: { id: situationId, siteId },
    });
    if (!s) throw new NotFoundException('Situation introuvable');

    if (
      s.status === SituationStatus.PAYEE &&
      dto.status !== SituationStatus.PAYEE
    ) {
      throw new BadRequestException('Une situation payée ne peut pas être modifiée');
    }

    const updated = await this.prisma.situation.update({
      where: { id: situationId },
      data: dto,
      include: { lignes: { include: { lot: true } } },
    });

    const site = await this.prisma.site.findUniqueOrThrow({ where: { id: siteId } });
    return this.mapSituation(updated, site.tvaRate);
  }

  async deleteSituation(siteId: string, situationId: string, actor: Actor) {
    await this.sites.assertCanAccess(siteId, actor);
    this.canWrite(actor);

    const s = await this.prisma.situation.findFirst({
      where: { id: situationId, siteId },
    });
    if (!s) throw new NotFoundException('Situation introuvable');
    if (s.status !== SituationStatus.BROUILLON)
      throw new BadRequestException('Seul un brouillon peut être supprimé');

    await this.prisma.situation.delete({ where: { id: situationId } });
  }

  /* ── Lignes ──────────────────────────────────────────────────────── */

  async updateLigne(
    siteId: string,
    situationId: string,
    ligneId: string,
    dto: UpdateLigneDto,
    actor: Actor,
  ) {
    await this.sites.assertCanAccess(siteId, actor);
    this.canWrite(actor);

    const s = await this.prisma.situation.findFirst({
      where: { id: situationId, siteId },
    });
    if (!s) throw new NotFoundException('Situation introuvable');
    if (s.status !== SituationStatus.BROUILLON)
      throw new BadRequestException('Seule une situation en brouillon peut être modifiée');

    const ligne = await this.prisma.situationLigne.findFirst({
      where: { id: ligneId, situationId },
    });
    if (!ligne) throw new NotFoundException('Ligne introuvable');

    const updated = await this.prisma.situation.findFirst({
      where: { id: situationId },
      include: { lignes: { include: { lot: true } } },
    });

    await this.prisma.situationLigne.update({
      where: { id: ligneId },
      data: {
        avancementCumul: dto.avancementCumul,
        notes: dto.notes,
      },
    });

    const fresh = await this.prisma.situation.findFirst({
      where: { id: situationId },
      include: { lignes: { include: { lot: true } } },
    });

    // silence unused variable warning
    void updated;

    const site = await this.prisma.site.findUniqueOrThrow({ where: { id: siteId } });
    return this.mapSituation(fresh!, site.tvaRate);
  }

  /* ── Marché lot ──────────────────────────────────────────────────── */

  async updateLotBudget(
    siteId: string,
    lotId: string,
    montantMarcheHt: number,
    actor: Actor,
  ) {
    await this.sites.assertCanAccess(siteId, actor);
    this.canWrite(actor);

    const lot = await this.prisma.lot.findFirst({ where: { id: lotId, siteId } });
    if (!lot) throw new NotFoundException('Lot introuvable');

    return this.prisma.lot.update({
      where: { id: lotId },
      data: { montantMarcheHt: BigInt(Math.round(montantMarcheHt)) },
      select: { id: true, montantMarcheHt: true },
    });
  }

  /* ── Mapper ──────────────────────────────────────────────────────── */

  private mapSituation(
    s: {
      id: string;
      siteId: string;
      numero: number;
      periode: string;
      dateEmission: Date;
      status: SituationStatus;
      notes: string | null;
      createdAt: Date;
      updatedAt: Date;
      lignes: Array<{
        id: string;
        avancementCumul: Decimal;
        notes: string | null;
        lot: {
          id: string;
          code: string;
          name: string;
          montantMarcheHt: bigint;
        };
      }>;
    },
    tvaRate: Decimal,
  ) {
    const tva = decToNum(tvaRate);

    const lignes = s.lignes.map((l) => {
      const budget = bigToNum(l.lot.montantMarcheHt);
      const cumul = decToNum(l.avancementCumul);
      const montantHtCumul = Math.round((budget * cumul) / 100);
      return {
        id: l.id,
        lotId: l.lot.id,
        lotCode: l.lot.code,
        lotName: l.lot.name,
        montantMarcheHt: budget,
        avancementCumul: cumul,
        montantHtCumul,
        notes: l.notes,
      };
    });

    const totalHt = lignes.reduce((a, l) => a + l.montantHtCumul, 0);
    const totalTva = Math.round(totalHt * tva);
    const totalTtc = totalHt + totalTva;

    return {
      id: s.id,
      siteId: s.siteId,
      numero: s.numero,
      periode: s.periode,
      dateEmission: s.dateEmission,
      status: s.status,
      notes: s.notes,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      lignes,
      totalHt,
      totalTva,
      totalTtc,
      tvaRate: tva,
    };
  }
}
