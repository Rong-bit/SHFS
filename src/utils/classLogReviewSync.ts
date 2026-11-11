import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
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
import { freeSiblingLocalCaches, isLocalStorageQuotaError } from './classLogSync';

type DatedRecord = { id: string; date: string };

type PendingOp<T extends DatedRecord> = { opId: string } & (
  | { op: 'put'; record: T }
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

function createDatedRecordHook<T extends DatedRecord>(opts: {
  storageKey: string;
  pendingKey: string;
  remoteSegment: '_class_log_week' | '_class_log_return';
  label: string;
}) {
  const quotaHint = `本機儲存空間不足。請加入學校同步後再處理${opts.label}，或清除此網站資料後再試。`;

  const loadLocal = (): T[] => readJson<T[]>(opts.storageKey, []);
  const loadPending = (): PendingOp<T>[] => readJson<PendingOp<T>[]>(opts.pendingKey, []);

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
        if (isLocalStorageQuotaError(retryErr)) throw new Error(quotaHint);
        throw new Error('本機儲存失敗，請再試一次');
      }
    }
  };

  const saveLocal = (records: T[]) => {
    writeLocalItem(opts.storageKey, JSON.stringify(records));
  };

  const savePending = (ops: PendingOp<T>[]) => {
    writeLocalItem(opts.pendingKey, JSON.stringify(ops));
  };

  const remoteBase = async (settings: CloudSyncSettings) => {
    const id = await pathIdForSchool(settings.schoolKey);
    return `${normalizeDatabaseUrl(settings.databaseUrl)}/shfs_patrol/${id}/${opts.remoteSegment}`;
  };

  const rtdbConfig = (settings: CloudSyncSettings) => ({
    databaseUrl: normalizeDatabaseUrl(settings.databaseUrl),
    ...resolveFirebaseWebConfig(settings),
  });

  const pushRecord = async (settings: CloudSyncSettings, record: T) => {
    const base = await remoteBase(settings);
    const envelope = await encryptJson(settings.schoolKey, record);
    const res = await rtdbFetch(
      `${base}/${encodeURIComponent(record.date)}/${encodeURIComponent(record.id)}.json`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(envelope),
      },
      rtdbConfig(settings)
    );
    if (!res.ok) throw new Error(`${opts.label}上傳失敗（HTTP ${res.status}）`);
  };

  const deleteRemote = async (settings: CloudSyncSettings, date: string, id: string) => {
    const base = await remoteBase(settings);
    const res = await rtdbFetch(
      `${base}/${encodeURIComponent(date)}/${encodeURIComponent(id)}.json`,
      { method: 'DELETE' },
      rtdbConfig(settings)
    );
    if (!res.ok) throw new Error(`${opts.label}刪除失敗（HTTP ${res.status}）`);
  };

  const pullRecords = async (
    settings: CloudSyncSettings,
    dateFrom: string,
    dateTo: string
  ): Promise<T[]> => {
    const base = await remoteBase(settings);
    const qs = `orderBy=${encodeURIComponent('"$key"')}&startAt=${encodeURIComponent(
      `"${dateFrom}"`
    )}&endAt=${encodeURIComponent(`"${dateTo}"`)}`;
    const res = await rtdbFetch(`${base}.json?${qs}`, undefined, rtdbConfig(settings));
    if (!res.ok) {
      throw new Error(
        `${opts.label}讀取失敗（HTTP ${res.status}）。請確認 shfs_patrol 規則為 auth != null。`
      );
    }
    const json = (await res.json()) as Record<
      string,
      Record<string, { iv: string; ct: string }>
    > | null;
    if (!json) return [];
    const out: T[] = [];
    for (const byId of Object.values(json)) {
      for (const env of Object.values(byId || {})) {
        if (!env?.iv || !env?.ct) continue;
        try {
          out.push(await decryptJson<T>(settings.schoolKey, env));
        } catch {
          // 不同同步密碼寫入的資料無法解密，略過
        }
      }
    }
    return out;
  };

  return function useDatedRecords() {
    const { cloudSyncSettings } = useApp();
    const cloudReady = isCloudSyncReady(cloudSyncSettings);
    const [records, setRecords] = useState<T[]>(loadLocal);
    const [pendingCount, setPendingCount] = useState(() => loadPending().length);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const flushingRef = useRef(false);
    const recentOpsRef = useRef<Map<string, { id: string; at: number; record?: T }>>(new Map());
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
          if (op.op === 'put') await pushRecord(settings, op.record);
          else await deleteRemote(settings, op.date, op.id);
          savePending(loadPending().filter((item) => item.opId !== op.opId));
          setPendingCount(loadPending().length);
        }
        setError('');
      } catch (err) {
        setError(err instanceof Error ? err.message : `${opts.label}上傳失敗`);
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

    const queue = (nextRecords: T[], kind: 'put' | 'delete') => {
      const now = Date.now();
      const idSet = new Set(nextRecords.map((r) => r.id));
      const pending = loadPending().filter(
        (op) => !idSet.has(op.op === 'put' ? op.record.id : op.id)
      );
      for (const record of nextRecords) {
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

    const saveRecords = useCallback((incoming: T[]) => {
      if (incoming.length === 0) return;
      let next = loadLocal();
      for (const record of incoming) {
        next = [...next.filter((r) => r.id !== record.id), record];
      }
      saveLocal(next);
      setRecords(next);
      queue(incoming, 'put');
    }, []);

    const deleteRecords = useCallback((incoming: T[]) => {
      if (incoming.length === 0) return;
      const idSet = new Set(incoming.map((r) => r.id));
      const next = loadLocal().filter((r) => !idSet.has(r.id));
      saveLocal(next);
      setRecords(next);
      queue(incoming, 'delete');
    }, []);

    const refresh = useCallback(
      async (dateFrom: string, dateTo: string) => {
        const settings = settingsRef.current;
        if (!isCloudSyncReady(settings)) return;
        setLoading(true);
        const startedAt = Date.now();
        try {
          await flush();
          const remote = await pullRecords(settings, dateFrom, dateTo);
          const pending = loadPending();
          const recent: { id: string; at: number; record?: T }[] = [];
          recentOpsRef.current.forEach((op) => {
            if (op.at >= startedAt) recent.push(op);
          });
          const puts = new Map<string, T>();
          for (const op of pending) if (op.op === 'put') puts.set(op.record.id, op.record);
          for (const op of recent) if (op.record) puts.set(op.id, op.record);
          const deletes = new Set<string>(
            pending.flatMap((op) => (op.op === 'delete' ? [op.id] : []))
          );
          for (const op of recent) if (!op.record) deletes.add(op.id);
          for (const id of deletes) puts.delete(id);
          const outside = loadLocal().filter((r) => r.date < dateFrom || r.date > dateTo);
          const inside = [
            ...remote.filter((r) => !deletes.has(r.id) && !puts.has(r.id)),
            ...Array.from(puts.values()).filter((r) => r.date >= dateFrom && r.date <= dateTo),
          ];
          const next = [...outside, ...inside];
          try {
            saveLocal(next);
          } catch {
            // 本機寫不進時仍更新畫面
          }
          setRecords(next);
          if (loadPending().length === 0) setError('');
        } catch (err) {
          setError(err instanceof Error ? err.message : `${opts.label}讀取失敗`);
        } finally {
          setLoading(false);
        }
      },
      [flush]
    );

    return {
      records,
      pendingCount,
      loading,
      error,
      cloudReady,
      saveRecords,
      deleteRecords,
      refresh,
    };
  };
}

export const CLASS_LOG_WEEK_KEY = 'voc_class_log_week_v1';
export const CLASS_LOG_WEEK_PENDING_KEY = 'voc_class_log_week_pending_v1';
export const CLASS_LOG_RETURN_KEY = 'voc_class_log_return_v1';
export const CLASS_LOG_RETURN_PENDING_KEY = 'voc_class_log_return_pending_v1';

export const useClassLogWeekReviews = createDatedRecordHook<
  import('../types').ClassLogWeekReview
>({
  storageKey: CLASS_LOG_WEEK_KEY,
  pendingKey: CLASS_LOG_WEEK_PENDING_KEY,
  remoteSegment: '_class_log_week',
  label: '教室日誌週核章',
});

export const useClassLogReturns = createDatedRecordHook<import('../types').ClassLogReturn>({
  storageKey: CLASS_LOG_RETURN_KEY,
  pendingKey: CLASS_LOG_RETURN_PENDING_KEY,
  remoteSegment: '_class_log_return',
  label: '教室日誌退回',
});
