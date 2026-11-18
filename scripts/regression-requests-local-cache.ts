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
  freeRequestsLocalBodyKeepingMeta,
  persistRequestsLocalCache,
  retainRecentRequestsForLocalCache,
  resolveDisplayedCaseCount,
  resolveDisplayedNoticeCount,
  shouldBlockCloudPushForTruncatedRequests,
} from '../src/utils/requestsLocalCache';
import { persistSchoolLocalJson } from '../src/utils/localStorageQuota';

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
  // 手機：空間夠放最近幾筆時，應留最近內容＋正確總筆數，且不動巡堂
  const recentKeep = 15;
  const bulky = many.map((r) => ({ ...r, reason: 'y'.repeat(80) }));
  const recentPayloadLen = JSON.stringify(
    retainRecentRequestsForLocalCache(bulky, recentKeep)
  ).length;
  const fullLen = JSON.stringify(bulky).length;
  assert.ok(fullLen > recentPayloadLen + 2_000, '完整應明顯大於最近幾筆');
  const patrolJson = JSON.stringify(
    Array.from({ length: 20 }, (_, i) => ({ id: `p${i}`, date: '2025-01-01', note: 'n'.repeat(120) }))
  );
  // 配額 = 巡堂 + 最近通知單 + meta 餘裕；完整內容放不下
  const storage = createWebKitStorage(patrolJson.length + recentPayloadLen + 800);
  storage.map.set('voc_patrol_records_v1', patrolJson);
  assert.ok(
    patrolJson.length + fullLen > patrolJson.length + recentPayloadLen + 800,
    '完整＋巡堂應超過配額'
  );
  const result = persistRequestsLocalCache(storage, 'voc_requests_v1', bulky, {
    allowCountOnly: true,
  });
  assert.equal(result.ok, true);
  assert.equal(result.truncated, true);
  assert.ok(result.retained.length > 0, '應留下最近通知單內容');
  assert.ok(result.retained.length < bulky.length);
  assert.equal(result.meta.totalCount, bulky.length);
  assert.equal(result.meta.noticeCount, buildRequestsLocalMeta(bulky).noticeCount);
  assert.ok(storage.getItem('voc_requests_v1'));
  assert.equal(storage.getItem('voc_patrol_records_v1'), patrolJson);
}

{
  // 手機：連最近幾筆都放不下時，僅留正確總筆數，仍保留巡堂
  const storage = createWebKitStorage(6_000);
  const patrolJson = JSON.stringify(
    Array.from({ length: 20 }, (_, i) => ({ id: `p${i}`, date: '2025-01-01', note: 'n'.repeat(120) }))
  );
  storage.map.set('voc_patrol_records_v1', patrolJson);
  const huge = many.map((r) => ({ ...r, reason: 'z'.repeat(200) }));
  assert.ok(JSON.stringify(huge).length > 8000);
  const result = persistRequestsLocalCache(storage, 'voc_requests_v1', huge, {
    allowCountOnly: true,
  });
  assert.equal(result.ok, true);
  assert.equal(result.truncated, true);
  assert.equal(result.retained.length, 0);
  assert.equal(result.meta.totalCount, huge.length);
  assert.equal(storage.getItem('voc_requests_v1'), null);
  assert.ok(storage.getItem('voc_requests_meta_v1'));
  assert.equal(storage.getItem('voc_patrol_records_v1'), patrolJson);
  assert.match(REQUESTS_LOCAL_TRUNCATED_HINT, /筆數/);
}

