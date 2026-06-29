import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Lot, Task } from '@/api/types';

export interface ExportSite {
  name: string;
  reference: string;
}

const NAVY: [number, number, number] = [0, 51, 102];
const CYAN: [number, number, number] = [0, 174, 239];
const RED: [number, number, number] = [163, 45, 45];
const ORANGE: [number, number, number] = [180, 95, 6];
const ORANGE_LIGHT: [number, number, number] = [255, 237, 213];
const RED_LIGHT: [number, number, number] = [254, 226, 226];

const LOT_HEADERS = [
  'Code',
  'Corps de métier',
  'Début',
  'Fin',
  'Avancement réel (%)',
  'Planifié (%)',
  'En retard',
  'À démarrer',
  'Retard max (j)',
];

const TASK_HEADERS = [
  'Lot',
  'Tâche',
  'Début',
  'Fin',
  'Avancement (%)',
  'Statut',
  'Alerte',
];

interface Totals {
  reel: number;
  plan: number;
  tasks: number;
  late: number;
  toStart: number;
}

function computeTotals(lots: Lot[]): Totals {
  const totW = lots.reduce((a, l) => a + (l.weight || 1), 0) || lots.length || 1;
  return {
    reel: Math.round(lots.reduce((a, l) => a + (l.weight || 1) * l.progressPct, 0) / totW),
    plan: Math.round(lots.reduce((a, l) => a + (l.weight || 1) * l.plannedPct, 0) / totW),
    tasks: lots.reduce((a, l) => a + l.tasks.length, 0),
    late: lots.reduce((a, l) => a + l.tasksLate, 0),
    toStart: lots.reduce((a, l) => a + l.tasksToStart, 0),
  };
}

const fmtDate = (iso: string | null) => (iso ? iso.slice(0, 10) : '—');

function TASK_STATUS_FR(status: Task['status']): string {
  const m: Record<Task['status'], string> = {
    NOT_STARTED: 'À faire',
    IN_PROGRESS: 'En cours',
    DONE: 'Terminé',
    BLOCKED: 'Bloqué',
  };
  return m[status] ?? status;
}

function taskAlert(task: Task): string {
  if (task.enRetard) return `Retard ${task.retardJours} j`;
  if (task.aDemarrer) return 'À démarrer';
  return '';
}

function lotRow(l: Lot): (string | number)[] {
  return [
    l.code,
    l.name,
    fmtDate(l.startDate),
    fmtDate(l.endDate),
    l.progressPct,
    l.plannedPct,
    l.tasksLate,
    l.tasksToStart,
    l.retardJoursMax,
  ];
}

function taskRows(lots: Lot[]): (string | number)[][] {
  return lots.flatMap((l) =>
    l.tasks.map((t) => [
      `${l.code} – ${l.name}`,
      t.name,
      fmtDate(t.startDate),
      fmtDate(t.endDate),
      t.progressPct,
      TASK_STATUS_FR(t.status),
      taskAlert(t),
    ]),
  );
}

function today(): string {
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date());
}

function fileStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

/* ── Excel ─────────────────────────────────────────────────────────────── */

