/**
 * 手機本機配額不足時：只快取最近通知單／申請列，完整筆數寫入 meta。
 * 雲端資料不刪除；截斷本機時不可把不完整資料推上雲端。
 */
import { SubstituteRequest } from '../types';
import { isActingHomeroomOnlyRequest } from './actingHomeroomPayrollRegister';
import { listPrintableNoticeAnchors, noticeSheetKey } from './noticeDocument';
import {
  persistSchoolLocalJson,
  purgeShrinkableLocalCaches,
  type StorageLike,
  writeItemFreeingKey,
  isLocalStorageQuotaError,
  relieveDatedCaches,
  SHRINKABLE_LOCAL_CACHE_KEYS,
} from './localStorageQuota';

export const REQUESTS_META_KEY = 'voc_requests_meta_v1';

/** 本機快取申請列上限（由多到少嘗試） */
export const REQUEST_CACHE_KEEP_LIMITS = [120, 80, 50, 30, 15] as const;

export type RequestsLocalMeta = {
  v: 1;
  truncated: boolean;
  /** 雲端／完整申請列數 */
  totalCount: number;
  /** 可列印通知單張數（與電腦相同口徑） */
  noticeCount: number;
  /** 登錄簿「案件」數（假單編號／batch） */
  allCaseCount: number;
  pendingCaseCount: number;
  retainedCount: number;
};

const leaveCaseKey = (r: Pick<SubstituteRequest, 'batchGroupId' | 'requestNumber' | 'id'>) =>
  r.batchGroupId || r.requestNumber || r.id;

export function countLeaveCases(requests: SubstituteRequest[]): number {
  return new Set(requests.map(leaveCaseKey)).size;
}

export function requestRecencyStamp(r: SubstituteRequest): string {
  return (
    (r.reviewedAt || '').trim() ||
    (r.createdAt || '').trim() ||
    (r.leaveDateEnd || '').trim() ||
    (r.leaveDateStart || '').trim() ||
    (r.effectiveDate || '').trim() ||
    ''
  );
}

export function buildRequestsLocalMeta(
  requests: SubstituteRequest[],
  opts?: { truncated?: boolean; retainedCount?: number }
): RequestsLocalMeta {
  const pending = requests.filter((r) => r.status === 'pending');
  return {
    v: 1,
    truncated: Boolean(opts?.truncated),
    totalCount: requests.length,
    noticeCount: listPrintableNoticeAnchors(requests).length,
    allCaseCount: countLeaveCases(requests),
    pendingCaseCount: countLeaveCases(pending),
    retainedCount: opts?.retainedCount ?? requests.length,
  };
}

/**
 * 保留最近申請列：待簽核全留；其餘依通知單分張整組保留（避免同一張通知單被拆一半）。
 */
export function retainRecentRequestsForLocalCache(
  requests: SubstituteRequest[],
  maxRows: number
): SubstituteRequest[] {
  if (requests.length <= maxRows) return requests.slice();

  const pending = requests.filter((r) => r.status === 'pending');
  const rest = requests.filter((r) => r.status !== 'pending');

  const groups = new Map<string, SubstituteRequest[]>();
  for (const r of rest) {
    const key =
      r.status === 'approved' && !isActingHomeroomOnlyRequest(r)
        ? noticeSheetKey(r)
        : `id:${r.id}`;
    const list = groups.get(key);
    if (list) list.push(r);
    else groups.set(key, [r]);
  }

  const orderedGroups = [...groups.values()].sort((a, b) => {
    const ra = a.reduce((m, r) => {
      const s = requestRecencyStamp(r);
      return s > m ? s : m;
    }, '');
    const rb = b.reduce((m, r) => {
      const s = requestRecencyStamp(r);
      return s > m ? s : m;
    }, '');
    return rb.localeCompare(ra);
  });

  const out: SubstituteRequest[] = [...pending];
  const seen = new Set(out.map((r) => r.id));
  for (const group of orderedGroups) {
    if (out.length >= maxRows) break;
    const addable = group.filter((r) => !seen.has(r.id));
    if (addable.length === 0) continue;
    if (out.length + addable.length > maxRows && out.length > pending.length) break;
    for (const r of addable) {
      out.push(r);
      seen.add(r.id);
    }
  }
  return out;
}

