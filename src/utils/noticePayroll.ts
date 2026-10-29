import type { CourseSession, DayOfWeek, SubstituteNoticeRow, SubstituteRequest } from '../types';
import { dateToIsoLocal } from './holidays';
import {
  dateToDayOfWeek,
  isLeaveDatePeriodBillable,
  leaveRangeCoversDate,
  resolveLeaveDateEnd,
  type LeaveBillableOptions,
} from './leaveDates';
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
  if (!trimmed || trimmed === '兼課' || trimmed === '—' || trimmed === '-') return 1;
  const n = Number.parseFloat(trimmed);
  if (Number.isFinite(n) && n > 0) return n;
  return 1;
}

const WEEKDAY_LABEL_TO_NUM: Record<string, number> = {
  '1': 1,
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
};

export function parseNoticeWeekday(weekday: string): number | null {
  const t = weekday.trim();
  if (!t) return null;
  if (WEEKDAY_LABEL_TO_NUM[t] != null) return WEEKDAY_LABEL_TO_NUM[t];
  const n = Number(t);
  if (Number.isFinite(n) && n >= 1 && n <= 5) return n;
  return null;
}

function normalizeNoticeHours(hours: string): string {
  const t = hours.trim();
  if (!t || t === '—' || t === '-') return '';
  return t;
}

export function noticeRowKey(row: SubstituteNoticeRow): string {
  return [
    row.date.trim(),
    row.weekday.trim(),
    row.period.trim(),
    row.className.trim(),
    row.subjectName.trim(),
    normalizeNoticeHours(row.hours),
  ].join('|');
}

