/**
 * 回歸：會辦並行核章 signOffs 合併
 */
import assert from 'node:assert/strict';
import type { PatrolReviewCase, PatrolSignOff } from '../src/types';
import { mergePatrolReviewCases } from '../src/utils/patrolReviewSync';

const base = {
  id: 'review_1',
  recordId: 'r1',
  date: '2026-10-14',
  kind: 'class' as const,
  roomId: 'rm',
  roomName: '301',
  building: 'A',
  floor: '3F',
  issueSummary: '睡覺',
  note: '',
  patrollerId: 'p',
  patrollerName: '巡堂',
  recipients: [],
  createdAt: '2026-10-14T00:00:00.000Z',
};

const sign = (partial: Partial<PatrolSignOff> & Pick<PatrolSignOff, 'role' | 'personId'>): PatrolSignOff => ({
  personName: partial.personName || partial.personId,
  action: partial.action || '閱畢',
  stampedAt: partial.stampedAt || '2026-10-14T01:00:00.000Z',
  stampLabel: 'x',
  ...partial,
});

const a: PatrolReviewCase = {
  ...base,
  status: 'reviewed',
  signOffs: [sign({ role: 'academic', personId: 's1', personName: '教學', stampedAt: '2026-10-14T01:00:00.000Z' })],
  updatedAt: '2026-10-14T01:00:00.000Z',
};

const b: PatrolReviewCase = {
  ...base,
  status: 'reviewed',
  signOffs: [
    sign({ role: 'student_affairs', personId: 's2', personName: '生輔', stampedAt: '2026-10-14T01:05:00.000Z' }),
  ],
  updatedAt: '2026-10-14T01:05:00.000Z',
};

const merged = mergePatrolReviewCases(a, b);
assert.equal(merged.signOffs.length, 2);
assert.ok(merged.signOffs.some((s) => s.role === 'academic'));
assert.ok(merged.signOffs.some((s) => s.role === 'student_affairs'));

const archived = mergePatrolReviewCases(a, {
  ...b,
  status: 'archived',
  archivedAt: '2026-10-14T02:00:00.000Z',
  signOffs: [
    ...b.signOffs,
    sign({ role: 'principal', personId: 'p1', action: '校長核章', stampedAt: '2026-10-14T02:00:00.000Z' }),
  ],
});
assert.equal(archived.status, 'archived');
assert.equal(archived.signOffs.length, 3);

console.log('regression-patrol-review-merge: ok');
