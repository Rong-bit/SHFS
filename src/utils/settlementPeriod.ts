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

/**
 * 結算月對應的連續 N 週區間（預設 4 週）。
 * 超出曆月天數併入前後結算月，例 115/8 → 8/2～8/29。
 */
export function resolveSettlementPeriod(
  settlementMonth: number,
  settlementWesternYear: number,
  weeksInMonth = 4
): SettlementPeriod {
  const weeks = Math.max(1, weeksInMonth);
  const ayAugustYear = academicAugustWesternYear(settlementMonth, settlementWesternYear);
  const anchor = firstPayrollSundayOnOrAfterAugust1(ayAugustYear);
  const periodIndex = academicSettlementMonthIndex(settlementMonth);
  const start = new Date(anchor);
  start.setDate(start.getDate() + periodIndex * weeks * 7);
  const end = new Date(start);
  end.setDate(end.getDate() + weeks * 7 - 1);
  return {
    settlementMonth,
    settlementYear: settlementWesternYear,
    startIso: dateToIsoLocal(start),
    endIso: dateToIsoLocal(end),
    weeks,
  };
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
  weeksInMonth = 4
): boolean {
  const period = resolveSettlementPeriod(settlementMonth, settlementWesternYear, weeksInMonth);
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
 * 找出包含該日的結算期（連續 N 週）。
 * 例：115 學年 4 週、8/1 為週六 → 8/30 屬 9 月期（8/30～9/26），不屬 8 月期（8/2～8/29）。
 * 若落在兩期之間的空隙，改對應曆月結算期（與申請畫面預設一致）。
 */
export function settlementPeriodContainingIso(
  iso: string,
  weeksInMonth = 4
): SettlementPeriod {
  const parts = parseIsoParts(iso);
  const fallbackYear = parts?.year ?? new Date().getFullYear();
  const fallbackMonth = parts?.month ?? new Date().getMonth() + 1;
  if (parts) {
    for (const ay of [parts.year + 1, parts.year, parts.year - 1, parts.year - 2]) {
      for (const month of ACADEMIC_MONTH_ORDER) {
        const settlementYear = month >= 8 ? ay : ay + 1;
        const period = resolveSettlementPeriod(month, settlementYear, weeksInMonth);
        if (iso >= period.startIso && iso <= period.endIso) return period;
      }
    }
  }
  return resolveSettlementPeriod(fallbackMonth, fallbackYear, weeksInMonth);
}

export function settlementMonthForEventIso(
  eventIso: string | undefined,
  weeksInMonth = 4
): number {
  return settlementPeriodContainingIso(eventIso || isoDaysAgo(0), weeksInMonth).settlementMonth;
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
  weeksInMonth = 4
): string {
  const period = resolveSettlementPeriod(settlementMonth, settlementWesternYear, weeksInMonth);
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
  weeksInMonth: number,
  counselingStartDate?: string | null,
  counselingEndDate?: string | null
): { startIso: string; endIso: string; weeks: number } | null {
  const period = resolveSettlementPeriod(settlementMonth, settlementYear, weeksInMonth);
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
