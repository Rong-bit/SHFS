import type { CourseSession, DayOfWeek, SubstituteNoticeRow, SubstituteRequest } from '../types';
import { dateToIsoLocal } from './holidays';
import { dateToDayOfWeek, resolveLeaveDateEnd, type LeaveBillableOptions } from './leaveDates';
import {
  isLeaveDatePublicPayroll,
  listBillableLeaveDatesInMonth,
  listBillableLeaveDatesInRange,
  type LeavePayrollContext,
} from './leavePayrollPolicy';
import { isDateInSettlementMonth } from './settlementPeriod';

export function isMeaningfulNoticeRow(row: SubstituteNoticeRow): boolean {
  return Boolean(
    row.date.trim() ||
      row.weekday.trim() ||
      row.period.trim() ||
      row.className.trim() ||
      row.subjectName.trim() ||
      row.hours.trim()
  );
}

/** 通知單日期欄：115/6/17 或 2026/6/17 → YYYY-MM-DD */
export function parseNoticeRowDateToIso(date: string): string | null {
  const trimmed = date.trim();
  if (!trimmed) return null;
  const parts = trimmed.replace(/-/g, '/').split('/').map((s) => s.trim());
  if (parts.length !== 3) return null;
  const [yRaw, mRaw, dRaw] = parts;
  const m = Number(mRaw);
  const d = Number(dRaw);
  if (!m || !d || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const yNum = Number(yRaw);
  if (!Number.isFinite(yNum)) return null;
  const westernYear = yNum > 1911 ? yNum : yNum + 1911;
  return `${westernYear}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function parseNoticeRowHours(hours: string): number {
  const trimmed = hours.trim();
  if (!trimmed || trimmed === '兼課') return 1;
  const n = Number.parseFloat(trimmed);
  if (Number.isFinite(n) && n > 0) return n;
  return 1;
}

export function noticeRowFieldsEqual(a: SubstituteNoticeRow, b: SubstituteNoticeRow): boolean {
  return (
    a.date === b.date &&
    a.weekday === b.weekday &&
    a.period === b.period &&
    a.className === b.className &&
    a.subjectName === b.subjectName &&
    a.hours === b.hours
  );
}

function formatNoticeDate(iso?: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso.replace(/-/g, '/');
  return `${Number(y)}/${Number(m)}/${Number(d)}`;
}

function weekdayFromIso(iso?: string): number | null {
  if (!iso) return null;
  const d = new Date(iso.replace(/-/g, '/') + ' 12:00:00');
  if (Number.isNaN(d.getTime())) return null;
  const js = d.getDay();
  if (js < 1 || js > 5) return null;
  return js;
}

function listDatesMatchingWeekday(start: string, end: string, dayOfWeek: DayOfWeek): string[] {
  const s = new Date(start.replace(/-/g, '/') + ' 12:00:00');
  const e = new Date(end.replace(/-/g, '/') + ' 12:00:00');
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) {
    return start ? [start] : [];
  }
  const dates: string[] = [];
  for (let cur = new Date(s); cur <= e; cur.setDate(cur.getDate() + 1)) {
    if (cur.getDay() === dayOfWeek) dates.push(dateToIsoLocal(cur));
  }
  return dates;
}

function defaultNoticeRowFromSession(session: CourseSession, dateIso?: string): SubstituteNoticeRow {
  const weekday = weekdayFromIso(dateIso) ?? session.dayOfWeek;
  return {
    date: formatNoticeDate(dateIso),
    weekday: String(weekday),
    period: String(session.period),
    className: session.className || '',
    subjectName: session.subjectName || '',
    hours: session.isConcurrent ? '兼課' : '',
  };
}

export function buildDefaultNoticeRowsFromRequests(
  related: SubstituteRequest[]
): SubstituteNoticeRow[] {
  const rows = related.flatMap((r) => {
    const sess = r.originalSession;
    if (!sess) return [];
    const start = r.leaveDateStart || '';
    const end = resolveLeaveDateEnd(start, r.leaveDateEnd) || start;
    const dates =
      start && end && sess.dayOfWeek
        ? listDatesMatchingWeekday(start, end, sess.dayOfWeek)
        : start
          ? [start]
          : [''];
    const dateList = dates.length ? dates : [start || ''];
    return dateList.map((iso) => defaultNoticeRowFromSession(sess, iso || undefined));
  });
  const sortKey = (date: string) => parseNoticeRowDateToIso(date) ?? date.replace(/\//g, '-');
  return [...rows].sort((a, b) => {
    const dateA = sortKey(a.date);
    const dateB = sortKey(b.date);
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    const periodA = Number(a.period) || 0;
    const periodB = Number(b.period) || 0;
    if (periodA !== periodB) return periodA - periodB;
    return a.className.localeCompare(b.className, 'zh-Hant');
  });
}

/** 與課表預設列完全相同者視為未改；對不到預設列（含新增列、改過任一欄）視為已修改。 */
export function classifySavedNoticeRows(
  savedRows: SubstituteNoticeRow[],
  defaultRows: SubstituteNoticeRow[]
): { row: SubstituteNoticeRow; modified: boolean }[] {
  const unused = defaultRows.filter(isMeaningfulNoticeRow).map((row) => ({ row, used: false }));
  return savedRows.filter(isMeaningfulNoticeRow).map((row) => {
    const hit = unused.find((item) => !item.used && noticeRowFieldsEqual(item.row, row));
    if (hit) {
      hit.used = true;
      return { row, modified: false };
    }
    return { row, modified: true };
  });
}

export function resolveEffectiveNoticeRows(
  request: SubstituteRequest,
  allRequests: SubstituteRequest[]
): SubstituteNoticeRow[] | null {
  const customizedRows = (r: SubstituteRequest) =>
    r.noticeRowsCustomized
      ? r.noticeRows?.filter(isMeaningfulNoticeRow) ?? []
      : [];

  const own = customizedRows(request);
  if (own.length > 0) return own;

  if (!request.batchGroupId) return null;

  for (const r of allRequests) {
    if (r.batchGroupId !== request.batchGroupId) continue;
    const batchRows = customizedRows(r);
    if (batchRows.length > 0) return batchRows;
  }
  return null;
}

export function getRelatedSubstituteRequests(
  request: SubstituteRequest,
  allRequests: SubstituteRequest[]
): SubstituteRequest[] {
  if (request.batchGroupId) {
    return allRequests.filter(
      (r) =>
        r.batchGroupId === request.batchGroupId &&
        r.status === 'approved' &&
        r.requestType === 'substitute'
    );
  }
  return request.status === 'approved' && request.requestType === 'substitute'
    ? [request]
    : [];
}

export type NoticePayrollResolveOptions = {
  relatedRequests: SubstituteRequest[];
  settlementMonth: number;
  settlementYear: number;
  weeksInMonth?: number;
  holidaySet?: Set<string>;
  calendarOpts?: LeaveBillableOptions;
};

export type ResolvedNoticePayrollRow = {
  row: SubstituteNoticeRow;
  iso: string;
};

function matchesNoticeSlot(
  row: SubstituteNoticeRow,
  request: SubstituteRequest,
  options: { requireClassName: boolean }
): boolean {
  const sess = request.originalSession;
  if (!sess) return false;
  const period = Number(row.period);
  const weekday = Number(row.weekday);
  const className = row.className.trim();
  if (row.period.trim() && Number.isFinite(period) && period > 0 && sess.period !== period) {
    return false;
  }
  if (
    row.weekday.trim() &&
    Number.isFinite(weekday) &&
    weekday >= 1 &&
    weekday <= 5 &&
    sess.dayOfWeek !== weekday
  ) {
    return false;
  }
  if (options.requireClassName && className && sess.className !== className) return false;
  return true;
}

function findMatchingRequests(
  row: SubstituteNoticeRow,
  related: SubstituteRequest[],
  options?: { allowFallback?: boolean }
): SubstituteRequest[] {
  const byClass = related.filter((r) => matchesNoticeSlot(row, r, { requireClassName: true }));
  if (byClass.length > 0) return byClass;
  // 科目／班級改成監考等人工調整後，仍依節次／星期對到原請假單
  const bySlot = related.filter((r) => matchesNoticeSlot(row, r, { requireClassName: false }));
  if (bySlot.length > 0) return bySlot;
  if (options?.allowFallback === false) return [];
  return related.filter((r) => Boolean(r.leaveDateStart && r.originalSession));
}

/** 此請假單對應的通知單列是否曾人工修改（僅該列改入代課清冊；未改列維持兼課轉移） */
export function requestHasModifiedNoticePayrollRow(
  request: SubstituteRequest,
  allRequests: SubstituteRequest[]
): boolean {
  const saved = resolveEffectiveNoticeRows(request, allRequests);
  if (!saved) return false;
  const related = getRelatedSubstituteRequests(request, allRequests);
  const classified = classifySavedNoticeRows(saved, buildDefaultNoticeRowsFromRequests(related));
  return classified.some(
    ({ row, modified }) =>
      modified && findMatchingRequests(row, [request], { allowFallback: false }).length > 0
  );
}

function collectCandidateDatesForRow(
  row: SubstituteNoticeRow,
  opts: NoticePayrollResolveOptions
): string[] {
  const matching = findMatchingRequests(row, opts.relatedRequests);
  const dates: string[] = [];
  const weeksInMonth = opts.weeksInMonth ?? 4;

  for (const r of matching) {
    if (!r.leaveDateStart) continue;
    const periodOpts = {
      ...opts.calendarOpts,
      weeksInMonth,
      period: r.originalSession?.period,
    };
    dates.push(
      ...listBillableLeaveDatesInMonth(
        r,
        opts.settlementMonth,
        opts.settlementYear,
        opts.holidaySet,
        periodOpts
      )
    );
  }

  return [...new Set(dates)].sort();
}

function inferNoticeRowDateIso(
  row: SubstituteNoticeRow,
  opts: NoticePayrollResolveOptions,
  consumed: Set<string>
): string | null {
  const weeksInMonth = opts.weeksInMonth ?? 4;
  const candidates = collectCandidateDatesForRow(row, opts);
  const period = row.period.trim();
  const className = row.className.trim();
  const weekday = Number(row.weekday);

  for (const iso of candidates) {
    if (!isDateInSettlementMonth(iso, opts.settlementMonth, opts.settlementYear, weeksInMonth)) {
      continue;
    }
    if (
      row.weekday.trim() &&
      Number.isFinite(weekday) &&
      weekday >= 1 &&
      weekday <= 5 &&
      dateToDayOfWeek(iso) !== weekday
    ) {
      continue;
    }
    const slotKey = `${iso}|${period}|${className}`;
    if (consumed.has(slotKey)) continue;
    consumed.add(slotKey);
    return iso;
  }
  return null;
}

function resolveNoticeRowDateIso(
  row: SubstituteNoticeRow,
  opts: NoticePayrollResolveOptions,
  consumed: Set<string>
): string | null {
  const parsed = parseNoticeRowDateToIso(row.date);
  if (parsed) {
    const period = Number(row.period) || 0;
    const className = row.className.trim();
    const slotKey = `${parsed}|${period}|${className}`;
    if (consumed.has(slotKey)) return null;
    consumed.add(slotKey);
    return parsed;
  }
  return inferNoticeRowDateIso(row, opts, consumed);
}

export function listResolvedNoticeRowsInSettlementMonth(
  rows: SubstituteNoticeRow[],
  opts: NoticePayrollResolveOptions
): ResolvedNoticePayrollRow[] {
  const weeksInMonth = opts.weeksInMonth ?? 4;
  const consumed = new Set<string>();
  const resolved: ResolvedNoticePayrollRow[] = [];

  for (const row of rows) {
    if (!isMeaningfulNoticeRow(row)) continue;
    const iso = resolveNoticeRowDateIso(row, opts, consumed);
    if (!iso) continue;
    if (!isDateInSettlementMonth(iso, opts.settlementMonth, opts.settlementYear, weeksInMonth)) {
      continue;
    }
    resolved.push({ row, iso });
  }

  return resolved;
}

/** 通知單表格列：僅計入對應請假單、該日可計費且已達公費門檻者 */
export function filterResolvedNoticeRowsForPublicPayroll(
  resolvedRows: ResolvedNoticePayrollRow[],
  relatedRequests: SubstituteRequest[],
  ctx: LeavePayrollContext,
  excludeDates?: Set<string>,
  calendarOpts?: LeaveBillableOptions
): ResolvedNoticePayrollRow[] {
  return resolvedRows.filter(({ row, iso }) => {
    const matching = findMatchingRequests(row, relatedRequests);
    if (matching.length === 0) return false;
    return matching.some((r) => {
      if (!r.leaveDateStart || !r.originalSession) return false;
      const periodOpts: LeaveBillableOptions = {
        ...calendarOpts,
        period: r.originalSession.period,
      };
      const billable = listBillableLeaveDatesInRange(r, excludeDates, periodOpts);
      if (!billable.includes(iso)) return false;
      return isLeaveDatePublicPayroll(iso, r, ctx, r.applicantTeacherId);
    });
  });
}

export function countNoticeRowsSubstitutePayrollInMonth(
  rows: SubstituteNoticeRow[],
  settlementMonth: number,
  settlementYear: number,
  weeksInMonth = 4,
  resolveOpts?: Omit<NoticePayrollResolveOptions, 'settlementMonth' | 'settlementYear' | 'weeksInMonth'>
): number {
  const opts: NoticePayrollResolveOptions = {
    relatedRequests: resolveOpts?.relatedRequests ?? [],
    settlementMonth,
    settlementYear,
    weeksInMonth,
    holidaySet: resolveOpts?.holidaySet,
    calendarOpts: resolveOpts?.calendarOpts,
  };
  return listResolvedNoticeRowsInSettlementMonth(rows, opts).reduce(
    (sum, { row }) => sum + parseNoticeRowHours(row.hours),
    0
  );
}

/** @deprecated 請改用 listResolvedNoticeRowsInSettlementMonth */
export function listNoticeRowsInSettlementMonth(
  rows: SubstituteNoticeRow[],
  settlementMonth: number,
  settlementYear: number,
  weeksInMonth = 4
): SubstituteNoticeRow[] {
  return listResolvedNoticeRowsInSettlementMonth(rows, {
    relatedRequests: [],
    settlementMonth,
    settlementYear,
    weeksInMonth,
  }).map(({ row }) => row);
}

export type NoticePayrollCountResult = {
  periods: number;
  /** true＝依自訂表格以基本鐘點計算；false＝退回原課表邏輯 */
  useBasicRate: boolean;
  resolvedRows: ResolvedNoticePayrollRow[];
};

export function countSubstitutePayrollWithNoticeRows(
  effectiveNoticeRows: SubstituteNoticeRow[],
  relatedRequests: SubstituteRequest[],
  settlementMonth: number,
  settlementYear: number,
  weeksInMonth: number,
  holidaySet: Set<string> | undefined,
  calendarOpts: LeaveBillableOptions | undefined,
  payrollCtx: LeavePayrollContext,
  countOriginal: () => number
): NoticePayrollCountResult {
  const resolveOpts: NoticePayrollResolveOptions = {
    relatedRequests,
    settlementMonth,
    settlementYear,
    weeksInMonth,
    holidaySet,
    calendarOpts,
  };
  const resolvedRows = filterResolvedNoticeRowsForPublicPayroll(
    listResolvedNoticeRowsInSettlementMonth(effectiveNoticeRows, resolveOpts),
    relatedRequests,
    payrollCtx,
    holidaySet,
    calendarOpts
  );
  const classified = classifySavedNoticeRows(
    effectiveNoticeRows,
    buildDefaultNoticeRowsFromRequests(relatedRequests)
  );
  const modifiedByRow = new Map(classified.map((item) => [item.row, item.modified]));
  const substituteRows = resolvedRows.filter(({ row }) => {
    const modified = modifiedByRow.get(row);
    if (modified) return true;
    // 未修改的兼課列維持兼課轉移，不入代課清冊
    return row.hours.trim() !== '兼課';
  });
  const customizedPeriods = substituteRows.reduce(
    (sum, { row }) => sum + parseNoticeRowHours(row.hours),
    0
  );

  const hasModifiedRow = classified.some((item) => item.modified);
  if (hasModifiedRow || effectiveNoticeRows.some(isMeaningfulNoticeRow)) {
    return { periods: customizedPeriods, useBasicRate: true, resolvedRows: substituteRows };
  }

  return {
    periods: countOriginal(),
    useBasicRate: false,
    resolvedRows: [],
  };
}
