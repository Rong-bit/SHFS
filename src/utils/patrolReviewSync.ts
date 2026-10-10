import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { PatrolReviewCase } from '../types';
import {
  CloudSyncSettings,
  decryptJson,
  encryptJson,
  isCloudSyncReady,
  normalizeDatabaseUrl,
  pathIdForSchool,
} from './cloudSync';
import { dateToIsoLocal } from './holidays';

export const PATROL_REVIEW_KEY = 'voc_patrol_review_v1';
export const PATROL_REVIEW_PENDING_KEY = 'voc_patrol_review_pending_v1';
const LOCAL_RETENTION_DAYS = 400;

type PendingOp = { opId: string } & (
  | { op: 'put'; record: PatrolReviewCase }
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

export const loadLocalPatrolReviews = (): PatrolReviewCase[] =>
  readJson<PatrolReviewCase[]>(PATROL_REVIEW_KEY, []);

const saveLocalPatrolReviews = (records: PatrolReviewCase[]) => {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - LOCAL_RETENTION_DAYS);
  const cutoffIso = dateToIsoLocal(cutoff);
  localStorage.setItem(
    PATROL_REVIEW_KEY,
    JSON.stringify(records.filter((r) => r.date >= cutoffIso))
  );
};

const loadPending = (): PendingOp[] => readJson<PendingOp[]>(PATROL_REVIEW_PENDING_KEY, []);
const savePending = (ops: PendingOp[]) =>
  localStorage.setItem(PATROL_REVIEW_PENDING_KEY, JSON.stringify(ops));

/**
 * 會辦案掛在既有 shfs_patrol 路徑下，沿用學校已開放的巡堂規則，
 * 不必另開 shfs_patrol_review（否則常見 HTTP 401）。
 * 結構：shfs_patrol/{schoolId}/_review/{date}/{caseId}
 */
const reviewBase = async (settings: CloudSyncSettings) => {
  const id = await pathIdForSchool(settings.schoolKey);
  return `${normalizeDatabaseUrl(settings.databaseUrl)}/shfs_patrol/${id}/_review`;
};

const pushReview = async (settings: CloudSyncSettings, record: PatrolReviewCase) => {
  const base = await reviewBase(settings);
  const envelope = await encryptJson(settings.schoolKey, record);
  const res = await fetch(`${base}/${record.date}/${record.id}.json`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(envelope),
  });
  if (!res.ok) throw new Error(`巡堂會辦上傳失敗（HTTP ${res.status}）`);
};

const deleteReviewRemote = async (settings: CloudSyncSettings, date: string, id: string) => {
  const base = await reviewBase(settings);
  const res = await fetch(`${base}/${date}/${id}.json`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`巡堂會辦刪除失敗（HTTP ${res.status}）`);
};

export const pullPatrolReviews = async (
  settings: CloudSyncSettings,
  dateFrom: string,
  dateTo: string
): Promise<PatrolReviewCase[]> => {
  const base = await reviewBase(settings);
  const qs = `orderBy=${encodeURIComponent('"$key"')}&startAt=${encodeURIComponent(
    `"${dateFrom}"`
  )}&endAt=${encodeURIComponent(`"${dateTo}"`)}`;
  const res = await fetch(`${base}.json?${qs}`);
  if (!res.ok) {
    throw new Error(
      `巡堂會辦讀取失敗（HTTP ${res.status}）。請確認資料庫規則允許 shfs_patrol 路徑讀寫（會辦案在 shfs_patrol/…/_review）。`
    );
  }
  const json = (await res.json()) as Record<
    string,
    Record<string, { iv: string; ct: string }>
  > | null;
  if (!json) return [];
  const out: PatrolReviewCase[] = [];
  for (const byId of Object.values(json)) {
    for (const env of Object.values(byId || {})) {
      if (!env?.iv || !env?.ct) continue;
      try {
        out.push(await decryptJson<PatrolReviewCase>(settings.schoolKey, env));
      } catch {
        // ignore undecryptable
      }
    }
  }
  return out;
};

const upsert = (records: PatrolReviewCase[], record: PatrolReviewCase) => [
  ...records.filter((r) => r.id !== record.id),
  record,
];

type RecentOp = { id: string; at: number; record?: PatrolReviewCase };

export function usePatrolReviews() {
  const { cloudSyncSettings } = useApp();
  const cloudReady = isCloudSyncReady(cloudSyncSettings);
  const [cases, setCases] = useState<PatrolReviewCase[]>(loadLocalPatrolReviews);
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
        if (op.op === 'put') await pushReview(settings, op.record);
        else await deleteReviewRemote(settings, op.date, op.id);
        savePending(loadPending().filter((o) => o.opId !== op.opId));
        setPendingCount(loadPending().length);
      }
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '巡堂會辦上傳失敗');
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

  const saveCase = useCallback(
    (record: PatrolReviewCase) => {
      const nextDisk = upsert(loadLocalPatrolReviews(), record);
      saveLocalPatrolReviews(nextDisk);
      setCases((prev) => {
        const saved = loadLocalPatrolReviews();
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

  const deleteCase = useCallback(
    (record: PatrolReviewCase) => {
      const nextDisk = loadLocalPatrolReviews().filter((r) => r.id !== record.id);
      saveLocalPatrolReviews(nextDisk);
      setCases((prev) => {
        const saved = loadLocalPatrolReviews();
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
        const remote = await pullPatrolReviews(settings, dateFrom, dateTo);
        const pending = loadPending();
        const recent: RecentOp[] = [];
        recentOpsRef.current.forEach((o) => {
          if (o.at >= startedAt) recent.push(o);
        });
        const puts = new Map<string, PatrolReviewCase>();
        for (const op of pending) if (op.op === 'put') puts.set(op.record.id, op.record);
        for (const o of recent) if (o.record) puts.set(o.id, o.record);
        const deletes = new Set<string>(pending.flatMap((op) => (op.op === 'delete' ? [op.id] : [])));
        for (const o of recent) if (!o.record) deletes.add(o.id);
        for (const id of deletes) puts.delete(id);
        const outside = loadLocalPatrolReviews().filter((r) => r.date < dateFrom || r.date > dateTo);
        const inside = [
          ...remote.filter((r) => !deletes.has(r.id) && !puts.has(r.id)),
          ...Array.from(puts.values()).filter((r) => r.date >= dateFrom && r.date <= dateTo),
        ];
        const next = [...outside, ...inside];
        saveLocalPatrolReviews(next);
        setCases(next);
        setError('');
      } catch (err) {
        setError(err instanceof Error ? err.message : '巡堂會辦讀取失敗');
      } finally {
        setLoading(false);
      }
    },
    [flush]
  );

  return { cases, pendingCount, loading, error, cloudReady, saveCase, deleteCase, refresh };
}
