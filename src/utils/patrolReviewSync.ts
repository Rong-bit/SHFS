import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { PatrolReviewCase, PatrolReviewStatus, PatrolSignOff } from '../types';
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

/** 以 raw 字串 CAS 寫入 pending，降低並發 saveCase 互蓋 */
const mutatePending = (mutator: (ops: PendingOp[]) => PendingOp[]) => {
  for (let i = 0; i < 8; i++) {
    const before = localStorage.getItem(PATROL_REVIEW_PENDING_KEY);
    let current: PendingOp[] = [];
    if (before) {
      try {
        const parsed = JSON.parse(before);
        current = Array.isArray(parsed) ? (parsed as PendingOp[]) : [];
      } catch {
        current = [];
      }
    }
    const next = mutator(current);
    if (localStorage.getItem(PATROL_REVIEW_PENDING_KEY) !== before) continue;
    localStorage.setItem(PATROL_REVIEW_PENDING_KEY, JSON.stringify(next));
    return;
  }
  savePending(mutator(loadPending()));
};

const STATUS_RANK: Record<PatrolReviewStatus, number> = {
  closed: 0,
  open: 1,
  reviewed: 2,
  principal_done: 3,
  archived: 4,
};

/** 合併並行核章的 signOffs，避免後寫覆蓋先寫的其他身分 */
export function mergePatrolReviewCases(
  a: PatrolReviewCase,
  b: PatrolReviewCase
): PatrolReviewCase {
  const byKey = new Map<string, PatrolSignOff>();
  for (const s of a.signOffs || []) {
    byKey.set(`${s.role}:${s.personId}`, s);
  }
  for (const s of b.signOffs || []) {
    const k = `${s.role}:${s.personId}`;
    const prev = byKey.get(k);
    if (!prev || (s.stampedAt || '') >= (prev.stampedAt || '')) byKey.set(k, s);
  }
  const signOffs = [...byKey.values()].sort((x, y) =>
    (x.stampedAt || '').localeCompare(y.stampedAt || '')
  );
  const newer = (a.updatedAt || '') >= (b.updatedAt || '') ? a : b;
  const older = newer === a ? b : a;
  const status =
    STATUS_RANK[a.status] >= STATUS_RANK[b.status] ? a.status : b.status;
  return {
    ...older,
    ...newer,
    status,
    signOffs,
    archivedAt: a.archivedAt || b.archivedAt || newer.archivedAt,
    notifiedAt: a.notifiedAt || b.notifiedAt || newer.notifiedAt,
    updatedAt:
      (a.updatedAt || '') >= (b.updatedAt || '') ? a.updatedAt : b.updatedAt,
  };
}

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

const upsertMerged = (records: PatrolReviewCase[], record: PatrolReviewCase) => {
  const prev = records.find((r) => r.id === record.id);
  const merged = prev ? mergePatrolReviewCases(prev, record) : record;
  return [...records.filter((r) => r.id !== record.id), merged];
};

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
    let drainedClean = false;
    try {
      for (;;) {
        const ops = loadPending();
        if (ops.length === 0) {
          drainedClean = true;
          break;
        }
        const op = ops[0];
        if (op.op === 'put') {
          // 上傳前再與本機合併一次，降低並行核章互相覆蓋
          const local = loadLocalPatrolReviews().find((r) => r.id === op.record.id);
          const toPush = local ? mergePatrolReviewCases(local, op.record) : op.record;
          await pushReview(settings, toPush);
        } else await deleteReviewRemote(settings, op.date, op.id);
        mutatePending((cur) => cur.filter((o) => o.opId !== op.opId));
        setPendingCount(loadPending().length);
      }
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '巡堂會辦上傳失敗');
    } finally {
      flushingRef.current = false;
      setPendingCount(loadPending().length);
      // flush 期間若另有 saveCase 入隊，排空後再排一次
      if (drainedClean && loadPending().length > 0) void flush();
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
      const nextDisk = upsertMerged(loadLocalPatrolReviews(), record);
      const savedRecord = nextDisk.find((r) => r.id === record.id) || record;
      saveLocalPatrolReviews(nextDisk);
      setCases((prev) => {
        const saved = loadLocalPatrolReviews();
        const savedIds = new Set(saved.map((r) => r.id));
        const olderInMemory = prev.filter((r) => !savedIds.has(r.id) && r.id !== record.id);
        return [...olderInMemory, ...saved];
      });
      recentOpsRef.current.set(record.id, {
        id: record.id,
        at: Date.now(),
        record: savedRecord,
      });
      mutatePending((ops) => {
        const filtered = ops.filter(
          (op) => (op.op === 'put' ? op.record.id : op.id) !== record.id
        );
        const priorPut = ops.find((op) => op.op === 'put' && op.record.id === record.id);
        const mergedRecord =
          priorPut && priorPut.op === 'put'
            ? mergePatrolReviewCases(priorPut.record, savedRecord)
            : savedRecord;
        return [...filtered, { opId: newOpId(), op: 'put', record: mergedRecord }];
      });
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
      mutatePending((ops) => [
        ...ops.filter((op) => (op.op === 'put' ? op.record.id : op.id) !== record.id),
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
        for (const o of recent) {
          if (!o.record) continue;
          const prev = puts.get(o.id);
          puts.set(o.id, prev ? mergePatrolReviewCases(prev, o.record) : o.record);
        }
        const deletes = new Set<string>(pending.flatMap((op) => (op.op === 'delete' ? [op.id] : [])));
        for (const o of recent) if (!o.record) deletes.add(o.id);
        for (const id of deletes) puts.delete(id);
        const outside = loadLocalPatrolReviews().filter((r) => r.date < dateFrom || r.date > dateTo);
        const inside: PatrolReviewCase[] = [];
        const seen = new Set<string>();
        for (const r of remote) {
          if (deletes.has(r.id)) continue;
          const put = puts.get(r.id);
          inside.push(put ? mergePatrolReviewCases(r, put) : r);
          seen.add(r.id);
        }
        for (const r of puts.values()) {
          if (seen.has(r.id) || deletes.has(r.id)) continue;
          if (r.date < dateFrom || r.date > dateTo) continue;
          inside.push(r);
        }
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
