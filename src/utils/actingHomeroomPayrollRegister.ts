import type { ClashCheckResult, SubstituteRequest, SystemConfig, Teacher } from '../types';
import { isPlaceholderSession } from './resolveOriginalSession';
import { actingHomeroomLeaveRemarkShort } from './leaveTypes';
import { resolveLeaveDateEnd } from './leaveDates';
import { dateToIsoLocal, isNonTeachingDate, nonTeachingDateSet } from './holidays';
import { resolveTeacherSalaryCode } from './salaryCodes';
import {
  formatPayrollMonthRangeLabel,
  formatRocYear,
  isBlankPayrollRow,
  padPayrollRowsToPage,
  PAYROLL_ROWS_LAST_PAGE,
  PAYROLL_ROWS_PER_PAGE,
} from './overloadPayrollRegister';

export { formatPayrollMonthRangeLabel, formatRocYear, PAYROLL_ROWS_PER_PAGE, isBlankPayrollRow };

export type ActingHomeroomPayrollRow = {
  teacherId: string;
  salaryCode: string;
  teacherName: string;
  /** 代課天數（實際為代導師日數） */
  actingDays: number;
  dailyRate: number;
  amount: number;
  remarks: string;
};

export type ActingHomeroomPayrollTotals = {
  actingDays: number;
  amount: number;
};

export type ActingHomeroomPayrollPage = {
  pageIndex: number;
  rows: ActingHomeroomPayrollRow[];
  subtotal: ActingHomeroomPayrollTotals;
  subtotalRateLabel: string;
};

export function isHomeroomTeacher(
  teacher: Pick<Teacher, 'title' | 'homeroomClass'> | undefined | null
): boolean {
  if (!teacher) return false;
  return Boolean(teacher.homeroomClass) || teacher.title === '導師';
}

/**
 * 可否列入代導師印領清冊領費。
 * 法令原則：未兼任主管職務、且未接班之「專任教師」代理始支鐘點費。
 * （已接導師／組長／科主任／主任可被指定代理，但不列入領費清冊。）
 */
export function canReceiveActingHomeroomFee(
  teacher: Pick<Teacher, 'title' | 'homeroomClass'> | undefined | null
): boolean {
  if (!teacher) return false;
  return teacher.title === '專任教師' && !isHomeroomTeacher(teacher);
}

/**
 * 僅辦代導師、無授課派代（佔位／無代課教師）。
 * 仍走代導師派代與印領清冊，但不列印通知單。
 */
export function isActingHomeroomOnlyRequest(
  request: Pick<
    SubstituteRequest,
    'requestType' | 'substituteTeacherId' | 'originalSession' | 'actingHomeroomTeacherId'
  >
): boolean {
  if (request.requestType !== 'substitute') return false;
  if (request.substituteTeacherId) return false;
  const sess = request.originalSession;
  if (!sess) return Boolean(request.actingHomeroomTeacherId);
  return (
    isPlaceholderSession(sess) ||
    Boolean(sess.subjectName?.includes('代導師')) ||
    Boolean(sess.notes?.includes('僅代導師'))
  );
}

/** 僅代導師單不需媒合代課教師；衝堂檢核應顯示通過而非「尚未指定代課教師」。 */
export const ACTING_HOMEROOM_ONLY_CLASH_PASS: ClashCheckResult = {
  hasClash: false,
  severity: 'none',
  messages: ['檢核通過：當日無排課，僅辦代導師職務代理，無需指定代課教師。'],
};

function isMissingSubstituteTeacherHint(messages: string[] | undefined): boolean {
  return Boolean(messages?.some((m) => m.includes('尚未指定代課教師')));
}

/** 修正舊單將「僅代導師」誤標成尚未指定代課教師的 clashStatus。 */
export function sanitizeActingHomeroomOnlyClashStatus(
  request: SubstituteRequest
): SubstituteRequest {
  if (!isActingHomeroomOnlyRequest(request)) return request;
  if (!isMissingSubstituteTeacherHint(request.clashStatus?.messages)) return request;
  return { ...request, clashStatus: ACTING_HOMEROOM_ONLY_CLASH_PASS };
}

export function displayClashStatus(request: SubstituteRequest): ClashCheckResult {
  return sanitizeActingHomeroomOnlyClashStatus(request).clashStatus;
}

const formatMd = (iso: string) => {
  const [, m, d] = iso.split('-');
  return `${Number(m)}/${Number(d)}`;
};

