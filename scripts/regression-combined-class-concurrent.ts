/**
 * 同科同年級忠／孝同時段合班：跨班、一班兼課則兩班皆兼課，鐘點只計 1 節。
 * 執行：npx tsx scripts/regression-combined-class-concurrent.ts
 */
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import type { CourseSession, SubstituteRequest } from '../src/types';
import { INITIAL_SYSTEM_CONFIG } from '../src/data/mockData';
import {
  breakdownWeeklyOverloadPeriods,
  countDistinctDayPeriods,
  countWeeklyConcurrentPeriods,
  expandWithCombinedClassPartners,
  formatCombinedLeaveCount,
  markCombinedSlotConcurrent,
  isSameSubjectCombinedClass,
  monthlyConcurrentPeriods,
} from '../src/utils/schoolDepartments';
import {
  applyCombinedClassConcurrent,
  combinedImportPartnerClassNames,
  parseScheduleFile,
  type ParsedImportRow,
} from '../src/utils/scheduleImporter';
import {
  buildLeavePayrollContext,
  countApplicantConcurrentDeductPeriodsInMonth,
  countSubstituteTeacherConcurrentAddPeriodsInMonth,
  sumUniqueSubstitutePublicPayrollPeriods,
} from '../src/utils/leavePayrollPolicy';
import {
  countSubstitutePayrollWithNoticeRows,
  leaveDateMovedOffConcurrentPayroll,
  noticeDateUsesModifiedSubstitutePayroll,
} from '../src/utils/noticePayroll';
import {
  isCombinedPartnerOccupancy,
  rankSubstituteCandidates,
  substituteOccupanciesBlockingSlot,
} from '../src/utils/substituteCandidates';
import type { Teacher } from '../src/types';

const row = (partial: Partial<ParsedImportRow> & Pick<ParsedImportRow, 'className' | 'subjectName' | 'teacherName'>): ParsedImportRow => ({
  rowNumber: partial.rowNumber ?? 2,
  dayOfWeek: partial.dayOfWeek ?? 1,
  period: partial.period ?? 1,
  className: partial.className,
  subjectName: partial.subjectName,
  teacherName: partial.teacherName,
  venueName: partial.venueName ?? '原班教室',
  isPractical: partial.isPractical ?? false,
  isConcurrent: partial.isConcurrent ?? false,
  errors: partial.errors ?? [],
  warnings: partial.warnings ?? [],
});

const session = (partial: Partial<CourseSession> & Pick<CourseSession, 'id' | 'className'>): CourseSession => ({
  id: partial.id,
  dayOfWeek: partial.dayOfWeek ?? 2,
  period: partial.period ?? 3,
  className: partial.className,
  subjectName: partial.subjectName ?? '基本電學',
  teacherId: partial.teacherId ?? 't1',
  teacherName: partial.teacherName ?? '王小明',
  venueId: 'v1',
  venueName: '教室',
  isPractical: false,
  isConcurrent: partial.isConcurrent ?? false,
});

assert.equal(
  isSameSubjectCombinedClass(
    { className: '電機二忠', subjectName: '基本電學' },
    { className: '電機二孝', subjectName: '基本電學' }
  ),
  true
);
assert.equal(
  isSameSubjectCombinedClass(
    { className: '機二忠', subjectName: '基本電學' },
    { className: '機二孝', subjectName: '基本電學' }
  ),
  true,
  '簡稱班名也視為同科合班'
);
assert.equal(
  isSameSubjectCombinedClass(
    { className: '電機二忠', subjectName: '基本電學' },
    { className: '電機三孝', subjectName: '基本電學' }
  ),
  false
);
assert.equal(
  isSameSubjectCombinedClass(
    { className: '電機二忠', subjectName: '基本電學' },
    { className: '電機二孝', subjectName: '電子學' }
  ),
  false
);

const promoted = applyCombinedClassConcurrent([
  row({ className: '電機二忠', subjectName: '基本電學', teacherName: '王小明', isConcurrent: true }),
  row({ className: '電機二孝', subjectName: '基本電學', teacherName: '王小明', isConcurrent: false, rowNumber: 3 }),
]);
assert.equal(promoted[0].isConcurrent, true);
assert.equal(promoted[1].isConcurrent, true, '孝班應一併標為兼課');
assert.match(promoted[1].warnings.join(''), /兼課/);
assert.deepEqual(combinedImportPartnerClassNames(promoted[0], promoted), ['電機二孝']);

