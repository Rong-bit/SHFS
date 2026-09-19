import { CourseSession, DayOfWeek } from '../types';

/** 指定星期／節次的佔用課堂（可排除自己） */
export function findSessionsAtSlot(
  sessions: CourseSession[],
  dayOfWeek: DayOfWeek,
  period: number,
  excludeSessionId?: string
): CourseSession[] {
  return sessions.filter(
    (s) =>
      s.dayOfWeek === dayOfWeek &&
      s.period === period &&
      (!excludeSessionId || s.id !== excludeSessionId)
  );
}

/**
 * 移課置換優先對象：同班佔用 > 同教師佔用 > 同場地佔用 > 該節任一堂
 */
export function pickExchangeCandidate(
  sessions: CourseSession[],
  dayOfWeek: DayOfWeek,
  period: number,
  original: CourseSession,
  preferredVenueId?: string
): CourseSession | undefined {
  const occupants = findSessionsAtSlot(sessions, dayOfWeek, period, original.id);
  if (occupants.length === 0) return undefined;
  const sameClass = occupants.find((s) => s.className === original.className);
  if (sameClass) return sameClass;
  const sameTeacher = occupants.find((s) => s.teacherId === original.teacherId);
  if (sameTeacher) return sameTeacher;
  if (preferredVenueId) {
    const sameVenue = occupants.find((s) => s.venueId === preferredVenueId);
    if (sameVenue) return sameVenue;
  }
  return occupants[0];
}
