/**
 * 通知單改科目後，列表顯示應跟通知單（非課表原科目）。
 */
import assert from 'node:assert/strict';
import {
  alignNoticeRowsToRequests,
  resolveDisplayClassSubject,
  resolveNoticePrintGroup,
  resolveSharedNoticeRows,
  shouldAlignNoticeRowPeriods,
} from '../src/utils/noticeDocument';
import type { SubstituteRequest } from '../src/types';

const base: SubstituteRequest = {
  id: 'r1',
  requestNumber: '115-1-0055',
  requestType: 'substitute',
  applicantTeacherId: 't1',
  applicantTeacherName: '陳星同',
  applicantDepartment: '汽車科',
  reason: '公假',
  paymentType: 'public',
  leaveType: 'official',
  leaveDateStart: '2026-10-16',
  leaveDateEnd: '2026-10-16',
  substituteTeacherId: 't2',
  substituteTeacherName: '郭耀輝',
  status: 'approved',
  createdAt: '2026-10-01T00:00:00.000Z',
  clashStatus: { hasClash: false, severity: 'none', messages: [] },
  originalSession: {
    id: 's1',
    dayOfWeek: 5,
    period: 5,
    className: '汽車二孝',
    subjectName: '電工電子實習',
    teacherId: 't1',
    teacherName: '陳星同',
    venueId: 'v1',
    venueName: '',
    isPractical: true,
    isConcurrent: false,
  },
};

const unchanged = resolveDisplayClassSubject(base);
assert.equal(unchanged.subjectName, '電工電子實習');
assert.equal(unchanged.className, '汽車二孝');

const customized = resolveDisplayClassSubject({
  ...base,
  noticeRowsCustomized: true,
  noticeRows: [
    {
      date: '2026/10/16',
      weekday: '5',
      period: '5',
      className: '汽車二孝',
      subjectName: '監考',
      hours: '',
    },
  ],
});
assert.equal(customized.subjectName, '監考', '通知單改科目後列表應顯示監考');
assert.equal(customized.className, '汽車二孝');

// 同號多節：從 sibling 的通知單列帶科目
const siblingCustom = resolveDisplayClassSubject(base, [
  {
    ...base,
    id: 'r2',
    noticeRowsCustomized: true,
    noticeRows: [
      {
        date: '2026/10/16',
        weekday: '5',
        period: '5',
        className: '汽車二孝',
        subjectName: '監考',
        hours: '',
      },
    ],
  },
]);
assert.equal(siblingCustom.subjectName, '監考');

// 通知單改班級（不再要求班級仍等於課表原班）
const classChanged = resolveDisplayClassSubject({
  ...base,
  noticeRowsCustomized: true,
  noticeRows: [
    {
      date: '2026/10/16',
      weekday: '5',
      period: '第5節',
      className: '汽車三孝',
      subjectName: '監考',
      hours: '',
    },
  ],
});
assert.equal(classChanged.className, '汽車三孝', '通知單改班級後列表應顯示新班級');
assert.equal(classChanged.subjectName, '監考');

// 同號 2 節、無 batchGroupId：通知單應帶出兩節；各節科目各自對應
const period3: SubstituteRequest = {
  ...base,
  id: 'r-p3',
  requestNumber: '115-1-0049',
  originalSession: {
    ...base.originalSession,
    id: 's3',
    period: 3,
    className: '電機二忠',
    subjectName: '監考課表原名',
  },
};
const period4: SubstituteRequest = {
  ...base,
  id: 'r-p4',
  requestNumber: '115-1-0049',
  originalSession: {
    ...base.originalSession,
    id: 's4',
    period: 4,
    className: '電機二忠',
    subjectName: '英文閱讀',
  },
};
const printGroup = resolveNoticePrintGroup(period3, [period3, period4]);
assert.equal(printGroup.length, 2, '無 batchGroupId 的同號多節也應同張通知單');

const dualRows = [
  {
    date: '2026/10/16',
    weekday: '5',
    period: '3',
    className: '電機二忠',
    subjectName: '監考',
    hours: '',
  },
  {
    date: '2026/10/16',
    weekday: '5',
    period: '4',
    className: '電機二忠',
    subjectName: '監考',
    hours: '',
  },
];
const p3Custom = { ...period3, noticeRowsCustomized: true, noticeRows: dualRows };
const p4Custom = { ...period4, noticeRowsCustomized: true, noticeRows: dualRows };
assert.equal(resolveDisplayClassSubject(p3Custom, [p3Custom, p4Custom]).subjectName, '監考');
assert.equal(
  resolveDisplayClassSubject(p4Custom, [p3Custom, p4Custom]).subjectName,
  '監考',
  '第4節改監考後不可仍顯示英文閱讀'
);