const shortNames = applyCombinedClassConcurrent([
  row({ className: '機二忠', subjectName: '實習', teacherName: '王小明', isConcurrent: false }),
  row({ className: '機二孝', subjectName: '實習', teacherName: '王小明', isConcurrent: true, rowNumber: 3 }),
]);
assert.equal(shortNames[0].isConcurrent, true);
assert.equal(shortNames[1].isConcurrent, true);

const untouched = applyCombinedClassConcurrent([
  row({ className: '電機二忠', subjectName: '基本電學', teacherName: '王小明', isConcurrent: true }),
  row({ className: '電機二孝', subjectName: '電子學', teacherName: '王小明', isConcurrent: false, rowNumber: 3 }),
]);
assert.equal(untouched[1].isConcurrent, false, '不同科目不連動兼課');

const otherTeacher = applyCombinedClassConcurrent([
  row({ className: '電機二忠', subjectName: '基本電學', teacherName: '王小明', isConcurrent: true }),
  row({ className: '電機二孝', subjectName: '基本電學', teacherName: '李大華', isConcurrent: false, rowNumber: 3 }),
]);
assert.equal(otherTeacher[1].isConcurrent, false);

const both = [
  session({ id: 'a', className: '電機二忠', isConcurrent: true }),
  session({ id: 'b', className: '電機二孝', isConcurrent: true }),
];
const onlyOne = [
  session({ id: 'a', className: '電機二忠', isConcurrent: true }),
  session({ id: 'b', className: '電機二孝', isConcurrent: false }),
];
assert.equal(countWeeklyConcurrentPeriods(both, 't1', INITIAL_SYSTEM_CONFIG), 1);
assert.equal(countWeeklyConcurrentPeriods(onlyOne, 't1', INITIAL_SYSTEM_CONFIG), 1);
assert.equal(breakdownWeeklyOverloadPeriods(both, 't1', INITIAL_SYSTEM_CONFIG).counted, 1);
assert.equal(
  monthlyConcurrentPeriods(both, 't1', 2026, 10, new Set(), undefined, INITIAL_SYSTEM_CONFIG),
  monthlyConcurrentPeriods(onlyOne, 't1', 2026, 10, new Set(), undefined, INITIAL_SYSTEM_CONFIG)
);

const leaveSession = (id: string, className: string, period = 3): CourseSession =>
  session({ id, className, period, dayOfWeek: 2, isConcurrent: true });

const leaveReq = (id: string, className: string, period = 3): SubstituteRequest => ({
  id,
  requestNumber: `115-1-${id}`,
  requestType: 'substitute',
  applicantTeacherId: 't1',
  applicantTeacherName: '王小明',
  applicantDepartment: '電機科',
  reason: '產檢',
  leaveType: 'prenatal',
  paymentType: 'public',
  leaveDateStart: '2026-10-06',
  leaveDateEnd: '2026-10-06',
  substituteTeacherId: 't-b',
  substituteTeacherName: '代課乙',
  originalSession: leaveSession(id, className, period),
  status: 'approved',
  createdAt: '2026-10-01 09:00',
  reviewedAt: '2026-10-02 10:00',
  clashStatus: { hasClash: false, severity: 'none', messages: [] },
});

const paired = [leaveReq('r1', '電機二忠'), leaveReq('r2', '電機二孝')];
const ctx = buildLeavePayrollContext(paired, INITIAL_SYSTEM_CONFIG);
assert.equal(
  countApplicantConcurrentDeductPeriodsInMonth(paired, 't1', 10, 2026, ctx),
  1,
  '合班兩張請假單，兼課應減只計 1'
);
assert.equal(
  countSubstituteTeacherConcurrentAddPeriodsInMonth(paired, 't-b', 10, 2026, ctx),
  1,
  '同一代課人合班應加只計 1'
);

const differentPeriods = [leaveReq('r3', '電機二忠', 3), leaveReq('r4', '電機二忠', 4)];
const ctxPeriods = buildLeavePayrollContext(differentPeriods, INITIAL_SYSTEM_CONFIG);
assert.equal(
  countApplicantConcurrentDeductPeriodsInMonth(differentPeriods, 't1', 10, 2026, ctxPeriods),
  2,
  '不同節次仍各計 1 節'
);

