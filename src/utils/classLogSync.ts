import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { ClassLogEntry } from '../types';
import {
  CloudSyncSettings,
  decryptJson,
  encryptJson,
  isCloudSyncReady,
  normalizeDatabaseUrl,
  pathIdForSchool,
  resolveFirebaseWebConfig,
} from './cloudSync';
import { rtdbFetch } from './firebaseRtdbClient';
import { dateToIsoLocal } from './holidays';
import { classLogEntryId } from './classLogSlots';

export const CLASS_LOG_RECORDS_KEY = 'voc_class_log_v1';
export const CLASS_LOG_PENDING_KEY = 'voc_class_log_pending_v1';
/** 本機預設保留天數；空間不足時會自動縮短（雲端仍可查較舊資料） */
export const LOCAL_RETENTION_DAYS = 60;
/** 配額不足時依序縮短保留天數再重試 */
export const LOCAL_RETENTION_FALLBACK_DAYS = [60, 30, 14, 7, 3] as const;
const PENDING_MAX_OPS = 80;

/** 可縮減的其他本機快取（與教室日誌共用 origin 配額；手機 Safari 約 5MB） */
const SIBLING_CACHE_KEYS = [
  'voc_patrol_records_v1',
  'voc_patrol_pending_v1',
  'voc_patrol_review_v1',
  'voc_patrol_review_pending_v1',
] as const;

type PendingOp = { opId: string } & (
  | { op: 'put'; record: ClassLogEntry }
  | { op: 'delete'; id: string; date: string }
);

const newOpId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const readJson = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
};

export const loadLocalClassLogs = (): ClassLogEntry[] =>
  readJson<ClassLogEntry[]>(CLASS_LOG_RECORDS_KEY, []);

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
  // 部分 WebKit／嵌入式瀏覽器不以 DOMException 拋出
  const msg = String(e.message || err);
  return /quota|儲存空間|exceeded/i.test(msg);
}

/** 依保留天數過濾本機教室日誌（供寫入與測試） */
export function retainClassLogEntries(
  records: ClassLogEntry[],
  keepDays: number,
  todayIso = dateToIsoLocal(new Date())
): ClassLogEntry[] {
  const cutoff = new Date(`${todayIso}T12:00:00`);
  cutoff.setDate(cutoff.getDate() - keepDays);
  const cutoffIso = dateToIsoLocal(cutoff);
  return records.filter((r) => r.date >= cutoffIso);
}

/** 上傳佇列過長時只留最近幾筆，優先保留較新 op */
export function trimPendingOps<T>(ops: T[], maxOps = PENDING_MAX_OPS): T[] {
  if (ops.length <= maxOps) return ops;
  return ops.slice(ops.length - maxOps);
}

const QUOTA_HINT =
  '本機儲存空間不足。已改嘗試精簡快取；若仍失敗請清除此網站資料，或確認已加入學校同步後再試。';

const trySetItem = (key: string, value: string) => {
  localStorage.setItem(key, value);
};

/** 先寫入；若配額不足則刪舊鍵後再寫（Safari 常需先 remove 才釋放） */
const setItemFreeingKey = (key: string, value: string) => {
  try {
    trySetItem(key, value);
  } catch (err) {
    if (!isLocalStorageQuotaError(err)) throw err;
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
    trySetItem(key, value);
  }
};

/**
 * 釋出同站其他大型快取，讓教室日誌寫得進去。
 * 巡堂本機紀錄可再從雲端載入；不碰課表／申請等核心資料。
 */
