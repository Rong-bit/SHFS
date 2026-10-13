/**
 * 通知單改科目後，列表顯示應跟通知單（非課表原科目）。
 */
import assert from 'node:assert/strict';
import {
  resolveDisplayClassSubject,
  resolveNoticePrintGroup,
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
  originalSession: { ...base.originalSession, id: 's3', period: 3, subjectName: '監考課表原名' },
};
const period4: SubstituteRequest = {
  ...base,
  id: 'r-p4',
  requestNumber: '115-1-0049',
  originalSession: {
    ...base.originalSession,
    id: 's4',
    period: 4,
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

console.log('regression-notice-display-subject: OK');
