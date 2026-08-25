import { CourseSession, SubstituteRequest } from '../types';
import {
  isPlaceholderSession,
  resolveOriginalSession,
  resolveSwapTargetSession,
} from './resolveOriginalSession';
import { isTemporarySwap } from './temporarySwap';

const SUBSTITUTE_NOTE = '[代課]';
const LEAVE_COVER_NOTE = '[請假派代]';
const RESCHEDULE_NOTE = '[已移課]';
const SWAP_NOTE = '[同班對調·永久]';

function isLeaveCoverNote(notes?: string): boolean {
  return Boolean(notes?.includes(SUBSTITUTE_NOTE) || notes?.includes(LEAVE_COVER_NOTE));
}

function leaveCoverNote(req: SubstituteRequest): string {
  const subName = req.substituteTeacherName || '（未填姓名）';
  return `${LEAVE_COVER_NOTE} 代課教師：${subName}`;
}

/** 回滾時若同格尚有其他已核准請假，保留其標註 */
function findRemainingLeaveCoverNote(
  live: CourseSession,
  rollingBack: SubstituteRequest,
  allRequests?: SubstituteRequest[]
): string | undefined {
  if (!allRequests?.length) return undefined;
  const siblings = allRequests
    .filter(
      (r) =>
        r.id !== rollingBack.id &&
        r.status === 'approved' &&
        r.requestType === 'substitute' &&
        Boolean(r.substituteTeacherId) &&
        r.applicantTeacherId === rollingBack.applicantTeacherId &&
        (r.originalSession.id === live.id ||
          (r.originalSession.dayOfWeek === live.dayOfWeek &&
            r.originalSession.period === live.period &&
            (!live.className || r.originalSession.className === live.className)))
    )
    .sort((a, b) => {
      const ta = a.reviewedAt || a.createdAt || '';
      const tb = b.reviewedAt || b.createdAt || '';
      return tb.localeCompare(ta);
    });
  if (siblings.length === 0) return undefined;
  return leaveCoverNote(siblings[0]);
}

function matchesOriginalSession(s: CourseSession, req: SubstituteRequest, orig: CourseSession): boolean {
  if (!isPlaceholderSession(orig) && s.id === orig.id) return true;
  return (
    s.dayOfWeek === orig.dayOfWeek &&
    s.period === orig.period &&
    s.teacherId === req.applicantTeacherId
  );
}

/** 核准時套用課表異動（移課／互調／代課任課） */
export type ApplyRequestResult = {
  sessions: CourseSession[];
  /** true＝已達目標態（含本次變更或原本已套用／冪等） */
  applied: boolean;
  reason?: string;
};

export function applyRequestToSessions(
  sessions: CourseSession[],
  req: SubstituteRequest
): CourseSession[] {
  return applyRequestToSessionsDetailed(sessions, req).sessions;
}

