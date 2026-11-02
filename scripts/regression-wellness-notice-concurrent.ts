/**
 * 身心調適假超鐘點通知單：未改 → 兼課清冊（A 不扣、B 應加）；有修改 → 代課清冊。
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

const base = {
  requestNumber: '115-1-0300',
  requestType: 'substitute' as const,
  applicantTeacherId: 't-a',
  applicantTeacherName: '請假甲',
  applicantDepartment: '電機科',
  reason: '身心調適',
  leaveType: 'wellness' as const,
  paymentType: 'public' as const,
  leaveDateStart: '2026-10-07',
  leaveDateEnd: '2026-10-07',
  substituteTeacherId: 't-b',
  substituteTeacherName: '代課乙',
  status: 'approved' as const,
  createdAt: '2026-10-01 09:00',
  reviewedAt: '2026-10-02 10:00',
  clashStatus: { hasClash: false, severity: 'none' as const, messages: [] as string[] },
  originalSession: session,
};

// 1) 未改兼課列 → 兼課清冊（A 不扣、B 應加）
{
  const req: SubstituteRequest = {
    ...base,
    id: 'r-wellness-unmodified',
    noticeRowsCustomized: true,
    noticeRows: [
      {
        date: '2026/10/7',
        weekday: '3',
        period: '2',
        className: '電機二甲',
        subjectName: '專題製作',
        hours: '兼課',
      },
    ],
  };
  const reqs = [req];
  const ctx = buildLeavePayrollContext(reqs, INITIAL_SYSTEM_CONFIG);
  const effective = resolveEffectiveNoticeRows(req, reqs)!;

  assert.equal(
    noticeDateUsesModifiedSubstitutePayroll(req, reqs, '2026-10-07'),
    false,
    '未改兼課列不應視為已修改'
  );
  assert.equal(
    countApplicantConcurrentDeductPeriodsInMonth(reqs, 't-a', 10, 2026, ctx),
    0,
    '請假人兼課不應減'
  );

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
  assert.equal(add, 1, '未改兼課列：代課人兼課應加 1');

  const related = getRelatedSubstituteRequests(req, reqs).filter(
    (r) => r.substituteTeacherId === 't-b'
  );
  const payroll = countSubstitutePayrollWithNoticeRows(
    effective,
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
  assert.equal(payroll.periods, 0, '未改兼課列不入代課清冊');

  const concurrentRemarks = buildConcurrentPayrollRemarks(
    't-b',
    10,
    2026,
    reqs,
    INITIAL_SYSTEM_CONFIG
  );
  assert.match(
    concurrentRemarks,
    /代請假甲身心假/,
    `兼課清冊備註應有身心假（實際：${concurrentRemarks || '空'}）`
  );

  const applicantRemarks = buildConcurrentPayrollRemarks(
    't-a',
    10,
    2026,
    reqs,
    INITIAL_SYSTEM_CONFIG
  );
  assert.equal(
    /請.*身心假扣兼課/.test(applicantRemarks),
    false,
    `請假人兼課備註不可有扣兼課（實際：${applicantRemarks || '空'}）`
  );
}

// 2) 有修改（科目改監考）→ 代課清冊；A 仍不扣
{
  const req: SubstituteRequest = {
    ...base,
    id: 'r-wellness-modified',
    requestNumber: '115-1-0301',
    noticeRowsCustomized: true,
    noticeRows: [
      {
        date: '2026/10/7',
        weekday: '3',
        period: '2',
        className: '電機二甲',
        subjectName: '監考',
        hours: '兼課',
      },
    ],
  };
  const reqs = [req];
  const ctx = buildLeavePayrollContext(reqs, INITIAL_SYSTEM_CONFIG);
  const effective = resolveEffectiveNoticeRows(req, reqs)!;

  assert.equal(
    noticeDateUsesModifiedSubstitutePayroll(req, reqs, '2026-10-07'),
    true,
    '改科目應視為已修改'
  );
  assert.equal(
    countApplicantConcurrentDeductPeriodsInMonth(reqs, 't-a', 10, 2026, ctx),
    0,
    '有修改時請假人兼課仍不應減'
  );

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
  assert.equal(add, 0, '有修改：代課人兼課應加為 0');

  const related = getRelatedSubstituteRequests(req, reqs).filter(
    (r) => r.substituteTeacherId === 't-b'
  );
  const payroll = countSubstitutePayrollWithNoticeRows(
    effective,
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
  assert.equal(payroll.periods, 1, '有修改：應入代課清冊 1 節');
  assert.equal(payroll.useBasicRate, true, '有修改：以基本鐘點計');

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
    `有修改後兼課清冊不可再列（實際：${concurrentRemarks || '空'}）`
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
    `代課清冊備註應有身心假（實際：${substituteRemarks || '空'}）`
  );
}

console.log('wellness notice concurrent payroll checks passed');
