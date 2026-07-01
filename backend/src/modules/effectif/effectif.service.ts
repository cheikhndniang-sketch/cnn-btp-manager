import { ForbiddenException, Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SitesService } from '../sites/sites.service';
import { CreateOuvrierDto, UpdateOuvrierDto } from './dto/create-ouvrier.dto';
import { UpsertPointageDto } from './dto/create-pointage.dto';

type Actor = { userId: string; role: Role };
const MANAGERS: Role[] = [Role.ADMIN, Role.DIRECTEUR_PROJET, Role.DIRECTEUR_TRAVAUX, Role.CONDUCTEUR_TRAVAUX];

@Injectable()
export class EffectifService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sites: SitesService,
  ) {}

  // ── Ouvriers ──────────────────────────────────────────────────────────

  async listOuvriers(siteId: string, actor: Actor, actifOnly?: boolean) {
    await this.sites.assertCanAccess(siteId, actor);
    return this.prisma.ouvrier.findMany({
      where: { siteId, ...(actifOnly ? { actif: true } : {}) },
      orderBy: [{ actif: 'desc' }, { nom: 'asc' }],
    });
  }

  async createOuvrier(siteId: string, dto: CreateOuvrierDto, actor: Actor) {
    await this.sites.assertCanAccess(siteId, actor);
    if (!MANAGERS.includes(actor.role)) throw new ForbiddenException('Droits insuffisants');
    return this.prisma.ouvrier.create({
      data: {
        siteId,
        nom: dto.nom,
        prenom: dto.prenom,
        fonction: dto.fonction,
        qualification: dto.qualification ?? 'MANOEUVRE',
        tauxJournalier: BigInt(Math.round(dto.tauxJournalier)),
        dateEntree: new Date(dto.dateEntree),
        dateSortie: dto.dateSortie ? new Date(dto.dateSortie) : null,
        telephone: dto.telephone,
        notes: dto.notes,
      },
    });
  }

  async updateOuvrier(siteId: string, id: string, dto: UpdateOuvrierDto, actor: Actor) {
    await this.sites.assertCanAccess(siteId, actor);
    if (!MANAGERS.includes(actor.role)) throw new ForbiddenException('Droits insuffisants');
    return this.prisma.ouvrier.update({
      where: { id },
      data: {
        ...(dto.nom !== undefined && { nom: dto.nom }),
        ...(dto.prenom !== undefined && { prenom: dto.prenom }),
        ...(dto.fonction !== undefined && { fonction: dto.fonction }),
        ...(dto.qualification !== undefined && { qualification: dto.qualification }),
        ...(dto.tauxJournalier !== undefined && { tauxJournalier: BigInt(Math.round(dto.tauxJournalier)) }),
        ...(dto.dateEntree !== undefined && { dateEntree: new Date(dto.dateEntree) }),
        ...(dto.dateSortie !== undefined && { dateSortie: dto.dateSortie ? new Date(dto.dateSortie) : null }),
        ...(dto.actif !== undefined && { actif: dto.actif }),
        ...(dto.telephone !== undefined && { telephone: dto.telephone }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
    });
  }

  async removeOuvrier(siteId: string, id: string, actor: Actor) {
    await this.sites.assertCanAccess(siteId, actor);
    if (!MANAGERS.includes(actor.role)) throw new ForbiddenException('Droits insuffisants');
    await this.prisma.ouvrier.delete({ where: { id } });
  }

  // ── Pointages ─────────────────────────────────────────────────────────

  async listPointages(siteId: string, actor: Actor, mois: string) {
    await this.sites.assertCanAccess(siteId, actor);
    // mois = "2026-07" → du 1er au dernier jour du mois
    const [year, month] = mois.split('-').map(Number);
    const debut = new Date(year, month - 1, 1);
    const fin = new Date(year, month, 0); // dernier jour du mois
    return this.prisma.pointage.findMany({
      where: {
        siteId,
        date: { gte: debut, lte: fin },
      },
      include: { ouvrier: true },
      orderBy: [{ date: 'asc' }, { ouvrier: { nom: 'asc' } }],
    });
  }

  async upsertPointage(siteId: string, dto: UpsertPointageDto, actor: Actor) {
    await this.sites.assertCanAccess(siteId, actor);
    if (!MANAGERS.includes(actor.role)) throw new ForbiddenException('Droits insuffisants');
    const date = new Date(dto.date);
    return this.prisma.pointage.upsert({
      where: { ouvrierId_date: { ouvrierId: dto.ouvrierId, date } },
      create: {
        ouvrierId: dto.ouvrierId,
        siteId,
        date,
        present: dto.present ?? true,
        heures: dto.heures ?? 8,
        notes: dto.notes,
      },
      update: {
        present: dto.present ?? true,
        heures: dto.heures ?? 8,
        notes: dto.notes,
      },
    });
  }

  async deletePointage(siteId: string, id: string, actor: Actor) {
    await this.sites.assertCanAccess(siteId, actor);
    if (!MANAGERS.includes(actor.role)) throw new ForbiddenException('Droits insuffisants');
    await this.prisma.pointage.delete({ where: { id } });
  }

  // ── Résumé mensuel ────────────────────────────────────────────────────

  async resumeMensuel(siteId: string, actor: Actor, mois: string) {
    await this.sites.assertCanAccess(siteId, actor);
    const [year, month] = mois.split('-').map(Number);
    const debut = new Date(year, month - 1, 1);
    const fin = new Date(year, month, 0);

    const ouvriers = await this.prisma.ouvrier.findMany({
      where: { siteId, actif: true },
      include: {
        pointages: {
          where: { date: { gte: debut, lte: fin }, present: true },
        },
      },
      orderBy: { nom: 'asc' },
    });

    const lignes = ouvriers.map((o) => {
      const joursPresents = o.pointages.length;
      const heuresTotales = o.pointages.reduce(
        (acc, p) => acc + Number(p.heures),
        0,
      );
      const salaireHt = Number(o.tauxJournalier) * joursPresents;
      return {
        ouvrierId: o.id,
        nom: o.nom,
        prenom: o.prenom,
        fonction: o.fonction,
        qualification: o.qualification,
        tauxJournalier: Number(o.tauxJournalier),
        joursPresents,
        heuresTotales,
        salaireHt,
      };
    });

    const totalJours = lignes.reduce((a, l) => a + l.joursPresents, 0);
    const totalSalaire = lignes.reduce((a, l) => a + l.salaireHt, 0);

    return { mois, lignes, totalJours, totalSalaire };
  }
}
