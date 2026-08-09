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

// Rémunération au forfait : le mois compte 30 jours calendaires et le
// salaire est proratisé sur cette base (conducteurs, encadrement, gardiens).
const JOURS_FORFAIT = 30;

// ── Cotisations sociales — barème CSE Immobilier ─────────────────────
// Taux relevés sur la paie réelle du chantier Sandaga (août 2025) et
// validés sur 136 bulletins : charges patronales exactes 136/136,
// retenues salariales 123/126 (les 3 écarts sont des retenues
// exceptionnelles ponctuelles, hors formule).
//
// L'assiette est le salaire hors primes : transport et panier sont exonérés.

const IPRES_SAL = 0.056; // Salarié — non plafonné
const IPRES_EMP = 0.084; // Employeur
const CFCE_RATE = 0.03;  // CFCE (employeur)

const IPM_SAL = 8_750;   // IPM intégralement à la charge du salarié
const IPM_EMP = 7_000;   // Part employeur, forfaitaire
const TRIMF   = 250;     // Forfait mensuel

// CSS : cotisations assises sur le plafond mensuel de 63 000 F, donc
// forfaitaires quel que soit le salaire.
const CSS_AF_FORFAIT = 4_410; // 7 % × 63 000 — Allocations familiales
const CSS_AT_FORFAIT = 3_150; // 5 % × 63 000 — Accidents du travail (BTP)

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

    // Récapitulatifs repris des états de paie : ils font foi pour les mois
    // antérieurs à la saisie journalière dans l'application.
    const recaps = await this.prisma.recapMensuel.findMany({ where: { siteId, mois } });
    const recapParOuvrier = new Map(recaps.map((r) => [r.ouvrierId, r]));

    const ouvriers = await this.prisma.ouvrier.findMany({
      where: {
        siteId,
        ...(recaps.length > 0
          ? { OR: [{ actif: true }, { id: { in: recaps.map((r) => r.ouvrierId) } }] }
          : { actif: true }),
      },
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
      const forfait = o.forfaitMensuel ?? false;

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

      // Aucun pointage journalier saisi pour ce mois : le récapitulatif de
      // paie fait foi et est repris tel quel, sans reconstituer de journées.
      const recap = recapParOuvrier.get(o.id);
      const sourceRecap = o.pointages.length === 0 && !!recap;
      let hHs100 = 0;
      let mHs100 = 0;
      if (sourceRecap && recap) {
        hNorm  = Number(recap.heuresNormales);
        hHs15  = Number(recap.heuresHs15);
        hHs40  = Number(recap.heuresHs40);
        hFerie = Number(recap.heuresHs60);   // H 60 % → férié/dimanche
        hHs100 = Number(recap.heuresHs100);  // H 100 % → taux double
        // Au forfait, la colonne « H. normales » compte des JOURS sur une
        // base de 30 j calendaires : le salaire est proratisé, pas horaire.
        mNorm  = forfait
          ? Math.round((salaireBase * Math.min(hNorm, JOURS_FORFAIT)) / JOURS_FORFAIT)
          : Math.round(hNorm * tauxHoraire);
        mHs15  = Math.round(hHs15  * tauxHoraire * 1.15);
        mHs40  = Math.round(hHs40  * tauxHoraire * 1.40);
        mFerie = Math.round(hFerie * tauxHoraire * 1.60);
        mHs100 = Math.round(hHs100 * tauxHoraire * 2.00);
        heuresTotales   = hNorm + hHs15 + hHs40 + hFerie + hHs100;
        joursPresents   = recap.joursTransport;
        joursAvecPanier = recap.nbPaniers;
        detailSemaines.length = 0; // pas de découpage hebdomadaire disponible
      } else if (forfait) {
        // Saisie journalière pour un salarié au forfait : on proratise sur 30 j.
        mNorm  = Math.round((salaireBase * Math.min(joursPresents, JOURS_FORFAIT)) / JOURS_FORFAIT);
        mHs15 = 0; mHs40 = 0; mFerie = 0;
        hHs15 = 0; hHs40 = 0; hFerie = 0;
        detailSemaines.length = 0;
      }

      const majNuit      = Math.round(nuitSemaineTotal * tauxHoraire * 0.60);
      const majNuitFerie = Math.round(nuitFerieTotal   * tauxHoraire * 1.00);
      const primePanier    = tauxPanier    * joursAvecPanier;  // ≥11h/jour
      const primeTransport = tauxTransport * joursPresents;    // tous jours travaillés

      // Assiette de cotisations (primes de transport et panier exemptes)
      const totalSalarial = mNorm + mHs15 + mHs40 + mFerie + mHs100 + majNuit + majNuitFerie;
      const totalBrut     = totalSalarial + primePanier + primeTransport;

      // Les prestataires (gardiens, stagiaires — matricule non numérique)
      // ne sont pas assujettis aux cotisations sociales.
      const cotisable = !o.exonereCotisations && totalSalarial > 0;

      // ── Retenues salariales ─────────────────────────────────────────
      const retIPRES      = cotisable ? Math.round(totalSalarial * IPRES_SAL) : 0;
      const retIPM        = cotisable ? IPM_SAL : 0;
      const retTRIMF      = cotisable ? TRIMF : 0;
      // IRPP : la quasi-totalité des salariés en est exonérée (abattement +
      // charges de famille). Saisi au cas par cas plutôt que calculé.
      const retIRPP       = 0;
      const totalRetenues = retIPRES + retIPM + retTRIMF + retIRPP;
      const salaireNet    = totalBrut - totalRetenues;

      // ── Charges patronales ──────────────────────────────────────────
      // IPRES (8,4 %) et CFCE (3 %) sont arrondis ensemble pour coller au
      // franc près au calcul de paie existant ; le CFCE absorbe l'arrondi.
      const partProportionnelle    = cotisable ? Math.round(totalSalarial * (IPRES_EMP + CFCE_RATE)) : 0;
      const charIPRES              = cotisable ? Math.round(totalSalarial * IPRES_EMP) : 0;
      const charCFCE               = partProportionnelle - charIPRES;
      const charCssAF              = cotisable ? CSS_AF_FORFAIT : 0;
      const charCssAT              = cotisable ? CSS_AT_FORFAIT : 0;
      const charIPM                = cotisable ? IPM_EMP : 0;
      const totalChargesPatronales = charIPRES + charCFCE + charCssAF + charCssAT + charIPM;
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
        heuresHs100:   hHs100,
        montantHs100:  mHs100,
        sourceRecap,
        forfaitMensuel: forfait,
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
