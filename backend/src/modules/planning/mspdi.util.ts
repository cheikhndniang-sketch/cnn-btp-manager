/**
 * Génère un fichier XML MS Project (MSPDI — Microsoft Project Data Interchange).
 * Ce format s'ouvre nativement dans MS Project (Fichier → Ouvrir) et peut y être
 * enregistré en .mpp. Voir aussi l'utilitaire local `scripts/xml-to-mpp.ps1`.
 *
 * Structure produite : chaque lot = tâche récapitulative (niveau 1), chaque tâche = niveau 2.
 * Les tâches sont en planification manuelle pour préserver exactement les dates planifiées.
 */

export interface MspdiTaskInput {
  name: string;
  progressPct: number;
  startDate: Date | null;
  endDate: Date | null;
}

export interface MspdiLotInput {
  code: string;
  name: string;
  progressPct: number;
  tasks: MspdiTaskInput[];
}

export interface MspdiProject {
  name: string;
  reference: string;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function dt(date: Date, time: string): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${time}`;
}

/** Jours ouvrés (lun–ven) entre deux dates, inclus. Min 1. */
function workingDays(start: Date, end: Date): number {
  const a = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const b = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  if (b < a) return 1;
  let count = 0;
  const cur = new Date(a);
  while (cur <= b) {
    const wd = cur.getDay();
    if (wd !== 0 && wd !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return Math.max(1, count);
}

function isoDuration(hours: number): string {
  return `PT${hours}H0M0S`;
}

const STANDARD_CALENDAR = `  <Calendars>
    <Calendar>
      <UID>1</UID>
      <Name>Standard</Name>
      <IsBaseCalendar>1</IsBaseCalendar>
      <BaseCalendarUID>-1</BaseCalendarUID>
      <WeekDays>
        <WeekDay><DayType>1</DayType><DayWorking>0</DayWorking></WeekDay>
        ${[2, 3, 4, 5, 6]
          .map(
            (d) => `<WeekDay><DayType>${d}</DayType><DayWorking>1</DayWorking><WorkingTimes>` +
              `<WorkingTime><FromTime>08:00:00</FromTime><ToTime>12:00:00</ToTime></WorkingTime>` +
              `<WorkingTime><FromTime>13:00:00</FromTime><ToTime>17:00:00</ToTime></WorkingTime>` +
              `</WorkingTimes></WeekDay>`,
          )
          .join('\n        ')}
        <WeekDay><DayType>7</DayType><DayWorking>0</DayWorking></WeekDay>
      </WeekDays>
    </Calendar>
  </Calendars>`;

interface BuiltTask {
  uid: number;
  id: number;
  name: string;
  outline: number;
  summary: boolean;
  start: Date;
  finish: Date;
  durationHours: number;
  percent: number;
  outlineNumber: string;
}

export function buildMspdi(project: MspdiProject, lots: MspdiLotInput[]): string {
  const tasks: BuiltTask[] = [];
  let uid = 1;
  const fallback = new Date();

  lots.forEach((lot, li) => {
    const leafStarts = lot.tasks.map((t) => t.startDate).filter((d): d is Date => !!d);
    const leafFinishes = lot.tasks.map((t) => t.endDate).filter((d): d is Date => !!d);
    const lotStart = leafStarts.length
      ? new Date(Math.min(...leafStarts.map((d) => d.getTime())))
      : fallback;
    const lotFinish = leafFinishes.length
      ? new Date(Math.max(...leafFinishes.map((d) => d.getTime())))
      : fallback;

    const lotUid = uid++;
    tasks.push({
      uid: lotUid,
      id: lotUid,
      name: `${lot.code} · ${lot.name}`,
      outline: 1,
      summary: true,
      start: lotStart,
      finish: lotFinish,
      durationHours: workingDays(lotStart, lotFinish) * 8,
      percent: lot.progressPct,
      outlineNumber: String(li + 1),
    });

    lot.tasks.forEach((t, ti) => {
      const start = t.startDate ?? lotStart;
      const finish = t.endDate ?? start;
      const tUid = uid++;
      tasks.push({
        uid: tUid,
        id: tUid,
        name: t.name,
        outline: 2,
        summary: false,
        start,
        finish,
        durationHours: workingDays(start, finish) * 8,
        percent: t.progressPct,
        outlineNumber: `${li + 1}.${ti + 1}`,
      });
    });
  });

  const projStart = tasks.length
    ? new Date(Math.min(...tasks.map((t) => t.start.getTime())))
    : fallback;
  const projFinish = tasks.length
    ? new Date(Math.max(...tasks.map((t) => t.finish.getTime())))
    : fallback;

  const taskXml = tasks
    .map((t) => {
      // Tâches auto-planifiées : une contrainte « Début au plus tôt » (SNET) verrouille
      // la date de début, la durée donne la fin, et PercentComplete est respecté.
      // Les récapitulatifs (lots) calculent dates et avancement par cumul (rollup).
      const lines = [
        '    <Task>',
        `      <UID>${t.uid}</UID>`,
        `      <ID>${t.id}</ID>`,
        `      <Name>${esc(t.name)}</Name>`,
        `      <Active>1</Active>`,
        `      <Manual>0</Manual>`,
        `      <OutlineLevel>${t.outline}</OutlineLevel>`,
        `      <OutlineNumber>${t.outlineNumber}</OutlineNumber>`,
        `      <WBS>${t.outlineNumber}</WBS>`,
        `      <Summary>${t.summary ? 1 : 0}</Summary>`,
        `      <Start>${dt(t.start, '08:00:00')}</Start>`,
        `      <Finish>${dt(t.finish, '17:00:00')}</Finish>`,
        `      <Duration>${isoDuration(t.durationHours)}</Duration>`,
        `      <DurationFormat>7</DurationFormat>`,
        `      <Milestone>0</Milestone>`,
      ];
      if (!t.summary) {
        lines.push(
          `      <ConstraintType>4</ConstraintType>`,
          `      <ConstraintDate>${dt(t.start, '08:00:00')}</ConstraintDate>`,
          `      <PercentComplete>${t.percent}</PercentComplete>`,
        );
      }
      lines.push('    </Task>');
      return lines.join('\n');
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Project xmlns="http://schemas.microsoft.com/project">
  <SaveVersion>14</SaveVersion>
  <Name>${esc(project.reference)}.xml</Name>
  <Title>${esc(project.name)}</Title>
  <Author>CNN-BTPManager-Pro</Author>
  <CalendarUID>1</CalendarUID>
  <ScheduleFromStart>1</ScheduleFromStart>
  <StartDate>${dt(projStart, '08:00:00')}</StartDate>
  <FinishDate>${dt(projFinish, '17:00:00')}</FinishDate>
  <DefaultStartTime>08:00:00</DefaultStartTime>
  <DefaultFinishTime>17:00:00</DefaultFinishTime>
  <MinutesPerDay>480</MinutesPerDay>
  <MinutesPerWeek>2400</MinutesPerWeek>
  <DaysPerMonth>20</DaysPerMonth>
  <DurationFormat>7</DurationFormat>
${STANDARD_CALENDAR}
  <Tasks>
${taskXml}
  </Tasks>
</Project>
`;
}
