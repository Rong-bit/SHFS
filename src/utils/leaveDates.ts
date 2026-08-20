import { DayOfWeek, SubstituteRequest } from '../types';

/** YYYY-MM-DD → 週一=1 … 週五=5；週末回傳 null */
export function dateToDayOfWeek(isoDate: string): DayOfWeek | null {
  const d = new Date(isoDate.replace(/-/g, '/') + ' 12:00:00');
  if (Number.isNaN(d.getTime())) return null;
  const js = d.getDay(); // 0=日 … 6=六
  if (js < 1 || js > 5) return null;
  return js as DayOfWeek;
}

export function resolveLeaveDateEnd(start?: string, end?: string): string | undefined {
  if (!start) return undefined;
  if (!end || end < start) return start;
  return end;
}

/** 區間內與指定星期相符的天數（含起迄） */
export function countMatchingWeekdays(
  start: string,
  end: string,
  dayOfWeek: DayOfWeek
): number {
  const s = new Date(start.replace(/-/g, '/') + ' 12:00:00');
  const e = new Date(end.replace(/-/g, '/') + ' 12:00:00');
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) return 0;

  let count = 0;
  for (let cur = new Date(s); cur <= e; cur.setDate(cur.getDate() + 1)) {
    if (cur.getDay() === dayOfWeek) count += 1;
  }
  return count;
}

/**
 * 請假起迄區間內會出現的平日星期（1–5）。
 * 僅填開始日、或結束日無效時，回傳開始日的星期。
 */
export function weekdaysInDateRange(start?: string, end?: string): DayOfWeek[] {
  if (!start) return [];
  const resolvedEnd = resolveLeaveDateEnd(start, end) || start;
  const s = new Date(start.replace(/-/g, '/') + ' 12:00:00');
  const e = new Date(resolvedEnd.replace(/-/g, '/') + ' 12:00:00');
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) {
    const one = dateToDayOfWeek(start);
    return one == null ? [] : [one];
  }

  const found = new Set<DayOfWeek>();
  for (let cur = new Date(s); cur <= e; cur.setDate(cur.getDate() + 1)) {
    const js = cur.getDay();
    if (js >= 1 && js <= 5) found.add(js as DayOfWeek);
  }
  return Array.from(found).sort((a, b) => a - b);
}

export function formatWeekdayList(days: DayOfWeek[], dayNames: string[]): string {
  if (days.length === 0) return '';
  return days.map((d) => dayNames[d] || `週${d}`).join('、');
}

function formatSlashDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${y}/${m}/${d}`;
}

/** 畫面顯示用：單日或起迄；缺資料則註明未填 */
export function formatLeaveDateLabel(
  start?: string,
  end?: string,
  emptyLabel = '（未填請假日期）'
): string {
  if (!start) return emptyLabel;
  const resolvedEnd = resolveLeaveDateEnd(start, end) || start;
  if (resolvedEnd === start) return formatSlashDate(start);
  const [, em, ed] = resolvedEnd.split('-');
  return `${formatSlashDate(start)}～${em}/${ed}`;
}

/** 請假派代結算節數：無日期舊案算 1；有日期則算區間內相符星期數 */
export function countLeaveSubstitutePeriods(request: Pick<
  SubstituteRequest,
  'leaveDateStart' | 'leaveDateEnd' | 'originalSession'
>): number {
  if (!request.leaveDateStart) return 1;
  const end = resolveLeaveDateEnd(request.leaveDateStart, request.leaveDateEnd) || request.leaveDateStart;
  const n = countMatchingWeekdays(
    request.leaveDateStart,
    end,
    request.originalSession.dayOfWeek
  );
  return Math.max(1, n);
}

/** 區間內、落在指定曆月（1–12）且相符星期的天數；可選西元年避免跨年重計 */
export function countMatchingWeekdaysInMonth(
  start: string,
  end: string,
  dayOfWeek: DayOfWeek,
  month: number,
  year?: number
): number {
  const s = new Date(start.replace(/-/g, '/') + ' 12:00:00');
  const e = new Date(end.replace(/-/g, '/') + ' 12:00:00');
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) return 0;

  let count = 0;
  for (let cur = new Date(s); cur <= e; cur.setDate(cur.getDate() + 1)) {
    if (cur.getDay() !== dayOfWeek) continue;
    if (cur.getMonth() + 1 !== month) continue;
    if (year != null && cur.getFullYear() !== year) continue;
    count += 1;
  }
  return count;
}

/**
 * 結算用：有請假日期則只計「落在結算月（與西元年）」的相符星期；
 * 無日期舊案回傳 null（由呼叫端依單號月份決定是否整筆計入）。
 */
export function countLeaveSubstitutePeriodsInMonth(
  request: Pick<SubstituteRequest, 'leaveDateStart' | 'leaveDateEnd' | 'originalSession'>,
  settlementMonth: number,
  settlementYear?: number
): number | null {
  if (!request.leaveDateStart) return null;
  const end =
    resolveLeaveDateEnd(request.leaveDateStart, request.leaveDateEnd) ||
    request.leaveDateStart;
  return countMatchingWeekdaysInMonth(
    request.leaveDateStart,
    end,
    request.originalSession.dayOfWeek,
    settlementMonth,
    settlementYear
  );
}

function leaveRangesOverlap(
  aStart?: string,
  aEnd?: string,
  bStart?: string,
  bEnd?: string
): boolean {
  if (!aStart || !bStart) return false;
  const aE = resolveLeaveDateEnd(aStart, aEnd) || aStart;
  const bE = resolveLeaveDateEnd(bStart, bEnd) || bStart;
  return aStart <= bE && bStart <= aE;
}

function isPlaceholderSessionId(id?: string): boolean {
  return !id || id === 's-placeholder' || id.startsWith('s-placeholder');
}

function isSameLeaveSlot(
  a: { id?: string; dayOfWeek: DayOfWeek; period: number; className: string },
  b: { id?: string; dayOfWeek: DayOfWeek; period: number; className: string }
): boolean {
  // 佔位課堂固定／共用 id，不可只靠 id 判定同一節
  if (
    a.id &&
    b.id &&
    a.id === b.id &&
    !isPlaceholderSessionId(a.id) &&
    !isPlaceholderSessionId(b.id)
  ) {
    return true;
  }
  return a.dayOfWeek === b.dayOfWeek && a.period === b.period && a.className === b.className;
}

export type DuplicateLeaveConflict = {
  requestNumber: string;
  dayOfWeek: DayOfWeek;
  period: number;
  className: string;
  leaveLabel: string;
  status: string;
};

/**
 * 檢查是否與既有「待簽核／已核准」請假派代重疊：
 * 同一教師 + 同一課堂節次 + 請假日期區間重疊。
 */
export function findDuplicateLeaveConflicts(params: {
  existing: SubstituteRequest[];
  applicantTeacherId: string;
  leaveDateStart: string;
  leaveDateEnd?: string;
  sessions: Array<{ id?: string; dayOfWeek: DayOfWeek; period: number; className: string }>;
  excludeRequestIds?: string[];
}): DuplicateLeaveConflict[] {
  const {
    existing,
    applicantTeacherId,
    leaveDateStart,
    leaveDateEnd,
    sessions: targetSessions,
    excludeRequestIds = [],
  } = params;

  const active = existing.filter(
    (r) =>
      r.requestType === 'substitute' &&
      r.applicantTeacherId === applicantTeacherId &&
      (r.status === 'pending' || r.status === 'approved') &&
      !excludeRequestIds.includes(r.id)
  );

  const conflicts: DuplicateLeaveConflict[] = [];

  for (const session of targetSessions) {
    for (const r of active) {
      if (!isSameLeaveSlot(r.originalSession, session)) continue;
      if (
        !leaveRangesOverlap(
          leaveDateStart,
          leaveDateEnd,
          r.leaveDateStart,
          r.leaveDateEnd
        )
      ) {
        // 舊案無請假日期：仍以「同節次」視為可能重複
        if (r.leaveDateStart) continue;
      }
      conflicts.push({
        requestNumber: r.requestNumber,
        dayOfWeek: session.dayOfWeek,
        period: session.period,
        className: session.className,
        leaveLabel: formatLeaveDateLabel(r.leaveDateStart, r.leaveDateEnd, '（無請假日期）'),
        status: r.status,
      });
    }
  }

  // 去重（同一既有案可能對多節比對）
  const seen = new Set<string>();
  return conflicts.filter((c) => {
    const key = `${c.requestNumber}-${c.dayOfWeek}-${c.period}-${c.className}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function formatDuplicateLeaveAlert(
  conflicts: DuplicateLeaveConflict[],
  dayNames: string[]
): string {
  if (conflicts.length === 0) return '';
  const lines = conflicts.slice(0, 6).map(
    (c) =>
      `・${c.requestNumber}：${dayNames[c.dayOfWeek]}第${c.period}節 ${c.className}（請假 ${c.leaveLabel}，${
        c.status === 'approved' ? '已核准' : '待簽核'
      }）`
  );
  const more =
    conflicts.length > 6 ? `\n…另有 ${conflicts.length - 6} 筆重複` : '';
  return `偵測到同一天／同節次重複請假，請勿重覆派代：\n${lines.join('\n')}${more}`;
}

