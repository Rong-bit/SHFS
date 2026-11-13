/**
 * 手機 Safari 本機配額：會辦／巡堂暫存寫不進去時應精簡後重試，
 * 不可把 "The quota has been exceeded." 直接丟給畫面。
 * 執行：npx tsx scripts/regression-local-storage-quota.ts
 */
import assert from 'node:assert/strict';
import {
  LOCAL_STORAGE_QUOTA_HINT,
  explainStorageError,
  isLocalStorageQuotaError,
  persistDatedRecords,
  relieveDatedCaches,
  siblingCacheKeys,
  type StorageLike,
} from '../src/utils/localStorageQuota';

type Dated = { id: string; date: string; note?: string };

function quotaError(): Error {
  const err = new Error('The quota has been exceeded.');
  err.name = 'QuotaExceededError';
  return err;
}

/** WebKit：覆寫時舊值仍佔配額，必須先 removeItem。 */
function createWebKitStorage(maxBytes: number): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  const used = () => [...map.values()].reduce((sum, value) => sum + value.length, 0);
  return {
    map,
    getItem(key) {
      return map.has(key) ? map.get(key)! : null;
    },
    removeItem(key) {
      map.delete(key);
    },
    setItem(key, value) {
      if (used() + value.length > maxBytes) throw quotaError();
      map.set(key, value);
    },
  };
}

const TODAY = '2026-11-13';

function reviews(countOld: number, countRecent: number): Dated[] {
  const out: Dated[] = [];
  for (let i = 0; i < countOld; i++) {
    out.push({ id: `old-${i}`, date: '2025-06-01', note: 'x'.repeat(80) });
  }
  for (let i = 0; i < countRecent; i++) {
    out.push({ id: `new-${i}`, date: '2026-11-12', note: '本週' });
  }
  return out;
}

assert.equal(isLocalStorageQuotaError(quotaError()), true);
assert.equal(isLocalStorageQuotaError(new Error('The quota has been exceeded.')), true);
assert.equal(
  explainStorageError(quotaError(), '巡堂會辦讀取失敗'),
  LOCAL_STORAGE_QUOTA_HINT
);
assert.equal(explainStorageError(quotaError(), 'fallback').includes('The quota has been exceeded.'), false);
assert.match(LOCAL_STORAGE_QUOTA_HINT, /手機儲存空間不足/);
assert.equal(siblingCacheKeys(['voc_patrol_review_v1']).includes('voc_patrol_review_v1'), false);
assert.equal(siblingCacheKeys(['voc_patrol_review_v1']).includes('voc_class_log_v1'), true);
assert.equal(siblingCacheKeys(['voc_patrol_review_v1']).includes('voc_patrol_records_v1'), true);

// 舊的 400 日會辦把配額塞滿。直接覆寫會失敗；刪除舊鍵後只留近 60 日應成功。
{
  const storage = createWebKitStorage(4200);
  const stale = JSON.stringify(reviews(40, 0));
  assert.ok(stale.length > 3000);
  storage.map.set('voc_patrol_review_v1', stale);
  const incoming = reviews(40, 2);
  const saved = persistDatedRecords(storage, 'voc_patrol_review_v1', incoming, {
    retentionDays: [60, 30, 14, 7, 3],
    siblingKeys: ['voc_class_log_v1'],
    todayIso: TODAY,
  });
  assert.deepEqual(
    saved.map((r) => r.id),
    ['new-0', 'new-1']
  );
  const disk = JSON.parse(storage.getItem('voc_patrol_review_v1') || '[]') as Dated[];
  assert.deepEqual(
    disk.map((r) => r.id),
    ['new-0', 'new-1']
  );
}

// 近 60 日本身也放不下時，先把教室日誌舊檔縮短，再寫進會辦。未上傳的日誌要留下。
{
  const bulkyRecent = reviews(0, 8).map((r, i) => ({ ...r, id: `week-${i}`, note: 'w'.repeat(200) }));
  const payload = JSON.stringify(bulkyRecent);
  const logsRaw = JSON.stringify([
    { id: 'log-old', date: '2026-08-01', note: 'o'.repeat(3000) },
    { id: 'log-unsynced', date: '2026-08-02', note: 'keep' },
    { id: 'log-new', date: '2026-11-12', note: 'today' },
  ]);
  const pendingRaw = JSON.stringify([
    { op: 'put', record: { id: 'log-unsynced', date: '2026-08-02' } },
  ]);
  const reviewStale = 'x'.repeat(800);
  // 刪掉舊會辦後，教室日誌仍大到讓近期會辦寫不進去；縮掉舊日誌後才放得下。
  const maxBytes = logsRaw.length + pendingRaw.length + Math.floor(payload.length / 2);
  assert.ok(logsRaw.length + pendingRaw.length + payload.length > maxBytes);
  assert.ok(pendingRaw.length + payload.length + 200 < maxBytes);

  const storage = createWebKitStorage(maxBytes);
  storage.map.set('voc_patrol_review_v1', reviewStale);
  storage.map.set('voc_class_log_v1', logsRaw);
  storage.map.set('voc_class_log_pending_v1', pendingRaw);

  const saved = persistDatedRecords(storage, 'voc_patrol_review_v1', bulkyRecent, {
    retentionDays: [60, 30, 14, 7, 3],
    siblingKeys: ['voc_class_log_v1', 'voc_class_log_pending_v1'],
    todayIso: TODAY,
  });
  assert.equal(saved.length, bulkyRecent.length);
  const logs = JSON.parse(storage.getItem('voc_class_log_v1') || '[]') as Dated[];
  assert.deepEqual(
    logs.map((r) => r.id).sort(),
    ['log-new', 'log-unsynced']
  );
}

// 怎麼縮都放不下時，錯誤必須是中文，不能是 Safari 原文。
{
  const storage = createWebKitStorage(80);
  storage.map.set('voc_sessions_v1', 'y'.repeat(70));
  let thrown: unknown;
  try {
    persistDatedRecords(
      storage,
      'voc_patrol_review_v1',
      [{ id: 'big', date: TODAY, note: 'z'.repeat(200) }],
      {
        retentionDays: [60, 3],
        siblingKeys: [],
        todayIso: TODAY,
      }
    );
  } catch (err) {
    thrown = err;
  }
  assert.ok(thrown instanceof Error);
  assert.match(thrown.message, /手機儲存空間不足/);
  assert.equal(thrown.message.includes('The quota has been exceeded.'), false);
  assert.equal(isLocalStorageQuotaError(thrown), true);
}

// 釋出快取時，未上傳的舊巡堂要留著。
{
  const storage = createWebKitStorage(8000);
  storage.map.set(
    'voc_patrol_records_v1',
    JSON.stringify([
      { id: 'p-old', date: '2026-01-01' },
      { id: 'p-pending', date: '2026-01-02' },
      { id: 'p-new', date: '2026-11-13' },
    ])
  );
  storage.map.set(
    'voc_patrol_pending_v1',
    JSON.stringify([{ op: 'put', record: { id: 'p-pending', date: '2026-01-02' } }])
  );
  relieveDatedCaches(storage, ['voc_patrol_records_v1'], 7, TODAY);
  const left = JSON.parse(storage.getItem('voc_patrol_records_v1') || '[]') as Dated[];
  assert.deepEqual(left.map((r) => r.id).sort(), ['p-new', 'p-pending']);
}

console.log('regression-local-storage-quota: ok');