/** 請假區間內、落在結算月之週一～五且非全天放假的日期 */
export function listActingHomeroomDaysInMonth(
  leaveDateStart: string | undefined,
  leaveDateEnd: string | undefined,
  settlementMonth: number,
  settlementYear: number,
  holidaySet: Set<string>
): string[] {
  if (!leaveDateStart) return [];
  const end = resolveLeaveDateEnd(leaveDateStart, leaveDateEnd) || leaveDateStart;
  const s = new Date(leaveDateStart.replace(/-/g, '/') + ' 12:00:00');
  const e = new Date(end.replace(/-/g, '/') + ' 12:00:00');
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) return [];

  const dates: string[] = [];
  const pushMatching = (year: number) => {
    for (let cur = new Date(s); cur <= e; cur.setDate(cur.getDate() + 1)) {
      const js = cur.getDay();
      if (js < 1 || js > 5) continue;
      if (cur.getMonth() + 1 !== settlementMonth) continue;
      if (cur.getFullYear() !== year) continue;
      const iso = dateToIsoLocal(cur);
      if (isNonTeachingDate(iso, holidaySet)) continue;
      dates.push(iso);
    }
  };
  pushMatching(settlementYear);
  return dates;
}

type CoverKey = string;

type DayCover = {
  className: string;
  teacherName: string;
  leaveShort: string;
};

const coverKey = (c: DayCover): CoverKey =>
  `${c.className}|${c.teacherName}|${c.leaveShort}`;

const coverLabel = (covers: DayCover[]): string => {
  if (covers.length === 0) return '';
  if (covers.length === 1) {
    const c = covers[0];
    return `代${c.className}${c.teacherName}導師${c.leaveShort}`;
  }
  // 同日代理多班：代A導師及B導師公假
  const leave = covers[0].leaveShort;
  const parts = covers.map((c) => `${c.className}${c.teacherName}導師`);
  return `代${parts.join('及')}${leave}`;
};

/** 將連續日期合併為 3/26~3/27 或 3/16 */
function formatDateSpan(dates: string[]): string {
  const sorted = [...dates].sort();
  if (sorted.length === 0) return '';
  if (sorted.length === 1) return formatMd(sorted[0]);

  const parts: string[] = [];
  let runStart = sorted[0];
  let runPrev = sorted[0];

  const flush = () => {
    if (runStart === runPrev) parts.push(formatMd(runStart));
    else parts.push(`${formatMd(runStart)}~${formatMd(runPrev)}`);
  };

  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i];
    const prevDate = new Date(runPrev.replace(/-/g, '/') + ' 12:00:00');
    const curDate = new Date(cur.replace(/-/g, '/') + ' 12:00:00');
    const diffDays = Math.round((curDate.getTime() - prevDate.getTime()) / 86400000);
    if (diffDays === 1) {
      runPrev = cur;
    } else {
      flush();
      runStart = cur;
      runPrev = cur;
    }
  }
  flush();
  return parts.join('、');
}

function buildRemarksForActingTeacher(
  dayCovers: Map<string, DayCover[]>
): string {
  const dates = [...dayCovers.keys()].sort();
  if (dates.length === 0) return '';

  // 將「涵蓋集合相同」的連續日合併
  type Segment = { dates: string[]; covers: DayCover[] };
  const segments: Segment[] = [];

  const sameCovers = (a: DayCover[], b: DayCover[]) => {
    if (a.length !== b.length) return false;
    const ka = a.map(coverKey).sort().join(';');
    const kb = b.map(coverKey).sort().join(';');
    return ka === kb;
  };

  for (const iso of dates) {
    const covers = dayCovers.get(iso) || [];
    const last = segments[segments.length - 1];
    if (last && sameCovers(last.covers, covers)) {
      const prev = last.dates[last.dates.length - 1];
      const prevD = new Date(prev.replace(/-/g, '/') + ' 12:00:00');
      const curD = new Date(iso.replace(/-/g, '/') + ' 12:00:00');
      const diff = Math.round((curD.getTime() - prevD.getTime()) / 86400000);
      if (diff === 1) {
        last.dates.push(iso);
        continue;
      }
    }
    segments.push({ dates: [iso], covers: [...covers] });
  }

  return segments
    .map((seg) => {
      const n = seg.dates.length;
      return `${formatDateSpan(seg.dates)}${coverLabel(seg.covers)}${n}天`;
    })
    .join(' ');
}

/**
 * 從已核准請假派代彙總代導師清冊列。
 * - 僅計有指定代導師、申請人為導師之單
 * - 同一代導師同一日只算 1 天（即使代多班）
 */