export type ValidateSubstituteLeaveResult =
  | { ok: true; resolvedLeaveEnd: string }
  | { ok: false; message: string };

/**
 * 請假派代共用驗證（教學組派代／教師申請）。
 * 不含「是否指定代課教師」（教務必填、教師端可媒合）。
 */
export function validateSubstituteLeaveInput(params: {
  leaveDateMode: 'single' | 'range';
  leaveDateStart: string;
  leaveDateEnd?: string;
  /** 欲請假的課堂（一或多節） */
  sessions: Array<{ id?: string; dayOfWeek: DayOfWeek; period: number; className: string }>;
  existing: SubstituteRequest[];
  applicantTeacherId: string;
  dayNames: string[];
  excludeRequestIds?: string[];
}): ValidateSubstituteLeaveResult {
  const {
    leaveDateMode,
    leaveDateStart,
    leaveDateEnd,
    sessions: targetSessions,
    existing,
    applicantTeacherId,
    dayNames,
    excludeRequestIds,
  } = params;

  if (!leaveDateStart) {
    return { ok: false, message: '請填寫請假日期。' };
  }
  const startDow = dateToDayOfWeek(leaveDateStart);
  if (startDow === null) {
    return { ok: false, message: '請假開始日須為週一至週五。' };
  }
  if (leaveDateMode === 'range') {
    if (!leaveDateEnd) {
      return { ok: false, message: '起迄請假請填寫結束日期。' };
    }
    if (leaveDateEnd < leaveDateStart) {
      return { ok: false, message: '結束日期不可早於開始日期。' };
    }
  }

  const resolvedLeaveEnd =
    leaveDateMode === 'range'
      ? resolveLeaveDateEnd(leaveDateStart, leaveDateEnd) || leaveDateStart
      : leaveDateStart;

  const allowedDays = weekdaysInDateRange(leaveDateStart, resolvedLeaveEnd);
  const bad = targetSessions.find((s) => !allowedDays.includes(s.dayOfWeek));
  if (bad) {
    return {
      ok: false,
      message: `所選課堂（${dayNames[bad.dayOfWeek]}）不在請假區間涵蓋的星期（${formatWeekdayList(
        allowedDays,
        dayNames
      )}）內，請改日期或改課堂。`,
    };
  }

  const duplicates = findDuplicateLeaveConflicts({
    existing,
    applicantTeacherId,
    leaveDateStart,
    leaveDateEnd: resolvedLeaveEnd,
    sessions: targetSessions,
    excludeRequestIds,
  });
  if (duplicates.length > 0) {
    return { ok: false, message: formatDuplicateLeaveAlert(duplicates, dayNames) };
  }

  return { ok: true, resolvedLeaveEnd };
}
