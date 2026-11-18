import { dateToIsoLocal } from './holidays';

/**
 * iPhone Safari 對同一個網站的 localStorage 大約只有 5MB。
 * 配額用盡時 WebKit 丟出的訊息就是 "The quota has been exceeded."。
 */
export const LOCAL_STORAGE_QUOTA_HINT =
  '手機儲存空間不足。已改顯示較新的資料，較舊紀錄仍可從學校同步讀取。若這則訊息一直出現，請清除此網站資料後再加入學校同步。';

/** 會與課表／申請共用配額、但可再從雲端載回的大型暫存 */
export const SHRINKABLE_LOCAL_CACHE_KEYS = [
  'voc_class_log_v1',
  'voc_class_log_pending_v1',
  'voc_class_log_xfer_v1',
  'voc_class_log_xfer_pending_v1',
  'voc_class_log_week_v1',
  'voc_class_log_week_pending_v1',
  'voc_class_log_return_v1',
  'voc_class_log_return_pending_v1',
  'voc_patrol_records_v1',
  'voc_patrol_pending_v1',
  'voc_patrol_review_v1',
  'voc_patrol_review_pending_v1',
] as const;

/** 紀錄鍵對應的上傳佇列。巡堂紀錄的佇列鍵不是把 _v1 換成 _pending_v1。 */
const PENDING_KEY_FOR_RECORDS: Record<string, string> = {
  voc_class_log_v1: 'voc_class_log_pending_v1',
  voc_class_log_xfer_v1: 'voc_class_log_xfer_pending_v1',
  voc_class_log_week_v1: 'voc_class_log_week_pending_v1',
  voc_class_log_return_v1: 'voc_class_log_return_pending_v1',
  voc_patrol_records_v1: 'voc_patrol_pending_v1',
  voc_patrol_review_v1: 'voc_patrol_review_pending_v1',
};

export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export function siblingCacheKeys(except: readonly string[] = []): string[] {
  const skip = new Set(except);
  return SHRINKABLE_LOCAL_CACHE_KEYS.filter((key) => !skip.has(key));
}

export function isLocalStorageQuotaError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: string; code?: number; message?: string };
  if (
    e.name === 'QuotaExceededError' ||
    e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    e.code === 22 ||
    e.code === 1014
  ) {
    return true;
  }
  // 部分 WebKit／嵌入式瀏覽器不以 DOMException 拋出，只留這句英文
  const msg = String(e.message || err);
  return /quota|儲存空間|exceeded/i.test(msg);
}

