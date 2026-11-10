/**
 * 巡堂資格：
 * - 課間／室外／放學：僅組長／主任
 * - 段考：所有教師可選模式；一般教師僅能在「今天且為段考日」登錄
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

for (const title of ['專任教師', '導師', '科主任', '組長', '主任', '校長'] as const) {
  assert.equal(canAccessPatrolPortal({ title }), true);
  assert.equal(canPerformPatrolKind({ title }, 'exam'), true, `${title} 應可選段考巡堂`);
}

assert.equal(canPerformPatrolKind({ title: '專任教師' }, 'class'), false);
assert.equal(canPerformPatrolKind({ title: '組長' }, 'class'), true);

const examDays = [{ date: '2026-11-12' }, { date: '2026-11-13' }];
assert.equal(isConfiguredExamDay('2026-11-12', examDays), true);
assert.equal(isConfiguredExamDay('2026-11-10', examDays), false);

assert.equal(
  canRecordPatrolOnDate({
    teacher: { title: '專任教師' },
    kind: 'exam',
    isoDate: '2026-11-12',
    examDays,
    todayIso: '2026-11-12',
  }),
  true,
  '一般教師：今天恰為段考日可登錄'
);
assert.equal(
  canRecordPatrolOnDate({
    teacher: { title: '專任教師' },
    kind: 'exam',
    isoDate: '2026-11-13',
    examDays,
    todayIso: '2026-11-10',
  }),
  false,
  '一般教師：非段考時期改選未來段考日不可登錄'
);
assert.equal(
  canRecordPatrolOnDate({
    teacher: { title: '專任教師' },
    kind: 'exam',
    isoDate: '2026-11-12',
    examDays,
    todayIso: '2026-11-13',
  }),
  false,
  '一般教師：不可補登過去段考日（僅限今天）'
);
assert.equal(
  canRecordPatrolOnDate({
    teacher: { title: '科主任' },
    kind: 'exam',
    isoDate: '2026-11-10',
    examDays,
    todayIso: '2026-11-10',
  }),
  false,
  '一般教師：今天非段考日不可登錄'
);
assert.equal(
  canRecordPatrolOnDate({
    teacher: { title: '主任' },
    kind: 'exam',
    isoDate: '2026-11-10',
    examDays,
    todayIso: '2026-11-10',
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
    todayIso: '2026-11-12',
  }),
  false,
  '一般教師即使段考日也不可課間巡堂'
);

console.log('regression-patrol-eligibility: ok');
