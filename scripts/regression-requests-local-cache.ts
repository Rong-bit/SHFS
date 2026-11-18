/**
 * 回歸：手機配額不足時本機只留最近通知單，完整筆數進 meta，不刪雲端口徑。
 * 執行：npx tsx scripts/regression-requests-local-cache.ts
 */
import assert from 'node:assert/strict';
import { SubstituteRequest } from '../src/types';
import { type StorageLike } from '../src/utils/localStorageQuota';
import {
  REQUEST_CACHE_KEEP_LIMITS,
  REQUESTS_LOCAL_TRUNCATED_HINT,
  buildRequestsLocalMeta,
  persistRequestsLocalCache,
  retainRecentRequestsForLocalCache,
  resolveDisplayedCaseCount,
  resolveDisplayedNoticeCount,
  shouldBlockCloudPushForTruncatedRequests,
} from '../src/utils/requestsLocalCache';

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

function fakeRequest(
  id: string,
  opts: Partial<SubstituteRequest> & { stamp: string; approved?: boolean }
): SubstituteRequest {
  return {
    id,
    requestNumber: `115-1-${id}`,
    requestType: 'substitute',
    applicantTeacherId: 't1',
    applicantTeacherName: '甲',
    applicantDepartment: '電機科' as SubstituteRequest['applicantDepartment'],
    reason: 'x'.repeat(40),
    paymentType: 'public',
    originalSession: {
      id: `s-${id}`,
      teacherId: 't1',
      teacherName: '甲',
      className: '汽三甲',
      subjectName: '實習',
      dayOfWeek: 1,
      period: 2,
      venueId: 'v1',
      venueName: '工場',
    } as SubstituteRequest['originalSession'],
    status: opts.approved === false ? 'pending' : 'approved',
    clashStatus: 'ok',
    createdAt: opts.stamp,
    reviewedAt: opts.stamp,
    substituteTeacherId: `sub-${id}`,
    substituteTeacherName: '乙',
    ...opts,
  } as SubstituteRequest;
}

const many = Array.from({ length: 40 }, (_, i) =>
  fakeRequest(String(i).padStart(3, '0'), {
    stamp: `2026-11-${String((i % 28) + 1).padStart(2, '0')} 10:00`,
    approved: true,
  })
);

{
  const kept = retainRecentRequestsForLocalCache(many, 10);
  assert.ok(kept.length <= 15, '應約略壓到上限附近');
  assert.ok(kept.length < many.length, '應少於全部');
}

{
  const meta = buildRequestsLocalMeta(many, { truncated: true, retainedCount: 10 });
  assert.equal(meta.totalCount, 40);
  assert.equal(meta.noticeCount, resolveDisplayedNoticeCount(many, null));
  assert.equal(meta.truncated, true);
  assert.equal(resolveDisplayedNoticeCount(many.slice(0, 10), meta), meta.noticeCount);
  assert.equal(resolveDisplayedCaseCount(many.slice(0, 10), meta), meta.allCaseCount);
  assert.equal(shouldBlockCloudPushForTruncatedRequests(many.slice(0, 10), meta), true);
  assert.equal(shouldBlockCloudPushForTruncatedRequests(many, meta), false);
}

{
  const storage = createWebKitStorage(12_000);
  storage.map.set(
    'voc_patrol_records_v1',
    JSON.stringify(
      Array.from({ length: 30 }, (_, i) => ({ id: `p${i}`, date: '2025-01-01', note: 'n'.repeat(200) }))
    )
  );
  const huge = many.map((r) => ({ ...r, reason: 'z'.repeat(200) }));
  const fullJson = JSON.stringify(huge);
  assert.ok(fullJson.length > 8000, '測資應大到難以一次塞進配額');
  const result = persistRequestsLocalCache(storage, 'voc_requests_v1', huge);
  assert.equal(result.ok, true, '截斷後應寫入成功');
  assert.equal(result.meta.totalCount, huge.length);
  assert.ok(result.meta.noticeCount > 0);
  assert.equal(result.truncated, true, '應標記為本機截斷');
  assert.ok(result.retained.length < huge.length);
  assert.ok(result.retained.length <= REQUEST_CACHE_KEEP_LIMITS[0]);
  assert.match(REQUESTS_LOCAL_TRUNCATED_HINT, /未刪除/);
  assert.ok(storage.getItem('voc_requests_v1'));
  assert.ok(storage.getItem('voc_requests_meta_v1'));
  assert.equal(storage.getItem('voc_patrol_records_v1'), null, '應清掉可重建巡堂暫存');
}

console.log('regression-requests-local-cache: ok');
