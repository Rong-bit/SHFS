/**
 * 身心調適假超鐘點：請假人 A 不扣兼課；代課人 B 應加兼課（兼課清冊）。
 * 執行：npx tsx scripts/regression-wellness-concurrent-deduct.ts
 */
import assert from 'node:assert/strict';
import type { CourseSession, SubstituteRequest } from '../src/types';
import {
  buildLeavePayrollContext,
  countApplicantConcurrentDeductPeriodsInMonth,
  countSubstituteConcurrentAddPeriodsInMonth,
  countSubstitutePublicPayrollPeriodsInMonth,
  leavePaymentDisplayLabel,
  shouldDeductConcurrentOnLeaveDate,
  shouldTransferConcurrentToSubstituteOnLeaveDate,
} from '../src/utils/leavePayrollPolicy';
import { INITIAL_SYSTEM_CONFIG } from '../src/data/mockData';

const session: CourseSession = {
  id: 's-w1',
  dayOfWeek: 3,
  period: 1,
  className: '電機二甲',
  subjectName: '專題',
  teacherId: 't-a',
  teacherName: '請假甲',
  venueId: 'v1',
  venueName: '教室',
  isPractical: false,
  isConcurrent: true,
};

const wellnessReq: SubstituteRequest = {
  id: 'r-wellness',
  requestNumber: '115-1-0100',
  requestType: 'substitute',
  applicantTeacherId: 't-a',
  applicantTeacherName: '請假甲',
  applicantDepartment: '電機科',
  reason: '身心調適',
  leaveType: 'wellness',
  paymentType: 'public',
  leaveDateStart: '2026-10-07', // 星期三
  leaveDateEnd: '2026-10-07',
  substituteTeacherId: 't-b',
  substituteTeacherName: '代課乙',
  originalSession: session,
  status: 'approved',
  createdAt: '2026-10-01 09:00',
  reviewedAt: '2026-10-02 10:00',
  clashStatus: { hasClash: false, severity: 'none', messages: [] },
};

const ctx = buildLeavePayrollContext([wellnessReq], INITIAL_SYSTEM_CONFIG);

assert.equal(
  shouldDeductConcurrentOnLeaveDate('2026-10-07', wellnessReq, ctx),
  false,
  '身心調適假超鐘點請假人不扣兼課'
);
assert.equal(
  shouldTransferConcurrentToSubstituteOnLeaveDate('2026-10-07', wellnessReq, ctx),
  true,
  '身心調適假超鐘點代課人應加兼課'
);

const deduct = countApplicantConcurrentDeductPeriodsInMonth(
  [wellnessReq],
  't-a',
  10,
  2026,
  ctx
);
assert.equal(deduct, 0, '請假人兼課應減為 0');

const add = countSubstituteConcurrentAddPeriodsInMonth(
  wellnessReq,
  10,
  2026,
  ctx
);
assert.equal(add, 1, '代課人兼課應加 1 節');

const subPayroll = countSubstitutePublicPayrollPeriodsInMonth(
  wellnessReq,
  10,
  2026,
  ctx
);
assert.equal(subPayroll, 0, '未改通知單時不入代課清冊（走兼課清冊）');

const label = leavePaymentDisplayLabel('public', 'wellness', undefined, {
  isConcurrentSession: true,
});
assert.match(label.detail, /不扣/);
assert.match(label.detail, /應加兼課/);

console.log('wellness concurrent A-no-deduct B-add checks passed', {
  deduct,
  add,
  subPayroll,
  detail: label.detail,
});
