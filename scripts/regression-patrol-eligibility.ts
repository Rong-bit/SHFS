/**
 * 巡堂資格：僅組長／主任；科主任等不可。
 * 執行：npx tsx scripts/regression-patrol-eligibility.ts
 */
import assert from 'node:assert/strict';
import { canPerformPatrol, PATROL_ELIGIBLE_TITLES } from '../src/utils/patrolConfig';

assert.deepEqual(PATROL_ELIGIBLE_TITLES, ['組長', '主任']);

assert.equal(canPerformPatrol({ title: '組長' }), true);
assert.equal(canPerformPatrol({ title: '主任' }), true);
assert.equal(canPerformPatrol({ title: '科主任' }), false, '科主任無巡堂資格');
assert.equal(canPerformPatrol({ title: '導師' }), false);
assert.equal(canPerformPatrol({ title: '專任教師' }), false);
assert.equal(canPerformPatrol({ title: '校長' }), false);
assert.equal(canPerformPatrol(null), false);
assert.equal(canPerformPatrol({ title: '' }), false);

console.log('regression-patrol-eligibility: ok');
