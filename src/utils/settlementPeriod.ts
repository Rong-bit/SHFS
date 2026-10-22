import { dateToIsoLocal } from './holidays';

export type SettlementPeriod = {
  settlementMonth: number;
  settlementYear: number;
  startIso: string;
  endIso: string;
  weeks: number;
};

/** 學年起始西元年（8 月） */
export function academicAugustWesternYear(
  settlementMonth: number,
  settlementWesternYear: number
): number {
  return settlementMonth >= 8 ? settlementWesternYear : settlementWesternYear - 1;
}

/** 學年度內第幾個結算月（8 月 = 0） */
export function academicSettlementMonthIndex(settlementMonth: number): number {
  return settlementMonth >= 8 ? settlementMonth - 8 : settlementMonth + 4;
}

/** 8 月 1 日起算，第一個週日為該學年結算週期起點 */
export function firstPayrollSundayOnOrAfterAugust1(westernYear: number): Date {
  const aug1 = new Date(westernYear, 7, 1, 12, 0, 0);
  const jsDay = aug1.getDay();
  if (jsDay === 0) return aug1;
  return new Date(westernYear, 7, 1 + (7 - jsDay), 12, 0, 0);
}

/** 該曆月最後一個週六（month = 1～12） */
export function lastSaturdayOfMonth(westernYear: number, month: number): Date {
  const d = new Date(westernYear, month, 0, 12, 0, 0);
  while (d.getDay() !== 6) d.setDate(d.getDate() - 1);
  return d;
}

/**
 * 結算月區間：結至該曆月最後一個週六；週數隨月自然為 4 或 5。
 * 8 月自該學年 8/1 後第一個週日起；其後各月自上期迄日隔天（週日）起。
 * 例：115/10 → 9/27～10/31（5 週）。
 *
 * `@param _weeksInMonth` 已不再決定區間長度（保留參數以相容舊呼叫；請改用全月折算分母）。
 */
export function resolveSettlementPeriod(
  settlementMonth: number,
  settlementWesternYear: number,
  _weeksInMonth?: number
): SettlementPeriod {
  const end = lastSaturdayOfMonth(settlementWesternYear, settlementMonth);
  let start: Date;
  if (settlementMonth === 8) {
    start = firstPayrollSundayOnOrAfterAugust1(settlementWesternYear);
  } else {
    const prevMonth = settlementMonth === 1 ? 12 : settlementMonth - 1;
    const prevYear = settlementMonth === 1 ? settlementWesternYear - 1 : settlementWesternYear;
    const prevEnd = lastSaturdayOfMonth(prevYear, prevMonth);
    start = new Date(prevEnd);
    start.setDate(start.getDate() + 1);
  }
  const dayMs = 24 * 60 * 60 * 1000;
  const days = Math.round((end.getTime() - start.getTime()) / dayMs) + 1;
  const weeks = Math.max(1, Math.round(days / 7));
  return {
    settlementMonth,
    settlementYear: settlementWesternYear,
    startIso: dateToIsoLocal(start),
    endIso: dateToIsoLocal(end),
    weeks,
  };
}

/** 月額依實際結算週數／全月折算基準比例折算（例：4 週月、基準 5 → 4/5） */
export function prorateFullMonthAmount(
  amount: number,
  actualWeeks: number,
  weeksInMonthBasis: number
): number {
  const basis = Math.max(1, weeksInMonthBasis);
  const weeks = Math.max(0, actualWeeks);
  return amount * (weeks / basis);
}

export function isDateInSettlementPeriod(
  iso: string,
  period: Pick<SettlementPeriod, 'startIso' | 'endIso'>
): boolean {
  return iso >= period.startIso && iso <= period.endIso;
}

export function isDateInSettlementMonth(
  iso: string,
  settlementMonth: number,
  settlementWesternYear: number,
  _weeksInMonth?: number
): boolean {
  const period = resolveSettlementPeriod(settlementMonth, settlementWesternYear);
  return isDateInSettlementPeriod(iso, period);
}

const ACADEMIC_MONTH_ORDER = [8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6, 7] as const;

function parseIsoParts(iso: string): { year: number; month: number } | null {
  const [year, month] = (iso || '').split('-').map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return null;
  }
  return { year, month };
}

/**
 * 找出包含該日的結算期（結至曆月最後週六）。
 * 例：115 學年 8/1 為週六 → 8/30 屬 9 月期（8/30～9/26），不屬 8 月期（8/2～8/29）。
 * 若落在兩期之間的空隙，改對應曆月結算期（與申請畫面預設一致）。
 */