const zhongSession = session({ id: 'a', className: '電機二忠', isConcurrent: true });
const xiaoSession = session({ id: 'b', className: '電機二孝', isConcurrent: false });
const expanded = expandWithCombinedClassPartners([zhongSession], [zhongSession, xiaoSession]);
assert.deepEqual(new Set(expanded.map((s) => s.className)), new Set(['電機二忠', '電機二孝']));
assert.equal(countDistinctDayPeriods(expanded), 1);
assert.equal(
  formatCombinedLeaveCount(expanded.map((s) => ({ originalSession: s }))),
  '1 節（2 班）'
);

const basicReq = (id: string, className: string, period = 3): SubstituteRequest => ({
  ...leaveReq(id, className, period),
  leaveType: 'official',
  reason: '公假',
  originalSession: session({
    id,
    className,
    period,
    dayOfWeek: 2,
    isConcurrent: false,
  }),
});
const basicPair = [basicReq('b1', '電機二忠'), basicReq('b2', '電機二孝')];
const basicCtx = buildLeavePayrollContext(basicPair, INITIAL_SYSTEM_CONFIG);
assert.equal(
  sumUniqueSubstitutePublicPayrollPeriods(basicPair, 10, 2026, basicCtx),
  1,
  '跨班基鐘代課只計 1 節'
);
assert.equal(
  sumUniqueSubstitutePublicPayrollPeriods(
    [basicReq('b3', '電機二忠', 3), basicReq('b4', '電機二忠', 4)],
    10,
    2026,
    buildLeavePayrollContext(
      [basicReq('b3', '電機二忠', 3), basicReq('b4', '電機二忠', 4)],
      INITIAL_SYSTEM_CONFIG
    )
  ),
  2,
  '不同節次代課仍各計 1 節'
);
assert.equal(
  sumUniqueSubstitutePublicPayrollPeriods(paired, 10, 2026, ctx),
  0,
  '跨班兼課不入代課清冊'
);

const mixed = [
  leaveReq('m1', '電機二忠'),
  {
    ...leaveReq('m2', '電機二孝'),
    originalSession: session({
      id: 'm2',
      className: '電機二孝',
      period: 3,
      dayOfWeek: 2,
      isConcurrent: false,
    }),
  },
];
const mixedCtx = buildLeavePayrollContext(mixed, INITIAL_SYSTEM_CONFIG);
assert.equal(
  countApplicantConcurrentDeductPeriodsInMonth(mixed, 't1', 10, 2026, mixedCtx),
  1,
  '只有一班標兼課時，應減仍只計 1'
);
assert.equal(
  countSubstituteTeacherConcurrentAddPeriodsInMonth(mixed, 't-b', 10, 2026, mixedCtx),
  1
);
assert.equal(
  sumUniqueSubstitutePublicPayrollPeriods(mixed, 10, 2026, mixedCtx),
  0,
  '同一節已走兼課，另一班不可再入代課'
);
const marked = markCombinedSlotConcurrent(mixed.map((r) => r.originalSession));
assert.equal(marked.every((s) => s.isConcurrent), true);
assert.equal(mixed[1].originalSession.isConcurrent, false, '不改原課表列');
const unrelated = markCombinedSlotConcurrent([
  session({ id: 'u1', className: '電機二忠', subjectName: '基本電學', isConcurrent: true }),
  session({ id: 'u2', className: '電機二孝', subjectName: '電子學', isConcurrent: false }),
]);
assert.equal(unrelated[1].isConcurrent, false, '不同科目同時段不連動兼課');

const partnerOcc = {
  teacherId: 't-b',
  dayOfWeek: 2 as const,
  period: 3,
  leaveDateStart: '2026-10-06',
  leaveDateEnd: '2026-10-06',
  applicantTeacherId: 't1',
  className: '電機二忠',
  subjectName: '基本電學',
};
assert.equal(
  isCombinedPartnerOccupancy(partnerOcc, { className: '電機二孝', subjectName: '基本電學' }, 't1'),
  true
);
assert.equal(
  isCombinedPartnerOccupancy(partnerOcc, { className: '電機二忠', subjectName: '基本電學' }, 't1'),
  false,
  '同一班再派一次仍算佔用'
);
assert.equal(
  isCombinedPartnerOccupancy(partnerOcc, { className: '電機二孝', subjectName: '基本電學' }, 't-other'),
  false,
  '不同請假人不視為跨班同一節'
);
const blocking = substituteOccupanciesBlockingSlot(
  [basicReq('b1', '電機二忠')],
  { className: '電機二孝', subjectName: '基本電學' },
  't1'
);
assert.equal(blocking.length, 0, '已接下忠班的代課人，再派孝班不應被擋');
const sameClassBlocking = substituteOccupanciesBlockingSlot(
  [basicReq('b1', '電機二忠')],
  { className: '電機二忠', subjectName: '基本電學' },
  't1'
);
assert.equal(sameClassBlocking.length, 1, '同一班重複派代仍應擋住');

