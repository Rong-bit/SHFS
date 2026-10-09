import {
  CourseSession,
  DayOfWeek,
  SubstituteNoticeRow,
  SubstituteRequest,
} from '../types';
import { resolveOriginalSession } from './resolveOriginalSession';
import { resolveLeaveDateEnd } from './leaveDates';
import { leaveTypeRemarkShort } from './leaveTypes';
import { dateToIsoLocal } from './holidays';
import {
  isTemporarySwap,
  resolveTemporarySwapOccurrenceDates,
} from './temporarySwap';
import { parseNoticeRowDateToIso } from './noticePayroll';
import { isActingHomeroomOnlyRequest } from './actingHomeroomPayrollRegister';

export type NoticeRow = SubstituteNoticeRow;

const WEEKDAY_PRINT_LABELS: Record<string, string> = {
  '1': '一',
  '2': '二',
  '3': '三',
  '4': '四',
  '5': '五',
};

/** 通知單鐘點欄：兼課顯示「兼課」，其餘留白（不顯示數字節數） */
export function formatNoticeHoursDisplay(hours: string): string {
  return hours.trim() === '兼課' ? '兼課' : '';
}

export function formatNoticeWeekdayLabel(weekday: string): string {
  const trimmed = weekday.trim();
  if (!trimmed) return '';
  if (WEEKDAY_PRINT_LABELS[trimmed]) return WEEKDAY_PRINT_LABELS[trimmed];
  const n = Number(trimmed);
  if (Number.isFinite(n) && n >= 1 && n <= 5) return WEEKDAY_PRINT_LABELS[String(n)] || trimmed;
  return trimmed;
}

export const EMPTY_NOTICE_ROW: NoticeRow = {
  date: '',
  weekday: '',
  period: '',
  className: '',
  subjectName: '',
  hours: '',
};

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

