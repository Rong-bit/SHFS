/**
 * 教室日誌週彙整：教學組長／教務主任核章、退回、未完成篩選與通知信。
 * 執行：npx tsx scripts/regression-class-log-review.ts
 */
import assert from 'node:assert/strict';
import type {
  AcademicStaff,
  ClassLogEntry,
  ClassLogReturn,
  CourseSession,
  DayOfWeek,
} from '../src/types';
import {
  applyClassLogWeekSignOff,
  buildClassLogReminderEmail,
  buildClassLogReturn,
  buildClassLogSignOff,
  classLogContentIssue,
  classLogDutyStatus,
  classLogReviewRole,
  classLogWeekReviewId,
  formatClassLogGapLine,
  groupClassLogWeekByClass,
  listClassLogWeekDuties,
  listTeachersPendingClassLogStamp,
  returnClearedByResubmit,
  schoolWeekOf,
  shiftSchoolWeek,
  weekStampState,
} from '../src/utils/classLogReview';

const staff = (
  title: string,
  id = 's1',
  name = '某人'
): Pick<AcademicStaff, 'id' | 'name' | 'title'> => ({ id, name, title });

assert.equal(classLogReviewRole(staff('教務主任')), 'academic_dean');
assert.equal(classLogReviewRole(staff('教師兼教務主任')), 'academic_dean');
assert.equal(classLogReviewRole(staff('教學組長')), 'teaching_leader');
assert.equal(classLogReviewRole(staff('教師兼教學組長')), 'teaching_leader');
assert.equal(classLogReviewRole(staff('教學組組員 (幹事)')), null);
assert.equal(classLogReviewRole(staff('教學組助理')), null);
assert.equal(classLogReviewRole(null), null);

assert.equal(classLogContentIssue(''), 'empty');
assert.equal(classLogContentIssue('   '), 'empty');
assert.equal(classLogContentIssue('無'), 'incomplete');
assert.equal(classLogContentIssue('同上。'), 'incomplete');
assert.equal(classLogContentIssue('ok'), 'incomplete');
assert.equal(classLogContentIssue('複習'), null);
assert.equal(classLogContentIssue('完成第三章習題講解'), null);

const week = schoolWeekOf('2026-11-11');
assert.deepEqual(week, { weekStart: '2026-11-09', weekEnd: '2026-11-13' });
assert.deepEqual(schoolWeekOf('2026-11-15'), week, '週末應落在該週週一至週五');
assert.deepEqual(shiftSchoolWeek(week.weekStart, 1), {
  weekStart: '2026-11-16',
  weekEnd: '2026-11-20',
});
assert.equal(
  classLogWeekReviewId('2026-11-09', '機二 忠'),
  '2026-11-09__機二-忠'
);

const leader = buildClassLogSignOff(staff('教學組長', 'leader', '陳雅筑'), 'teaching_leader', '2026-11-13T01:00:00.000Z');
const dean = buildClassLogSignOff(staff('教務主任', 'dean', '吳教務'), 'academic_dean', '2026-11-13T02:00:00.000Z');
assert.equal(leader.stampCaption, '教師兼教學組長');
assert.equal(dean.stampCaption, '教師兼教務主任');

const afterLeader = applyClassLogWeekSignOff(undefined, leader, {
  weekStart: week.weekStart,
  weekEnd: week.weekEnd,
  className: '機二忠',
  now: leader.stampedAt,
});
const both = applyClassLogWeekSignOff(afterLeader, dean, {
  weekStart: week.weekStart,
  weekEnd: week.weekEnd,
  className: '機二忠',
  now: dean.stampedAt,
});
assert.deepEqual(
  both.signOffs.map((s) => s.role),
  ['teaching_leader', 'academic_dean']
);
assert.equal(both.date, week.weekStart);
assert.equal(weekStampState(both).complete, true);