// 第4節自己還留舊 noticeRows（英文閱讀），但同號另一筆已存兩節皆監考 → 應合併採監考
const p3Fresh = {
  ...period3,
  noticeRowsCustomized: true as const,
  noticeRows: dualRows,
};
const p4Stale = {
  ...period4,
  noticeRowsCustomized: true as const,
  noticeRows: [
    {
      date: '2026/10/16',
      weekday: '5',
      period: '3',
      className: '電機二忠',
      subjectName: '監考',
      hours: '',
    },
    {
      date: '2026/10/16',
      weekday: '5',
      period: '4',
      className: '電機二忠',
      subjectName: '英文閱讀',
      hours: '',
    },
  ],
};
assert.equal(
  resolveDisplayClassSubject(p4Stale, [p3Fresh, p4Stale]).subjectName,
  '監考',
  '同號合併時不可被舊的英文閱讀蓋掉'
);
const shared = resolveSharedNoticeRows(p4Stale, [p3Fresh, p4Stale]);
assert.ok(shared?.some((r) => r.period === '4' && r.subjectName === '監考'));

// 通知單節次被改成 2、3，申請卻是 3、4：應依列順序對到監考，且 align 後寫回 3、4
const misnumbered = [
  {
    date: '2026/10/16',
    weekday: '5',
    period: '2',
    className: '電機二忠',
    subjectName: '監考',
    hours: '',
  },
  {
    date: '2026/10/16',
    weekday: '5',
    period: '3',
    className: '電機二忠',
    subjectName: '監考',
    hours: '',
  },
];
const p3Mis = { ...period3, noticeRowsCustomized: true as const, noticeRows: misnumbered };
const p4Mis = { ...period4, noticeRowsCustomized: true as const, noticeRows: misnumbered };
assert.equal(
  resolveDisplayClassSubject(p3Mis, [p3Mis, p4Mis]).subjectName,
  '監考',
  '節次寫成 2、3 時第3節仍應對到監考'
);
assert.equal(
  resolveDisplayClassSubject(p4Mis, [p3Mis, p4Mis]).subjectName,
  '監考',
  '節次寫成 2、3 時第4節不可回退英文閱讀'
);
assert.equal(shouldAlignNoticeRowPeriods(misnumbered, [period3, period4]), true);
const aligned = alignNoticeRowsToRequests(misnumbered, [period3, period4]);
assert.equal(aligned[0].period, '3');
assert.equal(aligned[1].period, '4');
assert.equal(aligned[0].subjectName, '監考');
assert.equal(aligned[1].subjectName, '監考');

// 單列手改節次 5→3：不可被強制改回，否則使用者會覺得「無法儲存」
const singleReq: SubstituteRequest = {
  ...base,
  id: 'r-single',
  originalSession: {
    ...base.originalSession,
    id: 's5',
    period: 5,
    className: '金工二忠',
    subjectName: '某科',
  },
};
const handEdited = [
  {
    date: '2026/10/16',
    weekday: '5',
    period: '3',
    className: '金工二忠',
    subjectName: '監考',
    hours: '',
  },
];
assert.equal(shouldAlignNoticeRowPeriods(handEdited, [singleReq]), false);
const kept = alignNoticeRowsToRequests(handEdited, [singleReq]);
assert.equal(kept[0].period, '3', '單列手改節次應原樣保留');
assert.equal(kept[0].subjectName, '監考');

// 列表節次應跟通知單手改後的節次（課表仍是第5節）
const periodDisplay = resolveDisplayClassSubject({
  ...singleReq,
  noticeRowsCustomized: true,
  noticeRows: handEdited,
});
assert.equal(periodDisplay.period, 3, '列表應顯示通知單第3節而非課表第5節');
assert.equal(periodDisplay.dayOfWeek, 5);
assert.equal(periodDisplay.subjectName, '監考');
assert.equal(periodDisplay.className, '金工二忠');

// 同號 2 節：即使通知單只有一列或節次重複，列表仍應分別顯示第3、4節
const dualOneRow = [
  {
    date: '2026/10/16',
    weekday: '5',
    period: '3',
    className: '電機二忠',
    subjectName: '監考',
    hours: '',
  },
];
const p3OneRow = { ...period3, noticeRowsCustomized: true as const, noticeRows: dualOneRow };
const p4OneRow = { ...period4, noticeRowsCustomized: true as const, noticeRows: dualOneRow };
const d3 = resolveDisplayClassSubject(p3OneRow, [p3OneRow, p4OneRow]);
const d4 = resolveDisplayClassSubject(p4OneRow, [p3OneRow, p4OneRow]);
assert.equal(d3.subjectName, '監考');
assert.equal(d4.subjectName, '監考');
assert.equal(d3.period, 3, '同號多節第3節不可被通知單壓成同一節');
assert.equal(d4.period, 4, '同號多節第4節應仍顯示第4節');
assert.notEqual(d3.period, d4.period, '兩節列表不可都變成第3節');

console.log('regression-notice-display-subject: OK');
