/**
 * 通知單科目改「監考」後：應入代課清冊、勿留在兼課清冊備註／應加。
 * 執行：npx tsx scripts/regression-notice-invigilation-payroll.ts
 */
import assert from 'node:assert/strict';
import type { CourseSession, SubstituteRequest } from '../src/types';
import { INITIAL_SYSTEM_CONFIG } from '../src/data/mockData';
import {
  buildLeavePayrollContext,
  countSubstituteTeacherConcurrentAddPeriodsInMonth,
} from '../src/utils/leavePayrollPolicy';
import {
  countSubstitutePayrollWithNoticeRows,
  getRelatedSubstituteRequests,
  noticeDateUsesModifiedSubstitutePayroll,
  resolveEffectiveNoticeRows,
} from '../src/utils/noticePayroll';
import { resolveDisplayClassSubject } from '../src/utils/noticeDocument';
import { buildConcurrentPayrollRemarks } from '../src/utils/overloadPayrollRegister';
import { buildSubstitutePayrollRemarks } from '../src/utils/substitutePayrollRegister';

const session: CourseSession = {
  id: 's-invigilation',
  dayOfWeek: 5, // 2026-10-16 星期五
  period: 3,
  className: '英文二甲',
  subjectName: '英文閱讀',
  teacherId: 'wu',
  teacherName: '吳東儒',
  venueId: 'v1',
  venueName: '教室',
  isPractical: false,
  isConcurrent: true,
};

const baseReq = {
  requestNumber: '115-1-0200',
  requestType: 'substitute' as const,
  applicantTeacherId: 'wu',
  applicantTeacherName: '吳東儒',
  applicantDepartment: '英文科',
  reason: '公假',
  leaveType: 'official' as const,
  paymentType: 'public' as const,
  leaveDateStart: '2026-10-16',
  leaveDateEnd: '2026-10-16',
  substituteTeacherId: 'liu',
  substituteTeacherName: '劉文田',
  status: 'approved' as const,
  createdAt: '2026-10-10 09:00',
  reviewedAt: '2026-10-10 10:00',
  clashStatus: { hasClash: false, severity: 'none' as const, messages: [] as string[] },
};

function runCase(name: string, reqs: SubstituteRequest[], expectedSubstitutePeriods: number) {
  const anchor = reqs[0];
  const ctx = buildLeavePayrollContext(reqs, INITIAL_SYSTEM_CONFIG);
  const effective = resolveEffectiveNoticeRows(anchor, reqs);
  assert.ok(effective, `${name}: 應有已存通知單列`);
  assert.ok(
    effective!.some((r) => r.subjectName.trim() === '監考'),
    `${name}: 有效通知單列應含監考`
  );
  assert.equal(
    noticeDateUsesModifiedSubstitutePayroll(anchor, reqs, '2026-10-16'),
    true,
    `${name}: 該日應視為已改入代課清冊`
  );

  const add = countSubstituteTeacherConcurrentAddPeriodsInMonth(
    reqs,
    'liu',
    10,
    2026,
    ctx,
    undefined,
    {
      matchSession: (s) => Boolean(s?.isConcurrent),
      skipDate: (iso, r) => noticeDateUsesModifiedSubstitutePayroll(r, reqs, iso),
    }
  );
  assert.equal(add, 0, `${name}: 兼課應加應為 0`);

  const related = getRelatedSubstituteRequests(anchor, reqs).filter(
    (r) => r.substituteTeacherId === 'liu'
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
    'liu'
  );
  assert.equal(
    payroll.periods,
    expectedSubstitutePeriods,
    `${name}: 代課清冊應 ${expectedSubstitutePeriods} 節`
  );
  assert.equal(payroll.useBasicRate, true, `${name}: 應以基本鐘點計`);

  const concurrentRemarks = buildConcurrentPayrollRemarks(
    'liu',
    10,
    2026,
    reqs,
    INITIAL_SYSTEM_CONFIG
  );
  assert.equal(
    concurrentRemarks.includes('代吳東儒公假兼課'),
    false,
    `${name}: 兼課清冊備註不可再列吳東儒公假兼課（實際：${concurrentRemarks || '空'}）`
  );

  const substituteRemarks = buildSubstitutePayrollRemarks(
    'liu',
    10,
    2026,
    reqs,
    INITIAL_SYSTEM_CONFIG
  );
  assert.match(
    substituteRemarks,
    /10\/16代吳東儒公假1節/,
    `${name}: 代課清冊備註應有 10/16代吳東儒公假1節（實際：${substituteRemarks || '空'}）`
  );
}

// 1) 單筆：科目改監考（鐘點仍寫兼課）
const single: SubstituteRequest = {
  ...baseReq,
  id: 'r-single',
  originalSession: session,
  noticeRowsCustomized: true,
  noticeRows: [
    {
      date: '2026/10/16',
      weekday: '5',
      period: '3',
      className: '英文二甲',
      subjectName: '監考',
      hours: '兼課',
    },
  ],
};
runCase('單筆改監考', [single], 1);

// 2) 同號兩節：本節還留舊「英文閱讀／兼課」，另一筆已存監考 → 顯示與清冊都應採監考
const session4: CourseSession = { ...session, id: 's4', period: 4, className: '英文二乙' };
const staleOwn: SubstituteRequest = {
  ...baseReq,
  id: 'r-stale',
  batchGroupId: 'bg-invigilation',
  originalSession: session,
  noticeRowsCustomized: true,
  noticeRows: [
    {
      date: '2026/10/16',
      weekday: '5',
      period: '3',
      className: '英文二甲',
      subjectName: '英文閱讀',
      hours: '兼課',
    },
    {
      date: '2026/10/16',
      weekday: '5',
      period: '4',
      className: '英文二乙',
      subjectName: '英文閱讀',
      hours: '兼課',
    },
  ],
};
const freshSibling: SubstituteRequest = {
  ...baseReq,
  id: 'r-fresh',
  batchGroupId: 'bg-invigilation',
  originalSession: session4,
  noticeRowsCustomized: true,
  noticeRows: [
    {
      date: '2026/10/16',
      weekday: '5',
      period: '3',
      className: '英文二甲',
      subjectName: '監考',
      hours: '',
    },
    {
      date: '2026/10/16',
      weekday: '5',
      period: '4',
      className: '英文二乙',
      subjectName: '監考',
      hours: '',
    },
  ],
};
assert.equal(
  resolveDisplayClassSubject(staleOwn, [staleOwn, freshSibling]).subjectName,
  '監考',
  '列表應顯示監考'
);
runCase('同號舊列合併採監考', [staleOwn, freshSibling], 2);

console.log('notice invigilation payroll checks passed');
