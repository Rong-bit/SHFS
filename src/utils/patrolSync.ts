import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { PatrolKind, PatrolRecord } from '../types';
import {
  CloudSyncSettings,
  decryptJson,
  encryptJson,
  isCloudSyncReady,
  normalizeDatabaseUrl,
  pathIdForSchool,
} from './cloudSync';
import { dateToIsoLocal } from './holidays';

export const PATROL_RECORDS_KEY = 'voc_patrol_records_v1';
export const PATROL_PENDING_KEY = 'voc_patrol_pending_v1';
/** 本機只保留近期紀錄，避免 localStorage 爆量；較舊的仍可由雲端查詢 */
const LOCAL_RETENTION_DAYS = 400;

type PendingOp = { opId: string } & (
  | { op: 'put'; record: PatrolRecord }
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

export const loadLocalPatrolRecords = (): PatrolRecord[] => readJson<PatrolRecord[]>(PATROL_RECORDS_KEY, []);

const saveLocalPatrolRecords = (records: PatrolRecord[]) => {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - LOCAL_RETENTION_DAYS);
  const cutoffIso = dateToIsoLocal(cutoff);
  localStorage.setItem(
    PATROL_RECORDS_KEY,
    JSON.stringify(records.filter((r) => r.date >= cutoffIso))
  );
};

const loadPending = (): PendingOp[] => readJson<PendingOp[]>(PATROL_PENDING_KEY, []);
const savePending = (ops: PendingOp[]) => localStorage.setItem(PATROL_PENDING_KEY, JSON.stringify(ops));

