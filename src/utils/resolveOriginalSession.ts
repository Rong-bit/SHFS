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

/**
 * 將佔位／暫代 originalSession 對應到現行課表課堂（含真實 id）。
 * 僅以「申請教師 + 星期 + 節次」比對；找不到則維持佔位（由核准流程擋下）。
 */
export const resolveOriginalSession = (
  request: SubstituteRequest,
  sessions: CourseSession[]
): CourseSession => {
  const orig = request.originalSession;
  if (!isPlaceholderSession(orig)) {
    const byId = sessions.find((s) => s.id === orig.id);
    return byId ? { ...orig, ...byId, id: byId.id } : orig;
  }

  const sameSlot = (s: CourseSession) =>
    s.dayOfWeek === orig.dayOfWeek && s.period === orig.period;

  const byApplicant = sessions.find(
    (s) => sameSlot(s) && s.teacherId === request.applicantTeacherId
  );
  if (byApplicant) {
    return { ...orig, ...byApplicant, id: byApplicant.id };
  }

  // 申請人該格已是此單的代課覆蓋（任課已改為代課教師）時，仍可對回該課堂
  if (request.substituteTeacherId && request.applicantTeacherName) {
    const byCover = sessions.find(
      (s) =>
        sameSlot(s) &&
        s.teacherId === request.substituteTeacherId &&
        Boolean(s.notes?.includes('[代課]')) &&
        Boolean(s.notes?.includes(request.applicantTeacherName))
    );
    if (byCover) {
      return { ...orig, ...byCover, id: byCover.id };
    }
  }

  return orig;
};