export function exportLotsToExcel(site: ExportSite, lots: Lot[]): void {
  const totals = computeTotals(lots);
  const wb = XLSX.utils.book_new();

  /* Feuille 1 : Résumé par lot */
  const aoa: (string | number)[][] = [
    ["CSE Immobilier — Suivi d’avancement par lot"],
    [`${site.name} (${site.reference})`],
    [`Exporté le ${today()}`],
    [],
    LOT_HEADERS,
    ...lots.map(lotRow),
    [],
    [
      'TOTAL',
      'Projet',
      '',
      '',
      totals.reel,
      totals.plan,
      totals.late,
      totals.toStart,
      '',
    ],
  ];

  const ws1 = XLSX.utils.aoa_to_sheet(aoa);
  ws1['!cols'] = [
    { wch: 8 },
    { wch: 32 },
    { wch: 12 },
    { wch: 12 },
    { wch: 18 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, ws1, 'Résumé par lot');

  /* Feuille 2 : Détail des tâches */
  const taskData = taskRows(lots);
  const aoa2: (string | number)[][] = [
    ["CSE Immobilier — Détail des tâches"],
    [`${site.name} (${site.reference})`],
    [`Exporté le ${today()}`],
    [],
    TASK_HEADERS,
    ...taskData,
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(aoa2);
  ws2['!cols'] = [
    { wch: 36 },
    { wch: 40 },
    { wch: 12 },
    { wch: 12 },
    { wch: 14 },
    { wch: 12 },
    { wch: 16 },
  ];
  XLSX.utils.book_append_sheet(wb, ws2, 'Détail des tâches');

  XLSX.writeFile(wb, `Avancement-par-lot-${site.reference}-${fileStamp()}.xlsx`);
}

/* ── PDF ────────────────────────────────────────────────────────────────── */

export function exportLotsToPdf(site: ExportSite, lots: Lot[]): void {
  const totals = computeTotals(lots);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();

  /* Bandeau d'en-tête */
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, pageW, 22, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.text("CSE Immobilier — Suivi d'avancement par lot", 14, 10);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`${site.name} (${site.reference})`, 14, 17);
  doc.setTextColor(...NAVY);
  doc.text(`Exporté le ${today()}`, pageW - 14, 17, { align: 'right' });

  /* Ligne résumé */
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...NAVY);
  doc.text(
    `Avancement : ${totals.reel} %  ·  Planifié : ${totals.plan} %  ·  En retard : ${totals.late}  ·  À démarrer : ${totals.toStart}`,
    14,
    30,
  );

  /* Tableau lots */
  autoTable(doc, {
    startY: 35,
    head: [LOT_HEADERS],
    body: lots.map(lotRow),
    foot: [
      ['TOTAL', 'Projet', '', '', totals.reel, totals.plan, totals.late, totals.toStart, ''],
    ],
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: CYAN, textColor: [255, 255, 255], fontStyle: 'bold' },
    footStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [244, 243, 238] },
    columnStyles: {
      0: { cellWidth: 14 },
      2: { cellWidth: 22, halign: 'center' },
      3: { cellWidth: 22, halign: 'center' },
      4: { halign: 'right' },
      5: { halign: 'right' },
      6: { halign: 'right' },
      7: { halign: 'right' },
      8: { halign: 'right' },
    },
    didParseCell: (data) => {
      if (data.section !== 'body') return;
      const col = data.column.index;
      const val = Number(data.cell.raw);
      if (col === 6 && val > 0) {
        data.cell.styles.textColor = RED;
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = RED_LIGHT;
      }
      if (col === 7 && val > 0) {
        data.cell.styles.textColor = ORANGE;
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = ORANGE_LIGHT;
      }
    },
  });

  /* Tableau détail des tâches — nouvelle page */
  doc.addPage();

  doc.setFillColor(...NAVY);
  doc.rect(0, 0, pageW, 22, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.text('CSE Immobilier — Détail des tâches', 14, 10);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`${site.name} (${site.reference})`, 14, 17);
  doc.setTextColor(...NAVY);
  doc.text(`Exporté le ${today()}`, pageW - 14, 17, { align: 'right' });

  autoTable(doc, {
    startY: 28,
    head: [TASK_HEADERS],
    body: taskRows(lots),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: CYAN, textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [244, 243, 238] },
    columnStyles: {
      0: { cellWidth: 52 },
      2: { cellWidth: 22, halign: 'center' },
      3: { cellWidth: 22, halign: 'center' },
      4: { cellWidth: 22, halign: 'right' },
      5: { cellWidth: 20, halign: 'center' },
      6: { cellWidth: 24 },
    },
    didParseCell: (data) => {
      if (data.section !== 'body') return;
      const alert = String(data.cell.raw ?? '');
      if (data.column.index === 6) {
        if (alert.startsWith('Retard')) {
          data.cell.styles.textColor = RED;
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = RED_LIGHT;
        } else if (alert === 'À démarrer') {
          data.cell.styles.textColor = ORANGE;
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = ORANGE_LIGHT;
        }
      }
    },
  });

  doc.save(`Avancement-par-lot-${site.reference}-${fileStamp()}.pdf`);
}
