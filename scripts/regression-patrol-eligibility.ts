/**
 * 巡堂資格：
 * - 課間／室外／放學：僅組長／主任
 * - 段考：所有教師可選模式；一般教師僅能在段考日登錄
 * 執行：npx tsx scripts/regression-patrol-eligibility.ts
 */
import assert from 'node:assert/strict';
import {
  canAccessPatrolPortal,
  canPerformFullPatrol,
  canPerformPatrolKind,
  canRecordPatrolOnDate,
  isConfiguredExamDay,
  PATROL_FULL_ELIGIBLE_TITLES,
} from '../src/utils/patrolConfig';

assert.deepEqual(PATROL_FULL_ELIGIBLE_TITLES, ['組長', '主任']);

assert.equal(canPerformFullPatrol({ title: '組長' }), true);
assert.equal(canPerformFullPatrol({ title: '主任' }), true);
assert.equal(canPerformFullPatrol({ title: '科主任' }), false, '科主任不可一般巡堂');
assert.equal(canPerformFullPatrol({ title: '專任教師' }), false);
assert.equal(canPerformFullPatrol({ title: '導師' }), false);
assert.equal(canPerformFullPatrol({ title: '校長' }), false);

for (const title of ['專任教師', '導師', '科主任', '組長', '主任', '校長'] as const) {
  assert.equal(canAccessPatrolPortal({ title }), true);
  assert.equal(canPerformPatrolKind({ title }, 'exam'), true, `${title} 應可選段考巡堂`);
}

assert.equal(canPerformPatrolKind({ title: '專任教師' }, 'class'), false);
assert.equal(canPerformPatrolKind({ title: '科主任' }, 'outdoor'), false);
assert.equal(canPerformPatrolKind({ title: '導師' }, 'after_school'), false);
assert.equal(canPerformPatrolKind({ title: '組長' }, 'class'), true);
assert.equal(canPerformPatrolKind({ title: '主任' }, 'after_school'), true);
assert.equal(canAccessPatrolPortal(null), false);
assert.equal(canPerformPatrolKind(null, 'exam'), false);

const examDays = [{ date: '2026-11-12' }, { date: '2026-11-13' }];
assert.equal(isConfiguredExamDay('2026-11-12', examDays), true);
assert.equal(isConfiguredExamDay('2026-11-10', examDays), false);
assert.equal(isConfiguredExamDay('2026-11-12', []), false);

assert.equal(
  canRecordPatrolOnDate({
    teacher: { title: '專任教師' },
    kind: 'exam',
    isoDate: '2026-11-12',
    examDays,
  }),
  true,
  '一般教師於段考日可登錄段考巡堂'
);
assert.equal(
  canRecordPatrolOnDate({
    teacher: { title: '科主任' },
    kind: 'exam',
    isoDate: '2026-11-10',
    examDays,
  }),
  false,
  '一般教師非段考日不可登錄'
);
assert.equal(
  canRecordPatrolOnDate({
    teacher: { title: '主任' },
    kind: 'exam',
    isoDate: '2026-11-10',
    examDays,
  }),
  true,
  '主任段考巡堂不限段考日'
);
assert.equal(
  canRecordPatrolOnDate({
    teacher: { title: '專任教師' },
    kind: 'class',
    isoDate: '2026-11-12',
    examDays,
  }),
  false,
  '一般教師即使段考日也不可課間巡堂'
);

console.log('regression-patrol-eligibility: ok');