export function noticeRowFieldsEqual(a: SubstituteNoticeRow, b: SubstituteNoticeRow): boolean {
  return (
    a.date === b.date &&
    a.weekday === b.weekday &&
    a.period === b.period &&
    a.className === b.className &&
    a.subjectName === b.subjectName &&
    normalizeNoticeHours(a.hours) === normalizeNoticeHours(b.hours)
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
  return sortNoticeRowsByDatePeriod(rows);
}

function sortNoticeRowsByDatePeriod(rows: SubstituteNoticeRow[]): SubstituteNoticeRow[] {
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

/** 節次字串正規化（與通知單顯示端一致） */
function normalizeNoticePeriodKey(period: string | number | null | undefined): string {
  const raw = String(period ?? '')
    .trim()
    .replace(/^第\s*/, '')
    .replace(/\s*節$/, '');
  if (!raw) return '';
  const n = Number(raw);
  return Number.isFinite(n) ? String(n) : raw;
}

/**
 * 同張通知單多節可能各存一份 noticeRows（舊資料／分次儲存）。
 * 依節次合併，科目或班級相對課表有改者優先（如改「監考」），
 * 避免薪資仍吃到舊的兼課列、列表卻已顯示監考。
 */
export function mergeCustomizedNoticeRowsFromPool(
  pool: SubstituteRequest[]
): SubstituteNoticeRow[] | null {
  const byPeriod = new Map<string, SubstituteNoticeRow[]>();
  let primaryTable: SubstituteNoticeRow[] | null = null;

  for (const r of pool) {
    if (!r.noticeRowsCustomized || !r.noticeRows?.length) continue;
    const rows = r.noticeRows.filter(isMeaningfulNoticeRow);
    if (rows.length === 0) continue;
    if (!primaryTable || rows.length > primaryTable.length) {
      primaryTable = rows;
    }
    for (const row of rows) {
      const key = normalizeNoticePeriodKey(row.period);
      if (!key) continue;
      const list = byPeriod.get(key) || [];
      list.push(row);
      byPeriod.set(key, list);
    }
  }
  if (byPeriod.size === 0) {
    return primaryTable && primaryTable.length > 0 ? [...primaryTable] : null;
  }

  const merged: SubstituteNoticeRow[] = [];
  for (const [periodKey, rows] of byPeriod) {
    const owner =
      pool.find((r) => normalizeNoticePeriodKey(r.originalSession?.period) === periodKey) ||
      pool[0];
    const origSubject = (owner?.originalSession?.subjectName || '').trim();
    const origClass = (owner?.originalSession?.className || '').trim();
    const subjectChanged = rows.filter((row) => {
      const sub = (row.subjectName || '').trim();
      return Boolean(sub && sub !== origSubject);
    });
    const classChanged = rows.filter((row) => {
      const cls = (row.className || '').trim();
      return Boolean(cls && cls !== origClass);
    });
    const pick = subjectChanged.length
      ? subjectChanged[subjectChanged.length - 1]
      : classChanged.length
        ? classChanged[classChanged.length - 1]
        : rows[rows.length - 1];
    merged.push(pick);
  }

  // 合併結果節次數少於完整表格時（節次被改偏），改回完整表格
  if (primaryTable && primaryTable.length > merged.length) {
    return [...primaryTable];
  }
  return sortNoticeRowsByDatePeriod(merged);
}

/** 同一張通知單／同一代課教師的申請列（含本人；同號僅併已核准，避免草稿監考污染薪資） */
function noticeSheetPoolForPayroll(
  request: SubstituteRequest,
  allRequests: SubstituteRequest[]
): SubstituteRequest[] {
  const num = (request.requestNumber || '').trim();
  const pool = allRequests.filter((r) => {
    if (r.id === request.id) return true;
    // 未核准／非代課單不參與合併，否則 pending 草稿改監考會蓋掉已核准兼課列
    if (r.status !== 'approved' || r.requestType !== 'substitute') return false;
    if (request.batchGroupId != null && request.batchGroupId !== '') {
      if (r.batchGroupId !== request.batchGroupId) return false;
    } else if (num) {
      if (r.requestNumber !== num) return false;
    } else {
      return false;
    }
    if (
      request.substituteTeacherId &&
      r.substituteTeacherId &&
      r.substituteTeacherId !== request.substituteTeacherId
    ) {
      return false;
    }
    return true;
  });
  return pool.length > 0 ? pool : [request];
}

export function resolveEffectiveNoticeRows(
  request: SubstituteRequest,
  allRequests: SubstituteRequest[]
): SubstituteNoticeRow[] | null {
  return mergeCustomizedNoticeRowsFromPool(noticeSheetPoolForPayroll(request, allRequests));
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
  const num = (request.requestNumber || '').trim();
  if (num && request.status === 'approved' && request.requestType === 'substitute') {
    return allRequests.filter(
      (r) =>
        r.requestNumber === num &&
        r.status === 'approved' &&
        r.requestType === 'substitute' &&
        (!request.substituteTeacherId ||
          r.substituteTeacherId === request.substituteTeacherId)
    );
  }
  return request.status === 'approved' && request.requestType === 'substitute'
    ? [request]
    : [];
}

function savedNoticeRowsOf(reqs: SubstituteRequest[]): SubstituteNoticeRow[] | null {
  const hit = reqs.find(
    (r) => r.noticeRowsCustomized && r.noticeRows?.some(isMeaningfulNoticeRow)
  );
  return hit?.noticeRows ?? null;
}

function withNoticeRows(
  r: SubstituteRequest,
  rows: SubstituteNoticeRow[] | null
): SubstituteRequest {
  if (rows && rows.some(isMeaningfulNoticeRow)) {
    return { ...r, noticeRows: rows, noticeRowsCustomized: true };
  }
  const { noticeRows: _rows, noticeRowsCustomized: _custom, ...rest } = r;
  return rest;
}

/**
 * 同號分張改派部分節次後，已儲存的課程表格列隨節次搬到新代理人：
 * 原代理人表格移除該節次列；新代理人表格＝其原表格（未存則課表預設列）＋搬來的列。
 * batch 須為已套用新代課教師後的同批申請。
 */
export function moveNoticeRowsWithReassignedSessions(
  batch: SubstituteRequest[],
  movedIds: Set<string>,
  fromSubstituteTeacherId: string,
  toSubstituteTeacherId: string
): SubstituteRequest[] {
  const moved = batch.filter((r) => movedIds.has(r.id));
  const source = batch.filter(
    (r) => !movedIds.has(r.id) && r.substituteTeacherId === fromSubstituteTeacherId
  );
  const dest = batch.filter(
    (r) => !movedIds.has(r.id) && r.substituteTeacherId === toSubstituteTeacherId
  );
  if (moved.length === 0) return batch;

  const sourceRows = savedNoticeRowsOf(moved) ?? savedNoticeRowsOf(source);
  const destRows = savedNoticeRowsOf(dest);
  if (!sourceRows && !destRows) return batch;

  const movedPeriods = new Set(
    moved.map((r) => String(r.originalSession?.period ?? '')).filter(Boolean)
  );
  const isMovedRow = (row: SubstituteNoticeRow) => movedPeriods.has(row.period.trim());

  const nextSourceRows = sourceRows ? sourceRows.filter((row) => !isMovedRow(row)) : null;
  const carriedRows = sourceRows
    ? sourceRows.filter(isMovedRow)
    : buildDefaultNoticeRowsFromRequests(moved);
  const nextDestRows = sortNoticeRowsByDatePeriod([
    ...(destRows ?? buildDefaultNoticeRowsFromRequests(dest)),
    ...carriedRows,
  ]);

  const destIds = new Set([...moved, ...dest].map((r) => r.id));
  const sourceIds = new Set(source.map((r) => r.id));
  return batch.map((r) => {
    if (destIds.has(r.id)) return withNoticeRows(r, nextDestRows);
    if (sourceIds.has(r.id) && sourceRows) return withNoticeRows(r, nextSourceRows);
    return r;
  });
}

export type NoticePayrollResolveOptions = {
  relatedRequests: SubstituteRequest[];
  settlementMonth: number;
  settlementYear: number;
  weeksInMonth?: number;
  holidaySet?: Set<string>;
  calendarOpts?: LeaveBillableOptions;
  /** false＝通知單列必須對到該代課老師自己的節次，不可整表算給第一人 */
  allowMatchFallback?: boolean;
  /** 完整通知單列；刻意改節次（3、4→2、3）時依列順序對申請單 */
  allNoticeRows?: SubstituteNoticeRow[];
};

export type ResolvedNoticePayrollRow = {
  row: SubstituteNoticeRow;
  iso: string;
};

function normalizePeriodNum(period: string | number | null | undefined): number {
  const key = normalizeNoticePeriodKey(period);
  const n = Number(key);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function noticeRowPeriodsDistinct(rows: SubstituteNoticeRow[]): boolean {
  const nums = rows.map((r) => normalizePeriodNum(r.period)).filter((n) => n > 0);
  return nums.length === rows.length && new Set(nums).size === nums.length;
}

function orderedRequestsBySession(related: SubstituteRequest[]): SubstituteRequest[] {
  return [...related]
    .filter((r) => r.originalSession)
    .sort(
      (a, b) =>
        (a.originalSession!.dayOfWeek || 0) - (b.originalSession!.dayOfWeek || 0) ||
        (a.originalSession!.period || 0) - (b.originalSession!.period || 0) ||
        a.id.localeCompare(b.id)
    );
}

function orderedNoticeRowsByPeriod(rows: SubstituteNoticeRow[]): SubstituteNoticeRow[] {
  return [...rows].sort(
    (a, b) =>
      normalizePeriodNum(a.period) - normalizePeriodNum(b.period) ||
      a.className.localeCompare(b.className, 'zh-Hant')
  );
}

/** 列數＝申請節數、兩邊節次皆不重複 → 可依順序對位（含刻意改節次） */
function canPairNoticeRowsByOrder(
  rows: SubstituteNoticeRow[],
  related: SubstituteRequest[]
): boolean {
  const meaningful = rows.filter(isMeaningfulNoticeRow);
  const reqs = orderedRequestsBySession(related);
  if (reqs.length < 2 || meaningful.length !== reqs.length) return false;
  if (!noticeRowPeriodsDistinct(meaningful)) return false;
  const reqPeriods = reqs.map((r) => r.originalSession!.period);
  return new Set(reqPeriods).size === reqPeriods.length;
}

/** 通知單節次集合與課表節次不同（如 3、4→2、3） */
function noticePeriodsRemappedFromRequests(
  rows: SubstituteNoticeRow[],
  related: SubstituteRequest[]
): boolean {
  if (!canPairNoticeRowsByOrder(rows, related)) return false;
  const rowPeriods = new Set(
    orderedNoticeRowsByPeriod(rows.filter(isMeaningfulNoticeRow)).map((r) =>
      normalizePeriodNum(r.period)
    )
  );
  const reqPeriods = new Set(orderedRequestsBySession(related).map((r) => r.originalSession!.period));
  if (rowPeriods.size !== reqPeriods.size) return true;
  for (const p of rowPeriods) {
    if (!reqPeriods.has(p)) return true;
  }
  return false;
}

function findRequestByNoticeRowOrder(
  row: SubstituteNoticeRow,
  allRows: SubstituteNoticeRow[],
  related: SubstituteRequest[]
): SubstituteRequest | null {
  const meaningful = allRows.filter(isMeaningfulNoticeRow);
  if (!canPairNoticeRowsByOrder(meaningful, related)) return null;
  const orderedRows = orderedNoticeRowsByPeriod(meaningful);
  const orderedReqs = orderedRequestsBySession(related);
  const rowKey = noticeRowKey(row);
  const idx = orderedRows.findIndex((r) => noticeRowKey(r) === rowKey);
  if (idx < 0 || idx >= orderedReqs.length) return null;
  return orderedReqs[idx];
}

/** 將申請單對到通知單列：刻意改節次時依順序，否則依課表節次 */
function findNoticeRowPairedToRequest(
  request: SubstituteRequest,
  rows: SubstituteNoticeRow[],
  related: SubstituteRequest[]
): SubstituteNoticeRow | null {
  const meaningful = rows.filter(isMeaningfulNoticeRow);
  if (meaningful.length === 0) return null;

  if (noticePeriodsRemappedFromRequests(meaningful, related)) {
    const orderedRows = orderedNoticeRowsByPeriod(meaningful);
    const orderedReqs = orderedRequestsBySession(related);
    const idx = orderedReqs.findIndex((r) => r.id === request.id);
    if (idx >= 0 && idx < orderedRows.length) return orderedRows[idx];
    return null;
  }

  const sessPeriod = request.originalSession?.period;
  if (sessPeriod) {
    const samePeriod = meaningful.filter((r) => normalizePeriodNum(r.period) === sessPeriod);
    if (samePeriod.length === 1) return samePeriod[0];
    if (samePeriod.length > 1) {
      const classKey = (request.originalSession?.className || '').trim();
      return samePeriod.find((r) => r.className.trim() === classKey) || samePeriod[0];
    }
  }

  if (canPairNoticeRowsByOrder(meaningful, related)) {
    const orderedRows = orderedNoticeRowsByPeriod(meaningful);
    const orderedReqs = orderedRequestsBySession(related);
    const idx = orderedReqs.findIndex((r) => r.id === request.id);
    if (idx >= 0 && idx < orderedRows.length) return orderedRows[idx];
  }

  if (related.length === 1 && related[0]?.id === request.id && meaningful.length === 1) {
    return meaningful[0];
  }
  return null;
}

function matchesNoticeSlot(
  row: SubstituteNoticeRow,
  request: SubstituteRequest,
  options: { requireClassName: boolean }
): boolean {
  const sess = request.originalSession;
  if (!sess) return false;
  const period = Number(row.period);
  const weekday = parseNoticeWeekday(row.weekday);
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

function distinctSubstituteTeacherIds(related: SubstituteRequest[]): string[] {
  return [
    ...new Set(
      related
        .map((r) => r.substituteTeacherId)
        .filter((id): id is string => Boolean(id))
    ),
  ];
}

function sheetRelatedRequests(
  request: SubstituteRequest,
  allRequests: SubstituteRequest[]
): SubstituteRequest[] {
  const related = getRelatedSubstituteRequests(request, allRequests);
  if (!request.substituteTeacherId) return related;
  return related.filter((r) => r.substituteTeacherId === request.substituteTeacherId);
}

function findMatchingRequests(
  row: SubstituteNoticeRow,
  related: SubstituteRequest[],
  options?: { allowFallback?: boolean; allNoticeRows?: SubstituteNoticeRow[] }
): SubstituteRequest[] {
  const allRows = options?.allNoticeRows?.filter(isMeaningfulNoticeRow);
  // 刻意改節次時優先依列順序，避免「通知單第3節」誤對到課表第3節申請
  if (allRows && noticePeriodsRemappedFromRequests(allRows, related)) {
    const byOrder = findRequestByNoticeRowOrder(row, allRows, related);
    if (byOrder) return [byOrder];
  }

  const mixedSubs = distinctSubstituteTeacherIds(related).length > 1;
  const distinctPeriods = new Set(
    related
      .map((r) => r.originalSession?.period)
      .filter((period): period is number => Boolean(period && period > 0))
  );
  // 同單不同代課老師／多節次：必須對到節次，不可把整張表算給第一人
  if (mixedSubs || distinctPeriods.size > 1) {
    const period = Number(row.period);
    if (!row.period.trim() || !Number.isFinite(period) || period <= 0) {
      return [];
    }
  }

  const byClass = related.filter((r) => matchesNoticeSlot(row, r, { requireClassName: true }));
  if (byClass.length > 0) return byClass;
  // 科目／班級改成監考等人工調整後，仍依節次／星期對到原請假單
  const bySlot = related.filter((r) => matchesNoticeSlot(row, r, { requireClassName: false }));
  if (bySlot.length > 0) return bySlot;

  if (allRows) {
    const byOrder = findRequestByNoticeRowOrder(row, allRows, related);
    if (byOrder) return [byOrder];
  }

  if (options?.allowFallback === false || mixedSubs) return [];
  return related.filter((r) => Boolean(r.leaveDateStart && r.originalSession));
}

/** 通知單列只計入該代課老師自己的節次 */
export function requestsForSubstituteTeacher(
  related: SubstituteRequest[],
  substituteTeacherId: string
): SubstituteRequest[] {
  return related.filter((r) => r.substituteTeacherId === substituteTeacherId);
}

function listClassifiedNoticeRowsForRequest(
  request: SubstituteRequest,
  allRequests: SubstituteRequest[]
): {
  saved: SubstituteNoticeRow[];
  related: SubstituteRequest[];
  classified: { row: SubstituteNoticeRow; modified: boolean }[];
} | null {
  const saved = resolveEffectiveNoticeRows(request, allRequests);
  if (!saved) return null;
  const related = sheetRelatedRequests(request, allRequests);
  return {
    saved,
    related,
    classified: classifySavedNoticeRows(saved, buildDefaultNoticeRowsFromRequests(related)),
  };
}

/** 此請假單對應的通知單列是否曾人工修改（僅該列改入代課清冊；未改列維持兼課轉移） */
export function requestHasModifiedNoticePayrollRow(
  request: SubstituteRequest,
  allRequests: SubstituteRequest[]
): boolean {
  const listed = listClassifiedNoticeRowsForRequest(request, allRequests);
  if (!listed) return false;
  const paired = findNoticeRowPairedToRequest(request, listed.saved, listed.related);
  if (!paired) return false;
  return listed.classified.some(
    (item) => item.modified && noticeRowKey(item.row) === noticeRowKey(paired)
  );
}

/** 該請假日是否已改入代課清冊（未改的兼課列仍應加兼課） */
export function noticeDateUsesModifiedSubstitutePayroll(
  request: SubstituteRequest,
  allRequests: SubstituteRequest[],
  isoDate: string
): boolean {
  const listed = listClassifiedNoticeRowsForRequest(request, allRequests);
  if (!listed) return false;
  const paired = findNoticeRowPairedToRequest(request, listed.saved, listed.related);
  if (!paired) return false;
  const item = listed.classified.find((c) => noticeRowKey(c.row) === noticeRowKey(paired));
  if (!item?.modified) return false;

  const parsed = parseNoticeRowDateToIso(item.row.date);
  if (parsed) return parsed === isoDate;
  const weekday = parseNoticeWeekday(item.row.weekday);
  if (weekday != null && dateToDayOfWeek(isoDate) !== weekday) return false;
  // 刻意改節次後通知單 period 可與課表不同，對位已由 findNoticeRowPairedToRequest 完成
  return true;
}

function collectCandidateDatesForRow(
  row: SubstituteNoticeRow,
  opts: NoticePayrollResolveOptions
): string[] {
  const matching = findMatchingRequests(row, opts.relatedRequests, {
    allowFallback: opts.allowMatchFallback !== false,
    allNoticeRows: opts.allNoticeRows,
  });
  const dates: string[] = [];
  const weeksInMonth = opts.weeksInMonth ?? 5;

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
  const weeksInMonth = opts.weeksInMonth ?? 5;
  const candidates = collectCandidateDatesForRow(row, opts);
  const period = row.period.trim();
  const className = row.className.trim();
  const weekday = parseNoticeWeekday(row.weekday);

  for (const iso of candidates) {
    if (!isDateInSettlementMonth(iso, opts.settlementMonth, opts.settlementYear, weeksInMonth)) {
      continue;
    }
    if (weekday != null && dateToDayOfWeek(iso) !== weekday) {
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
  const weeksInMonth = opts.weeksInMonth ?? 5;
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
  calendarOpts?: LeaveBillableOptions,
  allNoticeRows?: SubstituteNoticeRow[]
): ResolvedNoticePayrollRow[] {
  const tableRows = allNoticeRows ?? resolvedRows.map(({ row }) => row);
  return resolvedRows.filter(({ row, iso }) => {
    const matching = findMatchingRequests(row, relatedRequests, {
      allowFallback: false,
      allNoticeRows: tableRows,
    });
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
  weeksInMonth = 5,
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
  weeksInMonth = 5
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
  countOriginal: () => number,
  forSubstituteTeacherId?: string
): NoticePayrollCountResult {
  const scopedRelated = forSubstituteTeacherId
    ? requestsForSubstituteTeacher(relatedRequests, forSubstituteTeacherId)
    : relatedRequests;
  const resolveOpts: NoticePayrollResolveOptions = {
    relatedRequests: scopedRelated,
    settlementMonth,
    settlementYear,
    weeksInMonth,
    holidaySet,
    calendarOpts,
    allowMatchFallback: false,
    allNoticeRows: effectiveNoticeRows,
  };
  const resolvedRows = filterResolvedNoticeRowsForPublicPayroll(
    listResolvedNoticeRowsInSettlementMonth(effectiveNoticeRows, resolveOpts),
    scopedRelated,
    payrollCtx,
    holidaySet,
    calendarOpts,
    effectiveNoticeRows
  );
  const classified = classifySavedNoticeRows(
    effectiveNoticeRows,
    buildDefaultNoticeRowsFromRequests(scopedRelated)
  );
  const modifiedByRow = new Map(classified.map((item) => [noticeRowKey(item.row), item.modified]));
  const substituteRows = resolvedRows.filter(({ row }) => {
    if (
      forSubstituteTeacherId &&
      findMatchingRequests(row, scopedRelated, {
        allowFallback: false,
        allNoticeRows: effectiveNoticeRows,
      }).length === 0
    ) {
      return false;
    }
    const modified = modifiedByRow.get(noticeRowKey(row));
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