/** 同一人同日同類同節同教室只留一筆，重送即更新 */
export const patrolRecordId = (params: {
  date: string;
  kind: PatrolKind;
  period?: number;
  roomId: string;
  patrollerId: string;
}) =>
  [params.date, params.kind, params.period ?? 0, params.roomId, params.patrollerId]
    .join('_')
    .replace(/[.#$/[\]]/g, '-');

const patrolBase = async (settings: CloudSyncSettings) => {
  const id = await pathIdForSchool(settings.schoolKey);
  return `${normalizeDatabaseUrl(settings.databaseUrl)}/shfs_patrol/${id}`;
};

const pushPatrolRecord = async (settings: CloudSyncSettings, record: PatrolRecord) => {
  const base = await patrolBase(settings);
  const envelope = await encryptJson(settings.schoolKey, record);
  const res = await fetch(`${base}/${record.date}/${record.id}.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(envelope),
  });
  if (!res.ok) throw new Error(`巡堂紀錄上傳失敗（HTTP ${res.status}）`);
};

const deletePatrolRecordRemote = async (settings: CloudSyncSettings, date: string, id: string) => {
  const base = await patrolBase(settings);
  const res = await fetch(`${base}/${date}/${id}.json`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`巡堂紀錄刪除失敗（HTTP ${res.status}）`);
};

/** 依日期區間一次讀取（以日期為 key 排序查詢） */
export const pullPatrolRecords = async (
  settings: CloudSyncSettings,
  dateFrom: string,
  dateTo: string
): Promise<PatrolRecord[]> => {
  const base = await patrolBase(settings);
  const qs = `orderBy=${encodeURIComponent('"$key"')}&startAt=${encodeURIComponent(
    `"${dateFrom}"`
  )}&endAt=${encodeURIComponent(`"${dateTo}"`)}`;
  const res = await fetch(`${base}.json?${qs}`);
  if (!res.ok) throw new Error(`巡堂紀錄讀取失敗（HTTP ${res.status}）。請確認資料庫規則允許 shfs_patrol 路徑。`);
  const json = (await res.json()) as Record<string, Record<string, { iv: string; ct: string }>> | null;
  if (!json) return [];
  const out: PatrolRecord[] = [];
  for (const byId of Object.values(json)) {
    for (const env of Object.values(byId || {})) {
      if (!env?.iv || !env?.ct) continue;
      try {
        out.push(await decryptJson<PatrolRecord>(settings.schoolKey, env));
      } catch {
        // 不同同步密碼寫入的資料無法解密，略過
      }
    }
  }
  return out;
};

const upsert = (records: PatrolRecord[], record: PatrolRecord) => [
  ...records.filter((r) => r.id !== record.id),
  record,
];

/** 巡堂紀錄：本機優先寫入，雲端可用時逐筆上傳；離線時排入待上傳 */
type RecentOp = { id: string; at: number; record?: PatrolRecord };

export function usePatrolRecords() {
  const { cloudSyncSettings } = useApp();
  const cloudReady = isCloudSyncReady(cloudSyncSettings);
  const [records, setRecords] = useState<PatrolRecord[]>(loadLocalPatrolRecords);
  const [pendingCount, setPendingCount] = useState(() => loadPending().length);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const flushingRef = useRef(false);
  /** 最近的本機新增／刪除（record 為 undefined 表示刪除） */
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
        if (op.op === 'put') await pushPatrolRecord(settings, op.record);
        else await deletePatrolRecordRemote(settings, op.date, op.id);
        savePending(loadPending().filter((o) => o.opId !== op.opId));
        setPendingCount(loadPending().length);
      }
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '巡堂紀錄上傳失敗');
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

  const saveRecord = useCallback(
    (record: PatrolRecord) => {
      const nextDisk = upsert(loadLocalPatrolRecords(), record);
      saveLocalPatrolRecords(nextDisk);
      // 磁碟只留近期；畫面上若已用 refresh 拉回較舊資料，勿被此次寫入沖掉
      setRecords((prev) => {
        const saved = loadLocalPatrolRecords();
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

  const deleteRecord = useCallback(
    (record: PatrolRecord) => {
      const nextDisk = loadLocalPatrolRecords().filter((r) => r.id !== record.id);
      saveLocalPatrolRecords(nextDisk);
      setRecords((prev) => {
        const saved = loadLocalPatrolRecords();
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

  /** 從雲端重新載入區間內紀錄（尚未上傳的本機變更保留） */
  const refresh = useCallback(
    async (dateFrom: string, dateTo: string) => {
      const settings = settingsRef.current;
      if (!isCloudSyncReady(settings)) return;
      setLoading(true);
      const startedAt = Date.now();
      try {
        await flush();
        const remote = await pullPatrolRecords(settings, dateFrom, dateTo);
        const pending = loadPending();
        // 讀取期間才完成上傳／刪除的本機變更，雲端快照可能還沒包含
        const recent: RecentOp[] = [];
        recentOpsRef.current.forEach((o) => {
          if (o.at >= startedAt) recent.push(o);
        });
        const puts = new Map<string, PatrolRecord>();
        for (const op of pending) if (op.op === 'put') puts.set(op.record.id, op.record);
        for (const o of recent) if (o.record) puts.set(o.id, o.record);
        const deletes = new Set<string>(pending.flatMap((op) => (op.op === 'delete' ? [op.id] : [])));
        for (const o of recent) if (!o.record) deletes.add(o.id);
        for (const id of deletes) puts.delete(id);
        const outside = loadLocalPatrolRecords().filter((r) => r.date < dateFrom || r.date > dateTo);
        const inside = [
          ...remote.filter((r) => !deletes.has(r.id) && !puts.has(r.id)),
          ...Array.from(puts.values()).filter((r) => r.date >= dateFrom && r.date <= dateTo),
        ];
        const next = [...outside, ...inside];
        saveLocalPatrolRecords(next);
        setRecords(next);
        setError('');
      } catch (err) {
        setError(err instanceof Error ? err.message : '巡堂紀錄讀取失敗');
      } finally {
        setLoading(false);
      }
    },
    [flush]
  );

  return { records, pendingCount, loading, error, cloudReady, saveRecord, deleteRecord, refresh };
}
