/**
 * 回歸：本機已記同步時間戳但申請單未寫入時，首次拉取仍應套用雲端（修復手機通知單數量偏少）。
 * 執行：npx tsx scripts/regression-cloud-sync-stale-local.ts
 */
import assert from 'node:assert/strict';
import { shouldApplyRemoteSchoolData } from '../src/utils/cloudSync';
import {
  LOCAL_STORAGE_QUOTA_HINT,
  SCHOOL_LOCAL_CACHE_QUOTA_HINT,
  persistSchoolLocalJson,
  purgeShrinkableLocalCaches,
  type StorageLike,
} from '../src/utils/localStorageQuota';

assert.equal(
  shouldApplyRemoteSchoolData({
    remoteUpdatedAt: 100,
    localUpdatedAt: 50,
    isFirstFullPull: false,
  }),
  true,
  '遠端較新應套用'
);

assert.equal(
  shouldApplyRemoteSchoolData({
    remoteUpdatedAt: 100,
    localUpdatedAt: 100,
    isFirstFullPull: false,
  }),
  false,
  '後續輪詢時間戳相同不重抓'
);

assert.equal(
  shouldApplyRemoteSchoolData({
    remoteUpdatedAt: 100,
    localUpdatedAt: 100,
    isFirstFullPull: true,
  }),
  true,
  '首次完整拉取時間戳相同也要套用（癒合本機未寫入）'
);

assert.equal(
  shouldApplyRemoteSchoolData({
    remoteUpdatedAt: 100,
    localUpdatedAt: 200,
    isFirstFullPull: true,
  }),
  false,
  '遠端較舊不覆寫'
);

assert.equal(
  shouldApplyRemoteSchoolData({
    remoteUpdatedAt: 0,
    localUpdatedAt: 0,
    isFirstFullPull: true,
  }),
  false,
  '無遠端時間戳不套用'
);

function quotaError(): Error {
  const err = new Error('The quota has been exceeded.');
  err.name = 'QuotaExceededError';
  return err;
}

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

{
  const storage = createWebKitStorage(2500);
  storage.map.set(
    'voc_patrol_records_v1',
    JSON.stringify(
      Array.from({ length: 30 }, (_, i) => ({
        id: `p-${i}`,
        date: '2025-01-01',
        note: 'x'.repeat(60),
      }))
    )
  );
  const requests = Array.from({ length: 20 }, (_, i) => ({
    id: `r-${i}`,
    requestNumber: `A${i}`,
    status: 'approved',
  }));
  const ok = persistSchoolLocalJson(storage, 'voc_requests_v1', requests);
  assert.equal(ok, true, '應先清巡堂暫存後寫入申請單');
  assert.ok(storage.getItem('voc_requests_v1'));
}

{
  const storage = createWebKitStorage(80);
  storage.map.set('other', 'y'.repeat(70));
  const ok = persistSchoolLocalJson(storage, 'voc_requests_v1', {
    id: 'huge',
    payload: 'z'.repeat(200),
  });
  assert.equal(ok, false, '仍不足配額應回傳 false');
  assert.match(LOCAL_STORAGE_QUOTA_HINT, /手機儲存空間不足/);
  assert.match(SCHOOL_LOCAL_CACHE_QUOTA_HINT, /無法完整快取/);
  assert.match(SCHOOL_LOCAL_CACHE_QUOTA_HINT, /清除巡堂與日誌快取/);
}

{
  const storage = createWebKitStorage(500);
  storage.map.set(
    'voc_class_log_v1',
    JSON.stringify([{ id: '1', date: '2025-01-01', note: 'x'.repeat(200) }])
  );
  storage.map.set(
    'voc_patrol_records_v1',
    JSON.stringify([{ id: '2', date: '2025-01-01', note: 'y'.repeat(200) }])
  );
  const removed = purgeShrinkableLocalCaches(storage);
  assert.ok(removed >= 2, '應刪除可重建暫存');
  assert.equal(storage.getItem('voc_class_log_v1'), null);
  assert.equal(storage.getItem('voc_patrol_records_v1'), null);
  const ok = persistSchoolLocalJson(storage, 'voc_requests_v1', {
    id: 'r1',
    status: 'approved',
  });
  assert.equal(ok, true, '清空暫存後應可寫入申請單');
}

console.log('regression-cloud-sync-stale-local: ok');
