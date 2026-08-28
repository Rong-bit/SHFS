import type { SubstituteNoticeRow, SubstituteRequest } from '../types';
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

export function countNoticeRowsSubstitutePayrollInMonth(
  rows: SubstituteNoticeRow[],
  settlementMonth: number,
  settlementYear: number,
  weeksInMonth = 4
): number {
  let total = 0;
  for (const row of rows) {
    if (!isMeaningfulNoticeRow(row)) continue;
    const iso = parseNoticeRowDateToIso(row.date);
    if (!iso) continue;
    if (
      !isDateInSettlementMonth(iso, settlementMonth, settlementYear, weeksInMonth)
    ) {
      continue;
    }
    total += parseNoticeRowHours(row.hours);
  }
  return total;
}

export function listNoticeRowsInSettlementMonth(
  rows: SubstituteNoticeRow[],
  settlementMonth: number,
  settlementYear: number,
  weeksInMonth = 4
): SubstituteNoticeRow[] {
  return rows.filter((row) => {
    if (!isMeaningfulNoticeRow(row)) return false;
    const iso = parseNoticeRowDateToIso(row.date);
    if (!iso) return false;
    return isDateInSettlementMonth(iso, settlementMonth, settlementYear, weeksInMonth);
  });
}
