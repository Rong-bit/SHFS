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
const LOCAL_RETENTION_DAYS = 400;

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

const saveLocalClassLogs = (records: ClassLogEntry[]) => {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - LOCAL_RETENTION_DAYS);
  const cutoffIso = dateToIsoLocal(cutoff);
  localStorage.setItem(
    CLASS_LOG_RECORDS_KEY,
    JSON.stringify(records.filter((r) => r.date >= cutoffIso))
  );
};

const loadPending = (): PendingOp[] => readJson<PendingOp[]>(CLASS_LOG_PENDING_KEY, []);
const savePending = (ops: PendingOp[]) =>
  localStorage.setItem(CLASS_LOG_PENDING_KEY, JSON.stringify(ops));

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
        if (op.op === 'put') await pushClassLogEntry(settings, op.record);
        else await deleteClassLogRemote(settings, op.date, op.id);
        savePending(loadPending().filter((o) => o.opId !== op.opId));
        setPendingCount(loadPending().length);
      }
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '教室日誌上傳失敗');
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

  const saveEntry = useCallback(
    (record: ClassLogEntry) => {
      const nextDisk = upsert(loadLocalClassLogs(), record);
      saveLocalClassLogs(nextDisk);
      setEntries((prev) => {
        const saved = loadLocalClassLogs();
        const savedIds = new Set(saved.map((r) => r.id));
        const olderInMemory = prev.filter((r) => !savedIds.has(r.id) && r.id !== record.id);
        return [...olderInMemory, ...saved];
      });
      recentOpsRef.current.set(record.id, { id: record.id, at: Date.now(), record });
      savePending([
        ...loadPending().filter((op) => (op.op === 'put' ? op.record.id : op.id) !== record.id),
        { opId: newOpId(), op: 'put', record },
      ]);
      setPendingCount(loadPending().length);
      void flush();
    },
    [flush]
  );

  const deleteEntry = useCallback(
    (record: ClassLogEntry) => {
      const nextDisk = loadLocalClassLogs().filter((r) => r.id !== record.id);
      saveLocalClassLogs(nextDisk);
      setEntries((prev) => {
        const saved = loadLocalClassLogs();
        const savedIds = new Set(saved.map((r) => r.id));
        const olderInMemory = prev.filter((r) => !savedIds.has(r.id) && r.id !== record.id);
        return [...olderInMemory, ...saved];
      });
      recentOpsRef.current.set(record.id, { id: record.id, at: Date.now() });
      savePending([
        ...loadPending().filter((op) => (op.op === 'put' ? op.record.id : op.id) !== record.id),
        { opId: newOpId(), op: 'delete', id: record.id, date: record.date },
      ]);
      setPendingCount(loadPending().length);
      void flush();
    },
    [flush]
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
        const pending = loadPending();
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
        saveLocalClassLogs(next);
        setEntries(next);
        setError('');
      } catch (err) {
        setError(err instanceof Error ? err.message : '教室日誌讀取失敗');
      } finally {
        setLoading(false);
      }
    },
    [flush]
  );

  return { entries, pendingCount, loading, error, cloudReady, saveEntry, deleteEntry, refresh };
}
