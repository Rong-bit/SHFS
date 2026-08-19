import { CourseSession, SubstituteRequest } from '../types';

export const resolveOriginalSession = (
  request: SubstituteRequest,
  sessions: CourseSession[]
): CourseSession => {
  const orig = request.originalSession;
  const isPlaceholder = orig.className === '未指派課堂' || orig.id === 's-placeholder';
  if (!isPlaceholder) return orig;

  const found = sessions.find(
    (s) =>
      s.dayOfWeek === orig.dayOfWeek &&
      s.period === orig.period &&
      (s.teacherId === request.applicantTeacherId || s.teacherId === request.substituteTeacherId)
  );

  return found
    ? {
        ...orig,
        className: found.className,
        subjectName: found.subjectName,
        venueName: found.venueName || orig.venueName,
        isPractical: found.isPractical,
        isConcurrent: found.isConcurrent,
      }
    : orig;
};
