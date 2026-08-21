import { DayOfWeek, PartialNonTeachingDay, TemporaryScheduleMove } from '../types';
import { dateToIsoLocal } from './holidays';

export type CalendarSettlementOptions = {
  holidaySet?: Set<string> | null;
  temporaryMoves?: TemporaryScheduleMove[] | null;
  partialStops?: PartialNonTeachingDay[] | null;
};

const ALL_PERIODS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

function jsDayToDow(js: number): DayOfWeek | null {
  if (js < 1 || js > 5) return null;
  return js as DayOfWeek;
}

function parseIsoParts(iso: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

function isoDayOfWeek(iso: string): DayOfWeek | null {
  const p = parseIsoParts(iso);
  if (!p) return null;
  const js = new Date(p.y, p.m - 1, p.d, 12, 0, 0).getDay();
  return jsDayToDow(js);
}

/** 含週末：回傳 0–6；無效日期回 null */
function isoJsDay(iso: string): number | null {
  const p = parseIsoParts(iso);
  if (!p) return null;
  return new Date(p.y, p.m - 1, p.d, 12, 0, 0).getDay();
}

function dateInYearMonth(iso: string, year: number, month: number): boolean {
  const p = parseIsoParts(iso);
  return Boolean(p && p.y === year && p.m === month);
}

function resolvePeriods(periods?: number[]): number[] {
  if (!periods || periods.length === 0) return [...ALL_PERIODS];
  return periods.filter((p) => p >= 1 && p <= 8);
}

function slotKey(dow: DayOfWeek, period: number): string {
  return `${dow}-${period}`;
}

function bump(map: Map<string, number>, key: string, delta: number) {
  if (delta === 0) return;
  map.set(key, Math.max(0, (map.get(key) || 0) + delta));
}

/**
 * 結算用：各「星期幾–節次」在該月應計幾次。
 * - 平日且非整天放假：各節 +1（再扣半日停課節次）
 * - 暫時移課：扣 sourceDate（若該日原先有計入），並在 targetDate 加回「source 星期」的節次（週六亦可）
 */
export function slotOccurrenceCountsInMonth(
  year: number,
  month: number,
  options?: CalendarSettlementOptions
): Map<string, number> {
  const holidaySet = options?.holidaySet ?? new Set<string>();
  const partialByDate = new Map<string, Set<number>>();
  for (const stop of options?.partialStops || []) {
    if (!stop?.date || !stop.periods?.length) continue;
    const set = partialByDate.get(stop.date) || new Set<number>();
    stop.periods.forEach((p) => {
      if (p >= 1 && p <= 8) set.add(p);
    });
    partialByDate.set(stop.date, set);
  }

  const counts = new Map<string, number>();
  const lastDay = new Date(year, month, 0).getDate();

  for (let day = 1; day <= lastDay; day += 1) {
    const iso = dateToIsoLocal(new Date(year, month - 1, day, 12, 0, 0));
    if (holidaySet.has(iso)) continue;
    const dow = jsDayToDow(new Date(year, month - 1, day, 12, 0, 0).getDay());
    if (dow == null) continue;
    const blocked = partialByDate.get(iso);
    for (const period of ALL_PERIODS) {
      if (blocked?.has(period)) continue;
      bump(counts, slotKey(dow, period), 1);
    }
  }

  for (const move of options?.temporaryMoves || []) {
    if (!move?.sourceDate || !move?.targetDate) continue;
    const sourceDow = isoDayOfWeek(move.sourceDate);
    // source 若為週末無法對應週一～五模板
    if (sourceDow == null) continue;
    const periods = resolvePeriods(move.periods);

    // 扣掉原日：若原日在結算月、非週末、且非整天放假（放假日基底已跳過，不必再扣）
    if (dateInYearMonth(move.sourceDate, year, month)) {
      const srcJs = isoJsDay(move.sourceDate);
      if (srcJs != null && srcJs >= 1 && srcJs <= 5 && !holidaySet.has(move.sourceDate)) {
        const blocked = partialByDate.get(move.sourceDate);
        for (const period of periods) {
          if (blocked?.has(period)) continue; // 半日已扣過，勿重複
          bump(counts, slotKey(sourceDow, period), -1);
        }
      }
    }

    // 加到補課日：只要 target 落在結算月即可（含週六）；半日停課之節次不加回
    if (dateInYearMonth(move.targetDate, year, month)) {
      const blockedTarget = partialByDate.get(move.targetDate);
      for (const period of periods) {
        if (blockedTarget?.has(period)) continue;
        bump(counts, slotKey(sourceDow, period), 1);
      }
    }
  }

  return counts;
}

/** 由 slot 計次表折成「各星期幾」出現次數（取第 1～7 節平均，供週數估算） */
export function weekdayCountsFromSlotMap(slotCounts: Map<string, number>): Record<number, number> {
  const out: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  for (let dow = 1; dow <= 5; dow += 1) {
    let sum = 0;
    for (let p = 1; p <= 7; p += 1) {
      sum += slotCounts.get(slotKey(dow as DayOfWeek, p)) || 0;
    }
    out[dow] = sum / 7;
  }
  return out;
}

export function mergeTemporaryScheduleMoves(
  existing: TemporaryScheduleMove[] | undefined,
  incoming: TemporaryScheduleMove[]
): TemporaryScheduleMove[] {
  const map = new Map<string, TemporaryScheduleMove>();
  for (const m of existing || []) {
    if (m?.id) map.set(m.id, m);
  }
  for (const m of incoming) {
    if (m?.id) map.set(m.id, m);
  }
  return Array.from(map.values()).sort((a, b) =>
    a.sourceDate.localeCompare(b.sourceDate) || a.targetDate.localeCompare(b.targetDate)
  );
}

export function mergePartialNonTeachingDays(
  existing: PartialNonTeachingDay[] | undefined,
  incoming: PartialNonTeachingDay[]
): PartialNonTeachingDay[] {
  const map = new Map<string, PartialNonTeachingDay>();
  for (const m of existing || []) {
    if (m?.id) map.set(m.id, m);
  }
  for (const m of incoming) {
    if (m?.id) map.set(m.id, m);
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}
