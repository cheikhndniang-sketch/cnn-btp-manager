import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Lot } from '@/api/types';

export interface ExportSite {
  name: string;
  reference: string;
}

const NAVY: [number, number, number] = [0, 51, 102];
const CYAN: [number, number, number] = [0, 174, 239];
const RED: [number, number, number] = [163, 45, 45];

const HEADERS = [
  'Code',
  'Corps de métier',
  'Avancement réel (%)',
  'Planifié (%)',
  'Écart (pts)',
  'Nb tâches',
  'Tâches en retard',
  'Retard max (j)',
];

interface Totals {
  reel: number;
  plan: number;
  tasks: number;
  late: number;
}

function computeTotals(lots: Lot[]): Totals {
  const totW = lots.reduce((a, l) => a + (l.weight || 1), 0) || lots.length || 1;
  return {
    reel: Math.round(lots.reduce((a, l) => a + (l.weight || 1) * l.progressPct, 0) / totW),
    plan: Math.round(lots.reduce((a, l) => a + (l.weight || 1) * l.plannedPct, 0) / totW),
    tasks: lots.reduce((a, l) => a + l.tasks.length, 0),
    late: lots.reduce((a, l) => a + l.tasksLate, 0),
  };
}

function lotRow(l: Lot): (string | number)[] {
  return [
    l.code,
    l.name,
    l.progressPct,
    l.plannedPct,
    l.progressPct - l.plannedPct,
    l.tasks.length,
    l.tasksLate,
    l.retardJoursMax,
  ];
}

function today(): string {
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date());
}

function fileStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

export function exportLotsToExcel(site: ExportSite, lots: Lot[]): void {
  const totals = computeTotals(lots);
  const aoa: (string | number)[][] = [
    ['CSE Immobilier — Suivi d’avancement par lot'],
    [`${site.name} (${site.reference})`],
    [`Exporté le ${today()}`],
    [],
    HEADERS,
    ...lots.map(lotRow),
    [],
    ['TOTAL', 'Projet', totals.reel, totals.plan, totals.reel - totals.plan, totals.tasks, totals.late, ''],
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [
    { wch: 8 },
    { wch: 32 },
    { wch: 18 },
    { wch: 12 },
    { wch: 11 },
    { wch: 10 },
    { wch: 16 },
    { wch: 14 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Avancement par lot');
  XLSX.writeFile(wb, `Avancement-par-lot-${site.reference}-${fileStamp()}.xlsx`);
}

export function exportLotsToPdf(site: ExportSite, lots: Lot[]): void {
  const totals = computeTotals(lots);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();

  // Bandeau d'en-tête (charte CSE)
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, pageW, 22, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.text('CSE Immobilier — Suivi d’avancement par lot', 14, 10);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`${site.name} (${site.reference})`, 14, 17);
  doc.setTextColor(...NAVY);
  doc.text(`Exporté le ${today()}`, pageW - 14, 17, { align: 'right' });

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(
    `Avancement global : ${totals.reel} %  ·  Planifié : ${totals.plan} %  ·  Tâches en retard : ${totals.late}`,
    14,
    30,
  );

  autoTable(doc, {
    startY: 34,
    head: [HEADERS],
    body: lots.map(lotRow),
    foot: [
      ['TOTAL', 'Projet', totals.reel, totals.plan, totals.reel - totals.plan, totals.tasks, totals.late, ''],
    ],
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: CYAN, textColor: [255, 255, 255], fontStyle: 'bold' },
    footStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [244, 243, 238] },
    columnStyles: {
      0: { cellWidth: 16 },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
      6: { halign: 'right' },
      7: { halign: 'right' },
    },
    didParseCell: (data) => {
      if (data.section !== 'body') return;
      const value = Number(data.cell.raw);
      // Écart négatif et tâches en retard > 0 en rouge.
      if (data.column.index === 4 && value < 0) {
        data.cell.styles.textColor = RED;
        data.cell.styles.fontStyle = 'bold';
      }
      if (data.column.index === 6 && value > 0) {
        data.cell.styles.textColor = RED;
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  doc.save(`Avancement-par-lot-${site.reference}-${fileStamp()}.pdf`);
}
