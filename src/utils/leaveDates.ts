import {
  CourseSession,
  DayOfWeek,
  PartialNonTeachingDay,
  SubstituteRequest,
  TemporaryScheduleMove,
} from '../types';
import { dateToIsoLocal, isNonTeachingDate } from './holidays';

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

/** 請假區間是否涵蓋指定日（無起日視為舊案：一律涵蓋） */
export function leaveRangeCoversDate(
  leaveDateStart?: string,
  leaveDateEnd?: string,
  isoDate?: string
): boolean {
  if (!leaveDateStart) return true;
  if (!isoDate) return true;
  const end = resolveLeaveDateEnd(leaveDateStart, leaveDateEnd) || leaveDateStart;
  return isoDate >= leaveDateStart && isoDate <= end;
}

/** 本週（以今天所在週一～五）對應星期幾的 YYYY-MM-DD */
export function isoDateForDayOfWeekInCurrentWeek(dayOfWeek: DayOfWeek, now = new Date()): string {
  const js = now.getDay();
  const mondayOffset = js === 0 ? -6 : 1 - js;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset);
  const target = new Date(monday);
  target.setDate(monday.getDate() + (dayOfWeek - 1));
  return dateToIsoLocal(target);
}

export function isLeaveCoverNote(notes?: string): boolean {
  return Boolean(notes?.includes('[請假派代]') || notes?.includes('[代課]'));
}

type LeaveCoverDisplayRequest = Pick<
  SubstituteRequest,
  | 'status'
  | 'requestType'
  | 'applicantTeacherId'
  | 'leaveDateStart'
  | 'leaveDateEnd'
  | 'originalSession'
  | 'substituteTeacherName'
>;

/** 課表格：本週對應日是否仍有已核准請假派代（過週不顯示，即使 notes 仍留永久註記） */
export function findActiveLeaveCoverRequestForSession(
  session: Pick<CourseSession, 'id' | 'dayOfWeek' | 'period' | 'teacherId'>,
  requests: LeaveCoverDisplayRequest[],
  now = new Date()
): LeaveCoverDisplayRequest | undefined {
  const weekDate = isoDateForDayOfWeekInCurrentWeek(session.dayOfWeek, now);
  return requests.find(
    (r) =>
      r.status === 'approved' &&
      r.requestType === 'substitute' &&
      (r.originalSession.id === session.id ||
        (r.originalSession.dayOfWeek === session.dayOfWeek &&
          r.originalSession.period === session.period &&
          r.applicantTeacherId === session.teacherId)) &&
      leaveRangeCoversDate(r.leaveDateStart, r.leaveDateEnd, weekDate)
  );
}

/**
 * 課表格子請假派代表籤。
 * 核准時 notes 會永久寫入，顯示必須再依本週日期過濾，過週恢復平常課表。
 */
export function leaveCoverLabelForSessionDisplay(
  session: Pick<CourseSession, 'id' | 'dayOfWeek' | 'period' | 'teacherId' | 'notes'>,
  requests: LeaveCoverDisplayRequest[],
  now = new Date()
): string | null {
  const hit = findActiveLeaveCoverRequestForSession(session, requests, now);
  if (!hit) return null;
  if (isLeaveCoverNote(session.notes)) return session.notes || null;
  const end = resolveLeaveDateEnd(hit.leaveDateStart, hit.leaveDateEnd);
  const range =
    hit.leaveDateStart
      ? ` ${hit.leaveDateStart}${end && end !== hit.leaveDateStart ? `～${end}` : ''}`
      : '';
  return `[請假派代${range}] 代課教師：${hit.substituteTeacherName || '已派代'}`;
}

/** 全校課表等：非請假註記照常顯示；請假派代僅本週涵蓋日才顯示 */
export function sessionNotesForCurrentWeekDisplay(
  session: Pick<CourseSession, 'id' | 'dayOfWeek' | 'period' | 'teacherId' | 'notes'>,
  requests: LeaveCoverDisplayRequest[],
  now = new Date()
): string | null {
  if (!session.notes) return null;
  if (!isLeaveCoverNote(session.notes)) return session.notes;
  return findActiveLeaveCoverRequestForSession(session, requests, now) ? session.notes : null;
}

export type ExcludeDates = Set<string> | Iterable<string> | null | undefined;

/** 結算用：半日停課／暫時移課等（與 calendarSettlement 對齊） */
export type LeaveBillableOptions = {
  /** 該節次；有值時才套用半日停課／移課排除 */
  period?: number;
  temporaryMoves?: TemporaryScheduleMove[] | null;
  partialStops?: PartialNonTeachingDay[] | null;
};