const teachers: Teacher[] = [
  {
    id: 't-b',
    name: '代課乙',
    department: '電機科',
    title: '專任教師',
    weeklyActualPeriods: 0,
    basePeriods: 16,
    email: '',
    phone: '',
    certifications: [],
  },
];
const ranked = rankSubstituteCandidates({
  teachers,
  sessions: [],
  requests: [basicReq('b1', '電機二忠')],
  excludeTeacherId: 't1',
  targetDayOfWeek: 2,
  targetPeriod: 3,
  subjectName: '基本電學',
  applicantDepartment: '電機科',
  maxWeeklyOverloadPeriods: 9,
  leaveDateStart: '2026-10-06',
  leaveDateEnd: '2026-10-06',
  applicantTeacherId: 't1',
  combinedLeaveSessions: [{ className: '電機二孝', subjectName: '基本電學', period: 3 }],
});
assert.equal(ranked[0]?.hasClash, false, '跨班夥伴已派代，不應把同一代課人排成衝堂');

const noticePair = basicPair.map((r) => ({
  ...r,
  batchGroupId: 'batch-cross',
  noticeRowsCustomized: true,
  noticeRows: [
    {
      date: '2026/10/6',
      weekday: '2',
      period: '3',
      className: r.originalSession.className,
      subjectName: '基本電學',
      hours: '',
    },
  ],
}));
const noticePayroll = countSubstitutePayrollWithNoticeRows(
  noticePair.flatMap((r) => r.noticeRows || []),
  noticePair,
  10,
  2026,
  5,
  undefined,
  undefined,
  buildLeavePayrollContext(noticePair, INITIAL_SYSTEM_CONFIG),
  () => 99,
  't-b'
);
assert.equal(noticePayroll.periods, 1, '通知單兩班基鐘列只計 1 節');

const editedNoticeRows = [
  {
    date: '2026/10/6',
    weekday: '2',
    period: '3',
    className: '電機二忠',
    subjectName: '監考',
    hours: '兼課',
  },
  {
    date: '2026/10/6',
    weekday: '2',
    period: '3',
    className: '電機二孝',
    subjectName: '基本電學',
    hours: '兼課',
  },
];
const editedPair = [leaveReq('n1', '電機二忠'), leaveReq('n2', '電機二孝')].map((r) => ({
  ...r,
  batchGroupId: 'batch-edited',
  noticeRowsCustomized: true,
  noticeRows: editedNoticeRows,
}));
const editedPayroll = countSubstitutePayrollWithNoticeRows(
  editedNoticeRows,
  editedPair,
  10,
  2026,
  5,
  undefined,
  undefined,
  buildLeavePayrollContext(editedPair, INITIAL_SYSTEM_CONFIG),
  () => 99,
  't-b'
);
assert.equal(editedPayroll.periods, 1, '只改一班成監考時，代課仍只計 1 節');
assert.equal(
  leaveDateMovedOffConcurrentPayroll(editedPair[1], editedPair, '2026-10-06'),
  true,
  '另一班未改，仍應視為這節已離開兼課應加'
);
assert.equal(
  countSubstituteTeacherConcurrentAddPeriodsInMonth(
    editedPair,
    't-b',
    10,
    2026,
    buildLeavePayrollContext(editedPair, INITIAL_SYSTEM_CONFIG),
    undefined,
    {
      skipDate: (iso, r) => leaveDateMovedOffConcurrentPayroll(r, editedPair, iso),
    }
  ),
  0,
  '通知單改了一班後，另一班不可再加兼課'
);

