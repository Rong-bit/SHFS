/**
 * 手機本機配額不足時（優先保留巡堂／教室日誌）：
 * 1) 空間夠 → 完整通知單
 * 2) 不夠 → 最近通知單內容，完整筆數寫入 meta
 * 3) 再不夠 → 僅 meta 總筆數（不存內容）
 * 騰位刪 body 時必須標 truncated，避免重整後筆數變 0／誤推空資料。
 * 雲端資料不刪除；截斷本機時不可把不完整資料推上雲端。
 */
import { SubstituteRequest } from '../types';
import { isActingHomeroomOnlyRequest } from './actingHomeroomPayrollRegister';
import { listPrintableNoticeAnchors, noticeSheetKey } from './noticeDocument';
import {
  type StorageLike,
  writeItemFreeingKey,
  isLocalStorageQuotaError,
  isCompactDeviceStorage,
  purgeShrinkableLocalCaches,
  relieveDatedCaches,
  SHRINKABLE_LOCAL_CACHE_KEYS,
  DEFAULT_REQUESTS_META_KEY,
} from './localStorageQuota';

export const REQUESTS_META_KEY = DEFAULT_REQUESTS_META_KEY;

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

export function clearRequestsLocalMeta(storage: StorageLike): void {
  try {
    storage.removeItem(REQUESTS_META_KEY);
  } catch {
    // ignore
  }
}

/**
 * 本機已是截斷快取時，後續只帶部分列寫入（例如名冊回寫科別、小幅編輯）
 * 不可把 meta 重寫成「完整、筆數＝本機列數」，否則筆數變少且可能誤推上雲。
 */
export function preservePriorTruncatedMeta(
  prior: RequestsLocalMeta | null,
  built: RequestsLocalMeta,
  retainedCount: number
): RequestsLocalMeta {
  if (!prior?.truncated) return built;
  if (prior.totalCount <= retainedCount) return built;
  // 這次 built 若已涵蓋先前完整筆數（例如剛拉完整包），採用 built
  if (!built.truncated && built.totalCount >= prior.totalCount) return built;
  return {
    ...prior,
    truncated: true,
    retainedCount,
  };
}

/**
 * 冷啟動：body 缺席時若已有 truncated／count-only meta，回傳 []，
 * 切勿落到示範用 INITIAL_REQUESTS（否則小校可能誤推 mock 上雲）。
 */
export function resolveRequestsColdStartBody(
  storedBody: SubstituteRequest[] | null,
  meta: RequestsLocalMeta | null,
  mockFallback: SubstituteRequest[]
): SubstituteRequest[] {
  if (storedBody != null) return storedBody;
  if (meta?.truncated) return [];
  if (meta && meta.totalCount > 0 && meta.retainedCount === 0) return [];
  return mockFallback;
}

/**
 * 騰位刪除通知單本機內容，但把完整筆數標成 truncated meta。
 * body 寫成 []（勿 removeItem），避免重整時被當成「尚無資料」而灌入 mock。
 */
export function freeRequestsLocalBodyKeepingMeta(
  storage: StorageLike,
  requestsKey: string
): RequestsLocalMeta | null {
  let meta = loadRequestsLocalMeta(storage);
  if (!meta) {
    try {
      const raw = storage.getItem(requestsKey);
      if (raw) {
        const parsed = JSON.parse(raw) as SubstituteRequest[];
        if (Array.isArray(parsed)) {
          meta = buildRequestsLocalMeta(parsed, { truncated: true, retainedCount: 0 });
        }
      }
    } catch {
      // ignore malformed body
    }
  } else {
    meta = { ...meta, truncated: true, retainedCount: 0 };
  }
  // 先寫 meta，再清 body；meta 失敗時仍盡力留下 truncated 標記
  if (meta) writeRequestsLocalMeta(storage, meta);
  try {
    writeItemFreeingKey(storage, requestsKey, '[]');
  } catch {
    try {
      storage.removeItem(requestsKey);
    } catch {
      // ignore
    }
  }
  if (meta) writeRequestsLocalMeta(storage, meta);
  return meta;
}

export type PersistRequestsResult = {
  ok: boolean;
  truncated: boolean;
  retained: SubstituteRequest[];
  meta: RequestsLocalMeta;
};

/**
 * 寫入申請單本機快取。
 * - 電腦：必須盡力保留完整通知單內容（可清巡堂／日誌暫存騰位）
 * - 手機：空間不足時可不存內容，只留正確筆數；優先保留巡堂／日誌
 */