{
  // 電腦：應清巡堂暫存後寫入完整通知單
  const desktopSet = many.slice(0, 20).map((r) => ({ ...r, reason: 'desk' }));
  const fullLen = JSON.stringify(desktopSet).length;
  const storage = createWebKitStorage(fullLen + 800);
  storage.map.set(
    'voc_patrol_records_v1',
    JSON.stringify(
      Array.from({ length: 30 }, (_, i) => ({ id: `p${i}`, date: '2025-01-01', note: 'n'.repeat(80) }))
    )
  );
  assert.ok(
    fullLen + storage.getItem('voc_patrol_records_v1')!.length > fullLen + 800,
    '合計應超過配額，迫使先清巡堂'
  );
  const result = persistRequestsLocalCache(storage, 'voc_requests_v1', desktopSet, {
    allowCountOnly: false,
  });
  assert.equal(result.ok, true, '電腦應寫入成功');
  assert.equal(result.truncated, false, '電腦應為完整內容');
  assert.equal(result.retained.length, desktopSet.length);
  assert.ok(storage.getItem('voc_requests_v1'));
  const patrolLeft = storage.getItem('voc_patrol_records_v1');
  assert.ok(
    patrolLeft == null || patrolLeft === '[]',
    '電腦可精簡／清空巡堂暫存以保住完整通知單'
  );
  assert.ok(REQUEST_CACHE_KEEP_LIMITS.length > 0);
}

{
  // 騰位刪 body 時必須標 truncated，筆數仍正確，並擋推送
  const storage = createWebKitStorage(200_000);
  const full = many.slice(0, 12);
  const written = persistRequestsLocalCache(storage, 'voc_requests_v1', full, {
    allowCountOnly: true,
  });
  assert.equal(written.ok, true);
  assert.equal(written.truncated, false);
  const meta = freeRequestsLocalBodyKeepingMeta(storage, 'voc_requests_v1');
  assert.ok(meta);
  assert.equal(meta!.truncated, true);
  assert.equal(meta!.retainedCount, 0);
  assert.equal(meta!.totalCount, full.length);
  assert.equal(meta!.noticeCount, buildRequestsLocalMeta(full).noticeCount);
  assert.equal(storage.getItem('voc_requests_v1'), null);
  assert.equal(resolveDisplayedNoticeCount([], meta), meta!.noticeCount);
  assert.equal(shouldBlockCloudPushForTruncatedRequests([], meta), true);
}

{
  // 手機寫入課表騰位：刪通知單 body 後仍可用 callback 保住 meta 筆數
  const notices = many.slice(0, 10).map((r) => ({ ...r, reason: 'n'.repeat(100) }));
  const noticeJson = JSON.stringify(notices);
  const sessionsJson = JSON.stringify({ sessions: 's'.repeat(noticeJson.length) });
  const storage = createWebKitStorage(noticeJson.length + 900);
  storage.map.set('voc_requests_v1', noticeJson);
  storage.map.set(
    'voc_requests_meta_v1',
    JSON.stringify(buildRequestsLocalMeta(notices, { truncated: false }))
  );
  let freedMeta: ReturnType<typeof freeRequestsLocalBodyKeepingMeta> = null;
  const ok = persistSchoolLocalJson(storage, 'voc_sessions_v1', JSON.parse(sessionsJson), {
    preferPatrolOverNotices: true,
    requestsKey: 'voc_requests_v1',
    freeRequestsBody: (s, key) => {
      freedMeta = freeRequestsLocalBodyKeepingMeta(s, key);
    },
  });
  assert.equal(ok, true);
  assert.equal(storage.getItem('voc_requests_v1'), null);
  assert.ok(freedMeta?.truncated);
  assert.equal(freedMeta!.noticeCount, buildRequestsLocalMeta(notices).noticeCount);
  assert.equal(shouldBlockCloudPushForTruncatedRequests([], freedMeta), true);
}

{
  // 電腦：配額仍不夠時不可降級成截斷成功
  const desktopHuge = many.map((r) => ({ ...r, reason: 'D'.repeat(400) }));
  const storage = createWebKitStorage(2_000);
  const result = persistRequestsLocalCache(storage, 'voc_requests_v1', desktopHuge, {
    allowCountOnly: false,
  });
  assert.equal(result.ok, false);
  assert.equal(result.truncated, false);
  assert.ok(REQUEST_CACHE_KEEP_LIMITS.length > 0);
}

console.log('regression-requests-local-cache: ok');
