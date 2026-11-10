import type { CourseSession, DayOfWeek, SubstituteRequest } from '../types';
import { dateToDayOfWeek, leaveRangeCoversDate } from './leaveDates';

/** 教室日誌待填／已填對應的一節課 */
export type ClassLogSlot = {
  sessionId: string;
  period: number;
  dayOfWeek: DayOfWeek;
  className: string;
  subjectName: string;
  venueName: string;
  originalTeacherId: string;
  originalTeacherName: string;
  isSubstituteFill: boolean;
};

/** 穩定鍵：同日同節同課堂只一筆（代課覆寫同一 id） */
export function classLogEntryId(params: {
  date: string;
  period: number;
  sessionId: string;
}): string {
  return [params.date, params.period, params.sessionId].join('_').replace(/[.#$/[\]]/g, '-');
}

function slotFromSession(session: CourseSession, isSubstituteFill: boolean): ClassLogSlot {
  return {
    sessionId: session.id,
    period: session.period,
    dayOfWeek: session.dayOfWeek,
    className: session.className,
    subjectName: session.subjectName,
    venueName: session.venueName,
    originalTeacherId: session.teacherId,
    originalTeacherName: session.teacherName,
    isSubstituteFill,
  };
}

/**
 * 指定日期、指定教師應填的課堂：
 * - 本人課表該星期的課
 * - 另加當日已核准、自己為代課者之請假派代課堂
 */
export function listClassLogSlotsForTeacher(params: {
  teacherId: string;
  isoDate: string;
  sessions: CourseSession[];
  requests: SubstituteRequest[];
}): ClassLogSlot[] {
  const { teacherId, isoDate, sessions, requests } = params;
  const dow = dateToDayOfWeek(isoDate);
  if (dow == null) return [];

  const byKey = new Map<string, ClassLogSlot>();

  for (const s of sessions) {
    if (s.teacherId !== teacherId || s.dayOfWeek !== dow) continue;
    const key = `${s.period}|${s.id}`;
    byKey.set(key, slotFromSession(s, false));
  }

  for (const r of requests) {
    if (r.status !== 'approved' || r.requestType !== 'substitute') continue;
    if (r.substituteTeacherId !== teacherId) continue;
    if (!leaveRangeCoversDate(r.leaveDateStart, r.leaveDateEnd, isoDate)) continue;
    const orig = r.originalSession;
    if (!orig) continue;
    if (orig.dayOfWeek !== dow) continue;
    const key = `${orig.period}|${orig.id}`;
    // 代課優先覆寫同一節（本日實際上課者為代課）
    byKey.set(key, {
      ...slotFromSession(orig, true),
      originalTeacherId: r.applicantTeacherId || orig.teacherId,
      originalTeacherName: r.applicantTeacherName || orig.teacherName,
    });
  }

  return [...byKey.values()].sort(
    (a, b) =>
      a.period - b.period ||
      a.className.localeCompare(b.className, 'zh-Hant') ||
      a.subjectName.localeCompare(b.subjectName, 'zh-Hant')
  );
}

/** 僅作者可刪（教學組彙整不提供刪除） */
export function canDeleteClassLogEntry(
  entry: { authorTeacherId: string },
  teacherId: string | undefined
): boolean {
  return Boolean(teacherId && entry.authorTeacherId === teacherId);
}
