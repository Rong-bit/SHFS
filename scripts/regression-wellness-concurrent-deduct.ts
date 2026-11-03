/**
 * 身心調適假：基本鐘點入代課清冊；超鐘點 A 扣兼課、B 應加兼課（兼課清冊）。
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

const concurrentSession: CourseSession = {
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

const basicSession: CourseSession = {
  ...concurrentSession,
  id: 's-w-basic',
  isConcurrent: false,
};

const wellnessConcurrent: SubstituteRequest = {
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
  originalSession: concurrentSession,
  status: 'approved',
  createdAt: '2026-10-01 09:00',
  reviewedAt: '2026-10-02 10:00',
  clashStatus: { hasClash: false, severity: 'none', messages: [] },
};

const wellnessBasic: SubstituteRequest = {
  ...wellnessConcurrent,
  id: 'r-wellness-basic',
  requestNumber: '115-1-0101',
  originalSession: basicSession,
};

const ctxConcurrent = buildLeavePayrollContext([wellnessConcurrent], INITIAL_SYSTEM_CONFIG);
const ctxBasic = buildLeavePayrollContext([wellnessBasic], INITIAL_SYSTEM_CONFIG);

assert.equal(
  shouldDeductConcurrentOnLeaveDate('2026-10-07', wellnessConcurrent, ctxConcurrent),
  true,
  '身心調適假超鐘點請假人應扣兼課'
);
assert.equal(
  shouldTransferConcurrentToSubstituteOnLeaveDate('2026-10-07', wellnessConcurrent, ctxConcurrent),
  true,
  '身心調適假超鐘點代課人應加兼課'
);

const concurrentOnly = {
  matchSession: (s: CourseSession | undefined) => Boolean(s?.isConcurrent),
};

const deduct = countApplicantConcurrentDeductPeriodsInMonth(
  [wellnessConcurrent],
  't-a',
  10,
  2026,
  ctxConcurrent,
  undefined,
  concurrentOnly
);
assert.equal(deduct, 1, '請假人兼課應減為 1');

const add = countSubstituteConcurrentAddPeriodsInMonth(
  wellnessConcurrent,
  10,
  2026,
  ctxConcurrent
);
assert.equal(add, 1, '代課人兼課應加 1 節');

const subPayroll = countSubstitutePublicPayrollPeriodsInMonth(
  wellnessConcurrent,
  10,
  2026,
  ctxConcurrent
);
assert.equal(subPayroll, 0, '未改通知單時不入代課清冊（走兼課清冊）');

const concurrentLabel = leavePaymentDisplayLabel('public', 'wellness', undefined, {
  isConcurrentSession: true,
});
assert.match(concurrentLabel.detail, /扣請假人/);
assert.match(concurrentLabel.detail, /加代課人|應加兼課|兼課清冊/);

assert.equal(
  shouldDeductConcurrentOnLeaveDate('2026-10-07', wellnessBasic, ctxBasic),
  true,
  '基本鐘點公費日仍屬公費（但非兼課節則不入兼課應減）'
);
assert.equal(
  shouldTransferConcurrentToSubstituteOnLeaveDate('2026-10-07', wellnessBasic, ctxBasic),
  false,
  '基本鐘點不走兼課轉移'
);
assert.equal(
  countApplicantConcurrentDeductPeriodsInMonth(
    [wellnessBasic],
    't-a',
    10,
    2026,
    ctxBasic,
    undefined,
    concurrentOnly
  ),
  0,
  '基本鐘點請假人不扣兼課'
);
assert.equal(
  countSubstituteConcurrentAddPeriodsInMonth(wellnessBasic, 10, 2026, ctxBasic),
  0,
  '基本鐘點代課人不加兼課'
);
assert.equal(
  countSubstitutePublicPayrollPeriodsInMonth(wellnessBasic, 10, 2026, ctxBasic),
  1,
  '基本鐘點入代課清冊 1 節'
);

const basicLabel = leavePaymentDisplayLabel('public', 'wellness', undefined, {
  isConcurrentSession: false,
});
assert.match(basicLabel.detail, /代課清冊/);
assert.match(basicLabel.detail, /照支原薪|併入事假/);

console.log('wellness concurrent A-deduct B-add + basic substitute checks passed', {
  deduct,
  add,
  subPayroll,
  concurrentDetail: concurrentLabel.detail,
  basicDetail: basicLabel.detail,
});