export function freeSiblingLocalCaches(keepDays = 7): void {
  const todayIso = dateToIsoLocal(new Date());
  const cutoff = new Date(`${todayIso}T12:00:00`);
  cutoff.setDate(cutoff.getDate() - keepDays);
  const cutoffIso = dateToIsoLocal(cutoff);

  for (const key of SIBLING_CACHE_KEYS) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      // pending 佇列過大直接清掉（未上傳的會再由使用者重送／雲端為準）
      if (key.endsWith('_pending_v1') && raw.length > 20_000) {
        localStorage.removeItem(key);
        continue;
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) continue;
      if (key.endsWith('_pending_v1')) {
        const trimmed = trimPendingOps(parsed, 10);
        if (trimmed.length < parsed.length) {
          localStorage.removeItem(key);
          localStorage.setItem(key, JSON.stringify(trimmed));
        }
        continue;
      }
      const next = parsed.filter(
        (r: { date?: string }) => typeof r?.date === 'string' && r.date >= cutoffIso
      );
      if (next.length < parsed.length || raw.length > 200_000) {
        localStorage.removeItem(key);
        localStorage.setItem(key, JSON.stringify(next));
      }
    } catch {
      try {
        localStorage.removeItem(key);
      } catch {
        // ignore
      }
    }
  }
}

const saveLocalClassLogs = (records: ClassLogEntry[]): ClassLogEntry[] => {
  const todayIso = dateToIsoLocal(new Date());
  let lastErr: unknown;
  let relieved = false;

  const attempts: ClassLogEntry[][] = [
    ...LOCAL_RETENTION_FALLBACK_DAYS.map((days) =>
      retainClassLogEntries(records, days, todayIso)
    ),
  ];
  const essentialDates = new Set(records.map((r) => r.date).concat(todayIso).filter(Boolean));
  attempts.push(records.filter((r) => essentialDates.has(r.date)));
  // 只留這次寫入的批次
  attempts.push(records);

  for (let i = 0; i < attempts.length; i++) {
    const filtered = attempts[i];
    try {
      setItemFreeingKey(CLASS_LOG_RECORDS_KEY, JSON.stringify(filtered));
      return filtered;
    } catch (err) {
      lastErr = err;
      if (!isLocalStorageQuotaError(err)) {
        throw new Error('本機儲存失敗，請再試一次');
      }
      if (!relieved) {
        freeSiblingLocalCaches(7);
        relieved = true;
        i -= 1; // 釋放後重試同一層
      }
    }
  }
  throw new Error(
    lastErr && isLocalStorageQuotaError(lastErr) ? QUOTA_HINT : '本機儲存失敗，請再試一次'
  );
};

const loadPending = (): PendingOp[] => readJson<PendingOp[]>(CLASS_LOG_PENDING_KEY, []);

const savePending = (ops: PendingOp[]): PendingOp[] => {
  const attempts = [ops, trimPendingOps(ops, 40), trimPendingOps(ops, 15), trimPendingOps(ops, 5)];
  let lastErr: unknown;
  let relieved = false;
  for (let i = 0; i < attempts.length; i++) {
    const candidate = attempts[i];
    try {
      setItemFreeingKey(CLASS_LOG_PENDING_KEY, JSON.stringify(candidate));
      return candidate;
    } catch (err) {
      lastErr = err;
      if (!isLocalStorageQuotaError(err)) {
        throw new Error('本機儲存失敗，請再試一次');
      }
      if (!relieved) {
        freeSiblingLocalCaches(7);
        relieved = true;
        i -= 1;
      }
    }
  }
  const last = ops.slice(-1);
  try {
    localStorage.removeItem(CLASS_LOG_PENDING_KEY);
    setItemFreeingKey(CLASS_LOG_PENDING_KEY, JSON.stringify(last));
    return last;
  } catch (err) {
    lastErr = err;
  }
  throw new Error(
    lastErr && isLocalStorageQuotaError(lastErr) ? QUOTA_HINT : '本機儲存失敗，請再試一次'
  );
};

export { classLogEntryId };

/**
 * 掛在既有 shfs_patrol 路徑下，沿用學校已開放的巡堂規則，
 * 不必另開 shfs_class_log（否則常見 HTTP 401，與會辦 _review 同理）。
 * 結構：shfs_patrol/{schoolId}/_class_log/{date}/{entryId}
 */