function listDatesMatchingWeekday(
  start: string,
  end: string,
  dayOfWeek: DayOfWeek
): string[] {
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

function noticeHoursLabelForSession(session: Pick<CourseSession, 'isConcurrent'>): string {
  return session.isConcurrent ? '兼課' : '';
}

function sessionRow(session: CourseSession, dateIso?: string): NoticeRow {
  const weekday = weekdayFromIso(dateIso) ?? session.dayOfWeek;
  return {
    date: formatNoticeDate(dateIso),
    weekday: String(weekday),
    period: String(session.period),
    className: session.className || '',
    subjectName: session.subjectName || '',
    hours: noticeHoursLabelForSession(session),
  };
}

function sortNoticeRows(rows: NoticeRow[]): NoticeRow[] {
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

function buildLeaveRangeNoticeRows(
  groupedSessions: CourseSession[],
  leaveStart: string,
  leaveEnd: string
): NoticeRow[] {
  const rows = groupedSessions.flatMap((sess) => {
    const dates =
      leaveStart && leaveEnd && sess.dayOfWeek
        ? listDatesMatchingWeekday(leaveStart, leaveEnd, sess.dayOfWeek)
        : leaveStart
          ? [leaveStart]
          : [''];
    const dateList = dates.length ? dates : [leaveStart || ''];
    return dateList.map((iso) => sessionRow(sess, iso || undefined));
  });
  return sortNoticeRows(rows);
}

function stripTeacherTitle(name?: string): string {
  return (name || '')
    .replace(/\s+/g, '')
    .replace(/(科主任|主任|組長|導師|老師)$/g, '');
}

function teacherLabel(name?: string, fallback = '代課'): string {
  const n = stripTeacherTitle(name);
  return n ? `${n}老師` : `${fallback}老師`;
}

/** 與列印分張相同：同假單、同一代理人為一張 */
export function noticeSheetKey(request: SubstituteRequest): string {
  if (request.status === 'approved' && request.batchGroupId) {
    return `${request.batchGroupId}::${request.substituteTeacherId || ''}`;
  }
  return request.id;
}

export type NoticeDocument = {
  liveRequest: SubstituteRequest;
  printGroup: SubstituteRequest[];
  defaultRows: NoticeRow[];
  savedNoticeRows: NoticeRow[] | null;
  displayRows: NoticeRow[];
  title: string;
  addressee: string;
  greeting: string;
  requestNumberLabel: string;
};

export function buildNoticeDocument(
  request: SubstituteRequest,
  requests: SubstituteRequest[],
  sessions: CourseSession[]
): NoticeDocument {
  const liveRequest = requests.find((r) => r.id === request.id) ?? request;

  /** 同假單編號可有多位代理人；每一張通知單只含該代理人的節次 */
  const printGroup =
    liveRequest.status === 'approved' && liveRequest.batchGroupId
      ? requests
          .filter(
            (r) =>
              r.batchGroupId === liveRequest.batchGroupId &&
              r.status === 'approved' &&
              (liveRequest.substituteTeacherId
                ? r.substituteTeacherId === liveRequest.substituteTeacherId
                : true)
          )
          .sort(
            (a, b) =>
              a.originalSession.dayOfWeek - b.originalSession.dayOfWeek ||
              a.originalSession.period - b.originalSession.period
          )
      : [liveRequest];

  const groupedSessions = printGroup.map((r) => resolveOriginalSession(r, sessions));
  const originalSession = groupedSessions[0] || resolveOriginalSession(liveRequest, sessions);
  const leaveShort = leaveTypeRemarkShort(liveRequest.leaveType, liveRequest.reason);
  const leaveStart = liveRequest.leaveDateStart || '';
  const leaveEnd = resolveLeaveDateEnd(leaveStart, liveRequest.leaveDateEnd) || leaveStart;

  let title: string;
  let addressee: string;
  let greeting: string;
  let defaultRows: NoticeRow[];

  if (liveRequest.requestType === 'reschedule') {
    const target = liveRequest.targetReschedule;
    title = '調課通知單';
    addressee = teacherLabel(liveRequest.applicantTeacherName, '申請');
    greeting = '您好！您申請自行移課如下，請依新時段授課，';
    defaultRows = groupedSessions.map((sess) =>
      sessionRow(
        target
          ? {
              ...sess,
              dayOfWeek: target.dayOfWeek,
              period: target.period,
              venueId: target.venueId,
              venueName: target.venueName,
            }
          : sess
      )
    );
  } else if (liveRequest.requestType === 'swap' && liveRequest.swapTargetSession) {
    let applicantDate: string | undefined;
    let partnerDate: string | undefined;
    if (isTemporarySwap(liveRequest) && liveRequest.effectiveDate) {
      const occ = resolveTemporarySwapOccurrenceDates(
        liveRequest.effectiveDate,
        originalSession.dayOfWeek,
        liveRequest.swapTargetSession.dayOfWeek
      );
      applicantDate = occ.applicantDate;
      partnerDate = occ.partnerDate;
    }
    title = '調課通知單';
    addressee = teacherLabel(liveRequest.swapTargetTeacherName, '對調');
    greeting = `您好！${teacherLabel(liveRequest.applicantTeacherName, '申請')}申請同班對調如下，請依對調時段授課，`;
    defaultRows = [
      sessionRow(originalSession, applicantDate),
      sessionRow(liveRequest.swapTargetSession, partnerDate),
    ];
  } else {
    title = '代課通知單';
    addressee = teacherLabel(liveRequest.substituteTeacherName);
    greeting = `您好！${teacherLabel(liveRequest.applicantTeacherName, '申請')}因${leaveShort}請您代理以下課程，`;
    defaultRows = buildLeaveRangeNoticeRows(groupedSessions, leaveStart, leaveEnd);
  }

  let savedNoticeRows: NoticeRow[] | null = null;
  if (liveRequest.noticeRowsCustomized && liveRequest.noticeRows?.length) {
    savedNoticeRows = liveRequest.noticeRows;
  } else {
    const batchSaved = printGroup.find((r) => r.noticeRowsCustomized && r.noticeRows?.length);
    savedNoticeRows = batchSaved?.noticeRows ?? null;
  }

  const requestNumberLabel =
    printGroup.length > 1
      ? printGroup[0].requestNumber === printGroup[printGroup.length - 1].requestNumber
        ? printGroup[0].requestNumber
        : `${printGroup[0].requestNumber}～${printGroup[printGroup.length - 1].requestNumber}`
      : liveRequest.requestNumber;

  return {
    liveRequest,
    printGroup,
    defaultRows,
    savedNoticeRows,
    displayRows: savedNoticeRows ?? defaultRows,
    title,
    addressee,
    greeting,
    requestNumberLabel,
  };
}

/**
 * 可列印／可匯出的通知單錨點（已核准，且非僅代導師）。
 * scope 有值時，只保留該範圍內至少有一筆申請的通知單，內容仍依全校申請組成。
 */
export function listPrintableNoticeAnchors(
  requests: SubstituteRequest[],
  scope?: SubstituteRequest[]
): SubstituteRequest[] {
  const scopeIds = scope ? new Set(scope.map((r) => r.id)) : null;
  const printable = requests.filter(
    (r) => r.status === 'approved' && !isActingHomeroomOnlyRequest(r)
  );
  const seen = new Set<string>();
  const anchors: SubstituteRequest[] = [];
  for (const request of printable) {
    const key = noticeSheetKey(request);
    if (seen.has(key)) continue;
    if (scopeIds && !printable.some((r) => noticeSheetKey(r) === key && scopeIds.has(r.id))) {
      continue;
    }
    seen.add(key);
    anchors.push(request);
  }
  return anchors.sort((a, b) =>
    (a.requestNumber || '').localeCompare(b.requestNumber || '', 'zh-Hant')
  );
}

/** 解析 YYYY-MM-DD 或 YYYY-MM-DD HH:mm 為本地 Date；無效則回 null */
function parseLocalDateTime(value?: string): Date | null {
  if (!value?.trim()) return null;
  const m = value.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{1,2}))?/);
  if (!m) return null;
  const y = Number(m[1]);
  const month = Number(m[2]);
  const d = Number(m[3]);
  const h = Number(m[4] ?? 12);
  const min = Number(m[5] ?? 0);
  if (![y, month, d, h, min].every(Number.isFinite)) return null;
  const dt = new Date(y, month - 1, d, h, min, 0, 0);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/**
 * 通知單開立／戳章日期：以核准（產生）時間為準，補印不隨「今天」變動。
 * 優先 reviewedAt → 同批最早 reviewedAt → createdAt → 現在。
 */
export function resolveNoticeIssueDate(
  liveRequest: SubstituteRequest,
  printGroup: SubstituteRequest[]
): Date {
  const fromLive = parseLocalDateTime(liveRequest.reviewedAt);
  if (fromLive) return fromLive;

  let earliest: Date | null = null;
  for (const req of printGroup) {
    const dt = parseLocalDateTime(req.reviewedAt);
    if (!dt) continue;
    if (!earliest || dt.getTime() < earliest.getTime()) earliest = dt;
  }
  if (earliest) return earliest;

  return (
    parseLocalDateTime(liveRequest.createdAt) ||
    parseLocalDateTime(printGroup[0]?.createdAt) ||
    new Date()
  );
}

/** 開立通知單日期，例 115.8.28 */
export function formatNoticeIssueRocDate(date: Date = new Date()): string {
  const roc = date.getFullYear() - 1911;
  return `${roc}.${date.getMonth() + 1}.${date.getDate()}`;
}

/** 戳章日期格式，例 115. 8. 28（與表格下開立日期同源） */
export function formatStampRocDate(date: Date = new Date()): string {
  const roc = date.getFullYear() - 1911;
  return `${roc}. ${date.getMonth() + 1}. ${date.getDate()}`;
}