export function applyRequestToSessionsDetailed(
  sessions: CourseSession[],
  req: SubstituteRequest
): ApplyRequestResult {
  // 保留申請當下快照（互調／移課冪等判斷用），勿被 resolve 成現行時段後再對調一次
  const snapOrig = { ...req.originalSession };
  const snapPartner = req.swapTargetSession ? { ...req.swapTargetSession } : undefined;

  const resolvedOrig = resolveOriginalSession(req, sessions);
  const resolvedSwap = resolveSwapTargetSession(req, sessions);
  const reqResolved: SubstituteRequest = {
    ...req,
    originalSession: resolvedOrig,
    swapTargetSession: resolvedSwap ?? req.swapTargetSession,
  };

  if (reqResolved.requestType === 'reschedule' && reqResolved.targetReschedule) {
    const t = reqResolved.targetReschedule;
    const live = sessions.find((s) => s.id === resolvedOrig.id);
    if (!live) {
      return {
        sessions,
        applied: false,
        reason: '找不到欲移課的課堂於現行課表',
      };
    }

    // 與目標節置換：雙方永久互換星期／節次
    if (t.exchangeSessionId) {
      const partner =
        sessions.find((s) => s.id === t.exchangeSessionId) ||
        (t.exchangeSession
          ? sessions.find((s) => s.id === t.exchangeSession!.id)
          : undefined);
      if (!partner) {
        return {
          sessions,
          applied: false,
          reason: '找不到要置換的對方課堂',
        };
      }
      const alreadyExchanged =
        live.dayOfWeek === t.dayOfWeek &&
        live.period === t.period &&
        partner.dayOfWeek === snapOrig.dayOfWeek &&
        partner.period === snapOrig.period;
      if (alreadyExchanged) {
        // 仍可更新申請人場地
        if (t.venueId && live.venueId !== t.venueId) {
          return {
            sessions: sessions.map((s) =>
              s.id === live.id
                ? { ...s, venueId: t.venueId, venueName: t.venueName }
                : s
            ),
            applied: true,
          };
        }
        return { sessions, applied: true };
      }
      const atOriginal =
        live.dayOfWeek === snapOrig.dayOfWeek &&
        live.period === snapOrig.period &&
        partner.dayOfWeek === t.dayOfWeek &&
        partner.period === t.period;
      if (!atOriginal) {
        return {
          sessions,
          applied: false,
          reason: '置換雙方現況已非申請時段，無法套用',
        };
      }
      return {
        sessions: sessions.map((s) => {
          if (s.id === live.id) {
            return {
              ...s,
              dayOfWeek: t.dayOfWeek,
              period: t.period,
              venueId: t.venueId || s.venueId,
              venueName: t.venueName || s.venueName,
              notes: `${RESCHEDULE_NOTE} 與 ${partner.teacherName} 置換（原週${snapOrig.dayOfWeek}第${snapOrig.period}節）`,
            };
          }
          if (s.id === partner.id) {
            return {
              ...s,
              dayOfWeek: snapOrig.dayOfWeek,
              period: snapOrig.period,
              notes: `${RESCHEDULE_NOTE} 與 ${reqResolved.applicantTeacherName} 置換（原週${t.dayOfWeek}第${t.period}節）`,
            };
          }
          return s;
        }),
        applied: true,
      };
    }

    if (
      live.dayOfWeek === t.dayOfWeek &&
      live.period === t.period &&
      (!t.venueId || live.venueId === t.venueId)
    ) {
      return { sessions, applied: true }; // 已在目標時段
    }
    return {
      sessions: sessions.map((s) => {
        if (s.id !== resolvedOrig.id) return s;
        return {
          ...s,
          dayOfWeek: t.dayOfWeek,
          period: t.period,
          venueId: t.venueId,
          venueName: t.venueName,
          notes: `${RESCHEDULE_NOTE} 原週${snapOrig.dayOfWeek}第${snapOrig.period}節`,
        };
      }),
      applied: true,
    };
  }

  if (reqResolved.requestType === 'swap' && snapPartner) {
    const partnerId = (resolvedSwap || snapPartner).id;
    const liveA = sessions.find((s) => s.id === resolvedOrig.id);
    const liveB = sessions.find((s) => s.id === partnerId);
    if (!liveA || !liveB) {
      return {
        sessions,
        applied: false,
        reason: '找不到互調雙方課堂於現行課表',
      };
    }

    // 暫時對調：不改週課表模板
    if (isTemporarySwap(reqResolved)) {
      if (!reqResolved.effectiveDate?.trim()) {
        return {
          sessions,
          applied: false,
          reason: '暫時同班對調缺少生效日期',
        };
      }
      return { sessions, applied: true };
    }

    // 永久對調：改週課表模板
    const alreadySwapped =
      liveA.dayOfWeek === snapPartner.dayOfWeek &&
      liveA.period === snapPartner.period &&
      liveB.dayOfWeek === snapOrig.dayOfWeek &&
      liveB.period === snapOrig.period;
    if (alreadySwapped) return { sessions, applied: true };

    const atOriginalSlots =
      liveA.dayOfWeek === snapOrig.dayOfWeek &&
      liveA.period === snapOrig.period &&
      liveB.dayOfWeek === snapPartner.dayOfWeek &&
      liveB.period === snapPartner.period;
    if (!atOriginalSlots) {
      return {
        sessions,
        applied: false,
        reason: '對調課堂現況已非申請時段（之後可能又有異動），無法套用',
      };
    }

    return {
      sessions: sessions.map((s) => {
        if (s.id === resolvedOrig.id) {
          return {
            ...s,
            dayOfWeek: snapPartner.dayOfWeek,
            period: snapPartner.period,
            notes: `${SWAP_NOTE} 與 ${reqResolved.swapTargetTeacherName}`,
          };
        }
        if (s.id === partnerId) {
          return {
            ...s,
            dayOfWeek: snapOrig.dayOfWeek,
            period: snapOrig.period,
            notes: `${SWAP_NOTE} 與 ${reqResolved.applicantTeacherName}`,
          };
        }
        return s;
      }),
      applied: true,
    };
  }

  if (reqResolved.requestType === 'substitute' && reqResolved.substituteTeacherId) {
    const targets = sessions.filter((s) =>
      matchesOriginalSession(s, reqResolved, resolvedOrig)
    );
    // 舊版曾把任課改成代課老師：改以「申請人原課堂 id／時段」找回
    const legacyCovered =
      targets.length === 0
        ? sessions.filter(
            (s) =>
              s.id === resolvedOrig.id ||
              (s.dayOfWeek === resolvedOrig.dayOfWeek &&
                s.period === resolvedOrig.period &&
                s.teacherId === reqResolved.substituteTeacherId &&
                isLeaveCoverNote(s.notes))
          )
        : [];
    const toFix = targets.length > 0 ? targets : legacyCovered;
    if (toFix.length === 0) {
      return {
        sessions,
        applied: false,
        reason: '找不到欲派代的課堂於現行課表',
      };
    }

    const note = leaveCoverNote(reqResolved);
    // 請假只標註，不改週課表任課（否則申請人課表會「消失該節」）
    const alreadyOk = toFix.every(
      (s) =>
        s.teacherId === reqResolved.applicantTeacherId &&
        isLeaveCoverNote(s.notes) &&
        Boolean(s.notes?.includes(reqResolved.substituteTeacherName || ''))
    );
    if (alreadyOk) return { sessions, applied: true };

    const fixIds = new Set(toFix.map((s) => s.id));
    return {
      sessions: sessions.map((s) => {
        if (!fixIds.has(s.id)) return s;
        return {
          ...s,
          teacherId: reqResolved.applicantTeacherId,
          teacherName: reqResolved.applicantTeacherName || s.teacherName,
          notes: note,
        };
      }),
      applied: true,
    };
  }

  if (reqResolved.requestType === 'reschedule') {
    return {
      sessions,
      applied: false,
      reason: '移課申請缺少目標時段／場地，無法套用課表',
    };
  }
  if (reqResolved.requestType === 'swap') {
    return {
      sessions,
      applied: false,
      reason: '相互調課缺少對調課堂，無法套用課表',
    };
  }

  // 請假未指定代課等：無課表異動，視為成功（僅改單據狀態）
  return { sessions, applied: true };
}

