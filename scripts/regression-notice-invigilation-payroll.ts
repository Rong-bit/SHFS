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

// 3) 未核准草稿不得污染已核准薪資合併
{
  const approved = {
    ...baseReq,
    id: 'r-approved',
    originalSession: session,
    noticeRowsCustomized: true as const,
    noticeRows: [
      {
        date: '2026/10/16',
        weekday: '5',
        period: '3',
        className: '英文二甲',
        subjectName: '英文閱讀',
        hours: '兼課',
      },
    ],
  };
  const pendingDraft = {
    ...baseReq,
    id: 'r-pending',
    status: 'pending' as const,
    originalSession: { ...session, id: 's-pending', period: 4 },
    noticeRowsCustomized: true as const,
    noticeRows: [
      {
        date: '2026/10/16',
        weekday: '5',
        period: '3',
        className: '英文二甲',
        subjectName: '監考',
        hours: '',
      },
    ],
  };
  const effective = resolveEffectiveNoticeRows(approved, [approved, pendingDraft]);
  assert.equal(
    effective?.find((r) => r.period === '3')?.subjectName,
    '英文閱讀',
    'pending 草稿監考不可蓋掉已核准兼課列'
  );
  assert.equal(
    noticeDateUsesModifiedSubstitutePayroll(approved, [approved, pendingDraft], '2026-10-16'),
    false,
    'pending 污染時不應視為已改入代課清冊'
  );
}

// 4) 同表只改一節監考：另一節兼課仍應加
{
  const session4 = { ...session, id: 's4b', period: 4, className: '英文二乙', subjectName: '數學' };
  const rows = [
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
      subjectName: '數學',
      hours: '兼課',
    },
  ];
  const r3 = {
    ...baseReq,
    id: 'r-partial-3',
    batchGroupId: 'bg-partial',
    originalSession: session,
    noticeRowsCustomized: true as const,
    noticeRows: rows,
  };
  const r4 = {
    ...baseReq,
    id: 'r-partial-4',
    batchGroupId: 'bg-partial',
    originalSession: session4,
    noticeRowsCustomized: true as const,
    noticeRows: rows,
  };
  const ctx = buildLeavePayrollContext([r3, r4], INITIAL_SYSTEM_CONFIG);
  const add = countSubstituteTeacherConcurrentAddPeriodsInMonth(
    [r3, r4],
    'liu',
    10,
    2026,
    ctx,
    undefined,
    {
      matchSession: (s) => Boolean(s?.isConcurrent),
      skipDate: (iso, r) => noticeDateUsesModifiedSubstitutePayroll(r, [r3, r4], iso),
    }
  );
  assert.equal(add, 1, '只改第3節監考時，第4節兼課仍應加 1');
  const effective = resolveEffectiveNoticeRows(r3, [r3, r4])!;
  const related = getRelatedSubstituteRequests(r3, [r3, r4]);
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
    'liu'
  );
  assert.equal(payroll.periods, 1, '只改第3節時代課清冊 1 節');
  const concurrentRemarks = buildConcurrentPayrollRemarks(
    'liu',
    10,
    2026,
    [r3, r4],
    INITIAL_SYSTEM_CONFIG
  );
  assert.match(concurrentRemarks, /第4節/, '兼課備註應保留未改的第4節');
  assert.equal(concurrentRemarks.includes('(第3節)'), false, '兼課備註不可再列已改監考的第3節');
}

// 5) 刻意改節次 3、4→2、3：有改的列皆進代課，兼課應加為 0
{
  const session4 = { ...session, id: 's4c', period: 4, className: '英文二乙', subjectName: '數學' };
  const remapped = [
    {
      date: '2026/10/16',
      weekday: '5',
      period: '2',
      className: '英文二甲',
      subjectName: '監考',
      hours: '',
    },
    {
      date: '2026/10/16',
      weekday: '5',
      period: '3',
      className: '英文二乙',
      subjectName: '監考',
      hours: '',
    },
  ];
  const r3 = {
    ...baseReq,
    id: 'r-remap-3',
    batchGroupId: 'bg-remap',
    originalSession: session,
    noticeRowsCustomized: true as const,
    noticeRows: remapped,
  };
  const r4 = {
    ...baseReq,
    id: 'r-remap-4',
    batchGroupId: 'bg-remap',
    originalSession: session4,
    noticeRowsCustomized: true as const,
    noticeRows: remapped,
  };
  const all = [r3, r4];
  const ctx = buildLeavePayrollContext(all, INITIAL_SYSTEM_CONFIG);
  assert.equal(
    noticeDateUsesModifiedSubstitutePayroll(r3, all, '2026-10-16'),
    true,
    '改節次後第3節申請應對到已修改列'
  );
  assert.equal(
    noticeDateUsesModifiedSubstitutePayroll(r4, all, '2026-10-16'),
    true,
    '改節次後第4節申請應對到已修改列'
  );
  const add = countSubstituteTeacherConcurrentAddPeriodsInMonth(
    all,
    'liu',
    10,
    2026,
    ctx,
    undefined,
    {
      matchSession: (s) => Boolean(s?.isConcurrent),
      skipDate: (iso, r) => noticeDateUsesModifiedSubstitutePayroll(r, all, iso),
    }
  );
  assert.equal(add, 0, '刻意改節次且皆修改時兼課應加為 0');
  const effective = resolveEffectiveNoticeRows(r3, all)!;
  const related = getRelatedSubstituteRequests(r3, all);
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
    'liu'
  );
  assert.equal(payroll.periods, 2, '刻意改節次後兩列修改皆進代課清冊');
  const concurrentRemarks = buildConcurrentPayrollRemarks(
    'liu',
    10,
    2026,
    all,
    INITIAL_SYSTEM_CONFIG
  );
  assert.equal(concurrentRemarks, '', `兼課備註應為空（實際：${concurrentRemarks || '空'}）`);
  const substituteRemarks = buildSubstitutePayrollRemarks(
    'liu',
    10,
    2026,
    all,
    INITIAL_SYSTEM_CONFIG
  );
  assert.match(substituteRemarks, /代吳東儒公假1節/, `代課備註應有內容（實際：${substituteRemarks}）`);
}

console.log('notice invigilation payroll checks passed');
