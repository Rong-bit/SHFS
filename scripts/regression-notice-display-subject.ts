/**
 * 通知單改科目後，列表顯示應跟通知單（非課表原科目）。
 */
import assert from 'node:assert/strict';
import { resolveDisplayClassSubject } from '../src/utils/noticeDocument';
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

console.log('regression-notice-display-subject: OK');