export function loadRequestsLocalMeta(storage: StorageLike): RequestsLocalMeta | null {
  try {
    const raw = storage.getItem(REQUESTS_META_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RequestsLocalMeta;
    if (!parsed || parsed.v !== 1) return null;
    if (typeof parsed.totalCount !== 'number' || typeof parsed.noticeCount !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeRequestsLocalMeta(storage: StorageLike, meta: RequestsLocalMeta): boolean {
  try {
    writeItemFreeingKey(storage, REQUESTS_META_KEY, JSON.stringify(meta));
    return true;
  } catch (err) {
    if (isLocalStorageQuotaError(err)) return false;
    throw err;
  }
}

export type PersistRequestsResult = {
  ok: boolean;
  truncated: boolean;
  retained: SubstituteRequest[];
  meta: RequestsLocalMeta;
};

/**
 * 寫入申請單本機快取：空間不足時改留最近幾筆，meta 仍記完整筆數（雲端不刪）。
 */
export function persistRequestsLocalCache(
  storage: StorageLike,
  requestsKey: string,
  requests: SubstituteRequest[],
  opts?: { todayIso?: string }
): PersistRequestsResult {
  const fullMeta = buildRequestsLocalMeta(requests, { truncated: false });

  if (persistSchoolLocalJson(storage, requestsKey, requests, opts)) {
    writeRequestsLocalMeta(storage, fullMeta);
    return { ok: true, truncated: false, retained: requests, meta: fullMeta };
  }

  for (const keep of REQUEST_CACHE_KEEP_LIMITS) {
    const retained = retainRecentRequestsForLocalCache(requests, keep);
    const meta = buildRequestsLocalMeta(requests, {
      truncated: retained.length < requests.length,
      retainedCount: retained.length,
    });
    try {
      purgeShrinkableLocalCaches(storage);
      writeItemFreeingKey(storage, requestsKey, JSON.stringify(retained));
      writeRequestsLocalMeta(storage, meta);
      return { ok: true, truncated: meta.truncated, retained, meta };
    } catch (err) {
      if (!isLocalStorageQuotaError(err)) throw err;
      try {
        relieveDatedCaches(storage, SHRINKABLE_LOCAL_CACHE_KEYS, 3, opts?.todayIso);
      } catch {
        // ignore
      }
    }
  }

  return {
    ok: false,
    truncated: true,
    retained: [],
    meta: buildRequestsLocalMeta(requests, { truncated: true, retainedCount: 0 }),
  };
}

/** 本機申請列不完整時不可推上雲端（避免蓋掉完整資料） */
export function shouldBlockCloudPushForTruncatedRequests(
  localRequests: SubstituteRequest[],
  meta: RequestsLocalMeta | null
): boolean {
  if (!meta?.truncated) return false;
  return localRequests.length < meta.totalCount;
}

/** 供 UI：截斷時用 meta 的完整通知單／案件數 */
export function resolveDisplayedNoticeCount(
  requests: SubstituteRequest[],
  meta: RequestsLocalMeta | null
): number {
  if (meta?.truncated && requests.length < meta.totalCount) return meta.noticeCount;
  return listPrintableNoticeAnchors(requests).length;
}

export function resolveDisplayedCaseCount(
  requests: SubstituteRequest[],
  meta: RequestsLocalMeta | null
): number {
  if (meta?.truncated && requests.length < meta.totalCount) return meta.allCaseCount;
  return countLeaveCases(requests);
}

export const REQUESTS_LOCAL_TRUNCATED_HINT =
  '手機儲存空間不足，本機僅快取最近通知單；完整筆數仍與電腦相同（資料在雲端，未刪除）。';