export function explainStorageError(err: unknown, fallback: string): string {
  if (isLocalStorageQuotaError(err)) return LOCAL_STORAGE_QUOTA_HINT;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

/** 依保留天數過濾帶日期的本機紀錄（供寫入與測試） */
export function retainDatedRecords<T extends { date?: string }>(
  records: T[],
  keepDays: number,
  todayIso = dateToIsoLocal(new Date())
): T[] {
  const cutoff = new Date(`${todayIso}T12:00:00`);
  cutoff.setDate(cutoff.getDate() - keepDays);
  const cutoffIso = dateToIsoLocal(cutoff);
  return records.filter((r) => (r.date || '') >= cutoffIso);
}

/** 上傳佇列過長時只留最近幾筆，優先保留較新 op */
export function trimPendingOps<T>(ops: T[], maxOps = 80): T[] {
  if (ops.length <= maxOps) return ops;
  return ops.slice(ops.length - maxOps);
}

const safeGetItem = (storage: StorageLike, key: string): string | null => {
  try {
    return storage.getItem(key);
  } catch (err) {
    if (isLocalStorageQuotaError(err)) return null;
    throw err;
  }
};

/**
 * 先寫入；若配額不足則刪舊鍵後再寫。
 * Safari 在覆寫時仍把舊值算進配額，必須先 removeItem 才釋放空間。
 */
export function writeItemFreeingKey(storage: StorageLike, key: string, value: string): void {
  try {
    storage.setItem(key, value);
  } catch (err) {
    if (!isLocalStorageQuotaError(err)) throw err;
    try {
      storage.removeItem(key);
    } catch {
      // ignore
    }
    storage.setItem(key, value);
  }
}

const pendingIdsToKeep = (storage: StorageLike, pendingKey: string): Set<string> => {
  const keep = new Set<string>();
  const raw = safeGetItem(storage, pendingKey);
  if (!raw) return keep;
  try {
    const parsed = JSON.parse(raw) as Array<{ op?: string; id?: string; record?: { id?: string } }>;
    if (!Array.isArray(parsed)) return keep;
    for (const op of parsed) {
      if (op?.op === 'put' && op.record?.id) keep.add(op.record.id);
    }
  } catch {
    // ignore malformed queue
  }
  return keep;
};

/**
 * 釋出其他大型暫存，讓這次寫入有機會成功。
 * 未上傳的佇列只留最近幾筆；已在佇列中的紀錄即使較舊也保留。
 */
export function relieveDatedCaches(
  storage: StorageLike,
  keys: readonly string[],
  keepDays = 7,
  todayIso = dateToIsoLocal(new Date())
): void {
  const cutoff = new Date(`${todayIso}T12:00:00`);
  cutoff.setDate(cutoff.getDate() - keepDays);
  const cutoffIso = dateToIsoLocal(cutoff);

  for (const key of keys) {
    try {
      const raw = safeGetItem(storage, key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) continue;
      if (key.endsWith('_pending_v1')) {
        const trimmed = trimPendingOps(parsed, 10);
        if (trimmed.length < parsed.length || raw.length > 20_000) {
          storage.removeItem(key);
          if (trimmed.length > 0) storage.setItem(key, JSON.stringify(trimmed));
        }
        continue;
      }
      const pendingKey = PENDING_KEY_FOR_RECORDS[key] || '';
      const keepIds = pendingKey ? pendingIdsToKeep(storage, pendingKey) : new Set<string>();
      const next = parsed.filter((r: { date?: string; id?: string }) => {
        if (r?.id && keepIds.has(r.id)) return true;
        return typeof r?.date === 'string' && r.date >= cutoffIso;
      });
      if (next.length < parsed.length || raw.length > 200_000) {
        const mustKeep = next.filter((r: { id?: string }) => r?.id && keepIds.has(r.id));
        try {
          storage.removeItem(key);
          storage.setItem(key, JSON.stringify(next));
        } catch (err) {
          if (!isLocalStorageQuotaError(err)) {
            try {
              storage.removeItem(key);
            } catch {
              // ignore
            }
            continue;
          }
          try {
            storage.removeItem(key);
            storage.setItem(key, JSON.stringify(mustKeep));
          } catch {
            try {
              storage.removeItem(key);
            } catch {
              // ignore
            }
          }
        }
      }
    } catch {
      try {
        storage.removeItem(key);
      } catch {
        // ignore
      }
    }
  }
}

export function persistTextAttempts(
  storage: StorageLike,
  key: string,
  attempts: readonly string[],
  opts?: { siblingKeys?: readonly string[]; quotaHint?: string; todayIso?: string }
): void {
  if (attempts.length === 0) throw new Error('本機儲存失敗，請再試一次');
  let lastErr: unknown;
  let relieved = false;
  for (let i = 0; i < attempts.length; i++) {
    try {
      writeItemFreeingKey(storage, key, attempts[i]);
      return;
    } catch (err) {
      lastErr = err;
      if (!isLocalStorageQuotaError(err)) throw new Error('本機儲存失敗，請再試一次');
      if (!relieved && opts?.siblingKeys && opts.siblingKeys.length > 0) {
        relieveDatedCaches(storage, opts.siblingKeys, 7, opts.todayIso);
        relieved = true;
        i -= 1;
      }
    }
  }
  throw new Error(
    lastErr && isLocalStorageQuotaError(lastErr)
      ? opts?.quotaHint || LOCAL_STORAGE_QUOTA_HINT
      : '本機儲存失敗，請再試一次'
  );
}

/** 空間不夠就縮短保留天數，必要時先清其他暫存。回傳實際寫入的紀錄。 */
export function persistDatedRecords<T extends { date?: string }>(
  storage: StorageLike,
  key: string,
  records: T[],
  opts: {
    retentionDays: readonly number[];
    siblingKeys?: readonly string[];
    todayIso?: string;
    quotaHint?: string;
  }
): T[] {
  const todayIso = opts.todayIso ?? dateToIsoLocal(new Date());
  const attempts = opts.retentionDays.map((days) => retainDatedRecords(records, days, todayIso));
  let lastErr: unknown;
  let relieved = false;
  for (let i = 0; i < attempts.length; i++) {
    const filtered = attempts[i];
    try {
      writeItemFreeingKey(storage, key, JSON.stringify(filtered));
      return filtered;
    } catch (err) {
      lastErr = err;
      if (!isLocalStorageQuotaError(err)) throw new Error('本機儲存失敗，請再試一次');
      if (!relieved && opts.siblingKeys && opts.siblingKeys.length > 0) {
        relieveDatedCaches(storage, opts.siblingKeys, 7, todayIso);
        relieved = true;
        i -= 1;
      }
    }
  }
  throw new Error(
    lastErr && isLocalStorageQuotaError(lastErr)
      ? opts.quotaHint || LOCAL_STORAGE_QUOTA_HINT
      : '本機儲存失敗，請再試一次'
  );
}