function findLiveSessionForSubstitute(
  sessions: CourseSession[],
  req: SubstituteRequest
): CourseSession | undefined {
  const resolved = resolveOriginalSession(req, sessions);
  const byResolvedId = sessions.find((s) => s.id === resolved.id);
  if (byResolvedId) return byResolvedId;

  const bySnapId = sessions.find((s) => s.id === req.originalSession.id);
  if (bySnapId) return bySnapId;

  const day = resolved.dayOfWeek;
  const period = resolved.period;
  const className = resolved.className;

  // 現行已是本單代課覆蓋（新：仍掛申請人；舊：任課曾改成代課老師）
  if (req.substituteTeacherId) {
    const byApplicantCover = sessions.find(
      (s) =>
        s.dayOfWeek === day &&
        s.period === period &&
        s.teacherId === req.applicantTeacherId &&
        (!className || s.className === className) &&
        isLeaveCoverNote(s.notes)
    );
    if (byApplicantCover) return byApplicantCover;

    const byCover = sessions.find(
      (s) =>
        s.dayOfWeek === day &&
        s.period === period &&
        s.teacherId === req.substituteTeacherId &&
        (!className || s.className === className) &&
        isLeaveCoverNote(s.notes) &&
        Boolean(
          !req.applicantTeacherName || s.notes?.includes(req.applicantTeacherName)
        )
    );
    if (byCover) return byCover;
  }

  // 已回滾回申請人（或從未套用成功）
  return sessions.find(
    (s) =>
      s.dayOfWeek === day &&
      s.period === period &&
      s.teacherId === req.applicantTeacherId &&
      (!className || s.className === className)
  );
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

    if (t.exchangeSessionId) {
      const partner = sessions.find((s) => s.id === t.exchangeSessionId);
      if (!partner) return '找不到置換對方課堂，無法回滾';
      const aAtTarget =
        live.dayOfWeek === t.dayOfWeek && live.period === t.period;
      const bAtOrig =
        partner.dayOfWeek === req.originalSession.dayOfWeek &&
        partner.period === req.originalSession.period;
      if (!aAtTarget || !bAtOrig) {
        return '置換課堂之後又有異動，略過回滾以免覆寫較新課表';
      }
      return null;
    }

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
    if (isTemporarySwap(req)) {
      // 暫時對調未改週模板，可隨時「回滾」（no-op）
      return null;
    }
    // 永久對調：檢查是否仍在對調後狀態
    const a = sessions.find((s) => s.id === req.originalSession.id);
    const b = sessions.find((s) => s.id === req.swapTargetSession!.id);
    if (!a || !b) return '找不到對調課堂，無法回滾';
    const aAtPartnerSlot =
      a.dayOfWeek === req.swapTargetSession.dayOfWeek &&
      a.period === req.swapTargetSession.period;
    const bAtApplicantSlot =
      b.dayOfWeek === req.originalSession.dayOfWeek &&
      b.period === req.originalSession.period;
    if (!aAtPartnerSlot || !bAtApplicantSlot) {
      return '對調課堂之後又有異動，略過回滾以免覆寫較新課表';
    }
    return null;
  }

  if (req.requestType === 'substitute' && req.substituteTeacherId) {
    const live = findLiveSessionForSubstitute(sessions, req);
    if (!live) return '找不到原課堂，無法回滾代課';
    // 仍為申請人（含僅標註請假派代）：可回滾清註記
    if (live.teacherId === req.applicantTeacherId) return null;
    // 舊版：任課曾改成代課教師，可還原
    if (live.teacherId === req.substituteTeacherId) return null;
    return '該課堂任課已變更（可能另有派代），略過回滾';
  }

  // 請假派代未指定代課教師：無課表覆蓋可回滾
  if (req.requestType === 'substitute' && !req.substituteTeacherId) {
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
  req: SubstituteRequest,
  allRequests?: SubstituteRequest[]
): CourseSession[] {
  return rollbackRequestFromSessionsDetailed(sessions, req, allRequests).sessions;
}

