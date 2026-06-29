import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Situation } from '@/api/types';
import { formatFCFA } from './format';

const NAVY: [number, number, number] = [0, 51, 102];
const CYAN: [number, number, number] = [0, 174, 239];

export interface ExportSite {
  name: string;
  reference: string;
}

function today(): string {
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date());
}

function fileStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

export function exportSituationToPdf(site: ExportSite, s: Situation): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();

  /* Bandeau */
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, pageW, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('CSE Immobilier', 14, 10);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(`Situation de travaux n° ${s.numero}`, 14, 17);
  doc.setFontSize(9);
  doc.text(`${site.name} — ${site.reference}`, 14, 23);

  /* Date */
  doc.setTextColor(...NAVY);
  doc.setFontSize(9);
  doc.text(`Période : ${s.periode}   |   Émission : ${s.dateEmission.slice(0, 10)}   |   Imprimé le ${today()}`, 14, 34);

  /* Tableau des lignes */
  autoTable(doc, {
    startY: 38,
    head: [['Lot', 'Intitulé', 'Marché HT (FCFA)', 'Avanct. %', 'Montant HT (FCFA)']],
    body: s.lignes.map((l) => [
      l.lotCode,
      l.lotName,
      l.montantMarcheHt > 0 ? formatFCFA(l.montantMarcheHt) : '—',
      `${l.avancementCumul} %`,
      l.montantHtCumul > 0 ? formatFCFA(l.montantHtCumul) : '—',
    ]),
    styles: { fontSize: 9, cellPadding: 2.5 },
    headStyles: { fillColor: CYAN, textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [244, 243, 238] },
    columnStyles: {
      0: { cellWidth: 16 },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
    },
  });

  const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;

  /* Récapitulatif financier */
  const recap = [
    ['Montant HT', formatFCFA(s.totalHt)],
    [`TVA (${(s.tvaRate * 100).toFixed(0)} %)`, formatFCFA(s.totalTva)],
    ['TOTAL TTC', formatFCFA(s.totalTtc)],
  ];

  autoTable(doc, {
    startY: finalY,
    body: recap,
    styles: { fontSize: 10, cellPadding: 3 },
    columnStyles: {
      0: { fontStyle: 'bold', textColor: NAVY },
      1: { halign: 'right', fontStyle: 'bold', textColor: NAVY },
    },
    theme: 'plain',
    margin: { left: pageW - 80 },
    tableWidth: 66,
    didParseCell: (data) => {
      if (data.row.index === 2) {
        data.cell.styles.fillColor = NAVY;
        data.cell.styles.textColor = [255, 255, 255];
      }
    },
  });

  if (s.notes) {
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(`Note : ${s.notes}`, 14, finalY + 4);
  }

  doc.save(
    `Situation-${s.numero}-${site.reference}-${fileStamp()}.pdf`,
  );
}
