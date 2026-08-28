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
