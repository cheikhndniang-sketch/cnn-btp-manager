import { ForbiddenException, Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SitesService } from '../sites/sites.service';
import { CreateOuvrierDto, UpdateOuvrierDto } from './dto/create-ouvrier.dto';
import { UpsertPointageDto } from './dto/create-pointage.dto';

type Actor = { userId: string; role: Role };
const MANAGERS: Role[] = [Role.ADMIN, Role.DIRECTEUR_PROJET, Role.DIRECTEUR_TRAVAUX, Role.CONDUCTEUR_TRAVAUX];

// ── Calcul heures supplémentaires (Décret sénégalais n° 70-184) ────────
// Semaine = lundi-dimanche. Seuil : 40 h normales / semaine.
// HS 41e-48e : +15 % | HS > 48e : +40 % | Ferie/Dim : +60 %
// Nuit (22h-5h) semaine : supplément +60 % | Nuit ferie : supplément +100 %

const TAUX_BASE = 173.33; // h normales mensuelles (40h × 52 / 12)

function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const y1 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const w = Math.ceil((((d.getTime() - y1.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${w}`;
}

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
        matricule: dto.matricule ?? null,
        nom: dto.nom,
        prenom: dto.prenom,
        fonction: dto.fonction,
        qualification: dto.qualification ?? 'MANOEUVRE',
        salaireBase: BigInt(Math.round(dto.salaireBase)),
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
        ...(dto.matricule !== undefined && { matricule: dto.matricule || null }),
        ...(dto.prenom !== undefined && { prenom: dto.prenom }),
        ...(dto.fonction !== undefined && { fonction: dto.fonction }),
        ...(dto.qualification !== undefined && { qualification: dto.qualification }),
        ...(dto.salaireBase !== undefined && { salaireBase: BigInt(Math.round(dto.salaireBase)) }),
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
    const [year, month] = mois.split('-').map(Number);
    const debut = new Date(year, month - 1, 1);
    const fin = new Date(year, month, 0);
    return this.prisma.pointage.findMany({
      where: { siteId, date: { gte: debut, lte: fin } },
      include: { ouvrier: true },
      orderBy: [{ date: 'asc' }, { ouvrier: { nom: 'asc' } }],
    });
  }

  async upsertPointage(siteId: string, dto: UpsertPointageDto, actor: Actor) {
    await this.sites.assertCanAccess(siteId, actor);
    if (!MANAGERS.includes(actor.role)) throw new ForbiddenException('Droits insuffisants');
    const date = new Date(dto.date);
    const present = dto.present ?? true;
    const heures = dto.heures ?? 8;
    return this.prisma.pointage.upsert({
      where: { ouvrierId_date: { ouvrierId: dto.ouvrierId, date } },
      create: {
        ouvrierId: dto.ouvrierId,
        siteId,
        date,
        present,
        heures,
        heuresNuit: dto.heuresNuit ?? 0,
        jourFerie: dto.jourFerie ?? false,
        notes: dto.notes,
      },
      update: {
        present,
        heures,
        heuresNuit: dto.heuresNuit ?? 0,
        jourFerie: dto.jourFerie ?? false,
        notes: dto.notes,
      },
    });
  }

  async deletePointage(siteId: string, id: string, actor: Actor) {
    await this.sites.assertCanAccess(siteId, actor);
    if (!MANAGERS.includes(actor.role)) throw new ForbiddenException('Droits insuffisants');
    await this.prisma.pointage.delete({ where: { id } });
  }

  // ── Résumé mensuel avec calcul HS droit sénégalais ───────────────────

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
          orderBy: { date: 'asc' },
        },
      },
      orderBy: { nom: 'asc' },
    });

    const lignes = ouvriers.map((o) => {
      const salaireBase = Number(o.salaireBase);
      const tauxHoraire = salaireBase > 0 ? salaireBase / TAUX_BASE : 0;

      // Regroupement par semaine ISO
      const semaines = new Map<string, { wd: number; fe: number; nWd: number; nFe: number }>();
      let joursPresents = 0;
      let heuresTotales = 0;
      let nuitSemaineTotal = 0;
      let nuitFerieTotal = 0;

      for (const p of o.pointages) {
        joursPresents++;
        const h = Number(p.heures);
        const hn = Number(p.heuresNuit ?? 0);
        const fe = p.jourFerie ?? false;
        heuresTotales += h;

        const wk = isoWeekKey(new Date(p.date));
        if (!semaines.has(wk)) semaines.set(wk, { wd: 0, fe: 0, nWd: 0, nFe: 0 });
        const s = semaines.get(wk)!;
        if (fe) { s.fe += h; s.nFe += hn; nuitFerieTotal += hn; }
        else     { s.wd += h; s.nWd += hn; nuitSemaineTotal += hn; }
      }

      // Calcul HS par semaine
      let hNorm = 0, hHs15 = 0, hHs40 = 0, hFerie = 0;
      let mNorm = 0, mHs15 = 0, mHs40 = 0, mFerie = 0;

      for (const [, s] of semaines) {
        const norm = Math.min(s.wd, 40);
        const hs1  = Math.max(0, Math.min(s.wd - 40, 8));
        const hs2  = Math.max(0, s.wd - 48);
        hNorm  += norm; hHs15 += hs1; hHs40 += hs2; hFerie += s.fe;
        mNorm  += tauxHoraire * norm;
        mHs15  += tauxHoraire * 1.15 * hs1;
        mHs40  += tauxHoraire * 1.40 * hs2;
        mFerie += tauxHoraire * 1.60 * s.fe;
      }

      const majNuit     = tauxHoraire * 0.60 * nuitSemaineTotal;
      const majNuitFerie = tauxHoraire * 1.00 * nuitFerieTotal;
      const totalBrut   = mNorm + mHs15 + mHs40 + mFerie + majNuit + majNuitFerie;

      return {
        ouvrierId: o.id,
        matricule: o.matricule,
        nom: o.nom,
        prenom: o.prenom,
        fonction: o.fonction,
        qualification: o.qualification,
        salaireBase,
        tauxHoraire: Math.round(tauxHoraire),
        joursPresents,
        heuresTotales: Math.round(heuresTotales * 10) / 10,
        heuresNormales: Math.round(hNorm * 10) / 10,
        heuresHs15:    Math.round(hHs15 * 10) / 10,
        heuresHs40:    Math.round(hHs40 * 10) / 10,
        heuresFerie:   Math.round(hFerie * 10) / 10,
        heuresNuit:    nuitSemaineTotal,
        heuresNuitFerie: nuitFerieTotal,
        montantNormal:     Math.round(mNorm),
        montantHs15:       Math.round(mHs15),
        montantHs40:       Math.round(mHs40),
        montantFerie:      Math.round(mFerie),
        majorationNuit:    Math.round(majNuit),
        majorationNuitFerie: Math.round(majNuitFerie),
        totalBrut: Math.round(totalBrut),
        // champs rétrocompatibles
        tauxJournalier: salaireBase,
        salaireHt: Math.round(totalBrut),
      };
    });

    const totalJours   = lignes.reduce((a, l) => a + l.joursPresents, 0);
    const totalSalaire = lignes.reduce((a, l) => a + l.totalBrut, 0);
    return { mois, lignes, totalJours, totalSalaire };
  }
}
