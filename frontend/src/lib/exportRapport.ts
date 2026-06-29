import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Lot, Site, SiteKpi, SiteMember, Situation, SousTraitant, TravauxSupp } from '@/api/types';
import { formatFCFA } from './format';
import { montantEnLettresMaj } from './nombreEnLettres';

/* ── Palette ──────────────────────────────────────────────────────────── */
const NAVY: [number, number, number] = [0, 51, 102];
const CYAN: [number, number, number] = [0, 174, 239];
const GREY: [number, number, number] = [100, 116, 139];
const LIGHT: [number, number, number] = [244, 243, 238];
const RED_RGB: [number, number, number] = [163, 45, 45];
const GREEN_RGB: [number, number, number] = [34, 124, 58];

/* ── Helpers ──────────────────────────────────────────────────────────── */
function todayFr(): string {
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date());
}
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('fr-FR').format(new Date(iso));
}
function pctStr(v: number): string {
  return `${Number(v.toFixed(1))} %`;
}
function ecartStr(v: number): string {
  return `${v > 0 ? '+' : ''}${Number(v.toFixed(1))} %`;
}

export interface RapportData {
  site: Site & { members: SiteMember[] };
  kpi: SiteKpi | null;
  lots: Lot[];
  lastSituation: Situation | null;
  sousTraitants: SousTraitant[];
  travauxSupp: TravauxSupp[];
  periodeLabel: string;
}

