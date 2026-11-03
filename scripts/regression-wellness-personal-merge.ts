/**
 * 身心調適假日數併入事假累計：影響事假公費日序；身心調適假本身仍一律公費。
 * 執行：npx tsx scripts/regression-wellness-personal-merge.ts
 */
import assert from 'node:assert/strict';
import type { CourseSession, SubstituteRequest } from '../src/types';
import { INITIAL_SYSTEM_CONFIG } from '../src/data/mockData';
import {
  buildLeavePayrollContext,
  collectPersonalLeaveDatesInAcademicYear,
  isAlwaysPublicLeaveType,
  isLeaveDatePublicPayroll,
  isPersonalLeaveDatePublicPayroll,
  personalLeaveDayRank,
} from '../src/utils/leavePayrollPolicy';

const session: CourseSession = {
  id: 's-merge',
  dayOfWeek: 1,
  period: 1,
  className: '電機一甲',
  subjectName: '電路',
  teacherId: 't-a',
  teacherName: '請假甲',
  venueId: 'v1',
  venueName: '教室',
  isPractical: false,
  isConcurrent: false,
};

function makeReq(
  partial: Pick<
    SubstituteRequest,
    'id' | 'requestNumber' | 'leaveType' | 'leaveDateStart' | 'leaveDateEnd' | 'reason'
  >
): SubstituteRequest {
  return {
    requestType: 'substitute',
    applicantTeacherId: 't-a',
    applicantTeacherName: '請假甲',
    applicantDepartment: '電機科',
    paymentType: 'public',
    substituteTeacherId: 't-b',
    substituteTeacherName: '代課乙',
    originalSession: session,
    status: 'approved',
    createdAt: '2026-09-01 09:00',
    reviewedAt: '2026-09-01 10:00',
    clashStatus: { hasClash: false, severity: 'none', messages: [] },
    ...partial,
  };
}

// 3 日身心調適假（9/1–9/3）
const wellnessDays = ['2026-09-01', '2026-09-02', '2026-09-03'].map((d, i) =>
  makeReq({
    id: `r-w-${i}`,
    requestNumber: `115-1-04${10 + i}`,
    leaveType: 'wellness',
    reason: '身心調適',
    leaveDateStart: d,
    leaveDateEnd: d,
  })
);

// 之後 5 日事假（9/8–9/12）→ 累計第 4～8 日
const personalDays = [
  '2026-09-08',
  '2026-09-09',
  '2026-09-10',
  '2026-09-11',
  '2026-09-12',
].map((d, i) =>
  makeReq({
    id: `r-p-${i}`,
    requestNumber: `115-1-05${10 + i}`,
    leaveType: 'personal',
    reason: '事假',
    leaveDateStart: d,
    leaveDateEnd: d,
  })
);

const all = [...wellnessDays, ...personalDays];
const ctx = buildLeavePayrollContext(all, {
  ...INITIAL_SYSTEM_CONFIG,
  academicYear: '115',
});

const sorted = collectPersonalLeaveDatesInAcademicYear(ctx, 't-a');
assert.deepEqual(
  sorted,
  [
    '2026-09-01',
    '2026-09-02',
    '2026-09-03',
    '2026-09-08',
    '2026-09-09',
    '2026-09-10',
    '2026-09-11',
    '2026-09-12',
  ],
  '事假累計應含身心調適假曆日'
);

assert.equal(personalLeaveDayRank('2026-09-08', sorted), 4, '第一個事假日＝累計第 4 日');
assert.equal(personalLeaveDayRank('2026-09-11', sorted), 7, '第四個事假日＝累計第 7 日');
assert.equal(personalLeaveDayRank('2026-09-12', sorted), 8, '第五個事假日＝累計第 8 日');

assert.equal(
  isPersonalLeaveDatePublicPayroll('2026-09-11', sorted),
  false,
  '累計第 7 日事假仍自費'
);
assert.equal(
  isPersonalLeaveDatePublicPayroll('2026-09-12', sorted),
  true,
  '累計第 8 日事假改公費'
);

const personalOnDay7 = personalDays[3];
const personalOnDay8 = personalDays[4];
assert.equal(
  isLeaveDatePublicPayroll('2026-09-11', personalOnDay7, ctx, 't-a'),
  false,
  '事假累計第 7 日不公費'
);
assert.equal(
  isLeaveDatePublicPayroll('2026-09-12', personalOnDay8, ctx, 't-a'),
  true,
  '事假累計第 8 日公費'
);

// 身心調適假本身一律公費（不因併入事假而改自費）
assert.equal(isAlwaysPublicLeaveType('wellness'), true);
assert.equal(
  isLeaveDatePublicPayroll('2026-09-01', wellnessDays[0], ctx, 't-a'),
  true,
  '身心調適假單日仍公費'
);

// 同曆日 personal + wellness 不重複計日
const sameDay = [
  makeReq({
    id: 'r-same-w',
    requestNumber: '115-1-0600',
    leaveType: 'wellness',
    reason: '身心調適',
    leaveDateStart: '2026-10-01',
    leaveDateEnd: '2026-10-01',
  }),
  makeReq({
    id: 'r-same-p',
    requestNumber: '115-1-0601',
    leaveType: 'personal',
    reason: '事假',
    leaveDateStart: '2026-10-01',
    leaveDateEnd: '2026-10-01',
  }),
];
const sameCtx = buildLeavePayrollContext(sameDay, {
  ...INITIAL_SYSTEM_CONFIG,
  academicYear: '115',
});
const sameSorted = collectPersonalLeaveDatesInAcademicYear(sameCtx, 't-a');
assert.deepEqual(sameSorted, ['2026-10-01'], '同曆日不重複計入事假累計');

console.log('wellness personal-merge checks passed', {
  sortedLength: sorted.length,
  day8Public: true,
});