const leaderAgain = buildClassLogSignOff(
  staff('教學組長', 'leader-2', '林組長'),
  'teaching_leader',
  '2026-11-13T03:00:00.000Z'
);
const replaced = applyClassLogWeekSignOff(both, leaderAgain, {
  weekStart: week.weekStart,
  weekEnd: week.weekEnd,
  className: '機二忠',
  now: leaderAgain.stampedAt,
});
assert.equal(replaced.signOffs.length, 2, '同身分重蓋只替換自己的章');
assert.equal(
  replaced.signOffs.find((s) => s.role === 'teaching_leader')?.personName,
  '林組長'
);
assert.equal(
  replaced.signOffs.find((s) => s.role === 'academic_dean')?.personName,
  '吳教務'
);

const deanFirst = applyClassLogWeekSignOff(undefined, dean, {
  weekStart: week.weekStart,
  weekEnd: week.weekEnd,
  className: '機二忠',
  now: dean.stampedAt,
});
const deanThenLeader = applyClassLogWeekSignOff(deanFirst, leader, {
  weekStart: week.weekStart,
  weekEnd: week.weekEnd,
  className: '機二忠',
  now: leader.stampedAt,
});
assert.equal(weekStampState(deanThenLeader).complete, true, '主任先蓋、組長後蓋也算雙章完成');

function session(partial: {
  id: string;
  period: number;
  dayOfWeek: DayOfWeek;
  className: string;
  teacherId: string;
  teacherName: string;
  subjectName?: string;
}): CourseSession {
  return {
    id: partial.id,
    dayOfWeek: partial.dayOfWeek,
    period: partial.period,
    className: partial.className,
    subjectName: partial.subjectName ?? '電路',
    teacherId: partial.teacherId,
    teacherName: partial.teacherName,
    venueId: 'v1',
    venueName: '忠孝301',
    isPractical: false,
    isConcurrent: false,
  };
}

const sessions: CourseSession[] = [
  session({
    id: 's-done',
    period: 1,
    dayOfWeek: 1,
    className: '機二忠',
    teacherId: 't-done',
    teacherName: '已完成',
  }),
  session({
    id: 's-short',
    period: 2,
    dayOfWeek: 1,
    className: '機二忠',
    teacherId: 't-short',
    teacherName: '寫太短',
  }),
  session({
    id: 's-miss',
    period: 3,
    dayOfWeek: 2,
    className: '機二孝',
    teacherId: 't-miss',
    teacherName: '沒填',
  }),
  session({
    id: 's-back',
    period: 4,
    dayOfWeek: 3,
    className: '機二忠',
    teacherId: 't-back',
    teacherName: '被退回',
  }),
];

const entry = (partial: Partial<ClassLogEntry> & Pick<ClassLogEntry, 'id' | 'date' | 'period' | 'sessionId' | 'progress' | 'authorTeacherId' | 'authorTeacherName'>): ClassLogEntry => ({
  dayOfWeek: 1,
  className: '機二忠',
  subjectName: '電路',
  venueName: '忠孝301',
  originalTeacherId: partial.authorTeacherId,
  originalTeacherName: partial.authorTeacherName,
  isSubstituteFill: false,
  stampedAt: '2026-11-09T01:00:00.000Z',
  stampCaption: '教師',
  createdAt: '2026-11-09T01:00:00.000Z',
  updatedAt: '2026-11-09T01:00:00.000Z',
  ...partial,
});

const entries: ClassLogEntry[] = [
  entry({
    id: '2026-11-09_1_s-done',
    date: '2026-11-09',
    period: 1,
    sessionId: 's-done',
    progress: '完成歐姆定律例題',
    authorTeacherId: 't-done',
    authorTeacherName: '已完成',
  }),
  entry({
    id: '2026-11-09_2_s-short',
    date: '2026-11-09',
    period: 2,
    sessionId: 's-short',
    progress: '無',
    authorTeacherId: 't-short',
    authorTeacherName: '寫太短',
  }),
  entry({
    id: '2026-11-11_4_s-back',
    date: '2026-11-11',
    period: 4,
    sessionId: 's-back',
    progress: '上到串聯電路',
    authorTeacherId: 't-back',
    authorTeacherName: '被退回',
    updatedAt: '2026-11-11T01:00:00.000Z',
  }),
];

