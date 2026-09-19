import { CourseSession, SubstituteRequest } from '../types';

/** 教師端請假時暫代、尚未對應真實課表的課堂 */
export const isPlaceholderSession = (session: CourseSession | undefined | null): boolean => {
  if (!session) return true;
  return (
    session.className === '未指派課堂' ||
    session.id === 's-placeholder' ||
    session.id.startsWith('s-placeholder')
  );
};

function isLeaveCoverNote(notes?: string): boolean {
  return Boolean(notes?.includes('[代課]') || notes?.includes('[請假派代]'));
}

/**
 * 將佔位／暫代 originalSession 對應到現行課表課堂（含真實 id）。
 * 非佔位：保留申請快照的星期／節次／場地（通知單「原排定」、核准套用 snap），
 * 僅合併現行 id 與任課等欄位，避免核准／列印把原時段蓋成異動後時段。
 */
export const resolveOriginalSession = (
  request: SubstituteRequest,
  sessions: CourseSession[]
): CourseSession => {
  const orig = request.originalSession;
  // 僅代導師佔位不可對到同星期第 1 節真實課堂，否則會印成調代課單／誤改課表
  if (
    orig &&
    isPlaceholderSession(orig) &&
    !request.substituteTeacherId &&
    (orig.id.startsWith('s-placeholder-acting') ||
      Boolean(orig.subjectName?.includes('代導師')) ||
      Boolean(orig.notes?.includes('僅代導師')))
  ) {
    return orig;
  }
  if (!isPlaceholderSession(orig)) {
    const byId = sessions.find((s) => s.id === orig.id);
    if (!byId) return orig;
    return {
      ...orig,
      ...byId,
      id: byId.id,
      // 申請當下之時段／場地不可被現行課表覆寫
      dayOfWeek: orig.dayOfWeek,
      period: orig.period,
      venueId: orig.venueId || byId.venueId,
      venueName: orig.venueName || byId.venueName,
      className: orig.className || byId.className,
      subjectName: orig.subjectName || byId.subjectName,
    };
  }

  const sameSlot = (s: CourseSession) =>
    s.dayOfWeek === orig.dayOfWeek && s.period === orig.period;

  const byApplicant = sessions.find(
    (s) => sameSlot(s) && s.teacherId === request.applicantTeacherId
  );
  if (byApplicant) {
    return { ...orig, ...byApplicant, id: byApplicant.id };
  }

  // 舊版曾把任課改成代課老師：仍可對回該課堂
  if (request.substituteTeacherId) {
    const byCover = sessions.find(
      (s) =>
        sameSlot(s) &&
        s.teacherId === request.substituteTeacherId &&
        isLeaveCoverNote(s.notes) &&
        Boolean(
          !request.applicantTeacherName || s.notes?.includes(request.applicantTeacherName)
        )
    );
    if (byCover) {
      return { ...orig, ...byCover, id: byCover.id };
    }
  }

  // 新版：仍掛申請人＋請假標註
  if (request.applicantTeacherId) {
    const byLeaveNote = sessions.find(
      (s) =>
        sameSlot(s) &&
        s.teacherId === request.applicantTeacherId &&
        isLeaveCoverNote(s.notes)
    );
    if (byLeaveNote) {
      return { ...orig, ...byLeaveNote, id: byLeaveNote.id };
    }
  }

  return orig;
};

/**
 * 將互調對調課堂對應到現行課表（以 id 優先；否則對調教師＋時段）。
 * 同樣保留申請快照的星期／節次／場地。
 */
export const resolveSwapTargetSession = (
  request: SubstituteRequest,
  sessions: CourseSession[]
): CourseSession | undefined => {
  const snap = request.swapTargetSession;
  if (!snap) return undefined;

  const byId = sessions.find((s) => s.id === snap.id);
  if (byId) {
    return {
      ...snap,
      ...byId,
      id: byId.id,
      dayOfWeek: snap.dayOfWeek,
      period: snap.period,
      venueId: snap.venueId || byId.venueId,
      venueName: snap.venueName || byId.venueName,
      className: snap.className || byId.className,
      subjectName: snap.subjectName || byId.subjectName,
    };
  }

  if (request.swapTargetTeacherId) {
    const bySlot = sessions.find(
      (s) =>
        s.teacherId === request.swapTargetTeacherId &&
        s.dayOfWeek === snap.dayOfWeek &&
        s.period === snap.period
    );
    if (bySlot) {
      return {
        ...snap,
        ...bySlot,
        id: bySlot.id,
        dayOfWeek: snap.dayOfWeek,
        period: snap.period,
        venueId: snap.venueId || bySlot.venueId,
        venueName: snap.venueName || bySlot.venueName,
      };
    }
  }

  return snap;
};
