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

// ── Cotisations sociales (taux 2024, Sénégal) ────────────────────────
const IPRES_SAL   = 0.056;   // Salarié Régime Général
const IPRES_EMP   = 0.084;   // Employeur Régime Général
const IPRES_CEIL  = 260_000; // Plafond mensuel FCFA

const CSS_AF_RATE = 0.07;    // Allocations Familiales (employeur)
const CSS_AT_RATE = 0.03;    // Accidents du Travail BTP (employeur)
const CFCE_RATE   = 0.03;    // CFCE (employeur)

const IPM_SAL = 4_375;       // Part salarié (50 % de 8 750 F/mois)
const IPM_EMP = 4_375;       // Part employeur

function calcTRIMF(base: number): number {
  if (base <  25_000)  return 0;
  if (base <= 75_000)  return 167;    // 500 F/trim ÷ 3
  if (base <= 250_000) return 500;    // 1 500 F/trim ÷ 3
  if (base <= 400_000) return 1_000;  // 3 000 F/trim ÷ 3
  return 1_200;                       // 3 600 F/trim ÷ 3
}

// Barème IRPP annuel (CGI Sénégal) — calcul sur salaire mensuel annualisé
function calcIRPP(baseMensuel: number, ipresMensuel: number): number {
  const rniAnnuel = Math.max(0, (baseMensuel * 0.70 - ipresMensuel) * 12);
  let tax = 0;
  if      (rniAnnuel > 8_000_000) tax = (rniAnnuel - 8_000_000) * 0.40 + 4_000_000 * 0.35 + 2_500_000 * 0.30 + 870_000 * 0.20;
  else if (rniAnnuel > 4_000_000) tax = (rniAnnuel - 4_000_000) * 0.35 + 2_500_000 * 0.30 + 870_000 * 0.20;
  else if (rniAnnuel > 1_500_000) tax = (rniAnnuel - 1_500_000) * 0.30 + 870_000 * 0.20;
  else if (rniAnnuel >   630_000) tax = (rniAnnuel - 630_000) * 0.20;
  return Math.round(tax / 12);
}

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
        tauxPanier: dto.tauxPanier ?? 0,
        tauxTransport: dto.tauxTransport ?? 0,
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
        ...(dto.tauxPanier !== undefined && { tauxPanier: dto.tauxPanier }),
        ...(dto.tauxTransport !== undefined && { tauxTransport: dto.tauxTransport }),
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
    const debut = new Date(year, month - 2, 21); // 21 du mois précédent
    const fin   = new Date(year, month - 1, 20); // 20 du mois courant
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
    const debut = new Date(year, month - 2, 21); // 21 du mois précédent
    const fin   = new Date(year, month - 1, 20); // 20 du mois courant

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
      // Taux horaire à 4 décimales (Décret 70-184)
      const tauxHoraire = salaireBase > 0
        ? Math.round((salaireBase / TAUX_BASE) * 10000) / 10000
        : 0;
      const tauxPanier = o.tauxPanier ?? 0;
      const tauxTransport = o.tauxTransport ?? 0;

      // Regroupement par semaine ISO (l'arrondi se fait par semaine : chaque
      // semaine est l'unité légale de décompte des heures supplémentaires).
      type Semaine = {
        wd: number; fe: number; nWd: number; nFe: number;
        debut: Date; fin: Date;
      };
      const semaines = new Map<string, Semaine>();
      let joursPresents = 0;
      let joursAvecPanier = 0;
      let heuresTotales = 0;
      let nuitSemaineTotal = 0;
      let nuitFerieTotal = 0;

      for (const p of o.pointages) {
        joursPresents++;
        const h = Number(p.heures);
        if (h >= 11) joursAvecPanier++;
        const hn = Number(p.heuresNuit ?? 0);
        const fe = p.jourFerie ?? false;
        heuresTotales += h;

        const jour = new Date(p.date);
        const wk = isoWeekKey(jour);
        if (!semaines.has(wk)) semaines.set(wk, { wd: 0, fe: 0, nWd: 0, nFe: 0, debut: jour, fin: jour });
        const s = semaines.get(wk)!;
        if (jour < s.debut) s.debut = jour;
        if (jour > s.fin)   s.fin   = jour;
        if (fe) { s.fe += h; s.nFe += hn; nuitFerieTotal += hn; }
        else     { s.wd += h; s.nWd += hn; nuitSemaineTotal += hn; }
      }

      // Calcul HS par semaine
      let hNorm = 0, hHs15 = 0, hHs40 = 0, hFerie = 0;
      let mNorm = 0, mHs15 = 0, mHs40 = 0, mFerie = 0;

      // Détail par semaine : permet de justifier ligne à ligne le total
      // mensuel, l'arrondi étant appliqué à chaque semaine.
      const detailSemaines: {
        semaine: string; debut: string; fin: string;
        heuresNormales: number; heuresHs15: number; heuresHs40: number; heuresFerie: number;
        montantNormal: number; montantHs15: number; montantHs40: number; montantFerie: number;
        total: number;
      }[] = [];

      for (const [wk, s] of semaines) {
        const norm = Math.min(s.wd, 40);
        const hs1  = Math.max(0, Math.min(s.wd - 40, 8));
        const hs2  = Math.max(0, s.wd - 48);
        hNorm  += norm; hHs15 += hs1; hHs40 += hs2; hFerie += s.fe;
        // Arrondi sur le montant de chaque catégorie (pas sur le taux)
        const sNorm  = Math.round(norm  * tauxHoraire);
        const sHs15  = Math.round(hs1   * tauxHoraire * 1.15);
        const sHs40  = Math.round(hs2   * tauxHoraire * 1.40);
        const sFerie = Math.round(s.fe  * tauxHoraire * 1.60);
        mNorm  += sNorm; mHs15 += sHs15; mHs40 += sHs40; mFerie += sFerie;

        detailSemaines.push({
          semaine: wk,
          debut: s.debut.toISOString().slice(0, 10),
          fin:   s.fin.toISOString().slice(0, 10),
          heuresNormales: Math.round(norm * 10) / 10,
          heuresHs15:     Math.round(hs1  * 10) / 10,
          heuresHs40:     Math.round(hs2  * 10) / 10,
          heuresFerie:    Math.round(s.fe * 10) / 10,
          montantNormal: sNorm,
          montantHs15:   sHs15,
          montantHs40:   sHs40,
          montantFerie:  sFerie,
          total: sNorm + sHs15 + sHs40 + sFerie,
        });
      }

      const majNuit      = Math.round(nuitSemaineTotal * tauxHoraire * 0.60);
      const majNuitFerie = Math.round(nuitFerieTotal   * tauxHoraire * 1.00);
      const primePanier    = tauxPanier    * joursAvecPanier;  // ≥11h/jour
      const primeTransport = tauxTransport * joursPresents;    // tous jours travaillés

      // Assiette de cotisations (primes de transport et panier exemptes)
      const totalSalarial = mNorm + mHs15 + mHs40 + mFerie + majNuit + majNuitFerie;
      const totalBrut     = totalSalarial + primePanier + primeTransport;

      // ── Retenues salariales ─────────────────────────────────────────
      const baseIPRES     = Math.min(totalSalarial, IPRES_CEIL);
      const retIPRES      = Math.round(baseIPRES * IPRES_SAL);
      const retIPM        = joursPresents > 0 ? IPM_SAL : 0;
      const retTRIMF      = calcTRIMF(totalSalarial);
      const retIRPP       = calcIRPP(totalSalarial, retIPRES);
      const totalRetenues = retIPRES + retIPM + retTRIMF + retIRPP;
      const salaireNet    = totalBrut - totalRetenues;

      // ── Charges patronales ──────────────────────────────────────────
      const charIPRES              = Math.round(baseIPRES * IPRES_EMP);
      const charCssAF              = Math.round(totalSalarial * CSS_AF_RATE);
      const charCssAT              = Math.round(totalSalarial * CSS_AT_RATE);
      const charCFCE               = Math.round(totalSalarial * CFCE_RATE);
      const charIPM                = joursPresents > 0 ? IPM_EMP : 0;
      const totalChargesPatronales = charIPRES + charCssAF + charCssAT + charCFCE + charIPM;
      const coutTotalEmployeur     = totalBrut + totalChargesPatronales;

      return {
        ouvrierId: o.id,
        matricule: o.matricule,
        nom: o.nom,
        prenom: o.prenom,
        fonction: o.fonction,
        qualification: o.qualification,
        salaireBase,
        tauxHoraire,
        joursPresents,
        heuresTotales: Math.round(heuresTotales * 10) / 10,
        heuresNormales: Math.round(hNorm * 10) / 10,
        heuresHs15:    Math.round(hHs15 * 10) / 10,
        heuresHs40:    Math.round(hHs40 * 10) / 10,
        heuresFerie:   Math.round(hFerie * 10) / 10,
        heuresNuit:    nuitSemaineTotal,
        heuresNuitFerie: nuitFerieTotal,
        detailSemaines,
        montantNormal:       mNorm,
        montantHs15:         mHs15,
        montantHs40:         mHs40,
        montantFerie:        mFerie,
        majorationNuit:      majNuit,
        majorationNuitFerie: majNuitFerie,
        tauxPanier,
        tauxTransport,
        joursAvecPanier,
        primePanier,
        primeTransport,
        totalSalarial,
        totalBrut,
        retIPRES,
        retIPM,
        retTRIMF,
        retIRPP,
        totalRetenues,
        salaireNet,
        charIPRES,
        charCssAF,
        charCssAT,
        charCFCE,
        charIPM,
        totalChargesPatronales,
        coutTotalEmployeur,
        // champs rétrocompatibles
        tauxJournalier: salaireBase,
        salaireHt: Math.round(totalBrut),
      };
    });

    const totalJours             = lignes.reduce((a, l) => a + l.joursPresents, 0);
    const totalSalaire           = lignes.reduce((a, l) => a + l.totalBrut, 0);
    const totalSalaireNet        = lignes.reduce((a, l) => a + l.salaireNet, 0);
    const totalChargesPatronales = lignes.reduce((a, l) => a + l.totalChargesPatronales, 0);
    const totalCoutEmployeur     = lignes.reduce((a, l) => a + l.coutTotalEmployeur, 0);
    return { mois, lignes, totalJours, totalSalaire, totalSalaireNet, totalChargesPatronales, totalCoutEmployeur };
  }
}