/* ── Bandeau d'en-tête ────────────────────────────────────────────────── */
function drawHeader(doc: jsPDF, site: RapportData['site'], periode: string) {
  const W = doc.internal.pageSize.getWidth();

  doc.setFillColor(...NAVY);
  doc.rect(0, 0, W, 30, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('CSE IMMOBILIER', 14, 12);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Direction des Travaux & Réalisations', 14, 18);
  doc.text('Dakar, Sénégal', 14, 23);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('RAPPORT DE CHANTIER', W - 14, 12, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Période : ${periode}`, W - 14, 19, { align: 'right' });
  doc.text(`Édité le : ${todayFr()}`, W - 14, 24, { align: 'right' });

  doc.setFillColor(...CYAN);
  doc.rect(0, 30, W, 2, 'F');

  doc.setFillColor(...LIGHT);
  doc.rect(0, 32, W, 18, 'F');

  doc.setTextColor(...NAVY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('CHANTIER', 14, 38);
  doc.setFontSize(11);
  doc.text(site.name, 14, 44);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...GREY);
  doc.text(`Réf. : ${site.reference}   |   ${site.location ?? 'Localisation non renseignée'}`, 14, 49);

  doc.setTextColor(...NAVY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('MAÎTRE D\'OUVRAGE', W / 2, 38);
  doc.setFont('helvetica', 'normal');
  doc.text('CSE Immobilier', W / 2, 44);
  doc.setTextColor(...GREY);
  doc.setFontSize(7.5);
  doc.text(
    `Début : ${fmtDate(site.startDate)}   |   Fin prévue : ${fmtDate(site.endDatePlanned ?? '')}   |   Budget HT : ${formatFCFA(site.marcheHt)}`,
    W / 2,
    49,
  );
}

/* ── Titre de section ─────────────────────────────────────────────────── */
function sectionTitle(doc: jsPDF, title: string, y: number): number {
  const W = doc.internal.pageSize.getWidth();
  doc.setFillColor(...NAVY);
  doc.rect(0, y, W, 8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(title.toUpperCase(), 14, y + 5.5);
  return y + 12;
}

/* ── Mini KPI boxes ───────────────────────────────────────────────────── */
function drawKpiRow(
  doc: jsPDF,
  items: Array<{ label: string; value: string; color?: [number, number, number] }>,
  y: number,
): number {
  const W = doc.internal.pageSize.getWidth();
  const margin = 14;
  const n = items.length;
  const gap = 3;
  const boxW = (W - 2 * margin - gap * (n - 1)) / n;

  items.forEach((item, i) => {
    const x = margin + i * (boxW + gap);
    doc.setFillColor(...LIGHT);
    doc.rect(x, y, boxW, 14, 'F');
    doc.setDrawColor(...GREY);
    doc.setLineWidth(0.2);
    doc.rect(x, y, boxW, 14, 'S');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...GREY);
    doc.text(item.label, x + boxW / 2, y + 4.5, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...(item.color ?? NAVY));
    doc.text(item.value, x + boxW / 2, y + 10.5, { align: 'center' });
  });

  return y + 18;
}

/* ── Pied de page (numérotation) ──────────────────────────────────────── */
function addPageNumbers(doc: jsPDF) {
  const totalPages = doc.getNumberOfPages();
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...GREY);
    doc.text(`CNN-BTPManager — Rapport confidentiel`, 14, H - 6);
    doc.text(`Page ${i} / ${totalPages}`, W - 14, H - 6, { align: 'right' });
  }
}

/* ── Bloc signatures ──────────────────────────────────────────────────── */
function drawSignatures(doc: jsPDF, y: number) {
  const W = doc.internal.pageSize.getWidth();
  const margin = 14;
  const col = (W - 2 * margin) / 3;
  const labels = ["Le Maître d'Ouvrage", "Le Maître d'Œuvre", "L'Entreprise"];

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...NAVY);

  labels.forEach((lbl, i) => {
    const x = margin + i * col;
    doc.text(lbl, x + col / 2, y, { align: 'center' });
    doc.setDrawColor(...GREY);
    doc.setLineWidth(0.3);
    doc.rect(x + 4, y + 4, col - 8, 22);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...GREY);
    doc.text('Signature & cachet', x + col / 2, y + 17, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...NAVY);
  });
}

/* ── Export principal ─────────────────────────────────────────────────── */
export function exportRapportToPdf(data: RapportData): void {
  const { site, kpi, lots, lastSituation, sousTraitants, travauxSupp, periodeLabel } = data;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const PAGE_BOTTOM = H - 18;

  drawHeader(doc, site, periodeLabel);
  let y = 55;

  // ── 1. AVANCEMENT PLANNING ────────────────────────────────────────────
  y = sectionTitle(doc, '1. Avancement Planning', y);

  const avPct = kpi?.avancementPct ?? 0;
  const planPct = kpi?.avancementPlanifie ?? 0;
  const ecart = avPct - planPct;
  const lateCount = kpi?.tasksLate ?? 0;

  y = drawKpiRow(doc, [
    { label: 'Avancement physique', value: pctStr(avPct), color: GREEN_RGB },
    { label: 'Avancement planifié', value: pctStr(planPct), color: NAVY },
    { label: 'Écart', value: ecartStr(ecart), color: ecart >= 0 ? GREEN_RGB : RED_RGB },
    { label: 'Tâches en retard', value: String(lateCount), color: lateCount > 0 ? RED_RGB : GREEN_RGB },
    { label: 'Jours restants', value: String(kpi?.joursRestants ?? '—') },
  ], y);

  // Lots table
  if (lots.length > 0) {
    const lotsRows = lots.map((l) => {
      const totW = lots.reduce((a, b) => a + (b.weight || 1), 0) || 1;
      const wPct = ((l.weight || 1) / totW * 100).toFixed(0);
      return [
        l.code,
        l.name,
        `${wPct} %`,
        pctStr(l.progressPct),
        pctStr(l.plannedPct),
        l.tasksLate > 0 ? `${l.tasksLate} retard(s)` : '—',
      ];
    });

    autoTable(doc, {
      head: [['Code', 'Corps de métier', 'Poids', 'Réel', 'Planifié', 'Alerte']],
      body: lotsRows,
      startY: y,
      margin: { left: 14, right: 14 },
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: CYAN, textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 20 },
        5: { halign: 'center' },
      },
      didParseCell: (hookData) => {
        if (hookData.section === 'body' && hookData.column.index === 5) {
          const v = String(hookData.cell.raw);
          if (v !== '—') {
            hookData.cell.styles.textColor = RED_RGB;
            hookData.cell.styles.fontStyle = 'bold';
          }
        }
      },
    });
    y = ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY ?? y) + 5;
  }

  // Late tasks subsection
  const lateTasks = lots.flatMap((l) =>
    l.tasks.filter((t) => t.enRetard).map((t) => ({
      lot: l.code,
      task: t.name,
      status: t.status,
      progress: t.progressPct,
      endDate: t.endDate,
      retardJours: t.retardJours,
    })),
  );

  if (lateTasks.length > 0) {
    if (y > PAGE_BOTTOM - 20) { doc.addPage(); y = 20; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...RED_RGB);
    doc.text(`Tâches en retard (${lateTasks.length})`, 14, y);
    y += 4;

    autoTable(doc, {
      head: [['Lot', 'Tâche', 'Fin prévue', 'Avancement', 'Retard (j)']],
      body: lateTasks.map((t) => [
        t.lot,
        t.task,
        fmtDate(t.endDate),
        pctStr(t.progress),
        String(t.retardJours),
      ]),
      startY: y,
      margin: { left: 14, right: 14 },
      styles: { fontSize: 7.5, cellPadding: 2 },
      headStyles: { fillColor: RED_RGB, textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [254, 242, 242] },
    });
    y = ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY ?? y) + 5;
  }

  // ── 2. SITUATION FINANCIÈRE ───────────────────────────────────────────
  if (y > PAGE_BOTTOM - 40) { doc.addPage(); y = 20; }
  y = sectionTitle(doc, '2. Situation Financière', y);

  if (!lastSituation) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.setTextColor(...GREY);
    doc.text('Aucune situation validée pour ce chantier.', 14, y + 4);
    y += 12;
  } else {
    const s = lastSituation;
    const pctSur = s.totalHt > 0 ? ((s.totalHt / site.marcheHt) * 100).toFixed(1) : '0';

    // Sub header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...NAVY);
    doc.text(
      `Situation N°${s.numero}  —  Période : ${s.periode}  —  Date : ${fmtDate(String(s.dateEmission))}`,
      14,
      y,
    );
    y += 5;

    autoTable(doc, {
      body: [
        ['Marché HT', formatFCFA(site.marcheHt), ''],
        ['HT cumulé réalisé', formatFCFA(s.totalHt), `${pctSur} %`],
        [`TVA (${pctStr(s.tvaRate)})`, formatFCFA(s.totalTva), ''],
        ['TOTAL TTC BRUT', formatFCFA(s.totalTtc), ''],
        [`Retenue de garantie (${pctStr(s.tauxRg)})`, `− ${formatFCFA(s.montantRg)}`, ''],
        ['Déduction avance', s.deductionAvance > 0 ? `− ${formatFCFA(s.deductionAvance)}` : '—', ''],
        ['NET À PAYER', formatFCFA(s.netAPayer), ''],
      ],
      startY: y,
      margin: { left: 14, right: 14 },
      styles: { fontSize: 8, cellPadding: 2 },
      columnStyles: { 0: { cellWidth: 80 }, 1: { halign: 'right' }, 2: { halign: 'right', cellWidth: 20 } },
      didParseCell: (hookData) => {
        const row = hookData.row.index;
        if (hookData.section === 'body' && row === 6) {
          hookData.cell.styles.fillColor = NAVY;
          hookData.cell.styles.textColor = [255, 255, 255];
          hookData.cell.styles.fontStyle = 'bold';
        }
        if (hookData.section === 'body' && (row === 3)) {
          hookData.cell.styles.fontStyle = 'bold';
        }
      },
    });
    y = ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY ?? y) + 3;

    // Somme en lettres
    const lettres = montantEnLettresMaj(s.netAPayer);
    doc.setFillColor(244, 243, 238);
    doc.rect(14, y, W - 28, 12, 'F');
    doc.setDrawColor(...NAVY);
    doc.setLineWidth(0.3);
    doc.rect(14, y, W - 28, 12, 'S');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...NAVY);
    doc.text('Arrêtée à la somme de :', 18, y + 4);
    doc.setFont('helvetica', 'normal');
    const wrapped = doc.splitTextToSize(lettres, W - 36);
    doc.text(wrapped, 18, y + 9);
    y += 16;
  }

  // ── 3. SOUS-TRAITANCE ─────────────────────────────────────────────────
  const allContrats = sousTraitants.flatMap((st) =>
    (st.contrats ?? []).map((c) => ({ st: st.nom, ...c })),
  );

  if (allContrats.length > 0) {
    if (y > PAGE_BOTTOM - 30) { doc.addPage(); y = 20; }
    y = sectionTitle(doc, '3. Sous-traitance', y);

    autoTable(doc, {
      head: [['Sous-traitant', 'Référence', 'Intitulé', 'Montant HT', 'Payé HT', 'RG retenu', 'Statut']],
      body: allContrats.map((c) => [
        c.st,
        c.reference,
        c.intitule,
        formatFCFA(c.montantHt),
        formatFCFA(c.totalPaye),
        formatFCFA(c.totalRgRetenu),
        c.status,
      ]),
      startY: y,
      margin: { left: 14, right: 14 },
      styles: { fontSize: 7.5, cellPadding: 2 },
      headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right' },
        6: { halign: 'center', cellWidth: 22 },
      },
    });
    y = ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY ?? y) + 5;
  }

  // ── 4. TRAVAUX SUPPLÉMENTAIRES ────────────────────────────────────────
  const tsApprouves = travauxSupp.filter((t) => t.status !== 'BROUILLON');

  if (tsApprouves.length > 0) {
    if (y > PAGE_BOTTOM - 30) { doc.addPage(); y = 20; }
    y = sectionTitle(doc, '4. Travaux supplémentaires', y);

    const totalTsHt = tsApprouves.reduce((a, t) => a + t.montantHt, 0);
    const totalTsTtc = tsApprouves.reduce((a, t) => a + t.montantTtc, 0);

    autoTable(doc, {
      head: [['Référence', 'Description', 'Lot', 'Montant HT', 'TTC', 'Statut']],
      body: [
        ...tsApprouves.map((t) => [
          t.reference,
          t.description,
          t.lotCode ?? '—',
          formatFCFA(t.montantHt),
          formatFCFA(t.montantTtc),
          t.status,
        ]),
        ['', 'TOTAL', '', formatFCFA(totalTsHt), formatFCFA(totalTsTtc), ''],
      ],
      startY: y,
      margin: { left: 14, right: 14 },
      styles: { fontSize: 7.5, cellPadding: 2 },
      headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'center', cellWidth: 22 },
      },
      didParseCell: (hookData) => {
        if (hookData.section === 'body' && hookData.row.index === tsApprouves.length) {
          hookData.cell.styles.fontStyle = 'bold';
          hookData.cell.styles.fillColor = LIGHT;
        }
      },
    });
    y = ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY ?? y) + 5;
  }

  // ── 5. ÉQUIPE ────────────────────────────────────────────────────────
  if (site.members.length > 0) {
    if (y > PAGE_BOTTOM - 30) { doc.addPage(); y = 20; }
    y = sectionTitle(doc, '5. Équipe affectée', y);

    autoTable(doc, {
      head: [['Nom', 'Rôle']],
      body: site.members.map((m) => [m.name, m.role]),
      startY: y,
      margin: { left: 14, right: W / 2 },
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: GREY, textColor: [255, 255, 255] },
    });
    y = ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY ?? y) + 5;
  }

  // ── SIGNATURES ───────────────────────────────────────────────────────
  if (y > PAGE_BOTTOM - 35) { doc.addPage(); y = 20; }
  drawSignatures(doc, y + 5);

  // ── PAGE NUMBERS ──────────────────────────────────────────────────────
  addPageNumbers(doc);

  const stamp = new Date().toISOString().slice(0, 10);
  doc.save(`Rapport_${site.reference}_${stamp}.pdf`);
}
