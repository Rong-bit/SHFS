import assert from 'node:assert/strict';
import type { CourseSession, SubstituteRequest } from '../src/types';
import {
  buildNoticeDocument,
  listPrintableNoticeAnchors,
} from '../src/utils/noticeDocument';
import { buildNoticeWorkbook } from '../src/utils/noticeExcel';

function session(partial: Partial<CourseSession> & Pick<CourseSession, 'id' | 'dayOfWeek' | 'period'>): CourseSession {
  return {
    className: '電機二甲',
    subjectName: '電工機械',
    teacherId: 't1',
    teacherName: '王大明',
    venueId: 'v1',
    venueName: '電工工場',
    isPractical: false,
    ...partial,
  };
}

function request(partial: Partial<SubstituteRequest> & Pick<SubstituteRequest, 'id' | 'requestType'>): SubstituteRequest {
  return {
    requestNumber: '115-1-0001',
    applicantTeacherId: 't1',
    applicantTeacherName: '王大明老師',
    applicantDepartment: '電機科',
    reason: '公假',
    paymentType: 'public',
    originalSession: session({ id: `s-${partial.id}`, dayOfWeek: 1, period: 2 }),
    status: 'approved',
    createdAt: '2026-09-01 09:00',
    reviewedAt: '2026-09-02 10:30',
    clashStatus: { hasClash: false, severity: 'none', messages: [] },
    ...partial,
  };
}

const sessions: CourseSession[] = [
  session({ id: 's-sub', dayOfWeek: 1, period: 2, isConcurrent: true }),
  session({ id: 's-sub2', dayOfWeek: 1, period: 3, className: '電機二乙', subjectName: '電子學' }),
  session({ id: 's-move', dayOfWeek: 2, period: 4 }),
  session({ id: 's-swap-a', dayOfWeek: 3, period: 1, subjectName: '國文' }),
  session({ id: 's-swap-b', dayOfWeek: 4, period: 5, subjectName: '數學', teacherId: 't2', teacherName: '李小華' }),
];

const requests: SubstituteRequest[] = [
  request({
    id: 'sub-a',
    requestNumber: '115-1-0001',
    batchGroupId: 'batch-1',
    requestType: 'substitute',
    leaveType: 'official',
    leaveDateStart: '2026-09-07',
    leaveDateEnd: '2026-09-07',
    substituteTeacherId: 't9',
    substituteTeacherName: '陳代課',
    originalSession: sessions[0],
  }),
  request({
    id: 'sub-b',
    requestNumber: '115-1-0001',
    batchGroupId: 'batch-1',
    requestType: 'substitute',
    leaveType: 'official',
    leaveDateStart: '2026-09-07',
    leaveDateEnd: '2026-09-07',
    substituteTeacherId: 't8',
    substituteTeacherName: '林另一位',
    originalSession: sessions[1],
  }),
  request({
    id: 'move',
    requestNumber: '115-1-0002',
    requestType: 'reschedule',
    originalSession: sessions[2],
    targetReschedule: { dayOfWeek: 5, period: 6, venueId: 'v2', venueName: '教室' },
  }),
  request({
    id: 'swap',
    requestNumber: '115-1-0003',
    requestType: 'swap',
    originalSession: sessions[3],
    swapTargetTeacherId: 't2',
    swapTargetTeacherName: '李小華',
    swapTargetSession: sessions[4],
    swapMode: 'permanent',
  }),
  request({
    id: 'acting',
    requestNumber: '115-1-0004',
    requestType: 'substitute',
    actingHomeroomTeacherId: 't7',
    actingHomeroomTeacherName: '趙導師代理',
    originalSession: session({
      id: 's-acting',
      dayOfWeek: 1,
      period: 1,
      subjectName: '代導師',
      notes: '僅代導師',
    }),
  }),
  request({
    id: 'pending',
    requestNumber: '115-1-0005',
    requestType: 'substitute',
    status: 'pending',
    substituteTeacherId: 't9',
    substituteTeacherName: '陳代課',
  }),
];

const anchors = listPrintableNoticeAnchors(requests);
assert.equal(anchors.length, 4, '代課兩張、調課、對調；不含僅代導師與待審');
assert.deepEqual(
  anchors.map((r) => r.id),
  ['sub-a', 'sub-b', 'move', 'swap']
);

const subA = buildNoticeDocument(anchors[0], requests, sessions);
assert.equal(subA.title, '代課通知單');
assert.equal(subA.addressee, '陳代課老師');
assert.equal(subA.displayRows.length, 1);
assert.equal(subA.displayRows[0].hours, '兼課');
assert.equal(subA.displayRows[0].date, '2026/9/7');
assert.equal(subA.requestNumberLabel, '115-1-0001');

const move = buildNoticeDocument(requests[2], requests, sessions);
assert.equal(move.title, '調課通知單');
assert.equal(move.addressee, '王大明老師');
assert.equal(move.displayRows[0].period, '6');
assert.equal(move.displayRows[0].weekday, '5');

const swap = buildNoticeDocument(requests[3], requests, sessions);
assert.equal(swap.title, '調課通知單');
assert.equal(swap.addressee, '李小華老師');
assert.equal(swap.displayRows.length, 2);

const scoped = listPrintableNoticeAnchors(requests, [requests[0]]);
assert.deepEqual(scoped.map((r) => r.id), ['sub-a']);

const custom = request({
  id: 'custom',
  requestType: 'substitute',
  substituteTeacherId: 't9',
  substituteTeacherName: '陳代課',
  noticeRowsCustomized: true,
  noticeRows: [
    { date: '2026/10/1', weekday: '4', period: '8', className: '資訊一甲', subjectName: '程式', hours: '' },
  ],
  originalSession: sessions[0],
});
const customDoc = buildNoticeDocument(custom, [custom], sessions);
assert.equal(customDoc.displayRows[0].className, '資訊一甲');
assert.equal(customDoc.displayRows[0].hours, '');

const docs = anchors.map((anchor) => buildNoticeDocument(anchor, requests, sessions));
const workbook = await buildNoticeWorkbook(docs, '測試高中', { includeIndex: true });
assert.equal(workbook.worksheets[0].name, '目錄');
assert.equal(workbook.worksheets.length, 5);
const buffer = await workbook.xlsx.writeBuffer();
assert.ok(buffer.byteLength > 1000);

const single = await buildNoticeWorkbook([subA], '測試高中', { includeIndex: false });
assert.equal(single.worksheets.length, 1);
assert.equal(single.getWorksheet(1)?.getCell('A1').value, '代課通知單');
assert.equal(single.getWorksheet(1)?.getCell('A2').value, '假單編號：115-1-0001');

console.log('notice excel checks passed', {
  sheets: workbook.worksheets.map((ws) => ws.name),
  bytes: buffer.byteLength,
});
