import * as XLSX from 'xlsx';
import type { FinanceGlobal } from '@/api/types';

const SIT_STATUS_FR: Record<string, string> = {
  BROUILLON: 'Brouillon',
  VALIDEE: 'Validée',
  PAYEE: 'Payée',
};

const SITE_STATUS_FR: Record<string, string> = {
  ACTIVE: 'Actif',
  ARCHIVED: 'Archivé',
  COMPLETED: 'Terminé',
};

const NUM_FMT = '#,##0';
const PCT_FMT = '0.0%';

function setFmt(ws: XLSX.WorkSheet, r: number, c: number, fmt: string) {
  const addr = XLSX.utils.encode_cell({ r, c });
  if (ws[addr] && ws[addr].t === 'n') ws[addr].z = fmt;
}

export function exportFinanceGlobalToXlsx(data: FinanceGlobal): void {
  const wb = XLSX.utils.book_new();

  const now = new Date().toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  // ── Rows ────────────────────────────────────────────────────────────
  const rows: (string | number | null)[][] = [
    // 0 — Title (merged)
    ['CSE Immobilier — Tableau de bord financier global'],
    // 1 — Date (merged)
    [`Généré le : ${now}`],
    // 2 — blank
    [],
    // 3 — Summary section label
    ['RÉSUMÉ GLOBAL'],
    // 4
    ['Budget HT total (FCFA)', data.totalBudgetHt],
    // 5
    ['HT Cumulé (FCFA)', data.totalHtCumul, "Taux d'engagement", data.pctEngagement / 100],
    // 6
    ['RG total retenu (FCFA)', data.totalRgRetenu],
    // 7
    ['Net en attente — validé (FCFA)', data.totalNetEnAttente],
    // 8
    ['TS approuvés HT (FCFA)', data.totalTsApprouveHt],
    // 9
    ['Situations brouillon', data.totalSituationsBrouillon],
    // 10 — blank
    [],
    // 11 — Table header
    [
      'Référence', 'Chantier', 'Statut',
      'Marché HT (FCFA)', 'HT Cumulé (FCFA)', 'Avanc. %',
      'TVA %', 'TTC Cumulé (FCFA)', 'RG Retenu (FCFA)', 'Net à Payer (FCFA)',
      'TS Approuvés HT (FCFA)',
      'Dernière Sit. N°', 'Période', 'Statut Sit.',
      'Sit. Brouillon',
    ],
    // 12+ — Data rows
    ...data.parSite.map((s) => [
      s.siteReference,
      s.siteName,
      SITE_STATUS_FR[s.siteStatus] ?? s.siteStatus,
      s.marcheHt,
      s.htCumul,
      s.pctAvancement / 100,
      s.tvaRate,
      s.totalTtc,
      s.montantRg,
      s.netAPayer,
      s.tsApprouveHt > 0 ? s.tsApprouveHt : null,
      s.lastSituationNumero ?? null,
      s.lastSituationPeriode ?? null,
      s.lastSituationStatus
        ? (SIT_STATUS_FR[s.lastSituationStatus] ?? s.lastSituationStatus)
        : null,
      s.situationsBrouillon,
    ]),
    // Last row — Totals
    [
      'TOTAUX', '', '',
      data.totalBudgetHt,
      data.totalHtCumul,
      data.pctEngagement / 100,
      null, null,
      data.totalRgRetenu,
      data.totalNetEnAttente,
      data.totalTsApprouveHt > 0 ? data.totalTsApprouveHt : null,
      null, null, null,
      data.totalSituationsBrouillon,
    ],
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // ── Column widths ────────────────────────────────────────────────────
  ws['!cols'] = [
    { wch: 18 }, // Ref
    { wch: 42 }, // Chantier
    { wch: 10 }, // Statut
    { wch: 20 }, // Marché HT
    { wch: 20 }, // HT Cumulé
    { wch: 10 }, // Avanc %
    { wch: 8  }, // TVA %
    { wch: 20 }, // TTC
    { wch: 20 }, // RG
    { wch: 20 }, // Net
    { wch: 20 }, // TS HT
    { wch: 8  }, // Sit N°
    { wch: 14 }, // Période
    { wch: 12 }, // Statut Sit
    { wch: 14 }, // Brouillon
  ];

  // ── Merges ───────────────────────────────────────────────────────────
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 14 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 14 } },
  ];

  // ── Number formats — summary section (rows 4–9) ───────────────────
  for (let r = 4; r <= 8; r++) setFmt(ws, r, 1, NUM_FMT);
  setFmt(ws, 5, 3, PCT_FMT); // engagement %

  // ── Number formats — data table ───────────────────────────────────
  const dataStartRow = 12; // 0-based first data row
  const dataEndRow = dataStartRow + data.parSite.length; // includes totals row

  const fcfaDataCols = [3, 4, 7, 8, 9, 10];
  const pctDataCols  = [5, 6];

  for (let r = dataStartRow; r <= dataEndRow; r++) {
    for (const c of fcfaDataCols) setFmt(ws, r, c, NUM_FMT);
    for (const c of pctDataCols)  setFmt(ws, r, c, PCT_FMT);
  }

  // ── Write file ───────────────────────────────────────────────────────
  XLSX.utils.book_append_sheet(wb, ws, 'Tableau Financier');

  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `Dashboard_Financier_${stamp}.xlsx`);
}