const classLogBase = async (settings: CloudSyncSettings) => {
  const id = await pathIdForSchool(settings.schoolKey);
  return `${normalizeDatabaseUrl(settings.databaseUrl)}/shfs_patrol/${id}/_class_log`;
};

const classLogRtdbConfig = (settings: CloudSyncSettings) => ({
  databaseUrl: normalizeDatabaseUrl(settings.databaseUrl),
  ...resolveFirebaseWebConfig(settings),
});

const pushClassLogEntry = async (settings: CloudSyncSettings, record: ClassLogEntry) => {
  const base = await classLogBase(settings);
  const envelope = await encryptJson(settings.schoolKey, record);
  const res = await rtdbFetch(
    `${base}/${record.date}/${record.id}.json`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(envelope),
    },
    classLogRtdbConfig(settings)
  );
  if (!res.ok) throw new Error(`教室日誌上傳失敗（HTTP ${res.status}）`);
};

const deleteClassLogRemote = async (settings: CloudSyncSettings, date: string, id: string) => {
  const base = await classLogBase(settings);
  const res = await rtdbFetch(
    `${base}/${date}/${id}.json`,
    { method: 'DELETE' },
    classLogRtdbConfig(settings)
  );
  if (!res.ok) throw new Error(`教室日誌刪除失敗（HTTP ${res.status}）`);
};

export const pullClassLogEntries = async (
  settings: CloudSyncSettings,
  dateFrom: string,
  dateTo: string
): Promise<ClassLogEntry[]> => {
  const base = await classLogBase(settings);
  const qs = `orderBy=${encodeURIComponent('"$key"')}&startAt=${encodeURIComponent(
    `"${dateFrom}"`
  )}&endAt=${encodeURIComponent(`"${dateTo}"`)}`;
  const res = await rtdbFetch(`${base}.json?${qs}`, undefined, classLogRtdbConfig(settings));
  if (!res.ok) {
    throw new Error(
      `教室日誌讀取失敗（HTTP ${res.status}）。請確認 shfs_patrol 規則為 auth != null（日誌在 shfs_patrol/…/_class_log），並已設定 Web API 金鑰。`
    );
  }
  const json = (await res.json()) as Record<
    string,
    Record<string, { iv: string; ct: string }>
  > | null;
  if (!json) return [];
  const out: ClassLogEntry[] = [];
  for (const byId of Object.values(json)) {
    for (const env of Object.values(byId || {})) {
      if (!env?.iv || !env?.ct) continue;
      try {
        out.push(await decryptJson<ClassLogEntry>(settings.schoolKey, env));
      } catch {
        // 不同同步密碼寫入的資料無法解密，略過
      }
    }
  }
  return out;
};

const upsert = (records: ClassLogEntry[], record: ClassLogEntry) => [
  ...records.filter((r) => r.id !== record.id),
  record,
];

type RecentOp = { id: string; at: number; record?: ClassLogEntry };

