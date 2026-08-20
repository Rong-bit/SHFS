import { CourseSession, SubstituteRequest } from '../types';

const SUBSTITUTE_NOTE = '[代課]';
const RESCHEDULE_NOTE = '[已移課]';
const SWAP_NOTE = '[相互調課]';

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
        notes: `${RESCHEDULE_NOTE} 原週${req.originalSession.dayOfWeek}第${req.originalSession.period}節`,
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
          notes: `${SWAP_NOTE} 與 ${req.swapTargetTeacherName} 對調`,
        };
      }
      if (s.id === req.swapTargetSession!.id) {
        return {
          ...s,
          dayOfWeek: req.originalSession.dayOfWeek,
          period: req.originalSession.period,
          notes: `${SWAP_NOTE} 與 ${req.applicantTeacherName} 對調`,
        };
      }
      return s;
    });
  }

  if (req.requestType === 'substitute' && req.substituteTeacherId) {
    return sessions.map((s) => {
      if (s.id !== req.originalSession.id) return s;
      // 已是此代課覆蓋則略過（避免重複核准疊字）
      if (s.teacherId === req.substituteTeacherId && s.notes?.includes(SUBSTITUTE_NOTE)) return s;
      return {
        ...s,
        teacherId: req.substituteTeacherId!,
        teacherName: req.substituteTeacherName || s.teacherName,
        notes: `${SUBSTITUTE_NOTE} 原任課 ${req.applicantTeacherName}`,
      };
    });
  }

  return sessions;
}

/**
 * 若課表現況已不是本申請核准後的預期狀態（後續又有異動），回傳阻擋原因；可安全回滾則回傳 null。
 */
export function getRollbackBlockReason(
  sessions: CourseSession[],
  req: SubstituteRequest
): string | null {
  if (req.status !== 'approved') return '申請尚未核准，無需回滾課表';

  if (req.requestType === 'reschedule' && req.targetReschedule) {
    const live = sessions.find((s) => s.id === req.originalSession.id);
    if (!live) return '找不到原課堂，無法回滾移課';
    const t = req.targetReschedule;
    const matchesTarget =
      live.dayOfWeek === t.dayOfWeek &&
      live.period === t.period &&
      (!t.venueId || live.venueId === t.venueId);
    if (!matchesTarget) {
      return '該課堂之後又有移課／調課，略過回滾以免覆寫較新課表';
    }
    return null;
  }

  if (req.requestType === 'swap' && req.swapTargetSession) {
    const a = sessions.find((s) => s.id === req.originalSession.id);
    const b = sessions.find((s) => s.id === req.swapTargetSession!.id);
    if (!a || !b) return '找不到互調課堂，無法回滾';
    const aAtPartnerSlot =
      a.dayOfWeek === req.swapTargetSession.dayOfWeek &&
      a.period === req.swapTargetSession.period;
    const bAtApplicantSlot =
      b.dayOfWeek === req.originalSession.dayOfWeek &&
      b.period === req.originalSession.period;
    if (!aAtPartnerSlot || !bAtApplicantSlot) {
      return '互調課堂之後又有異動，略過回滾以免覆寫較新課表';
    }
    return null;
  }

  if (req.requestType === 'substitute' && req.substituteTeacherId) {
    const live = sessions.find((s) => s.id === req.originalSession.id);
    if (!live) return '找不到原課堂，無法回滾代課';
    if (live.teacherId !== req.substituteTeacherId) {
      return '該課堂任課已變更（可能另有派代），略過回滾';
    }
    return null;
  }

  return null;
}

export type RollbackResult = {
  sessions: CourseSession[];
  rolledBack: boolean;
  blockedReason?: string;
};

/** 取消／刪除／駁回已核准單時回滾課表；現況不符則不改課表 */
export function rollbackRequestFromSessions(
  sessions: CourseSession[],
  req: SubstituteRequest
): CourseSession[] {
  return rollbackRequestFromSessionsDetailed(sessions, req).sessions;
}

export function rollbackRequestFromSessionsDetailed(
  sessions: CourseSession[],
  req: SubstituteRequest
): RollbackResult {
  if (req.status !== 'approved') {
    return { sessions, rolledBack: false, blockedReason: '申請尚未核准' };
  }

  const blocked = getRollbackBlockReason(sessions, req);
  if (blocked) {
    return { sessions, rolledBack: false, blockedReason: blocked };
  }

  if (req.requestType === 'reschedule' && req.targetReschedule) {
    return {
      sessions: sessions.map((s) => {
        if (s.id !== req.originalSession.id) return s;
        return {
          ...s,
          dayOfWeek: req.originalSession.dayOfWeek,
          period: req.originalSession.period,
          venueId: req.originalSession.venueId,
          venueName: req.originalSession.venueName,
          notes: undefined,
        };
      }),
      rolledBack: true,
    };
  }

  if (req.requestType === 'swap' && req.swapTargetSession) {
    return {
      sessions: sessions.map((s) => {
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
      }),
      rolledBack: true,
    };
  }

  if (req.requestType === 'substitute' && req.substituteTeacherId) {
    return {
      sessions: sessions.map((s) => {
        if (s.id !== req.originalSession.id) return s;
        return {
          ...s,
          teacherId: req.applicantTeacherId,
          teacherName: req.applicantTeacherName,
          notes: undefined,
        };
      }),
      rolledBack: true,
    };
  }

  return { sessions, rolledBack: false };
}

/** 由新到舊回滾多筆已核准申請（用於清空清冊） */
export function rollbackApprovedRequestsNewestFirst(
  sessions: CourseSession[],
  requests: SubstituteRequest[]
): CourseSession[] {
  const approved = requests
    .filter((r) => r.status === 'approved')
    .slice()
    .sort((a, b) => {
      const ta = a.reviewedAt || a.createdAt || '';
      const tb = b.reviewedAt || b.createdAt || '';
      return tb.localeCompare(ta);
    });

  let next = sessions;
  for (const r of approved) {
    next = rollbackRequestFromSessions(next, r);
  }
  return next;
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
