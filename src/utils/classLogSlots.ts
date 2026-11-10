import type { ClassLogEntry, CourseSession, DayOfWeek, SubstituteRequest } from '../types';
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

/** 該課堂於指定日是否已被核准派代（有代課者）涵蓋 */
export function isSessionCoveredByApprovedSubstitute(
  session: Pick<CourseSession, 'id' | 'dayOfWeek' | 'period' | 'teacherId' | 'className'>,
  isoDate: string,
  requests: SubstituteRequest[]
): boolean {
  return requests.some((r) => {
    if (r.status !== 'approved' || r.requestType !== 'substitute') return false;
    if (!r.substituteTeacherId) return false;
    if (!leaveRangeCoversDate(r.leaveDateStart, r.leaveDateEnd, isoDate)) return false;
    const orig = r.originalSession;
    if (!orig) return false;
    return (
      orig.id === session.id ||
      (orig.dayOfWeek === session.dayOfWeek &&
        orig.period === session.period &&
        r.applicantTeacherId === session.teacherId &&
        (!orig.className || !session.className || orig.className === session.className))
    );
  });
}

/**
 * 指定日期、指定教師應填的課堂：
 * - 本人課表該星期的課（當日已核准派代涵蓋者除外，避免與代課者搶同一筆）
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
    if (isSessionCoveredByApprovedSubstitute(s, isoDate, requests)) continue;
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

function sameClassLogLesson(a: ClassLogSlot, b: ClassLogSlot): boolean {
  return (
    a.className === b.className &&
    a.subjectName === b.subjectName &&
    a.originalTeacherId === b.originalTeacherId &&
    a.isSubstituteFill === b.isSubstituteFill
  );
}

/**
 * 同一天、同班同科目（同原任課／代課狀態）且節次相連的課堂區塊（含 center）。
 * 例：第 2～4 節同班實習 → 填一節可套用整段。
 */
export function findConsecutiveClassLogSlots(
  slots: ClassLogSlot[],
  center: ClassLogSlot
): ClassLogSlot[] {
  const same = slots
    .filter((s) => sameClassLogLesson(s, center))
    .sort((a, b) => a.period - b.period || a.sessionId.localeCompare(b.sessionId));
  if (same.length === 0) return [center];

  const idx = same.findIndex(
    (s) => s.period === center.period && s.sessionId === center.sessionId
  );
  if (idx < 0) return [center];

  let lo = idx;
  while (lo > 0 && same[lo].period === same[lo - 1].period + 1) lo -= 1;
  let hi = idx;
  while (hi < same.length - 1 && same[hi + 1].period === same[hi].period + 1) hi += 1;
  return same.slice(lo, hi + 1);
}

/** 列表／開啟表單時：空節可顯示連續區塊內任一已填內容 */
export function resolveClassLogDisplayEntry(params: {
  slot: ClassLogSlot;
  date: string;
  slots: ClassLogSlot[];
  entriesById: Map<string, ClassLogEntry>;
}): ClassLogEntry | undefined {
  const { slot, date, slots, entriesById } = params;
  const ownId = classLogEntryId({ date, period: slot.period, sessionId: slot.sessionId });
  const own = entriesById.get(ownId);
  if (own) return own;

  const block = findConsecutiveClassLogSlots(slots, slot);
  for (const s of block) {
    const id = classLogEntryId({ date, period: s.period, sessionId: s.sessionId });
    const e = entriesById.get(id);
    if (e) return e;
  }
  return undefined;
}

/**
 * 開啟表單時是否預設勾選「一併套用」：
 * - 僅一節 → 否
 * - 其他節已有不同進度／備註 → 否（避免覆寫）
 * - 其餘（首次填寫、整段一致、或本節已填但連續節尚無獨立紀錄）→ 是
 *   （後者讓「更新並截章」會把鏡射中的連續節也寫成各節已填）
 */
export function shouldDefaultApplyConsecutive(params: {
  block: ClassLogSlot[];
  center: ClassLogSlot;
  date: string;
  entriesById: Map<string, ClassLogEntry>;
  displayProgress: string;
  displayNote: string;
}): boolean {
  const { block, center, date, entriesById, displayProgress, displayNote } = params;
  if (block.length <= 1) return false;

  for (const s of block) {
    if (s.period === center.period && s.sessionId === center.sessionId) continue;
    const e = entriesById.get(
      classLogEntryId({ date, period: s.period, sessionId: s.sessionId })
    );
    if (!e) continue;
    if (
      (e.progress || '') !== (displayProgress || '') ||
      (e.note || '') !== (displayNote || '')
    ) {
      return false;
    }
  }

  return true;
}