export function settlementPeriodContainingIso(
  iso: string,
  _weeksInMonth?: number
): SettlementPeriod {
  const parts = parseIsoParts(iso);
  const fallbackYear = parts?.year ?? new Date().getFullYear();
  const fallbackMonth = parts?.month ?? new Date().getMonth() + 1;
  if (parts) {
    for (const ay of [parts.year + 1, parts.year, parts.year - 1, parts.year - 2]) {
      for (const month of ACADEMIC_MONTH_ORDER) {
        const settlementYear = month >= 8 ? ay : ay + 1;
        const period = resolveSettlementPeriod(month, settlementYear);
        if (iso >= period.startIso && iso <= period.endIso) return period;
      }
    }
  }
  return resolveSettlementPeriod(fallbackMonth, fallbackYear);
}

export function settlementMonthForEventIso(
  eventIso: string | undefined,
  _weeksInMonth?: number
): number {
  return settlementPeriodContainingIso(eventIso || isoDaysAgo(0)).settlementMonth;
}

export function isoDaysAgo(days: number, from = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() - days, 12, 0, 0);
  return dateToIsoLocal(d);
}

export function formatSettlementMonthShortRange(period: Pick<SettlementPeriod, 'startIso' | 'endIso'>): string {
  const [, sm, sd] = period.startIso.split('-');
  const [, em, ed] = period.endIso.split('-');
  return `${Number(sm)}/${Number(sd)}～${Number(em)}/${Number(ed)}`;
}

export function formatRocDateLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${y - 1911}年${m}月${d}日`;
}

export function formatPayrollMonthRangeLabel(
  settlementMonth: number,
  settlementWesternYear: number,
  _weeksInMonth?: number
): string {
  const period = resolveSettlementPeriod(settlementMonth, settlementWesternYear);
  return `${formatRocDateLabel(period.startIso)} ~ ${formatRocDateLabel(period.endIso)} 共(${period.weeks}週)`;
}

export function isoInInclusiveRange(
  iso: string,
  startIso?: string | null,
  endIso?: string | null
): boolean {
  if (startIso && iso < startIso) return false;
  if (endIso && iso > endIso) return false;
  return true;
}

export function clipDateRange(
  windowStart: string,
  windowEnd: string,
  clipStart?: string | null,
  clipEnd?: string | null
): { startIso: string; endIso: string } | null {
  const start = clipStart && clipStart > windowStart ? clipStart : windowStart;
  const end = clipEnd && clipEnd < windowEnd ? clipEnd : windowEnd;
  if (start > end) return null;
  return { startIso: start, endIso: end };
}

/** 區間內有平日的週數（以該週週一為鍵；課輔「幾星期」用） */
export function countSchoolWeeksInIsoRange(startIso: string, endIso: string): number {
  const s = new Date(startIso.replace(/-/g, '/') + ' 12:00:00');
  const e = new Date(endIso.replace(/-/g, '/') + ' 12:00:00');
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) return 0;
  const weeks = new Set<string>();
  for (let cur = new Date(s); cur <= e; cur.setDate(cur.getDate() + 1)) {
    const js = cur.getDay();
    if (js < 1 || js > 5) continue;
    const monday = new Date(cur);
    monday.setDate(cur.getDate() - (js - 1));
    weeks.add(dateToIsoLocal(monday));
  }
  return weeks.size;
}

export function resolveCounselingActiveRange(
  settlementMonth: number,
  settlementYear: number,
  _weeksInMonth: number,
  counselingStartDate?: string | null,
  counselingEndDate?: string | null
): { startIso: string; endIso: string; weeks: number } | null {
  const period = resolveSettlementPeriod(settlementMonth, settlementYear);
  const clipped = clipDateRange(
    period.startIso,
    period.endIso,
    counselingStartDate?.trim() || null,
    counselingEndDate?.trim() || null
  );
  if (!clipped) return null;
  return {
    ...clipped,
    weeks: countSchoolWeeksInIsoRange(clipped.startIso, clipped.endIso),
  };
}

export function eachDateInSettlementPeriod(
  period: Pick<SettlementPeriod, 'startIso' | 'endIso'>,
  fn: (iso: string, jsDay: number) => void
): void {
  const start = new Date(period.startIso.replace(/-/g, '/') + ' 12:00:00');
  const end = new Date(period.endIso.replace(/-/g, '/') + ' 12:00:00');
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return;
  for (let cur = new Date(start); cur <= end; cur.setDate(cur.getDate() + 1)) {
    fn(dateToIsoLocal(cur), cur.getDay());
  }
}
