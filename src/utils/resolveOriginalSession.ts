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
 * 優先以「申請教師 + 星期 + 節次」比對；找不到再以代課教師時段比對。
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

  if (request.substituteTeacherId) {
    const bySub = sessions.find(
      (s) => sameSlot(s) && s.teacherId === request.substituteTeacherId
    );
    if (bySub) {
      return { ...orig, ...bySub, id: bySub.id };
    }
  }

  if (orig.teacherId) {
    const byOrigTeacher = sessions.find((s) => sameSlot(s) && s.teacherId === orig.teacherId);
    if (byOrigTeacher) {
      return { ...orig, ...byOrigTeacher, id: byOrigTeacher.id };
    }
  }

  return orig;
};