export function rollbackRequestFromSessionsDetailed(
  sessions: CourseSession[],
  req: SubstituteRequest,
  allRequests?: SubstituteRequest[]
): RollbackResult {
  if (req.status !== 'approved') {
    return { sessions, rolledBack: false, blockedReason: '申請尚未核准' };
  }

  const blocked = getRollbackBlockReason(sessions, req);
  if (blocked) {
    return { sessions, rolledBack: false, blockedReason: blocked };
  }

  if (req.requestType === 'reschedule' && req.targetReschedule) {
    const t = req.targetReschedule;
    if (t.exchangeSessionId) {
      const partnerSnap = t.exchangeSession;
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
          if (s.id === t.exchangeSessionId) {
            return {
              ...s,
              dayOfWeek: t.dayOfWeek,
              period: t.period,
              venueId: partnerSnap?.venueId ?? s.venueId,
              venueName: partnerSnap?.venueName ?? s.venueName,
              notes: undefined,
            };
          }
          return s;
        }),
        rolledBack: true,
      };
    }
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
    if (isTemporarySwap(req)) {
      return { sessions, rolledBack: true };
    }
    // 永久對調：還原時段
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
    const live = findLiveSessionForSubstitute(sessions, req);
    if (!live) {
      return { sessions, rolledBack: false, blockedReason: '找不到原課堂，無法回滾代課' };
    }
    // 已是申請人：清請假註記；若同格尚有其他已核准請假，改回仍有效單的標註
    if (live.teacherId === req.applicantTeacherId) {
      const siblingNote = findRemainingLeaveCoverNote(live, req, allRequests);
      return {
        sessions: sessions.map((s) =>
          s.id === live.id && isLeaveCoverNote(s.notes)
            ? { ...s, notes: siblingNote }
            : s
        ),
        rolledBack: true,
      };
    }
    if (live.teacherId !== req.substituteTeacherId) {
      return {
        sessions,
        rolledBack: false,
        blockedReason: '該課堂任課已變更（可能另有派代），略過回滾',
      };
    }
    // 舊版：任課在代課老師身上 → 還原申請人
    const siblingNote = findRemainingLeaveCoverNote(
      { ...live, teacherId: req.applicantTeacherId },
      req,
      allRequests
    );
    return {
      sessions: sessions.map((s) => {
        if (s.id !== live.id) return s;
        return {
          ...s,
          teacherId: req.applicantTeacherId,
          teacherName: req.applicantTeacherName,
          notes: siblingNote,
        };
      }),
      rolledBack: true,
    };
  }

  // 未指定代課教師的已核准請假單：無課表覆蓋
  if (req.requestType === 'substitute' && !req.substituteTeacherId) {
    return { sessions, rolledBack: true };
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
  /** 已回滾的單須自 sibling pool 排除，避免後續回滾又寫回幽靈請假標註 */
  const completedRollbackIds = new Set<string>();
  for (const r of approved) {
    const poolForSibling = requests.filter((x) => !completedRollbackIds.has(x.id));
    const result = rollbackRequestFromSessionsDetailed(next, r, poolForSibling);
    if (!result.rolledBack && result.blockedReason) {
      blocked.push({ request: r, reason: result.blockedReason });
      continue;
    }
    if (result.rolledBack) completedRollbackIds.add(r.id);
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
    if (isPlaceholderSession(snap)) return snap;
    if (byId.has(snap.id)) {
      const live = byId.get(snap.id)!;
      return { ...snap, ...pickLiveFields(live, snap) };
    }
    const hit = bySlot.get(`${snap.dayOfWeek}-${snap.period}-${snap.className}`);
    if (hit) return { ...snap, id: hit.id, ...pickLiveFields(hit, snap) };
    return snap;
  };

  return requests.map((r) => {
    if (isPlaceholderSession(r.originalSession)) {
      return r;
    }
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

/**
 * 修正舊版「請假核准後把任課改成代課老師」：還原申請人並改為請假標註。
 * 請假不應刪除／移走週課表該節。
 */
export function healLegacySubstituteOwnership(
  sessions: CourseSession[],
  requests: SubstituteRequest[]
): CourseSession[] {
  let next = sessions;
  let changed = false;
  for (const r of requests) {
    if (r.status !== 'approved' || r.requestType !== 'substitute' || !r.substituteTeacherId) {
      continue;
    }
    const result = applyRequestToSessionsDetailed(next, r);
    if (result.applied && result.sessions !== next) {
      next = result.sessions;
      changed = true;
    }
  }
  return changed ? next : sessions;
}