export function persistRequestsLocalCache(
  storage: StorageLike,
  requestsKey: string,
  requests: SubstituteRequest[],
  opts?: { todayIso?: string; allowCountOnly?: boolean }
): PersistRequestsResult {
  const allowCountOnly =
    typeof opts?.allowCountOnly === 'boolean'
      ? opts.allowCountOnly
      : isCompactDeviceStorage();
  const priorMeta = loadRequestsLocalMeta(storage);
  const builtFullMeta = buildRequestsLocalMeta(requests, { truncated: false });
  const fullMeta = preservePriorTruncatedMeta(priorMeta, builtFullMeta, requests.length);
  const payload = JSON.stringify(requests);

  try {
    writeItemFreeingKey(storage, requestsKey, payload);
    writeRequestsLocalMeta(storage, fullMeta);
    return {
      ok: true,
      truncated: fullMeta.truncated,
      retained: requests,
      meta: fullMeta,
    };
  } catch (err) {
    if (!isLocalStorageQuotaError(err)) throw err;
  }

  // 電腦（或不允許只留筆數）：清可重建暫存後仍要寫完整內容
  if (!allowCountOnly) {
    try {
      relieveDatedCaches(storage, SHRINKABLE_LOCAL_CACHE_KEYS, 7, opts?.todayIso);
      writeItemFreeingKey(storage, requestsKey, payload);
      writeRequestsLocalMeta(storage, fullMeta);
      return {
        ok: true,
        truncated: fullMeta.truncated,
        retained: requests,
        meta: fullMeta,
      };
    } catch (err) {
      if (!isLocalStorageQuotaError(err)) throw err;
    }
    try {
      purgeShrinkableLocalCaches(storage);
      writeItemFreeingKey(storage, requestsKey, payload);
      writeRequestsLocalMeta(storage, fullMeta);
      return {
        ok: true,
        truncated: fullMeta.truncated,
        retained: requests,
        meta: fullMeta,
      };
    } catch (err) {
      if (!isLocalStorageQuotaError(err)) throw err;
    }
    // 電腦不降級成「最近幾筆」：寫不進就失敗，避免本機／雲端誤以為完整
    return {
      ok: false,
      truncated: fullMeta.truncated,
      retained: requests,
      meta: fullMeta,
    };
  }

  // 手機：不動巡堂／日誌；依空間遞減：最近通知單（筆數正確）→ 僅總筆數
  for (const keep of REQUEST_CACHE_KEEP_LIMITS) {
    const retained = retainRecentRequestsForLocalCache(requests, keep);
    const built = buildRequestsLocalMeta(requests, {
      truncated: retained.length < requests.length,
      retainedCount: retained.length,
    });
    const meta = preservePriorTruncatedMeta(priorMeta, built, retained.length);
    try {
      writeItemFreeingKey(storage, requestsKey, JSON.stringify(retained));
      writeRequestsLocalMeta(storage, meta);
      return { ok: true, truncated: meta.truncated, retained, meta };
    } catch (err) {
      if (!isLocalStorageQuotaError(err)) throw err;
    }
  }

  const builtCountOnly = buildRequestsLocalMeta(requests, {
    truncated: true,
    retainedCount: 0,
  });
  const countOnlyMeta = preservePriorTruncatedMeta(priorMeta, builtCountOnly, 0);
  // 先寫 meta，再寫空陣列（勿 removeItem，避免冷啟動灌入 mock）
  const metaOk = writeRequestsLocalMeta(storage, countOnlyMeta);
  try {
    writeItemFreeingKey(storage, requestsKey, '[]');
  } catch {
    try {
      storage.removeItem(requestsKey);
    } catch {
      // ignore
    }
  }
  if (metaOk) writeRequestsLocalMeta(storage, countOnlyMeta);
  return {
    ok: metaOk,
    truncated: true,
    retained: [],
    meta: countOnlyMeta,
  };
}

/** 本機申請列不完整時不可推上雲端（避免蓋掉完整資料） */
export function shouldBlockCloudPushForTruncatedRequests(
  localRequests: SubstituteRequest[],
  meta: RequestsLocalMeta | null
): boolean {
  if (!meta) return false;
  if (meta.truncated && localRequests.length < meta.totalCount) return true;
  // 防禦：meta 仍記有通知單筆數，但本機申請列已空（例如只刪了 body）
  if (meta.totalCount > 0 && meta.noticeCount > 0 && localRequests.length === 0) return true;
  return false;
}

/** 供 UI：截斷時用 meta 的完整通知單／案件數 */
export function resolveDisplayedNoticeCount(
  requests: SubstituteRequest[],
  meta: RequestsLocalMeta | null
): number {
  if (meta?.truncated && requests.length < meta.totalCount) return meta.noticeCount;
  // 與推送防護同口徑：body 已空但 meta 仍記有通知單
  if (meta && meta.totalCount > 0 && meta.noticeCount > 0 && requests.length === 0) {
    return meta.noticeCount;
  }
  return listPrintableNoticeAnchors(requests).length;
}

export function resolveDisplayedCaseCount(
  requests: SubstituteRequest[],
  meta: RequestsLocalMeta | null
): number {
  if (meta?.truncated && requests.length < meta.totalCount) return meta.allCaseCount;
  if (meta && meta.totalCount > 0 && meta.allCaseCount > 0 && requests.length === 0) {
    return meta.allCaseCount;
  }
  return countLeaveCases(requests);
}

export const REQUESTS_LOCAL_TRUNCATED_HINT =
  '手機儲存空間不足，已優先保留巡堂／教室日誌。通知單筆數仍正確；內容可能僅最近幾筆或暫略，資料在雲端未刪除。';
