import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { ClassLogTransfer } from '../types';
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
import { classLogEntryId } from './classLogSlots';
import { freeSiblingLocalCaches, isLocalStorageQuotaError } from './classLogSync';

export const CLASS_LOG_XFER_KEY = 'voc_class_log_xfer_v1';
export const CLASS_LOG_XFER_PENDING_KEY = 'voc_class_log_xfer_pending_v1';

type PendingOp = { opId: string } & (
  | { op: 'put'; record: ClassLogTransfer }
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

export const loadLocalClassLogTransfers = (): ClassLogTransfer[] =>
  readJson<ClassLogTransfer[]>(CLASS_LOG_XFER_KEY, []);

const QUOTA_HINT =
  '本機儲存空間不足。請加入學校同步後再轉移，或清除此網站資料後再試。';

const writeLocalItem = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch (err) {
    if (!isLocalStorageQuotaError(err)) throw new Error('本機儲存失敗，請再試一次');
    freeSiblingLocalCaches(7);
    try {
      localStorage.removeItem(key);
      localStorage.setItem(key, value);
    } catch (retryErr) {
      if (isLocalStorageQuotaError(retryErr)) throw new Error(QUOTA_HINT);
      throw new Error('本機儲存失敗，請再試一次');
    }
  }
};

const saveLocal = (records: ClassLogTransfer[]) => {
  writeLocalItem(CLASS_LOG_XFER_KEY, JSON.stringify(records));
};

const loadPending = (): PendingOp[] => readJson<PendingOp[]>(CLASS_LOG_XFER_PENDING_KEY, []);

const savePending = (ops: PendingOp[]) => {
  writeLocalItem(CLASS_LOG_XFER_PENDING_KEY, JSON.stringify(ops));
};

/** 與教室日誌同一穩定鍵：同日同節同課堂只保留一筆轉移 */
export const classLogTransferId = classLogEntryId;

/**
 * 沿用巡堂規則，不必另開資料庫路徑。
 * 結構：shfs_patrol/{schoolId}/_class_log_xfer/{date}/{transferId}
 */
const transferBase = async (settings: CloudSyncSettings) => {
  const id = await pathIdForSchool(settings.schoolKey);
  return `${normalizeDatabaseUrl(settings.databaseUrl)}/shfs_patrol/${id}/_class_log_xfer`;
};

const rtdbConfig = (settings: CloudSyncSettings) => ({
  databaseUrl: normalizeDatabaseUrl(settings.databaseUrl),
  ...resolveFirebaseWebConfig(settings),
});

const pushTransfer = async (settings: CloudSyncSettings, record: ClassLogTransfer) => {
  const base = await transferBase(settings);
  const envelope = await encryptJson(settings.schoolKey, record);
  const res = await rtdbFetch(
    `${base}/${record.date}/${record.id}.json`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(envelope),
    },
    rtdbConfig(settings)
  );
  if (!res.ok) throw new Error(`教室日誌轉移上傳失敗（HTTP ${res.status}）`);
};

const deleteRemote = async (settings: CloudSyncSettings, date: string, id: string) => {
  const base = await transferBase(settings);
  const res = await rtdbFetch(
    `${base}/${date}/${id}.json`,
    { method: 'DELETE' },
    rtdbConfig(settings)
  );
  if (!res.ok) throw new Error(`教室日誌轉移刪除失敗（HTTP ${res.status}）`);
};

export const pullClassLogTransfers = async (
  settings: CloudSyncSettings,
  dateFrom: string,
  dateTo: string
): Promise<ClassLogTransfer[]> => {
  const base = await transferBase(settings);
  const qs = `orderBy=${encodeURIComponent('"$key"')}&startAt=${encodeURIComponent(
    `"${dateFrom}"`
  )}&endAt=${encodeURIComponent(`"${dateTo}"`)}`;
  const res = await rtdbFetch(`${base}.json?${qs}`, undefined, rtdbConfig(settings));
  if (!res.ok) {
    throw new Error(
      `教室日誌轉移讀取失敗（HTTP ${res.status}）。請確認 shfs_patrol 規則為 auth != null（轉移在 shfs_patrol/…/_class_log_xfer）。`
    );
  }
  const json = (await res.json()) as Record<
    string,
    Record<string, { iv: string; ct: string }>
  > | null;
  if (!json) return [];
  const out: ClassLogTransfer[] = [];
  for (const byId of Object.values(json)) {
    for (const env of Object.values(byId || {})) {
      if (!env?.iv || !env?.ct) continue;
      try {
        out.push(await decryptJson<ClassLogTransfer>(settings.schoolKey, env));
      } catch {
        // 不同同步密碼寫入的資料無法解密，略過
      }
    }
  }
  return out;
};