const multiWeekRows = [
  {
    date: '2026/10/6',
    weekday: '2',
    period: '3',
    className: '電機二忠',
    subjectName: '基本電學',
    hours: '兼課',
  },
  {
    date: '2026/10/13',
    weekday: '2',
    period: '3',
    className: '電機二忠',
    subjectName: '監考',
    hours: '兼課',
  },
  {
    date: '2026/10/6',
    weekday: '2',
    period: '3',
    className: '電機二孝',
    subjectName: '基本電學',
    hours: '兼課',
  },
  {
    date: '2026/10/13',
    weekday: '2',
    period: '3',
    className: '電機二孝',
    subjectName: '基本電學',
    hours: '兼課',
  },
];
const multiWeekPair = [leaveReq('w1', '電機二忠'), leaveReq('w2', '電機二孝')].map((r) => ({
  ...r,
  leaveDateEnd: '2026-10-13',
  batchGroupId: 'batch-weeks',
  noticeRowsCustomized: true,
  noticeRows: multiWeekRows,
}));
assert.equal(
  noticeDateUsesModifiedSubstitutePayroll(multiWeekPair[0], multiWeekPair, '2026-10-06'),
  false,
  '只改第二週時，第一週仍是未改兼課'
);
assert.equal(
  noticeDateUsesModifiedSubstitutePayroll(multiWeekPair[0], multiWeekPair, '2026-10-13'),
  true,
  '第二週改成監考應改入代課'
);
assert.equal(
  leaveDateMovedOffConcurrentPayroll(multiWeekPair[1], multiWeekPair, '2026-10-06'),
  false,
  '第一週另一班仍走兼課應加'
);
assert.equal(
  leaveDateMovedOffConcurrentPayroll(multiWeekPair[1], multiWeekPair, '2026-10-13'),
  true,
  '第二週另一班不可再加兼課'
);
const multiWeekCtx = buildLeavePayrollContext(multiWeekPair, INITIAL_SYSTEM_CONFIG);
assert.equal(
  countSubstitutePayrollWithNoticeRows(
    multiWeekRows,
    multiWeekPair,
    10,
    2026,
    5,
    undefined,
    undefined,
    multiWeekCtx,
    () => 99,
    't-b'
  ).periods,
  1,
  '兩週只改一天時，代課只計那一天'
);
assert.equal(
  countSubstituteTeacherConcurrentAddPeriodsInMonth(
    multiWeekPair,
    't-b',
    10,
    2026,
    multiWeekCtx,
    undefined,
    {
      skipDate: (iso, r) => leaveDateMovedOffConcurrentPayroll(r, multiWeekPair, iso),
    }
  ),
  1,
  '未改的那一週兼課應加仍計 1'
);
const pendingEdited = {
  ...leaveReq('p1', '電機二忠'),
  status: 'pending' as const,
  noticeRowsCustomized: true,
  noticeRows: [
    {
      date: '2026/10/6',
      weekday: '2',
      period: '3',
      className: '電機二忠',
      subjectName: '監考',
      hours: '兼課',
    },
  ],
};
assert.equal(
  leaveDateMovedOffConcurrentPayroll(leaveReq('a-xiao', '電機二孝'), [leaveReq('a-xiao', '電機二孝'), pendingEdited], '2026-10-06'),
  false,
  '尚未核准的跨班改列，不可讓已核准的另一班失去兼課應加'
);
const laterWeekOnly = {
  ...leaveReq('later', '電機二忠'),
  leaveDateStart: '2026-11-03',
  leaveDateEnd: '2026-11-03',
  noticeRowsCustomized: true,
  noticeRows: [
    {
      date: '',
      weekday: '2',
      period: '3',
      className: '電機二忠',
      subjectName: '監考',
      hours: '兼課',
    },
  ],
};
assert.equal(
  leaveDateMovedOffConcurrentPayroll(
    editedPair[1],
    [editedPair[1], laterWeekOnly],
    '2026-10-06'
  ),
  false,
  '別週的跨班單不可讓本週兼課應加消失'
);

const sheet = XLSX.utils.json_to_sheet([
  {
    星期: 1,
    節次: 1,
    班級: '電機二忠',
    科目名稱: '基本電學',
    任課教師: '王小明',
    兼課: 1,
  },
  {
    星期: 1,
    節次: 1,
    班級: '電機二孝',
    科目名稱: '基本電學',
    任課教師: '王小明',
    兼課: '',
  },
]);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, sheet, '課表');
const bytes = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
const file = new File([bytes], 'combined.xlsx');
const parsed = await parseScheduleFile(file, [], []);
const zhong = parsed.validRows.find((r) => r.className === '電機二忠');
const xiao = parsed.validRows.find((r) => r.className === '電機二孝');
assert.ok(zhong && xiao, '兩班都應匯入');
assert.equal(zhong.isConcurrent, true);
assert.equal(xiao.isConcurrent, true, '匯入時孝班應被標成兼課');
assert.equal(parsed.clashesInFile.length, 0, '同科合班不應列為教師衝堂');
assert.deepEqual(combinedImportPartnerClassNames(zhong, parsed.validRows), ['電機二孝']);

console.log('combined class concurrent checks passed');
