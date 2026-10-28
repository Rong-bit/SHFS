/**
 * 產檢假：公費派代，鐘點處理同娩假／陪產假（超鐘點 A 應減、B 應加兼課）。
 * 執行：npx tsx scripts/regression-prenatal-leave.ts
 */
import assert from 'node:assert/strict';
import type { CourseSession, SubstituteRequest } from '../src/types';
import { INITIAL_SYSTEM_CONFIG } from '../src/data/mockData';
import {
  buildLeavePayrollContext,
  countApplicantConcurrentDeductPeriodsInMonth,
  countSubstituteConcurrentAddPeriodsInMonth,
  countSubstitutePublicPayrollPeriodsInMonth,
  isAlwaysPublicLeaveType,
  shouldDeductConcurrentOnLeaveDate,
  shouldTransferConcurrentToSubstituteOnLeaveDate,
} from '../src/utils/leavePayrollPolicy';
import {
  defaultReasonForLeaveType,
  leaveTypeFormOptions,
  leaveTypeLabel,
  leaveTypeRemarkShort,
  paymentTypeForLeaveType,
} from '../src/utils/leaveTypes';

assert.equal(paymentTypeForLeaveType('prenatal'), 'public');
assert.equal(isAlwaysPublicLeaveType('prenatal'), true);
assert.equal(leaveTypeRemarkShort('prenatal'), '產檢假');
assert.match(leaveTypeLabel('prenatal'), /產檢假/);
assert.match(defaultReasonForLeaveType('prenatal'), /產檢假/);
assert.ok(leaveTypeFormOptions().some((o) => o.value === 'prenatal'));

const session: CourseSession = {
  id: 's-p1',
  dayOfWeek: 2,
  period: 3,
  className: '幼保一甲',
  subjectName: '幼兒教保',
  teacherId: 't-a',
  teacherName: '請假甲',
  venueId: 'v1',
  venueName: '教室',
  isPractical: false,
  isConcurrent: true,
};

const prenatalReq: SubstituteRequest = {
  id: 'r-prenatal',
  requestNumber: '115-1-0200',
  requestType: 'substitute',
  applicantTeacherId: 't-a',
  applicantTeacherName: '請假甲',
  applicantDepartment: '幼保科',
  reason: '產檢',
  leaveType: 'prenatal',
  paymentType: 'public',
  leaveDateStart: '2026-10-06', // 星期二
  leaveDateEnd: '2026-10-06',
  substituteTeacherId: 't-b',
  substituteTeacherName: '代課乙',
  originalSession: session,
  status: 'approved',
  createdAt: '2026-10-01 09:00',
  reviewedAt: '2026-10-02 10:00',
  clashStatus: { hasClash: false, severity: 'none', messages: [] },
};

const ctx = buildLeavePayrollContext([prenatalReq], INITIAL_SYSTEM_CONFIG);

assert.equal(shouldDeductConcurrentOnLeaveDate('2026-10-06', prenatalReq, ctx), true);
assert.equal(shouldTransferConcurrentToSubstituteOnLeaveDate('2026-10-06', prenatalReq, ctx), true);

const concurrentOnly = {
  matchSession: (s: CourseSession | undefined) => Boolean(s?.isConcurrent),
};

assert.equal(
  countApplicantConcurrentDeductPeriodsInMonth(
    [prenatalReq],
    't-a',
    10,
    2026,
    ctx,
    undefined,
    concurrentOnly
  ),
  1
);
assert.equal(countSubstituteConcurrentAddPeriodsInMonth(prenatalReq, 10, 2026, ctx), 1);
assert.equal(countSubstitutePublicPayrollPeriodsInMonth(prenatalReq, 10, 2026, ctx), 0);

// 基鐘：入代課清冊、不扣兼課
const basicReq: SubstituteRequest = {
  ...prenatalReq,
  id: 'r-prenatal-basic',
  originalSession: { ...session, id: 's-p2', isConcurrent: false },
};
const ctxBasic = buildLeavePayrollContext([basicReq], INITIAL_SYSTEM_CONFIG);
assert.equal(
  countApplicantConcurrentDeductPeriodsInMonth(
    [basicReq],
    't-a',
    10,
    2026,
    ctxBasic,
    undefined,
    concurrentOnly
  ),
  0
);
assert.equal(countSubstituteConcurrentAddPeriodsInMonth(basicReq, 10, 2026, ctxBasic), 0);
assert.equal(countSubstitutePublicPayrollPeriodsInMonth(basicReq, 10, 2026, ctxBasic), 1);

console.log('prenatal leave checks passed');