const upsert = (records: ClassLogTransfer[], record: ClassLogTransfer) => [
  ...records.filter((r) => r.id !== record.id),
  record,
];

type RecentOp = { id: string; at: number; record?: ClassLogTransfer };

export function useClassLogTransfers() {
  const { cloudSyncSettings } = useApp();
  const cloudReady = isCloudSyncReady(cloudSyncSettings);
  const [transfers, setTransfers] = useState<ClassLogTransfer[]>(loadLocalClassLogTransfers);
  const [pendingCount, setPendingCount] = useState(() => loadPending().length);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const flushingRef = useRef(false);
  const recentOpsRef = useRef<Map<string, RecentOp>>(new Map());
  const settingsRef = useRef(cloudSyncSettings);
  settingsRef.current = cloudSyncSettings;

  const flush = useCallback(async () => {
    const settings = settingsRef.current;
    if (!isCloudSyncReady(settings) || flushingRef.current) return;
    flushingRef.current = true;
    try {
      for (;;) {
        const ops = loadPending();
        if (ops.length === 0) break;
        const op = ops[0];
        if (op.op === 'put') await pushTransfer(settings, op.record);
        else await deleteRemote(settings, op.date, op.id);
        savePending(loadPending().filter((item) => item.opId !== op.opId));
        setPendingCount(loadPending().length);
      }
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '教室日誌轉移上傳失敗');
    } finally {
      flushingRef.current = false;
      setPendingCount(loadPending().length);
    }
  }, []);

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

  const queue = (records: ClassLogTransfer[], kind: 'put' | 'delete') => {
    const now = Date.now();
    const idSet = new Set(records.map((r) => r.id));
    const pending = loadPending().filter((op) => !idSet.has(op.op === 'put' ? op.record.id : op.id));
    for (const record of records) {
      recentOpsRef.current.set(record.id, {
        id: record.id,
        at: now,
        record: kind === 'put' ? record : undefined,
      });
      pending.push(
        kind === 'put'
          ? { opId: newOpId(), op: 'put', record }
          : { opId: newOpId(), op: 'delete', id: record.id, date: record.date }
      );
    }
    savePending(pending);
    setPendingCount(pending.length);
    void flush();
  };

  const saveTransfers = useCallback((records: ClassLogTransfer[]) => {
    if (records.length === 0) return;
    let next = loadLocalClassLogTransfers();
    for (const record of records) next = upsert(next, record);
    saveLocal(next);
    setTransfers(next);
    queue(records, 'put');
  }, []);

  const deleteTransfers = useCallback((records: ClassLogTransfer[]) => {
    if (records.length === 0) return;
    const idSet = new Set(records.map((r) => r.id));
    const next = loadLocalClassLogTransfers().filter((r) => !idSet.has(r.id));
    saveLocal(next);
    setTransfers(next);
    queue(records, 'delete');
  }, []);

  const refresh = useCallback(
    async (dateFrom: string, dateTo: string) => {
      const settings = settingsRef.current;
      if (!isCloudSyncReady(settings)) return;
      setLoading(true);
      const startedAt = Date.now();
      try {
        await flush();
        const remote = await pullClassLogTransfers(settings, dateFrom, dateTo);
        const pending = loadPending();
        const recent: RecentOp[] = [];
        recentOpsRef.current.forEach((op) => {
          if (op.at >= startedAt) recent.push(op);
        });
        const puts = new Map<string, ClassLogTransfer>();
        for (const op of pending) if (op.op === 'put') puts.set(op.record.id, op.record);
        for (const op of recent) if (op.record) puts.set(op.id, op.record);
        const deletes = new Set<string>(pending.flatMap((op) => (op.op === 'delete' ? [op.id] : [])));
        for (const op of recent) if (!op.record) deletes.add(op.id);
        for (const id of deletes) puts.delete(id);
        const outside = loadLocalClassLogTransfers().filter(
          (r) => r.date < dateFrom || r.date > dateTo
        );
        const inside = [
          ...remote.filter((r) => !deletes.has(r.id) && !puts.has(r.id)),
          ...Array.from(puts.values()).filter((r) => r.date >= dateFrom && r.date <= dateTo),
        ];
        const next = [...outside, ...inside];
        try {
          saveLocal(next);
        } catch {
          // 本機寫不進時仍更新畫面；雲端資料以記憶體為準
        }
        setTransfers(next);
        if (loadPending().length === 0) setError('');
      } catch (err) {
        setError(err instanceof Error ? err.message : '教室日誌轉移讀取失敗');
      } finally {
        setLoading(false);
      }
    },
    [flush]
  );

  return {
    transfers,
    pendingCount,
    loading,
    error,
    cloudReady,
    saveTransfers,
    deleteTransfers,
    refresh,
  };
}
