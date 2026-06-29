import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Situation } from '@/api/types';
import { formatFCFA } from './format';
import { montantEnLettresMaj } from './nombreEnLettres';

export interface ExportSite {
  name: string;
  reference: string;
}

export interface ExportSiteFinance extends ExportSite {
  marcheHt: number;
  avanceForfaitaire: number;
  tvaRate: number;
  tauxRg: number;
}

export interface FactureOptions {
  destinataire: string;
  destinatairePoste?: string;
  factureNumero: string;
  banque?: string;
  nomClient?: string;
  numeroCompte?: string;
}

/* ── Palette charte CSE ─────────────────────────────────────────────── */
const NAVY: [number, number, number] = [0, 51, 102];
const CYAN: [number, number, number] = [0, 174, 239];
const GREY: [number, number, number] = [100, 116, 139];
const LIGHT: [number, number, number] = [244, 243, 238];
const RED_RGB: [number, number, number] = [163, 45, 45];

/* ── Helpers ────────────────────────────────────────────────────────── */
function todayFr(): string {
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date());
}
function fmtDate(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR').format(new Date(iso));
}
function fileStamp(): string {
  return new Date().toISOString().slice(0, 10);
}
function pctStr(v: number): string {
  return `${Number(v.toFixed(2))} %`;
}

/* ── Bandeau d'en-tête officiel ─────────────────────────────────────── */
function drawHeader(doc: jsPDF, site: ExportSite, s: Situation) {
  const W = doc.internal.pageSize.getWidth();

  /* Bande bleue marine */
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, W, 30, 'F');

  /* Logo texte CSE */
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('CSE IMMOBILIER', 14, 12);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Direction des Travaux & Réalisations', 14, 18);
  doc.text('Dakar, Sénégal', 14, 23);

  /* Titre situation à droite */
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(`SITUATION DE TRAVAUX N° ${s.numero}`, W - 14, 12, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Période : ${s.periode}`, W - 14, 18, { align: 'right' });
  doc.text(`Date d'émission : ${fmtDate(String(s.dateEmission))}`, W - 14, 23, { align: 'right' });

  /* Ligne de séparation cyan */
  doc.setFillColor(...CYAN);
  doc.rect(0, 30, W, 2, 'F');

  /* Bloc chantier */
  doc.setFillColor(...LIGHT);
  doc.rect(0, 32, W, 20, 'F');

  doc.setTextColor(...NAVY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('CHANTIER', 14, 39);
  doc.setFont('helvetica', 'normal');
  doc.text(site.name, 14, 44);
  doc.setTextColor(...GREY);
  doc.text(`Réf. : ${site.reference}`, 14, 49);

  doc.setTextColor(...NAVY);
  doc.setFont('helvetica', 'bold');
  doc.text('MAÎTRE D\'OUVRAGE', W / 2, 39);
  doc.setFont('helvetica', 'normal');
  doc.text('CSE Immobilier', W / 2, 44);
  doc.setTextColor(...GREY);
  doc.text(`TVA : ${pctStr(s.tvaRate)}   |   RG : ${pctStr(s.tauxRg)}`, W / 2, 49);
}

/* ── Récapitulatif financier en bas de page ─────────────────────────── */
function drawRecap(doc: jsPDF, s: Situation, startY: number) {
  const W = doc.internal.pageSize.getWidth();
  const left = W - 100;
  const colW = 86;

  const lines: Array<{ label: string; value: string; bold?: boolean; color?: [number, number, number]; sep?: boolean }> = [
    { label: 'Montant HT cumulé', value: formatFCFA(s.totalHt) },
    { label: `TVA (${pctStr(s.tvaRate)})`, value: formatFCFA(s.totalTva) },
    { label: 'TOTAL TTC BRUT', value: formatFCFA(s.totalTtc), bold: true },
    { label: '', value: '', sep: true },
    { label: `Retenue de garantie (${pctStr(s.tauxRg)})`, value: `− ${formatFCFA(s.montantRg)}`, color: RED_RGB },
    { label: "Déduction d'avance", value: s.deductionAvance > 0 ? `− ${formatFCFA(s.deductionAvance)}` : '—', color: [180, 95, 6] },
    { label: '', value: '', sep: true },
    { label: 'NET À PAYER', value: formatFCFA(s.netAPayer), bold: true, color: NAVY },
  ];

  let y = startY;

  for (const line of lines) {
    if (line.sep) {
      doc.setDrawColor(...GREY);
      doc.setLineWidth(0.3);
      doc.line(left, y + 1, left + colW, y + 1);
      y += 4;
      continue;
    }

    if (line.bold) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
    } else {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
    }

    const col = line.color ?? GREY;
    doc.setTextColor(...col);
    doc.text(line.label, left, y);
    doc.setTextColor(...(line.color ?? NAVY));
    doc.text(line.value, left + colW, y, { align: 'right' });
    y += 6;
  }

  /* Encadré NET À PAYER */
  doc.setFillColor(...NAVY);
  doc.rect(left - 2, startY + lines.filter((l) => !l.sep).length * 6 + 6, colW + 4, 10, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('NET À PAYER', left, y + 3);
  doc.text(formatFCFA(s.netAPayer), left + colW, y + 3, { align: 'right' });

  /* Somme arrêtée en lettres */
  const lettres = montantEnLettresMaj(s.netAPayer);
  const fullW = doc.internal.pageSize.getWidth();
  const arreteeY = y + 16;
  doc.setFillColor(244, 243, 238);
  doc.rect(14, arreteeY - 5, fullW - 28, 14, 'F');
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.4);
  doc.rect(14, arreteeY - 5, fullW - 28, 14, 'S');
  doc.setTextColor(...NAVY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Arrêtée à la somme de :', 18, arreteeY + 1);
  doc.setFontSize(10);
  const maxW = fullW - 28 - 8;
  const wrapped = doc.splitTextToSize(lettres, maxW);
  doc.text(wrapped, 18, arreteeY + 7);
}

/* ── Bloc signatures ─────────────────────────────────────────────────── */
function drawSignatures(doc: jsPDF, y: number) {
  const W = doc.internal.pageSize.getWidth();
  const margin = 14;
  const col = (W - 2 * margin) / 3;

  const signataires = ["Le Maître d'Ouvrage", "Le Maître d'Œuvre", "L'Entreprise"];

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...NAVY);

  signataires.forEach((label, i) => {
    const x = margin + i * col;
    doc.text(label, x + col / 2, y, { align: 'center' });
    doc.setDrawColor(...GREY);
    doc.setLineWidth(0.3);
    doc.rect(x + 4, y + 4, col - 8, 20);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...GREY);
    doc.text('Signature & cachet', x + col / 2, y + 16, { align: 'center' });
    doc.setFont('helvetica', 'bold');
  });
}

