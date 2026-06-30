import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { RapportChantier } from '@/api/types';
import { METEO_LABELS } from '@/api/types';

const NAVY: [number, number, number] = [0, 51, 102];
const CYAN: [number, number, number] = [0, 174, 239];
const GREY: [number, number, number] = [100, 116, 139];
const LIGHT: [number, number, number] = [244, 243, 238];

function fmtDate(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso));
}

function stripEmoji(s: string): string {
  return s.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}]/gu, '').trim();
}

export function exportJournalToPdf(
  siteName: string,
  siteReference: string,
  rapports: RapportChantier[],
  periodeLabel: string,
) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const margin = 14;

  function drawHeader(pageNum: number, totalPages: number) {
    doc.setFillColor(...NAVY);
    doc.rect(0, 0, W, 22, 'F');
    doc.setFillColor(...CYAN);
    doc.rect(0, 22, W, 3, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(255, 255, 255);
    doc.text('CSE IMMOBILIER', margin, 10);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('Journal de chantier', W - margin, 10, { align: 'right' });
    doc.text(`Page ${pageNum} / ${totalPages}`, W - margin, 16, { align: 'right' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(siteName, margin, 16);

    doc.setFillColor(...LIGHT);
    doc.setTextColor(...NAVY);
  }

  // Titre
  drawHeader(1, 1);
  let y = 32;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...NAVY);
  doc.text('JOURNAL DE CHANTIER', W / 2, y, { align: 'center' });
  y += 7;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(...GREY);
  doc.text(`Période : ${periodeLabel}`, W / 2, y, { align: 'center' });
  y += 5;
  doc.text(`Référence : ${siteReference}`, W / 2, y, { align: 'center' });
  y += 10;

  // Ligne séparatrice
  doc.setDrawColor(...CYAN);
  doc.setLineWidth(0.4);
  doc.line(margin, y, W - margin, y);
  y += 6;

  // Tableau récapitulatif
  const sorted = [...rapports].sort((a, b) => a.date.localeCompare(b.date));
  const totalEffectif = sorted.reduce((s, r) => s + r.effectif, 0);
  const nbJours = sorted.length;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...NAVY);
  doc.text('Résumé', margin, y);
  y += 4;

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [['Rapports', 'Total présences', 'Effectif moyen / jour']],
    body: [[
      String(nbJours),
      String(totalEffectif),
      nbJours > 0 ? Math.round(totalEffectif / nbJours).toString() : '—',
    ]],
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 248, 252] },
    theme: 'striped',
  });

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

  // Un bloc par rapport
  for (const r of sorted) {
    const lines: [string, string][] = [];
    if (r.meteo) lines.push(['Météo', stripEmoji(METEO_LABELS[r.meteo])]);
    lines.push(['Effectif présent', `${r.effectif} personnes`]);
    if (r.travauxRealises) lines.push(['Travaux réalisés', r.travauxRealises]);
    if (r.materiaux) lines.push(['Matériaux', r.materiaux]);
    if (r.observations) lines.push(['Observations', r.observations]);
    if (r.incidents) lines.push(['Incidents', r.incidents]);

    const estimatedHeight = 12 + lines.length * 10 + 8;
    if (y + estimatedHeight > H - 20) {
      doc.addPage();
      drawHeader(doc.getNumberOfPages(), doc.getNumberOfPages());
      y = 32;
    }

    // Date header
    doc.setFillColor(...NAVY);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.roundedRect(margin, y, W - 2 * margin, 8, 1, 1, 'F');
    doc.text(fmtDate(r.date).toUpperCase(), margin + 3, y + 5.5);
    if (r.incidents) {
      doc.setTextColor(255, 200, 200);
      doc.text('⚠ INCIDENT', W - margin - 3, y + 5.5, { align: 'right' });
    }
    y += 10;

    autoTable(doc, {
      startY: y,
      margin: { left: margin + 2, right: margin + 2 },
      body: lines,
      columnStyles: {
        0: { fontStyle: 'bold', fillColor: LIGHT, textColor: NAVY, cellWidth: 45 },
        1: { textColor: [30, 30, 30] },
      },
      styles: { fontSize: 8.5, cellPadding: 2.5, lineColor: [220, 220, 220], lineWidth: 0.2 },
      theme: 'plain',
    });

    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  }

  // Footer on all pages
  const totalP = doc.getNumberOfPages();
  for (let p = 1; p <= totalP; p++) {
    doc.setPage(p);
    drawHeader(p, totalP);
    doc.setFontSize(7.5);
    doc.setTextColor(...GREY);
    doc.setFont('helvetica', 'normal');
    const genDate = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' }).format(new Date());
    doc.text(`Généré le ${genDate} — CNN-BTPManager Pro`, margin, H - 7);
    doc.text(`${siteReference} · ${periodeLabel}`, W - margin, H - 7, { align: 'right' });
  }

  const safeName = siteName.replace(/[^a-zA-Z0-9_-]/g, '_');
  doc.save(`Journal_Chantier_${safeName}_${periodeLabel.replace(/\s+/g, '_')}.pdf`);
}