function asExcludeSet(excludeDates?: ExcludeDates): Set<string> {
  if (!excludeDates) return new Set();
  if (excludeDates instanceof Set) return excludeDates;
  return new Set(excludeDates);
}

const ALL_PERIODS = [1, 2, 3, 4, 5, 6, 7, 8];

/** 該日該節是否仍應計請假／代課節數（整天放假、半日停課、暫時移走皆不计） */
export function isLeaveDatePeriodBillable(
  isoDate: string,
  excludeDates?: ExcludeDates,
  options?: LeaveBillableOptions
): boolean {
  const exclude = asExcludeSet(excludeDates);
  if (isNonTeachingDate(isoDate, exclude)) return false;
  const period = options?.period;
  if (period == null || period < 1 || period > 8) return true;

  for (const stop of options?.partialStops || []) {
    if (stop?.date === isoDate && stop.periods?.includes(period)) return false;
  }
  for (const move of options?.temporaryMoves || []) {
    if (!move?.sourceDate || move.sourceDate !== isoDate) continue;
    const periods =
      !move.periods || move.periods.length === 0 ? ALL_PERIODS : move.periods;
    if (periods.includes(period)) return false;
  }
  return true;
}

/** 區間內與指定星期相符的天數（含起迄）；放假日／半日停課／移課原日不計 */
export function countMatchingWeekdays(
  start: string,
  end: string,
  dayOfWeek: DayOfWeek,
  excludeDates?: ExcludeDates,
  billableOptions?: LeaveBillableOptions
): number {
  const s = new Date(start.replace(/-/g, '/') + ' 12:00:00');
  const e = new Date(end.replace(/-/g, '/') + ' 12:00:00');
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) return 0;

  let count = 0;
  for (let cur = new Date(s); cur <= e; cur.setDate(cur.getDate() + 1)) {
    if (cur.getDay() !== dayOfWeek) continue;
    const iso = dateToIsoLocal(cur);
    if (!isLeaveDatePeriodBillable(iso, excludeDates, billableOptions)) continue;
    count += 1;
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

/** 請假派代結算節數：無日期舊案若該結算月該星期仍有上課日算 1，皆放假則 0；有日期則算區間內相符星期數（放假日不計） */
export function countLeaveSubstitutePeriods(
  request: Pick<SubstituteRequest, 'leaveDateStart' | 'leaveDateEnd' | 'originalSession'>,
  excludeDates?: ExcludeDates,
  options?: { settlementMonth?: number; settlementYear?: number } & LeaveBillableOptions
): number {
  const billableOptions: LeaveBillableOptions = {
    period: options?.period ?? request.originalSession?.period,
    temporaryMoves: options?.temporaryMoves,
    partialStops: options?.partialStops,
  };
  if (!request.leaveDateStart) {
    const month = options?.settlementMonth;
    const year = options?.settlementYear;
    if (month == null || year == null) return 1;
    const pad = (n: number) => String(n).padStart(2, '0');
    const start = `${year}-${pad(month)}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const end = `${year}-${pad(month)}-${pad(lastDay)}`;
    const n = countMatchingWeekdays(
      start,
      end,
      request.originalSession.dayOfWeek,
      excludeDates,
      billableOptions
    );
    return n > 0 ? 1 : 0;
  }
  const end = resolveLeaveDateEnd(request.leaveDateStart, request.leaveDateEnd) || request.leaveDateStart;
  const n = countMatchingWeekdays(
    request.leaveDateStart,
    end,
    request.originalSession.dayOfWeek,
    excludeDates,
    billableOptions
  );
  return Math.max(0, n);
}

/** 區間內、落在指定曆月（1–12）且相符星期的天數；可選西元年避免跨年重計；放假日／半日停課／移課原日不計 */
export function countMatchingWeekdaysInMonth(
  start: string,
  end: string,
  dayOfWeek: DayOfWeek,
  month: number,
  year?: number,
  excludeDates?: ExcludeDates,
  billableOptions?: LeaveBillableOptions
): number {
  const s = new Date(start.replace(/-/g, '/') + ' 12:00:00');
  const e = new Date(end.replace(/-/g, '/') + ' 12:00:00');
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) return 0;

  let count = 0;
  for (let cur = new Date(s); cur <= e; cur.setDate(cur.getDate() + 1)) {
    if (cur.getDay() !== dayOfWeek) continue;
    if (cur.getMonth() + 1 !== month) continue;
    if (year != null && cur.getFullYear() !== year) continue;
    const iso = dateToIsoLocal(cur);
    if (!isLeaveDatePeriodBillable(iso, excludeDates, billableOptions)) continue;
    count += 1;
  }
  return count;
}

/** 請假區間內、落在指定曆月的西元年（通常僅一年；跨年同月取最接近 settlementYear 者） */
function resolveLeaveYearForSettlementMonth(
  start: string,
  end: string,
  settlementMonth: number,
  settlementYear?: number
): number | undefined {
  const s = new Date(start.replace(/-/g, '/') + ' 12:00:00');
  const e = new Date(end.replace(/-/g, '/') + ' 12:00:00');
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) return undefined;
  const years = new Set<number>();
  for (let cur = new Date(s); cur <= e; cur.setDate(cur.getDate() + 1)) {
    if (cur.getMonth() + 1 === settlementMonth) years.add(cur.getFullYear());
  }
  if (years.size === 0) return undefined;
  const list = Array.from(years);
  if (settlementYear == null) return list[0];
  return list.reduce((best, y) =>
    Math.abs(y - settlementYear) < Math.abs(best - settlementYear) ? y : best
  );
}

/**
 * 結算用：有請假日期則只計「落在結算月」且星期相符的天數。
 * 西元年優先用結算年；若結算年對不到（學年未換導致年偏）但請假區間確有該月，改以請假日期內之西元年計。
 * 無日期舊案回傳 null。
 */
export function countLeaveSubstitutePeriodsInMonth(
  request: Pick<SubstituteRequest, 'leaveDateStart' | 'leaveDateEnd' | 'originalSession'>,
  settlementMonth: number,
  settlementYear?: number,
  excludeDates?: ExcludeDates,
  billableOptions?: LeaveBillableOptions
): number | null {
  if (!request.leaveDateStart) return null;
  const end =
    resolveLeaveDateEnd(request.leaveDateStart, request.leaveDateEnd) ||
    request.leaveDateStart;
  const dayOfWeek = request.originalSession.dayOfWeek;
  const opts: LeaveBillableOptions = {
    period: billableOptions?.period ?? request.originalSession?.period,
    temporaryMoves: billableOptions?.temporaryMoves,
    partialStops: billableOptions?.partialStops,
  };

  const withSettlementYear = countMatchingWeekdaysInMonth(
    request.leaveDateStart,
    end,
    dayOfWeek,
    settlementMonth,
    settlementYear,
    excludeDates,
    opts
  );
  if (withSettlementYear > 0 || settlementYear == null) return withSettlementYear;

  // 結算西元年與請假日期年不一致：改以請假區間內「該月」實際年份計（禁止無 year 全掃）
  const leaveYear = resolveLeaveYearForSettlementMonth(
    request.leaveDateStart,
    end,
    settlementMonth,
    settlementYear
  );
  if (leaveYear == null) return 0;
  return countMatchingWeekdaysInMonth(
    request.leaveDateStart,
    end,
    dayOfWeek,
    settlementMonth,
    leaveYear,
    excludeDates,
    opts
  );
}

type LeaveCoverRequest = Pick<
  SubstituteRequest,
  | 'status'
  | 'requestType'
  | 'applicantTeacherId'
  | 'substituteTeacherId'
  | 'leaveDateStart'
  | 'leaveDateEnd'
  | 'originalSession'
  | 'requestNumber'
  | 'createdAt'
>;

/**
 * 申請人已核准請假落在結算月的節數（依請假日按日計）。
 * 用於從週課表模板推算的兼課／課輔月結中「按日扣減」，避免 [請假派代] 註記永久吃掉整月。
 */
export function countApplicantApprovedLeaveCoverPeriodsInMonth(
  requests: LeaveCoverRequest[],
  applicantTeacherId: string,
  settlementMonth: number,
  settlementYear: number,
  excludeDates?: ExcludeDates,
  options?: {
    matchSession?: (session: LeaveCoverRequest['originalSession']) => boolean;
    /** 無請假日期舊案：是否計入該結算月（通常依單號／建立日） */
    includeLegacyWithoutDates?: (r: LeaveCoverRequest) => boolean;
    temporaryMoves?: TemporaryScheduleMove[] | null;
    partialStops?: PartialNonTeachingDay[] | null;
  }
): number {
  const match = options?.matchSession ?? (() => true);
  const calendarOpts: LeaveBillableOptions = {
    temporaryMoves: options?.temporaryMoves,
    partialStops: options?.partialStops,
  };
  let total = 0;
  for (const r of requests) {
    if (r.status !== 'approved' || r.requestType !== 'substitute') continue;
    if (r.applicantTeacherId !== applicantTeacherId || !r.substituteTeacherId) continue;
    if (!match(r.originalSession)) continue;

    const periodOpts: LeaveBillableOptions = {
      ...calendarOpts,
      period: r.originalSession?.period,
    };
    const inMonth = countLeaveSubstitutePeriodsInMonth(
      r,
      settlementMonth,
      settlementYear,
      excludeDates,
      periodOpts
    );
    if (inMonth === null) {
      if (!options?.includeLegacyWithoutDates?.(r)) continue;
      total += countLeaveSubstitutePeriods(r, excludeDates, {
        settlementMonth,
        settlementYear,
        ...periodOpts,
      });
      continue;
    }
    if (inMonth > 0) total += inMonth;
  }
  return total;
}

/** 從單號或建立時間推估申請月份（1–12） */
export function inferRequestMonth(
  requestNumber?: string,
  createdAt?: string,
  fallbackMonth?: number
): number {
  const m = requestNumber?.match(/VOC-\d+-(\d+)-/i);
  if (m) {
    const n = Number(m[1]);
    if (n >= 1 && n <= 12) return n;
  }
  if (createdAt) {
    const parsed = new Date(createdAt.replace(/-/g, '/'));
    if (!Number.isNaN(parsed.getTime())) return parsed.getMonth() + 1;
  }
  return fallbackMonth ?? new Date().getMonth() + 1;
}

/**
 * 核准前檢查請假區間實際上課日數。
 * 無請假日期之舊單：以單號月份＋課堂星期推估整月，皆放假則不可核准。
 */
export function countBillableDaysForSubstituteApprove(
  request: Pick<
    SubstituteRequest,
    'leaveDateStart' | 'leaveDateEnd' | 'originalSession' | 'requestNumber' | 'createdAt'
  >,
  excludeDates: ExcludeDates,
  settlementYearForMonth: (month: number) => number,
  billableOptions?: LeaveBillableOptions
): { billable: number; missingLeaveDate: boolean } {
  const opts: LeaveBillableOptions = {
    period: billableOptions?.period ?? request.originalSession?.period,
    temporaryMoves: billableOptions?.temporaryMoves,
    partialStops: billableOptions?.partialStops,
  };
  if (request.leaveDateStart) {
    const end =
      resolveLeaveDateEnd(request.leaveDateStart, request.leaveDateEnd) ||
      request.leaveDateStart;
    return {
      billable: countMatchingWeekdays(
        request.leaveDateStart,
        end,
        request.originalSession.dayOfWeek,
        excludeDates,
        opts
      ),
      missingLeaveDate: false,
    };
  }
  const month = inferRequestMonth(request.requestNumber, request.createdAt);
  const year = settlementYearForMonth(month);
  const pad = (n: number) => String(n).padStart(2, '0');
  const start = `${year}-${pad(month)}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${pad(month)}-${pad(lastDay)}`;
  return {
    billable: countMatchingWeekdays(
      start,
      end,
      request.originalSession.dayOfWeek,
      excludeDates,
      opts
    ),
    missingLeaveDate: true,
  };
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
  /** 行事曆放假日（YYYY-MM-DD），放假日不可請假派代 */
  nonTeachingDates?: ExcludeDates;
  temporaryMoves?: TemporaryScheduleMove[] | null;
  partialStops?: PartialNonTeachingDay[] | null;
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
    nonTeachingDates,
    temporaryMoves,
    partialStops,
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

  const holidaySet = asExcludeSet(nonTeachingDates);
  if (isNonTeachingDate(leaveDateStart, holidaySet) && leaveDateMode === 'single') {
    return {
      ok: false,
      message: `請假日 ${leaveDateStart} 為行事曆放假日，不計鐘點且不可派代。請改選上課日，或至系統參數調整放假日。`,
    };
  }

  // 含半日停課／暫時移課：即使沒有整天放假日也要檢查可計節
  for (const s of targetSessions) {
    const billable = countMatchingWeekdays(
      leaveDateStart,
      resolvedLeaveEnd,
      s.dayOfWeek,
      holidaySet,
      {
        period: s.period,
        temporaryMoves,
        partialStops,
      }
    );
    if (billable <= 0) {
      return {
        ok: false,
        message: `請假區間內「${dayNames[s.dayOfWeek]}第${s.period}節」無可計節上課日（放假／半日停課／暫時移課），無法派代。請改日期或調整行事曆。`,
      };
    }
  }

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