export function buildActingHomeroomPayrollRows(
  requests: SubstituteRequest[],
  teachers: Teacher[],
  systemConfig: SystemConfig,
  settlementMonth: number,
  settlementYear: number
): ActingHomeroomPayrollRow[] {
  const holidaySet = nonTeachingDateSet(systemConfig.nonTeachingDays);
  const rawRate = systemConfig.actingHomeroomDailyRate;
  const dailyRate = typeof rawRate === 'number' && Number.isFinite(rawRate) ? rawRate : 404;
  const teacherById = new Map(teachers.map((t) => [t.id, t]));

  /** actingTeacherId → date → covers */
  const byActing = new Map<string, Map<string, DayCover[]>>();

  for (const r of requests) {
    if (r.status !== 'approved' || r.requestType !== 'substitute') continue;
    if (!r.actingHomeroomTeacherId) continue;

    const applicant = teacherById.get(r.applicantTeacherId);
    if (!isHomeroomTeacher(applicant)) continue;

    const actingTeacher = teacherById.get(r.actingHomeroomTeacherId);
    // 有師資資料時：僅「未接班專任教師」列入領費；無資料者不列（避免誤發）
    if (!canReceiveActingHomeroomFee(actingTeacher)) continue;

    const className =
      applicant?.homeroomClass?.trim() ||
      r.originalSession?.className?.trim() ||
      '導師班';

    const leaveShort = actingHomeroomLeaveRemarkShort(r.leaveType, r.reason);
    const days = listActingHomeroomDaysInMonth(
      r.leaveDateStart,
      r.leaveDateEnd,
      settlementMonth,
      settlementYear,
      holidaySet
    );
    if (days.length === 0) continue;

    let dayMap = byActing.get(r.actingHomeroomTeacherId);
    if (!dayMap) {
      dayMap = new Map();
      byActing.set(r.actingHomeroomTeacherId, dayMap);
    }

    const cover: DayCover = {
      className,
      teacherName: r.applicantTeacherName,
      leaveShort,
    };

    for (const iso of days) {
      const existing = dayMap.get(iso) || [];
      if (!existing.some((c) => coverKey(c) === coverKey(cover))) {
        existing.push(cover);
      }
      dayMap.set(iso, existing);
    }
  }

  const rows: ActingHomeroomPayrollRow[] = [];
  for (const [actingId, dayMap] of byActing) {
    const actingDays = dayMap.size;
    if (actingDays <= 0) continue;
    const teacher = teacherById.get(actingId);
    const teacherName =
      teacher?.name ||
      requests.find((r) => r.actingHomeroomTeacherId === actingId)?.actingHomeroomTeacherName ||
      '';
    rows.push({
      teacherId: actingId,
      salaryCode: resolveTeacherSalaryCode(
        { id: actingId, name: teacherName },
        systemConfig
      ),
      teacherName,
      actingDays,
      dailyRate,
      amount: actingDays * dailyRate,
      remarks: buildRemarksForActingTeacher(dayMap),
    });
  }

  return rows.sort((a, b) => {
    const codeA = a.salaryCode || '999999';
    const codeB = b.salaryCode || '999999';
    if (codeA !== codeB) return codeA.localeCompare(codeB, undefined, { numeric: true });
    return a.teacherName.localeCompare(b.teacherName, 'zh-Hant');
  });
}

const sumTotals = (rows: ActingHomeroomPayrollRow[]): ActingHomeroomPayrollTotals =>
  rows.reduce(
    (acc, r) => ({
      actingDays: acc.actingDays + r.actingDays,
      amount: acc.amount + r.amount,
    }),
    { actingDays: 0, amount: 0 }
  );

const subtotalRateLabel = (rows: ActingHomeroomPayrollRow[]) => {
  if (rows.length === 0) return '';
  const rates = new Set(rows.map((r) => r.dailyRate));
  return rates.size === 1 ? String(rows[0].dailyRate) : '';
};

export function paginateActingHomeroomPayroll(rows: ActingHomeroomPayrollRow[]): {
  pages: ActingHomeroomPayrollPage[];
  grandTotal: ActingHomeroomPayrollTotals;
  grandTotalRateLabel: string;
} {
  const grandTotal = sumTotals(rows);
  const grandTotalRateLabel = subtotalRateLabel(rows);
  if (rows.length === 0) {
    return { pages: [], grandTotal, grandTotalRateLabel: '' };
  }

  const pages: ActingHomeroomPayrollPage[] = [];
  const createBlank = (idx: number): ActingHomeroomPayrollRow => ({
    teacherId: `__blank-${idx}`,
    salaryCode: '',
    teacherName: '',
    actingDays: 0,
    dailyRate: 0,
    amount: 0,
    remarks: '',
  });

  for (let i = 0; i < rows.length; i += PAYROLL_ROWS_PER_PAGE) {
    const slice = rows.slice(i, i + PAYROLL_ROWS_PER_PAGE);
    const isLastPage = i + PAYROLL_ROWS_PER_PAGE >= rows.length;
    const padSize = isLastPage ? PAYROLL_ROWS_LAST_PAGE : PAYROLL_ROWS_PER_PAGE;
    pages.push({
      pageIndex: pages.length + 1,
      rows: padPayrollRowsToPage(slice, createBlank, padSize),
      subtotal: sumTotals(slice),
      subtotalRateLabel: subtotalRateLabel(slice),
    });
  }
  return { pages, grandTotal, grandTotalRateLabel };
}