export function useClassLogs() {
  const { cloudSyncSettings } = useApp();
  const cloudReady = isCloudSyncReady(cloudSyncSettings);
  const [entries, setEntries] = useState<ClassLogEntry[]>(loadLocalClassLogs);
  const [pendingCount, setPendingCount] = useState(() => loadPending().length);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const flushingRef = useRef(false);
  const recentOpsRef = useRef<Map<string, RecentOp>>(new Map());
  /** 本機佇列寫不進時暫存，供 flush／直寫雲端 */
  const memoryPendingRef = useRef<PendingOp[]>([]);
  const settingsRef = useRef(cloudSyncSettings);
  settingsRef.current = cloudSyncSettings;

  const readPending = useCallback((): PendingOp[] => {
    const disk = loadPending();
    if (memoryPendingRef.current.length === 0) return disk;
    const byId = new Map<string, PendingOp>();
    for (const op of disk) byId.set(op.opId, op);
    for (const op of memoryPendingRef.current) byId.set(op.opId, op);
    return Array.from(byId.values());
  }, []);

  const flush = useCallback(async () => {
    const settings = settingsRef.current;
    if (!isCloudSyncReady(settings) || flushingRef.current) return;
    flushingRef.current = true;
    let drainedClean = false;
    try {
      for (;;) {
        const ops = readPending();
        if (ops.length === 0) {
          drainedClean = true;
          break;
        }
        const op = ops[0];
        if (op.op === 'put') await pushClassLogEntry(settings, op.record);
        else await deleteClassLogRemote(settings, op.date, op.id);
        memoryPendingRef.current = memoryPendingRef.current.filter((o) => o.opId !== op.opId);
        try {
          savePending(loadPending().filter((o) => o.opId !== op.opId));
        } catch {
          // 本機寫不進時仍繼續排空記憶體佇列／其餘 disk ops
        }
        setPendingCount(readPending().length);
      }
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '教室日誌上傳失敗');
    } finally {
      flushingRef.current = false;
      setPendingCount(readPending().length);
      if (drainedClean && readPending().length > 0) void flush();
    }
  }, [readPending]);

  useEffect(() => {
    void flush();
    const onOnline = () => void flush();
    window.addEventListener('online', onOnline);
    const timer = window.setInterval(() => void flush(), 60_000);
    return () => {
      window.removeEventListener('online', onOnline);
      window.clearInterval(timer);
    };
  }, [flush, cloudReady]);

  /**
   * 連續節一次寫入。手機配額不足時：
   * 1) 縮短本機保留／釋出巡堂快取
   * 2) 仍失敗則只更新記憶體，並改直寫／記憶體佇列上傳雲端（已加入同步時）
   */
  const saveEntries = useCallback(
    (records: ClassLogEntry[]) => {
      if (records.length === 0) return;
      let nextDisk = loadLocalClassLogs();
      for (const record of records) nextDisk = upsert(nextDisk, record);

      let saved: ClassLogEntry[] | null = null;
      let localErr: unknown;
      try {
        saved = saveLocalClassLogs(nextDisk);
      } catch (err) {
        localErr = err;
        if (!isLocalStorageQuotaError(err) && !(err instanceof Error && /本機儲存/.test(err.message))) {
          throw err;
        }
      }

      const idSet = new Set(records.map((r) => r.id));
      setEntries((prev) => {
        const base = saved ?? nextDisk;
        const baseIds = new Set(base.map((r) => r.id));
        const olderInMemory = prev.filter((r) => !baseIds.has(r.id) && !idSet.has(r.id));
        // 確保這次批次一定在畫面中（即使本機寫失敗）
        const withoutBatch = [...olderInMemory, ...base].filter((r) => !idSet.has(r.id));
        return [...withoutBatch, ...records];
      });

      const now = Date.now();
      const pendingSeed = readPending().filter(
        (op) => !idSet.has(op.op === 'put' ? op.record.id : op.id)
      );
      for (const record of records) {
        recentOpsRef.current.set(record.id, { id: record.id, at: now, record });
        pendingSeed.push({ opId: newOpId(), op: 'put', record });
      }

      let queued = false;
      try {
        const savedPending = savePending(pendingSeed);
        memoryPendingRef.current = [];
        setPendingCount(savedPending.length);
        queued = true;
      } catch (err) {
        if (!cloudReady) {
          throw localErr instanceof Error
            ? localErr
            : err instanceof Error
              ? err
              : new Error(QUOTA_HINT);
        }
        memoryPendingRef.current = pendingSeed;
        setPendingCount(pendingSeed.length);
        queued = true;
      }

      if (!saved && !cloudReady) {
        throw localErr instanceof Error ? localErr : new Error(QUOTA_HINT);
      }

      if (queued) void flush();
    },
    [cloudReady, flush, readPending]
  );

  const saveEntry = useCallback(
    (record: ClassLogEntry) => {
      saveEntries([record]);
    },
    [saveEntries]
  );

  const deleteEntries = useCallback(
    (records: ClassLogEntry[]) => {
      if (records.length === 0) return;
      const idSet = new Set(records.map((r) => r.id));
      const nextDisk = loadLocalClassLogs().filter((r) => !idSet.has(r.id));

      let saved: ClassLogEntry[] | null = null;
      let localErr: unknown;
      try {
        saved = saveLocalClassLogs(nextDisk);
      } catch (err) {
        localErr = err;
        if (!isLocalStorageQuotaError(err) && !(err instanceof Error && /本機儲存/.test(err.message))) {
          throw err;
        }
      }

      setEntries(() => (saved ?? nextDisk).filter((r) => !idSet.has(r.id)));

      const now = Date.now();
      const pendingSeed = readPending().filter(
        (op) => !idSet.has(op.op === 'put' ? op.record.id : op.id)
      );
      for (const record of records) {
        recentOpsRef.current.set(record.id, { id: record.id, at: now });
        pendingSeed.push({
          opId: newOpId(),
          op: 'delete',
          id: record.id,
          date: record.date,
        });
      }

      try {
        const savedPending = savePending(pendingSeed);
        memoryPendingRef.current = [];
        setPendingCount(savedPending.length);
      } catch (err) {
        if (!cloudReady) {
          throw localErr instanceof Error
            ? localErr
            : err instanceof Error
              ? err
              : new Error(QUOTA_HINT);
        }
        memoryPendingRef.current = pendingSeed;
        setPendingCount(pendingSeed.length);
      }

      if (!saved && !cloudReady) {
        throw localErr instanceof Error ? localErr : new Error(QUOTA_HINT);
      }

      void flush();
    },
    [cloudReady, flush, readPending]
  );

  const deleteEntry = useCallback(
    (record: ClassLogEntry) => {
      deleteEntries([record]);
    },
    [deleteEntries]
  );

  const refresh = useCallback(
    async (dateFrom: string, dateTo: string) => {
      const settings = settingsRef.current;
      if (!isCloudSyncReady(settings)) return;
      setLoading(true);
      const startedAt = Date.now();
      try {
        await flush();
        const remote = await pullClassLogEntries(settings, dateFrom, dateTo);
        const pending = readPending();
        const recent: RecentOp[] = [];
        recentOpsRef.current.forEach((o) => {
          if (o.at >= startedAt) recent.push(o);
        });
        const puts = new Map<string, ClassLogEntry>();
        for (const op of pending) if (op.op === 'put') puts.set(op.record.id, op.record);
        for (const o of recent) if (o.record) puts.set(o.id, o.record);
        const deletes = new Set<string>(
          pending.flatMap((op) => (op.op === 'delete' ? [op.id] : []))
        );
        for (const o of recent) if (!o.record) deletes.add(o.id);
        for (const id of deletes) puts.delete(id);
        const outside = loadLocalClassLogs().filter((r) => r.date < dateFrom || r.date > dateTo);
        const inside = [
          ...remote.filter((r) => !deletes.has(r.id) && !puts.has(r.id)),
          ...Array.from(puts.values()).filter((r) => r.date >= dateFrom && r.date <= dateTo),
        ];
        const next = [...outside, ...inside];
        try {
          saveLocalClassLogs(next);
        } catch {
          // 本機寫不進時仍更新畫面；雲端資料以記憶體為準
        }
        setEntries(next);
        if (readPending().length === 0) setError('');
      } catch (err) {
        setError(err instanceof Error ? err.message : '教室日誌讀取失敗');
      } finally {
        setLoading(false);
      }
    },
    [flush, readPending]
  );

  return {
    entries,
    pendingCount,
    loading,
    error,
    cloudReady,
    saveEntry,
    saveEntries,
    deleteEntry,
    deleteEntries,
    refresh,
  };
}
