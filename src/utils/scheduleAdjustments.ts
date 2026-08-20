import { CourseSession, SubstituteRequest } from '../types';

/** 核准時套用課表異動（移課／互調／代課任課） */
export function applyRequestToSessions(
  sessions: CourseSession[],
  req: SubstituteRequest
): CourseSession[] {
  if (req.requestType === 'reschedule' && req.targetReschedule) {
    return sessions.map((s) => {
      if (s.id !== req.originalSession.id) return s;
      return {
        ...s,
        dayOfWeek: req.targetReschedule!.dayOfWeek,
        period: req.targetReschedule!.period,
        venueId: req.targetReschedule!.venueId,
        venueName: req.targetReschedule!.venueName,
        notes: `[已移課] 原週${req.originalSession.dayOfWeek}第${req.originalSession.period}節`,
      };
    });
  }

  if (req.requestType === 'swap' && req.swapTargetSession) {
    return sessions.map((s) => {
      if (s.id === req.originalSession.id) {
        return {
          ...s,
          dayOfWeek: req.swapTargetSession!.dayOfWeek,
          period: req.swapTargetSession!.period,
          notes: `[相互調課] 與 ${req.swapTargetTeacherName} 對調`,
        };
      }
      if (s.id === req.swapTargetSession!.id) {
        return {
          ...s,
          dayOfWeek: req.originalSession.dayOfWeek,
          period: req.originalSession.period,
          notes: `[相互調課] 與 ${req.applicantTeacherName} 對調`,
        };
      }
      return s;
    });
  }

  if (req.requestType === 'substitute' && req.substituteTeacherId) {
    return sessions.map((s) => {
      if (s.id !== req.originalSession.id) return s;
      // 已是此代課覆蓋則略過（避免重複核准疊字）
      if (s.teacherId === req.substituteTeacherId && s.notes?.includes('[代課]')) return s;
      return {
        ...s,
        teacherId: req.substituteTeacherId!,
        teacherName: req.substituteTeacherName || s.teacherName,
        notes: `[代課] 原任課 ${req.applicantTeacherName}`,
      };
    });
  }

  return sessions;
}

/** 取消／刪除／駁回已核准單時回滾課表 */
export function rollbackRequestFromSessions(
  sessions: CourseSession[],
  req: SubstituteRequest
): CourseSession[] {
  if (req.status !== 'approved') return sessions;

  if (req.requestType === 'reschedule' && req.targetReschedule) {
    return sessions.map((s) => {
      if (s.id !== req.originalSession.id) return s;
      return {
        ...s,
        dayOfWeek: req.originalSession.dayOfWeek,
        period: req.originalSession.period,
        venueId: req.originalSession.venueId,
        venueName: req.originalSession.venueName,
        notes: undefined,
      };
    });
  }

  if (req.requestType === 'swap' && req.swapTargetSession) {
    return sessions.map((s) => {
      if (s.id === req.originalSession.id) {
        return {
          ...s,
          dayOfWeek: req.originalSession.dayOfWeek,
          period: req.originalSession.period,
          venueId: req.originalSession.venueId,
          venueName: req.originalSession.venueName,
          notes: undefined,
        };
      }
      if (s.id === req.swapTargetSession!.id) {
        return {
          ...s,
          dayOfWeek: req.swapTargetSession!.dayOfWeek,
          period: req.swapTargetSession!.period,
          venueId: req.swapTargetSession!.venueId,
          venueName: req.swapTargetSession!.venueName,
          notes: undefined,
        };
      }
      return s;
    });
  }

  if (req.requestType === 'substitute' && req.substituteTeacherId) {
    return sessions.map((s) => {
      if (s.id !== req.originalSession.id) return s;
      if (s.teacherId !== req.substituteTeacherId) return s;
      return {
        ...s,
        teacherId: req.applicantTeacherId,
        teacherName: req.applicantTeacherName,
        notes: undefined,
      };
    });
  }

  return sessions;
}

/** 匯入後依「星期+節次+班級」對齊申請單上的 session id */
export function remapRequestSessions(
  requests: SubstituteRequest[],
  sessions: CourseSession[]
): SubstituteRequest[] {
  const byId = new Map(sessions.map((s) => [s.id, s]));
  const bySlot = new Map(
    sessions.map((s) => [`${s.dayOfWeek}-${s.period}-${s.className}`, s] as const)
  );

  const resolve = (snap: CourseSession | undefined): CourseSession | undefined => {
    if (!snap) return snap;
    if (byId.has(snap.id)) {
      const live = byId.get(snap.id)!;
      return { ...snap, ...pickLiveFields(live, snap) };
    }
    const hit = bySlot.get(`${snap.dayOfWeek}-${snap.period}-${snap.className}`);
    if (hit) return { ...snap, id: hit.id, ...pickLiveFields(hit, snap) };
    return snap;
  };

  return requests.map((r) => {
    const originalSession = resolve(r.originalSession) || r.originalSession;
    const swapTargetSession = r.swapTargetSession
      ? resolve(r.swapTargetSession) || r.swapTargetSession
      : undefined;
    const orphaned =
      !byId.has(originalSession.id) &&
      !bySlot.has(
        `${originalSession.dayOfWeek}-${originalSession.period}-${originalSession.className}`
      );

    if (!orphaned && originalSession === r.originalSession && swapTargetSession === r.swapTargetSession) {
      return r;
    }

    // 找不到對應課堂：已核准移課／互調標記作廢（狀態改 cancelled），其餘更新 id
    if (orphaned && (r.requestType === 'reschedule' || r.requestType === 'swap') && r.status === 'approved') {
      return {
        ...r,
        originalSession,
        swapTargetSession,
        status: 'cancelled' as const,
        rejectReason: r.rejectReason || '課表匯入後原課堂已不存在，申請已自動作廢',
      };
    }

    return { ...r, originalSession, swapTargetSession };
  });
}

function pickLiveFields(live: CourseSession, snap: CourseSession) {
  return {
    teacherId: live.teacherId || snap.teacherId,
    teacherName: live.teacherName || snap.teacherName,
    venueId: live.venueId || snap.venueId,
    venueName: live.venueName || snap.venueName,
    subjectName: live.subjectName || snap.subjectName,
    className: live.className || snap.className,
    isPractical: live.isPractical,
    isConcurrent: live.isConcurrent,
  };
}
