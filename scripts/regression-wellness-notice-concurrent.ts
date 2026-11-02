/**
 * 身心調適假超鐘點：即使通知單已儲存且兼課列未改，代課人仍入代課清冊（不漏算、不走兼課轉移）。
 * 執行：npx tsx scripts/regression-wellness-notice-concurrent.ts
 */
import assert from 'node:assert/strict';
import type { CourseSession, SubstituteRequest } from '../src/types';
import { INITIAL_SYSTEM_CONFIG } from '../src/data/mockData';
import {
  buildLeavePayrollContext,
  countApplicantConcurrentDeductPeriodsInMonth,
  countSubstituteTeacherConcurrentAddPeriodsInMonth,
} from '../src/utils/leavePayrollPolicy';
import {
  countSubstitutePayrollWithNoticeRows,
  getRelatedSubstituteRequests,
  noticeDateUsesModifiedSubstitutePayroll,
  resolveEffectiveNoticeRows,
} from '../src/utils/noticePayroll';
import { buildConcurrentPayrollRemarks } from '../src/utils/overloadPayrollRegister';
import { buildSubstitutePayrollRemarks } from '../src/utils/substitutePayrollRegister';

const session: CourseSession = {
  id: 's-wellness-notice',
  dayOfWeek: 3, // 2026-10-07 星期三
  period: 2,
  className: '電機二甲',
  subjectName: '專題製作',
  teacherId: 't-a',
  teacherName: '請假甲',
  venueId: 'v1',
  venueName: '教室',
  isPractical: false,
  isConcurrent: true,
};

const wellnessSavedUnmodified: SubstituteRequest = {
  id: 'r-wellness-notice',
  requestNumber: '115-1-0300',
  requestType: 'substitute',
  applicantTeacherId: 't-a',
  applicantTeacherName: '請假甲',
  applicantDepartment: '電機科',
  reason: '身心調適',
  leaveType: 'wellness',
  paymentType: 'public',
  leaveDateStart: '2026-10-07',
  leaveDateEnd: '2026-10-07',
  substituteTeacherId: 't-b',
  substituteTeacherName: '代課乙',
  originalSession: session,
  status: 'approved',
  createdAt: '2026-10-01 09:00',
  reviewedAt: '2026-10-02 10:00',
  clashStatus: { hasClash: false, severity: 'none', messages: [] },
  noticeRowsCustomized: true,
  noticeRows: [
    {
      date: '2026/10/7', // 與 buildDefaultNoticeRowsFromRequests 格式一致
      weekday: '3',
      period: '2',
      className: '電機二甲',
      subjectName: '專題製作',
      hours: '兼課',
    },
  ],
};

const reqs = [wellnessSavedUnmodified];
const ctx = buildLeavePayrollContext(reqs, INITIAL_SYSTEM_CONFIG);
const effective = resolveEffectiveNoticeRows(wellnessSavedUnmodified, reqs);
assert.ok(effective, '應有已存通知單列');

assert.equal(
  noticeDateUsesModifiedSubstitutePayroll(wellnessSavedUnmodified, reqs, '2026-10-07'),
  false,
  '兼課列未改，不應標成「已修改列」'
);

const deduct = countApplicantConcurrentDeductPeriodsInMonth(reqs, 't-a', 10, 2026, ctx);
assert.equal(deduct, 1, '請假人兼課仍應減 1 節');

const add = countSubstituteTeacherConcurrentAddPeriodsInMonth(
  reqs,
  't-b',
  10,
  2026,
  ctx,
  undefined,
  {
    matchSession: (s) => Boolean(s?.isConcurrent),
    skipDate: (iso, r) => noticeDateUsesModifiedSubstitutePayroll(r, reqs, iso),
  }
);
assert.equal(add, 0, '代課人兼課應加為 0（不走兼課轉移）');

const related = getRelatedSubstituteRequests(wellnessSavedUnmodified, reqs).filter(
  (r) => r.substituteTeacherId === 't-b'
);
const payroll = countSubstitutePayrollWithNoticeRows(
  effective!,
  related,
  10,
  2026,
  5,
  undefined,
  undefined,
  ctx,
  () => 0,
  't-b'
);
assert.equal(payroll.periods, 1, '未改兼課列仍應入代課清冊 1 節');
assert.equal(payroll.useBasicRate, true, '已存通知單應以基本鐘點計');

const concurrentRemarks = buildConcurrentPayrollRemarks(
  't-b',
  10,
  2026,
  reqs,
  INITIAL_SYSTEM_CONFIG
);
assert.equal(
  concurrentRemarks.includes('代請假甲'),
  false,
  `兼課清冊備註不可列身心調適假兼課轉移（實際：${concurrentRemarks || '空'}）`
);

const substituteRemarks = buildSubstitutePayrollRemarks(
  't-b',
  10,
  2026,
  reqs,
  INITIAL_SYSTEM_CONFIG
);
assert.match(
  substituteRemarks,
  /10\/7代請假甲身心假1節/,
  `代課清冊備註應有身心假節次（實際：${substituteRemarks || '空'}）`
);

// 對照：公假未改兼課列仍走兼課轉移、不入代課清冊
const officialSavedUnmodified: SubstituteRequest = {
  ...wellnessSavedUnmodified,
  id: 'r-official-notice',
  requestNumber: '115-1-0301',
  reason: '公假開會',
  leaveType: 'official',
};
const officialReqs = [officialSavedUnmodified];
const officialCtx = buildLeavePayrollContext(officialReqs, INITIAL_SYSTEM_CONFIG);
const officialEffective = resolveEffectiveNoticeRows(officialSavedUnmodified, officialReqs)!;
const officialRelated = getRelatedSubstituteRequests(officialSavedUnmodified, officialReqs);
const officialPayroll = countSubstitutePayrollWithNoticeRows(
  officialEffective,
  officialRelated,
  10,
  2026,
  5,
  undefined,
  undefined,
  officialCtx,
  () => 0,
  't-b'
);
assert.equal(officialPayroll.periods, 0, '公假未改兼課列不入代課清冊');
const officialAdd = countSubstituteTeacherConcurrentAddPeriodsInMonth(
  officialReqs,
  't-b',
  10,
  2026,
  officialCtx,
  undefined,
  { matchSession: (s) => Boolean(s?.isConcurrent) }
);
assert.equal(officialAdd, 1, '公假未改兼課列仍應加兼課 1');

console.log('wellness notice concurrent payroll checks passed', {
  deduct,
  add,
  subPayroll: payroll.periods,
  substituteRemarks,
});
