import type {
  AcademicStaff,
  ClassLogEntry,
  ClassLogReturn,
  ClassLogReviewRole,
  ClassLogWeekReview,
  ClassLogWeekSignOff,
  CourseSession,
  SubstituteRequest,
  Teacher,
} from '../types';
import { isAcademicDeanStaff } from './academicOfficeStaff';
import { ClassLogDuty, classLogEntryId, listClassLogDutiesForDate } from './classLogSlots';
import { dateToIsoLocal } from './holidays';
import { dateToDayOfWeek } from './leaveDates';
import { stampOfficeAndTitle } from './patrolReview';
import { escapeHtml } from './patrolMail';

const DAY_LABELS = ['', '一', '二', '三', '四', '五'] as const;

/** 去掉空白與句讀後，仍算沒寫到教學內容的敷衍字 */
const PLACEHOLDER =
  /^(無|無內容|沒有|未填|未寫|待補|待寫|同上|同前|略|補|ok|okay|na|none|n\/a|—|-|–|…|\.+|。+)$/i;

export const CLASS_LOG_REVIEW_ROLE_LABEL: Record<ClassLogReviewRole, string> = {
  teaching_leader: '教學組長',
  academic_dean: '教務主任',
};

export type ClassLogDutyStatus = 'complete' | 'missing' | 'incomplete' | 'returned';

export function classLogReviewRole(
  staff: Pick<AcademicStaff, 'title'> | null | undefined
): ClassLogReviewRole | null {
  if (!staff) return null;
  if (isAcademicDeanStaff(staff)) return 'academic_dean';
  if ((staff.title || '').includes('教學組長')) return 'teaching_leader';
  return null;
}

export function canClassLogReview(
  staff: Pick<AcademicStaff, 'title'> | null | undefined
): boolean {
  return classLogReviewRole(staff) != null;
}

/** 空白、過短或敷衍用語視為沒寫完；有實際進度則通過 */
export function classLogContentIssue(
  progress: string | undefined | null
): 'empty' | 'incomplete' | null {
  const text = (progress ?? '').trim();
  if (!text) return 'empty';
  const compact = text.replace(/\s+/g, '').replace(/[。．.！!，,、]+$/g, '');
  if (compact.length < 2 || PLACEHOLDER.test(compact)) return 'incomplete';
  return null;
}

export function schoolWeekOf(isoDate: string): { weekStart: string; weekEnd: string } {
  const d = new Date(isoDate.replace(/-/g, '/') + ' 12:00:00');
  if (Number.isNaN(d.getTime())) {
    return schoolWeekOf(dateToIsoLocal(new Date()));
  }
  const js = d.getDay();
  const mondayOffset = js === 0 ? -6 : 1 - js;
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + mondayOffset);
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  return { weekStart: dateToIsoLocal(monday), weekEnd: dateToIsoLocal(friday) };
}

export function shiftSchoolWeek(
  weekStart: string,
  deltaWeeks: number
): { weekStart: string; weekEnd: string } {
  const d = new Date(weekStart.replace(/-/g, '/') + ' 12:00:00');
  d.setDate(d.getDate() + deltaWeeks * 7);
  return schoolWeekOf(dateToIsoLocal(d));
}

export function eachSchoolDate(weekStart: string, weekEnd: string): string[] {
  const out: string[] = [];
  const d = new Date(weekStart.replace(/-/g, '/') + ' 12:00:00');
  if (Number.isNaN(d.getTime())) return out;
  for (let i = 0; i < 7; i++) {
    const iso = dateToIsoLocal(d);
    if (iso > weekEnd) break;
    if (dateToDayOfWeek(iso)) out.push(iso);
    d.setDate(d.getDate() + 1);
  }
  return out;
}