/* ── Export principal ───────────────────────────────────────────────── */
export function exportSituationToPdf(site: ExportSite, s: Situation): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();

  drawHeader(doc, site, s);

  /* Notes éventuelles */
  let bodyY = 56;
  if (s.notes) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(...GREY);
    doc.text(`Note : ${s.notes}`, 14, bodyY);
    bodyY += 6;
  }

  /* Tableau de décompte par lot */
  autoTable(doc, {
    startY: bodyY,
    head: [['Code', 'Lot / Corps de métier', 'Marché HT (FCFA)', 'Avanct. %', 'Montant HT (FCFA)']],
    body: s.lignes.map((l) => [
      l.lotCode,
      l.lotName,
      l.montantMarcheHt > 0 ? formatFCFA(l.montantMarcheHt) : '—',
      pctStr(l.avancementCumul),
      l.montantHtCumul > 0 ? formatFCFA(l.montantHtCumul) : '—',
    ]),
    foot: [
      [
        { content: 'TOTAL', colSpan: 2, styles: { fontStyle: 'bold' } },
        formatFCFA(s.lignes.reduce((a, l) => a + l.montantMarcheHt, 0)),
        '',
        formatFCFA(s.totalHt),
      ],
    ],
    styles: { fontSize: 9, cellPadding: 2.5, textColor: NAVY },
    headStyles: { fillColor: CYAN, textColor: [255, 255, 255], fontStyle: 'bold' },
    footStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: LIGHT },
    columnStyles: {
      0: { cellWidth: 14 },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right', fontStyle: 'bold' },
    },
  });

  const tableBottom =
    (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  /* Récapitulatif financier */
  const recapY = tableBottom + 8;
  drawRecap(doc, s, recapY);

  /* Signatures */
  const sigY = Math.max(recapY + 60, H - 50);
  drawSignatures(doc, sigY);

  /* Pied de page */
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...GREY);
  doc.text(
    `CSE Immobilier — ${site.name} — Situation n° ${s.numero} — Imprimé le ${todayFr()}`,
    W / 2, H - 6, { align: 'center' },
  );
  doc.setDrawColor(...CYAN);
  doc.setLineWidth(0.5);
  doc.line(14, H - 10, W - 14, H - 10);

  doc.save(`Situation-${String(s.numero).padStart(2, '0')}-${site.reference}-${fileStamp()}.pdf`);
}

