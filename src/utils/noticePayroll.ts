import type { SubstituteNoticeRow, SubstituteRequest } from '../types';
import { dateToDayOfWeek, type LeaveBillableOptions } from './leaveDates';
import { listBillableLeaveDatesInMonth } from './leavePayrollPolicy';
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
  const n = Number.parseFloat(hours.trim());
  if (Number.isFinite(n) && n > 0) return n;
  return 1;
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

function findMatchingRequests(
  row: SubstituteNoticeRow,
  related: SubstituteRequest[]
): SubstituteRequest[] {
  const period = Number(row.period);
  const weekday = Number(row.weekday);
  const className = row.className.trim();

  return related.filter((r) => {
    const sess = r.originalSession;
    if (!sess) return false;
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
    if (className && sess.className !== className) return false;
    return true;
  });
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
  const resolvedRows = listResolvedNoticeRowsInSettlementMonth(
    effectiveNoticeRows,
    resolveOpts
  );
  const customizedPeriods = resolvedRows.reduce(
    (sum, { row }) => sum + parseNoticeRowHours(row.hours),
    0
  );

  if (customizedPeriods > 0) {
    return { periods: customizedPeriods, useBasicRate: true, resolvedRows };
  }

  return {
    periods: countOriginal(),
    useBasicRate: false,
    resolvedRows: [],
  };
}