export function classLogWeekReviewId(weekStart: string, className: string): string {
  return `${weekStart}__${className}`.replace(/[.#$/[\]\s]/g, '-');
}

export function formatSchoolWeekLabel(weekStart: string, weekEnd: string): string {
  return `${weekStart}～${weekEnd}`;
}

export function classLogGapLabel(status: ClassLogDutyStatus): string {
  switch (status) {
    case 'missing':
      return '尚未填寫';
    case 'incomplete':
      return '內容不完整';
    case 'returned':
      return '已退回';
    default:
      return '已完成';
  }
}

/** 退回後若內容已改成完整進度，才算重送完成 */
export function returnClearedByResubmit(params: {
  previous?: Pick<ClassLogEntry, 'progress' | 'assessment' | 'note'> | null;
  nextProgress: string;
  nextAssessment?: string;
  nextNote?: string;
}): boolean {
  if (classLogContentIssue(params.nextProgress)) return false;
  if (!params.previous) return true;
  const same =
    (params.previous.progress || '').trim() === params.nextProgress.trim() &&
    (params.previous.assessment || '').trim() === (params.nextAssessment || '').trim() &&
    (params.previous.note || '').trim() === (params.nextNote || '').trim();
  return !same;
}

export function classLogDutyStatus(params: {
  entry?: Pick<ClassLogEntry, 'progress' | 'updatedAt'> | null;
  returned?: Pick<ClassLogReturn, 'updatedAt'> | null;
}): ClassLogDutyStatus {
  const entry = params.entry || undefined;
  const returned = params.returned || undefined;
  if (returned) {
    const resubmitted =
      entry &&
      entry.updatedAt > returned.updatedAt &&
      !classLogContentIssue(entry.progress);
    if (resubmitted) return 'complete';
    return 'returned';
  }
  if (!entry) return 'missing';
  if (classLogContentIssue(entry.progress)) return 'incomplete';
  return 'complete';
}

export type ClassLogWeekDuty = {
  date: string;
  duty: ClassLogDuty;
  entry?: ClassLogEntry;
  returned?: ClassLogReturn;
  status: ClassLogDutyStatus;
};

export function listClassLogWeekDuties(params: {
  weekStart: string;
  weekEnd: string;
  sessions: CourseSession[];
  requests: SubstituteRequest[];
  transfers?: Parameters<typeof listClassLogDutiesForDate>[0]['transfers'];
  entries: ClassLogEntry[];
  returns?: ClassLogReturn[];
}): ClassLogWeekDuty[] {
  const entryById = new Map(params.entries.map((e) => [e.id, e]));
  const returnById = new Map((params.returns || []).map((r) => [r.id, r]));
  const rows: ClassLogWeekDuty[] = [];
  for (const date of eachSchoolDate(params.weekStart, params.weekEnd)) {
    const duties = listClassLogDutiesForDate({
      isoDate: date,
      sessions: params.sessions,
      requests: params.requests,
      transfers: params.transfers,
    });
    for (const duty of duties) {
      const id = classLogEntryId({
        date,
        period: duty.slot.period,
        sessionId: duty.slot.sessionId,
      });
      const entry = entryById.get(id);
      const returned = returnById.get(id);
      rows.push({
        date,
        duty,
        entry,
        returned,
        status: classLogDutyStatus({ entry, returned }),
      });
    }
  }
  return rows.sort(
    (a, b) =>
      a.duty.slot.className.localeCompare(b.duty.slot.className, 'zh-Hant') ||
      a.date.localeCompare(b.date) ||
      a.duty.slot.period - b.duty.slot.period ||
      a.duty.slot.subjectName.localeCompare(b.duty.slot.subjectName, 'zh-Hant')
  );
}

export type ClassLogClassWeek = {
  className: string;
  rows: ClassLogWeekDuty[];
  pendingCount: number;
};

export function groupClassLogWeekByClass(rows: ClassLogWeekDuty[]): ClassLogClassWeek[] {
  const map = new Map<string, ClassLogWeekDuty[]>();
  for (const row of rows) {
    const name = row.duty.slot.className || '（未填班級）';
    const list = map.get(name);
    if (list) list.push(row);
    else map.set(name, [row]);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'zh-Hant'))
    .map(([className, classRows]) => ({
      className,
      rows: classRows,
      pendingCount: classRows.filter((r) => r.status !== 'complete').length,
    }));
}

export type PendingClassLogTeacher = {
  teacherId: string;
  teacherName: string;
  email: string;
  gaps: ClassLogWeekDuty[];
};

export function listTeachersPendingClassLogStamp(
  rows: ClassLogWeekDuty[],
  teachers: Pick<Teacher, 'id' | 'name' | 'email'>[]
): PendingClassLogTeacher[] {
  const emailById = new Map(teachers.map((t) => [t.id, (t.email || '').trim()]));
  const nameById = new Map(teachers.map((t) => [t.id, t.name]));
  const grouped = new Map<string, ClassLogWeekDuty[]>();
  for (const row of rows) {
    if (row.status === 'complete') continue;
    const id = row.duty.holderTeacherId;
    const list = grouped.get(id);
    if (list) list.push(row);
    else grouped.set(id, [row]);
  }
  return [...grouped.entries()]
    .map(([teacherId, gaps]) => ({
      teacherId,
      teacherName: nameById.get(teacherId) || gaps[0]?.duty.holderTeacherName || teacherId,
      email: emailById.get(teacherId) || '',
      gaps,
    }))
    .sort((a, b) => a.teacherName.localeCompare(b.teacherName, 'zh-Hant'));
}

export function indexWeekReviews(
  reviews: ClassLogWeekReview[],
  weekStart: string
): Map<string, ClassLogWeekReview> {
  const map = new Map<string, ClassLogWeekReview>();
  for (const review of reviews) {
    if (review.weekStart !== weekStart && review.date !== weekStart) continue;
    map.set(review.className, review);
  }
  return map;
}

export function weekStampState(review?: ClassLogWeekReview | null): {
  leader?: ClassLogWeekSignOff;
  dean?: ClassLogWeekSignOff;
  complete: boolean;
} {
  const leader = review?.signOffs.find((s) => s.role === 'teaching_leader');
  const dean = review?.signOffs.find((s) => s.role === 'academic_dean');
  return { leader, dean, complete: Boolean(leader && dean) };
}

export function buildClassLogSignOff(
  staff: Pick<AcademicStaff, 'id' | 'name' | 'title'>,
  role: ClassLogReviewRole,
  now: string
): ClassLogWeekSignOff {
  const patrolRole = role === 'academic_dean' ? 'dean_academic' : 'academic';
  const { stampCaption } = stampOfficeAndTitle(patrolRole, '閱畢', staff.title);
  return {
    role,
    personId: staff.id,
    personName: staff.name,
    title: staff.title,
    stampCaption,
    stampedAt: now,
  };
}

export function applyClassLogWeekSignOff(
  review: ClassLogWeekReview | undefined,
  signOff: ClassLogWeekSignOff,
  meta: { weekStart: string; weekEnd: string; className: string; now: string }
): ClassLogWeekReview {
  const signOffs = [...(review?.signOffs || []).filter((s) => s.role !== signOff.role), signOff];
  return {
    id: classLogWeekReviewId(meta.weekStart, meta.className),
    date: meta.weekStart,
    weekStart: meta.weekStart,
    weekEnd: meta.weekEnd,
    className: meta.className,
    signOffs,
    createdAt: review?.createdAt || meta.now,
    updatedAt: meta.now,
  };
}

export function buildClassLogReturn(params: {
  row: ClassLogWeekDuty;
  reason: string;
  staff: Pick<AcademicStaff, 'id' | 'name' | 'title'>;
  role: ClassLogReviewRole;
  now: string;
  previous?: ClassLogReturn;
}): ClassLogReturn {
  const { row, staff, role, now } = params;
  return {
    id: classLogEntryId({
      date: row.date,
      period: row.duty.slot.period,
      sessionId: row.duty.slot.sessionId,
    }),
    date: row.date,
    period: row.duty.slot.period,
    dayOfWeek: row.duty.slot.dayOfWeek,
    sessionId: row.duty.slot.sessionId,
    className: row.duty.slot.className,
    subjectName: row.duty.slot.subjectName,
    holderTeacherId: row.duty.holderTeacherId,
    holderTeacherName: row.duty.holderTeacherName,
    reason: params.reason.trim(),
    actorId: staff.id,
    actorName: staff.name,
    actorTitle: staff.title,
    actorRole: role,
    createdAt: params.previous?.createdAt || now,
    updatedAt: now,
  };
}

export function formatClassLogGapLine(row: ClassLogWeekDuty): string {
  const dow = dateToDayOfWeek(row.date);
  const week = dow ? `週${DAY_LABELS[dow]}` : '';
  const head = `${row.date}${week ? `（${week}）` : ''} 第${row.duty.slot.period}節 ${row.duty.slot.className} ${row.duty.slot.subjectName}`;
  if (row.status === 'returned') {
    const reason = row.returned?.reason?.trim();
    return reason ? `${head}：已退回（${reason}）` : `${head}：已退回，請補寫後再送出`;
  }
  if (row.status === 'incomplete') return `${head}：教學內容不完整，請補寫實際進度`;
  return `${head}：尚未填寫教學內容`;
}

export function buildClassLogReminderEmail(params: {
  schoolName: string;
  weekStart: string;
  weekEnd: string;
  teacherName: string;
  gaps: ClassLogWeekDuty[];
}): { subject: string; text: string; html: string } {
  const school = params.schoolName.trim();
  const range = formatSchoolWeekLabel(params.weekStart, params.weekEnd);
  const subject = `【教室日誌】${school ? `${school} ` : ''}${range} 請補齊教學內容`;
  const lines = params.gaps.map(formatClassLogGapLine);
  const text = [
    `${params.teacherName} 老師您好：`,
    '',
    `${school || '學校'} ${range} 教室日誌仍有課堂尚未完成填寫或核章，請登入系統補寫教學內容並重新截章。`,
    '',
    ...lines.map((line) => `・${line}`),
    '',
    '若已退回，請依退回原因修改後再送出，內容與退回前相同不會解除退回。',
  ].join('\n');
  const items = lines
    .map((line) => `<li>${escapeHtml(line)}</li>`)
    .join('');
  const html = `
    <div style="font-family:sans-serif;line-height:1.6;color:#0f172a">
      <p>${escapeHtml(params.teacherName)} 老師您好：</p>
      <p>${escapeHtml(school || '學校')} ${escapeHtml(range)} 教室日誌仍有課堂尚未完成填寫或核章，請登入系統補寫教學內容並重新截章。</p>
      <ul>${items}</ul>
      <p>若已退回，請依退回原因修改後再送出，內容與退回前相同不會解除退回。</p>
    </div>
  `.trim();
  return { subject, text, html };
}