/* ── En-tête Facture de décompte ────────────────────────────────────── */
function drawFactureHeader(doc: jsPDF, s: Situation, factureNumero: string) {
  const W = doc.internal.pageSize.getWidth();

  doc.setFillColor(...NAVY);
  doc.rect(0, 0, W, 24, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('CSE IMMOBILIER', 14, 10);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('Direction des Travaux & Réalisations', 14, 16);
  doc.text('Dakar, Sénégal', 14, 21);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('FACTURE DE DÉCOMPTE', W - 14, 11, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`N° ${factureNumero}`, W - 14, 17, { align: 'right' });
  doc.text(`Période : ${s.periode}`, W - 14, 22, { align: 'right' });

  doc.setFillColor(...CYAN);
  doc.rect(0, 24, W, 1.5, 'F');
}

/* ── Export Facture de décompte ─────────────────────────────────────── */
export function exportFactureToPdf(
  site: ExportSiteFinance,
  s: Situation,
  prevTotalHt: number,
  opts: FactureOptions,
): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();

  /* ── Calculs (logique facture : différentiel, RG sur HT, TVA sur net) */
  const montantMarcheHt = site.marcheHt;
  const avanceDemarrage = site.avanceForfaitaire;
  const pctAvance =
    montantMarcheHt > 0 ? Math.round((avanceDemarrage / montantMarcheHt) * 100) : 0;
  const presentTotalHt = s.totalHt;
  const pctPrecedent =
    montantMarcheHt > 0 ? (prevTotalHt / montantMarcheHt) * 100 : 0;
  const pctPresent =
    montantMarcheHt > 0 ? (presentTotalHt / montantMarcheHt) * 100 : 0;
  const montantTravauxHt = presentTotalHt - prevTotalHt;
  const rgHt = Math.round(montantTravauxHt * site.tauxRg);
  const remboursementAvance = s.deductionAvance;
  const tauxRembAvance = montantTravauxHt > 0 ? remboursementAvance / montantTravauxHt : 0;
  const totalHtva = montantTravauxHt - rgHt - remboursementAvance;
  const tvaAmount = Math.round(totalHtva * site.tvaRate);
  const totalTtc = totalHtva + tvaAmount;
  const netAPayer = totalTtc;

  /* ── En-tête ──────────────────────────────────────────────────────── */
  drawFactureHeader(doc, s, opts.factureNumero);
  let y = 30;

  /* ── ATTENTION DE + date + n° facture ────────────────────────────── */
  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...GREY);
  doc.text('ATTENTION DE :', 14, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...GREY);
  doc.text(`Dakar, le ${todayFr()}`, W - 14, y, { align: 'right' });

  y += 5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...NAVY);
  doc.text(opts.destinataire, 14, y);
  doc.setFontSize(9);
  doc.text(`FACTURE : ${opts.factureNumero}`, W - 14, y, { align: 'right' });

  if (opts.destinatairePoste) {
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...GREY);
    doc.text(opts.destinatairePoste, 14, y);
  }

  y += 10;
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(14, y, W - 14, y);
  y += 7;

  /* ── Projet / période ────────────────────────────────────────────── */
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...NAVY);
  doc.text('PROJET :', 14, y);
  doc.setFont('helvetica', 'normal');
  doc.text(site.name, 38, y);

  y += 5;
  doc.setFont('helvetica', 'bold');
  doc.text('DÉCOMPTE :', 14, y);
  doc.setFont('helvetica', 'normal');
  const periodeLabel = new Intl.DateTimeFormat('fr-FR', {
    year: 'numeric',
    month: 'long',
  }).format(new Date(`${s.periode}-01`)).toUpperCase();
  doc.text(periodeLabel, 38, y);

  y += 9;

  /* ── En-tête du tableau ──────────────────────────────────────────── */
  doc.setFillColor(...NAVY);
  doc.rect(14, y, W - 28, 8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('DESCRIPTION', 18, y + 5.5);
  doc.text('MONTANTS (FCFA)', W - 18, y + 5.5, { align: 'right' });
  y += 11;

  /* ── Ligne de tableau ────────────────────────────────────────────── */
  const tRow = (
    label: string,
    amount: number | null,
    options?: { bold?: boolean; shaded?: boolean; pct?: string; coeff?: string },
  ) => {
    const isBold = options?.bold ?? false;
    if (options?.shaded) {
      doc.setFillColor(...LIGHT);
      doc.rect(14, y - 4, W - 28, 6.5, 'F');
    }
    doc.setFont('helvetica', isBold ? 'bold' : 'normal');
    doc.setFontSize(isBold ? 10 : 9);
    doc.setTextColor(...NAVY);
    doc.text(label, 18, y);
    if (amount !== null) {
      doc.text(formatFCFA(amount), W - 18, y, { align: 'right' });
    }
    if (options?.pct) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...GREY);
      doc.text(options.pct, W - 52, y, { align: 'right' });
    }
    if (options?.coeff) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...GREY);
      doc.text(options.coeff, W - 52, y, { align: 'right' });
    }
    y += isBold ? 7 : 6.5;
  };

  const tSep = () => {
    doc.setDrawColor(210, 210, 210);
    doc.setLineWidth(0.2);
    doc.line(14, y - 0.5, W - 14, y - 0.5);
    y += 3;
  };

  tRow('MONTANT TOTAL DU MARCHÉ HTVA (EN FCFA)', montantMarcheHt, { shaded: true });
  tRow(
    `AVANCE DE DÉMARRAGE${pctAvance > 0 ? ` ${pctAvance} %` : ''} HTVA (EN FCFA)`,
    avanceDemarrage,
  );
  tSep();
  tRow('TOTAL DÉCOMPTE PRÉCÉDENT', prevTotalHt, {
    shaded: true,
    pct: `${pctPrecedent.toFixed(1)} %`,
  });
  tRow('TOTAL PRÉSENT DÉCOMPTE', presentTotalHt, { pct: `${pctPresent.toFixed(1)} %` });
  tRow('MONTANT DES TRAVAUX DU PRÉSENT DÉCOMPTE', montantTravauxHt, { bold: true, shaded: true });
  tRow(`RETENUE DE GARANTIE (${(site.tauxRg * 100).toFixed(0)} %)`, rgHt);
  tRow('REMBOURSEMENT AVANCE DE DÉMARRAGE', remboursementAvance, {
    coeff: tauxRembAvance > 0 ? tauxRembAvance.toFixed(4) : undefined,
  });
  tSep();
  tRow('TOTAL HTVA (EN FCFA)', totalHtva, { bold: true, shaded: true });
  tRow(`TVA ${(site.tvaRate * 100).toFixed(0)} %`, tvaAmount);
  tRow('TOTAL TTC', totalTtc, { bold: true });

  y += 2;
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.8);
  doc.line(14, y, W - 14, y);
  y += 8;

  /* ── NET À PAYER en lettres ──────────────────────────────────────── */
  const lettres = montantEnLettresMaj(netAPayer);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...NAVY);
  const netText = `NET À PAYER : ${lettres} TTC`;
  const wrapped = doc.splitTextToSize(netText, W - 28);
  doc.text(wrapped, 14, y);
  y += (wrapped as string[]).length * 6 + 12;

  /* ── Signature ───────────────────────────────────────────────────── */
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(9);
  doc.setTextColor(...NAVY);
  doc.text('Le Mandataire du Groupement', W - 14, y, { align: 'right' });
  y += 24;

  /* ── Coordonnées bancaires ───────────────────────────────────────── */
  if (opts.banque ?? opts.nomClient ?? opts.numeroCompte) {
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.3);
    doc.line(14, y, W - 14, y);
    y += 8;

    const bankLine = (key: string, val: string, xVal: number) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...NAVY);
      doc.text(`${key} :`, 14, y);
      doc.setFont('helvetica', 'normal');
      doc.text(val, xVal, y);
      y += 6;
    };

    if (opts.banque) bankLine('BANQUE', opts.banque, 32);
    if (opts.nomClient) bankLine('NOM DU CLIENT', opts.nomClient, 54);
    if (opts.numeroCompte) bankLine('NUMÉRO DE COMPTE', opts.numeroCompte, 64);
  }

  /* ── Pied de page ────────────────────────────────────────────────── */
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...GREY);
  doc.text(
    `CSE Immobilier — ${site.name} — Facture ${opts.factureNumero} — Imprimé le ${todayFr()}`,
    W / 2,
    H - 6,
    { align: 'center' },
  );
  doc.setDrawColor(...CYAN);
  doc.setLineWidth(0.5);
  doc.line(14, H - 10, W - 14, H - 10);

  doc.save(
    `Facture-${opts.factureNumero.replace(/\//g, '-')}-${site.reference}-${fileStamp()}.pdf`,
  );
}
