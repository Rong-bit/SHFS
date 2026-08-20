import { CourseSession, SubstituteRequest } from '../types';
import {
  isPlaceholderSession,
  resolveOriginalSession,
  resolveSwapTargetSession,
} from './resolveOriginalSession';

const SUBSTITUTE_NOTE = '[代課]';
const RESCHEDULE_NOTE = '[已移課]';
const SWAP_NOTE = '[相互調課]';

function matchesOriginalSession(s: CourseSession, req: SubstituteRequest, orig: CourseSession): boolean {
  if (!isPlaceholderSession(orig) && s.id === orig.id) return true;
  return (
    s.dayOfWeek === orig.dayOfWeek &&
    s.period === orig.period &&
    s.teacherId === req.applicantTeacherId
  );
}

/** 核准時套用課表異動（移課／互調／代課任課） */
export function applyRequestToSessions(
  sessions: CourseSession[],
  req: SubstituteRequest
): CourseSession[] {
  const resolvedOrig = resolveOriginalSession(req, sessions);
  const resolvedSwap = resolveSwapTargetSession(req, sessions);
  const reqResolved: SubstituteRequest = {
    ...req,
    originalSession: resolvedOrig,
    swapTargetSession: resolvedSwap ?? req.swapTargetSession,
  };

  if (reqResolved.requestType === 'reschedule' && reqResolved.targetReschedule) {
    return sessions.map((s) => {
      if (s.id !== resolvedOrig.id) return s;
      return {
        ...s,
        dayOfWeek: reqResolved.targetReschedule!.dayOfWeek,
        period: reqResolved.targetReschedule!.period,
        venueId: reqResolved.targetReschedule!.venueId,
        venueName: reqResolved.targetReschedule!.venueName,
        notes: `${RESCHEDULE_NOTE} 原週${resolvedOrig.dayOfWeek}第${resolvedOrig.period}節`,
      };
    });
  }

  if (reqResolved.requestType === 'swap' && reqResolved.swapTargetSession) {
    const partner = reqResolved.swapTargetSession;
    const liveA = sessions.find((s) => s.id === resolvedOrig.id);
    const liveB = sessions.find((s) => s.id === partner.id);
    // 缺任一方則不套用，避免單邊改日時
    if (!liveA || !liveB) return sessions;

    const aDay = liveA.dayOfWeek;
    const aPeriod = liveA.period;
    const bDay = liveB.dayOfWeek;
    const bPeriod = liveB.period;

    return sessions.map((s) => {
      if (s.id === resolvedOrig.id) {
        return {
          ...s,
          dayOfWeek: bDay,
          period: bPeriod,
          notes: `${SWAP_NOTE} 與 ${reqResolved.swapTargetTeacherName} 對調`,
        };
      }
      if (s.id === partner.id) {
        return {
          ...s,
          dayOfWeek: aDay,
          period: aPeriod,
          notes: `${SWAP_NOTE} 與 ${reqResolved.applicantTeacherName} 對調`,
        };
      }
      return s;
    });
  }

  if (reqResolved.requestType === 'substitute' && reqResolved.substituteTeacherId) {
    return sessions.map((s) => {
      if (!matchesOriginalSession(s, reqResolved, resolvedOrig)) return s;
      // 已是此代課覆蓋則略過（避免重複核准疊字）
      if (s.teacherId === reqResolved.substituteTeacherId && s.notes?.includes(SUBSTITUTE_NOTE)) return s;
      return {
        ...s,
        teacherId: reqResolved.substituteTeacherId!,
        teacherName: reqResolved.substituteTeacherName || s.teacherName,
        notes: `${SUBSTITUTE_NOTE} 原任課 ${reqResolved.applicantTeacherName}`,
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
  return rollbackApprovedRequestsNewestFirstDetailed(sessions, requests).sessions;
}

export type BatchRollbackResult = {
  sessions: CourseSession[];
  /** 無法回滾、應保留的已核准單 */
  blocked: Array<{ request: SubstituteRequest; reason: string }>;
};

/** 由新到舊回滾；任一筆被擋則該筆不改課表並列入 blocked */
export function rollbackApprovedRequestsNewestFirstDetailed(
  sessions: CourseSession[],
  requests: SubstituteRequest[]
): BatchRollbackResult {
  const approved = requests
    .filter((r) => r.status === 'approved')
    .slice()
    .sort((a, b) => {
      const ta = a.reviewedAt || a.createdAt || '';
      const tb = b.reviewedAt || b.createdAt || '';
      return tb.localeCompare(ta);
    });

  let next = sessions;
  const blocked: BatchRollbackResult['blocked'] = [];
  for (const r of approved) {
    const result = rollbackRequestFromSessionsDetailed(next, r);
    if (!result.rolledBack && result.blockedReason) {
      blocked.push({ request: r, reason: result.blockedReason });
      continue;
    }
    next = result.sessions;
  }
  return { sessions: next, blocked };
}

/** 匯入後依審核時間由舊到新重套用已核准異動（還原代課覆蓋／移課等） */
export function reapplyApprovedRequestsOldestFirst(
  sessions: CourseSession[],
  requests: SubstituteRequest[]
): CourseSession[] {
  const approved = requests
    .filter((r) => r.status === 'approved')
    .slice()
    .sort((a, b) => {
      const ta = a.reviewedAt || a.createdAt || '';
      const tb = b.reviewedAt || b.createdAt || '';
      return ta.localeCompare(tb);
    });

  let next = sessions;
  for (const r of approved) {
    next = applyRequestToSessions(next, r);
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

    // 找不到對應課堂：已核准移課／互調／代課標記作廢，避免 orphan 單據繼續結算
    if (
      orphaned &&
      (r.requestType === 'reschedule' || r.requestType === 'swap' || r.requestType === 'substitute') &&
      r.status === 'approved'
    ) {
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