const returned: ClassLogReturn = {
  id: '2026-11-11_4_s-back',
  date: '2026-11-11',
  period: 4,
  dayOfWeek: 3,
  sessionId: 's-back',
  className: '機二忠',
  subjectName: '電路',
  holderTeacherId: 't-back',
  holderTeacherName: '被退回',
  reason: '請寫明習題範圍',
  actorId: 'dean',
  actorName: '吳教務',
  actorTitle: '教務主任',
  actorRole: 'academic_dean',
  createdAt: '2026-11-11T02:00:00.000Z',
  updatedAt: '2026-11-11T02:00:00.000Z',
};

const rows = listClassLogWeekDuties({
  weekStart: week.weekStart,
  weekEnd: week.weekEnd,
  sessions,
  requests: [],
  entries,
  returns: [returned],
});
const byId = new Map(rows.map((r) => [r.duty.slot.sessionId, r]));
assert.equal(byId.get('s-done')?.status, 'complete');
assert.equal(byId.get('s-short')?.status, 'incomplete');
assert.equal(byId.get('s-miss')?.status, 'missing');
assert.equal(byId.get('s-back')?.status, 'returned');

const classes = groupClassLogWeekByClass(rows);
const loyal = classes.find((c) => c.className === '機二忠');
const filial = classes.find((c) => c.className === '機二孝');
assert.ok(loyal && filial);
assert.equal(loyal.pendingCount, 2);
assert.equal(filial.pendingCount, 1);

const pending = listTeachersPendingClassLogStamp(rows, [
  { id: 't-done', name: '已完成', email: 'done@school.edu' },
  { id: 't-short', name: '寫太短', email: 'short@school.edu' },
  { id: 't-miss', name: '沒填', email: '' },
  { id: 't-back', name: '被退回', email: 'back@school.edu' },
]);
assert.deepEqual(
  pending.map((t) => t.teacherId).sort(),
  ['t-back', 't-miss', 't-short']
);
assert.equal(pending.find((t) => t.teacherId === 't-miss')?.email, '');

const mail = buildClassLogReminderEmail({
  schoolName: '高雄市立中正高工',
  weekStart: week.weekStart,
  weekEnd: week.weekEnd,
  teacherName: '沒填<script>',
  gaps: [byId.get('s-miss')!],
});
assert.match(mail.subject, /2026-11-09～2026-11-13/);
assert.match(mail.text, /尚未填寫教學內容/);
assert.doesNotMatch(mail.text, /寫太短/);
assert.match(mail.html, /沒填&lt;script&gt;/);
assert.doesNotMatch(mail.html, /<script>/);
assert.match(formatClassLogGapLine(byId.get('s-back')!), /請寫明習題範圍/);

assert.equal(
  returnClearedByResubmit({
    previous: entries[2],
    nextProgress: '上到串聯電路',
    nextAssessment: '',
    nextNote: '',
  }),
  false,
  '內容沒改不應解除退回'
);
assert.equal(
  returnClearedByResubmit({
    previous: entries[2],
    nextProgress: '上到串聯電路，習題 1～5',
  }),
  true
);
assert.equal(
  returnClearedByResubmit({
    previous: entries[2],
    nextProgress: '無',
  }),
  false
);
assert.equal(returnClearedByResubmit({ nextProgress: '完成歐姆定律例題' }), true);

const stale = classLogDutyStatus({
  entry: { ...entries[2], progress: '已補習題範圍說明', updatedAt: '2026-11-11T03:00:00.000Z' },
  returned,
});
assert.equal(stale, 'complete', '退回之後已改成完整內容，應視為完成');

const rebuilt = buildClassLogReturn({
  row: byId.get('s-miss')!,
  reason: '  請補登  ',
  staff: staff('教學組長', 'leader', '陳雅筑'),
  role: 'teaching_leader',
  now: '2026-11-13T04:00:00.000Z',
});
assert.equal(rebuilt.reason, '請補登');
assert.equal(rebuilt.actorRole, 'teaching_leader');
assert.equal(rebuilt.id, '2026-11-10_3_s-miss');

console.log('regression-class-log-review: ok');
