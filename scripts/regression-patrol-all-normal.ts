/**
 * 巡堂「一切正常」：只補尚未登錄的應巡教室，不覆寫已有缺失或已正常的紀錄。
 * 執行：npx tsx scripts/regression-patrol-all-normal.ts
 */
import assert from 'node:assert/strict';
import type { PatrolRecord, PatrolRoom } from '../src/types';
import {
  allTargetsAreNormal,
  isBlankNormalRecord,
  planAllNormalRooms,
} from '../src/utils/patrolAllNormal';

const room = (id: string): PatrolRoom => ({
  id,
  building: '教學大樓',
  floor: '1F',
  name: id,
  homeroomClass: id,
  order: 0,
});

const rec = (partial: Partial<PatrolRecord> & Pick<PatrolRecord, 'roomId'>): PatrolRecord => ({
  id: partial.id || `rec-${partial.roomId}`,
  date: '2026-11-16',
  kind: 'class',
  period: 1,
  roomName: partial.roomId,
  building: '教學大樓',
  floor: '1F',
  observations: [],
  checks: {},
  note: '',
  patrollerId: 't1',
  patrollerName: '巡堂者',
  createdAt: '2026-11-16T01:00:00.000Z',
  ...partial,
});

const rooms = [room('甲'), room('乙'), room('丙'), room('丁')];
const byRoom = new Map<string, PatrolRecord[]>([
  ['乙', [rec({ roomId: '乙', observations: ['sleep'] })]],
  ['丙', [rec({ roomId: '丙' })]],
  ['丁', [rec({ roomId: '丁', patrollerId: 'other', note: '已看過' })]],
]);

const plan = planAllNormalRooms(rooms, byRoom);
assert.deepEqual(
  plan.toMark.map((r) => r.id),
  ['甲'],
  '只補完全沒紀錄的教室'
);
assert.deepEqual(
  plan.skippedIssue.map((r) => r.id),
  ['乙'],
  '已有缺失不覆寫'
);
assert.deepEqual(
  plan.alreadyNormal.map((r) => r.id),
  ['丙', '丁'],
  '已正常（含他人紀錄）不重複登錄'
);
assert.equal(allTargetsAreNormal(rooms, byRoom), false);
assert.equal(allTargetsAreNormal([room('丙')], byRoom), true);
assert.equal(allTargetsAreNormal([], byRoom), false);

assert.equal(isBlankNormalRecord(rec({ roomId: '甲' })), true);
assert.equal(isBlankNormalRecord(rec({ roomId: '甲', note: '後門已鎖' })), false);
assert.equal(isBlankNormalRecord(rec({ roomId: '甲', observations: ['phone'] })), false);
assert.equal(
  isBlankNormalRecord(
    rec({
      roomId: '甲',
      kind: 'after_school',
      checks: { light: true, door: false },
    })
  ),
  false
);
assert.equal(
  isBlankNormalRecord(
    rec({
      roomId: '甲',
      kind: 'outdoor',
      checks: { light: true, door: true },
    })
  ),
  true
);

const none = planAllNormalRooms([room('甲'), room('乙')], new Map());
assert.deepEqual(
  none.toMark.map((r) => r.id),
  ['甲', '乙']
);
assert.equal(allTargetsAreNormal([room('甲'), room('乙')], new Map()), false);

console.log('regression-patrol-all-normal: ok');
