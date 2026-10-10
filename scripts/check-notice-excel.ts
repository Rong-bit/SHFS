import assert from 'node:assert/strict';
import type { CourseSession, SubstituteRequest } from '../src/types';
import {
  buildNoticeDocument,
  listPrintableNoticeAnchors,
} from '../src/utils/noticeDocument';
import {
  NOTICE_ROSTER_HEADERS,
  buildNoticeRosterRows,
  buildNoticeWorkbook,
  noticeKindLabel,
  noticeCounterpartName,
  rosterRowFillByRequestNumber,
} from '../src/utils/noticeExcel';

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
assert.equal(noticeKindLabel(subA), '代課');
assert.equal(noticeCounterpartName(subA), '陳代課');

const move = buildNoticeDocument(requests[2], requests, sessions);
assert.equal(move.title, '調課通知單');
assert.equal(move.addressee, '王大明老師');
assert.equal(move.displayRows[0].period, '6');
assert.equal(move.displayRows[0].weekday, '5');
assert.equal(noticeKindLabel(move), '調課');
assert.equal(noticeCounterpartName(move), '王大明');

const swap = buildNoticeDocument(requests[3], requests, sessions);
assert.equal(swap.title, '調課通知單');
assert.equal(swap.addressee, '李小華老師');
assert.equal(swap.displayRows.length, 2);
assert.equal(noticeKindLabel(swap), '對調');
assert.equal(noticeCounterpartName(swap), '李小華');

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
const roster = buildNoticeRosterRows(docs);
// sub-a 1列 + sub-b 1列 + move 1列 + swap 2列
assert.equal(roster.length, 5);
assert.deepEqual(
  [...NOTICE_ROSTER_HEADERS],
  ['序', '種類', '假單編號', '請假者', '代課者', '開立日期', '請假日期', '星期', '節次', '班級', '科目', '鐘點']
);
assert.equal(roster[0].seq, 1);
assert.equal(roster[0].kind, '代課');
assert.equal(roster[0].requestNumber, '115-1-0001');
assert.equal(roster[0].applicant, '王大明');
assert.equal(roster[0].substitute, '陳代課');
assert.equal(roster[0].issueDate, '115.9.2');
assert.equal(roster[0].leaveDate, '2026/9/7');
assert.equal(roster[0].weekday, '一');
assert.equal(roster[0].period, 2);
assert.equal(typeof roster[0].period, 'number');
assert.equal(roster[0].className, '電機二甲');
assert.equal(roster[0].subjectName, '電工機械');
assert.equal(roster[0].hours, '兼課');

assert.equal(roster[1].substitute, '林另一位');
assert.equal(roster[1].period, 3);
assert.equal(roster[2].kind, '調課');
assert.equal(roster[2].substitute, '王大明');
assert.equal(roster[3].kind, '對調');
assert.equal(roster[3].substitute, '李小華');
assert.equal(roster[4].kind, '對調');
assert.equal(roster[4].seq, 5);

// 同號同色、換號深淺交替：0001×2 淺、0002 深、0003×2 淺
const fillByNumber = rosterRowFillByRequestNumber(roster.map((r) => r.requestNumber));
assert.deepEqual(fillByNumber, [
  'FFF8FAFC',
  'FFF8FAFC',
  'FFE2E8F0',
  'FFF8FAFC',
  'FFF8FAFC',
]);

const workbook = await buildNoticeWorkbook(docs, '測試高中');
assert.equal(workbook.worksheets.length, 1);
assert.equal(workbook.worksheets[0].name, '通知單清冊');
assert.equal(workbook.getWorksheet(1)?.getCell('A1').value, '測試高中　調代課通知單清冊');
NOTICE_ROSTER_HEADERS.forEach((label, index) => {
  assert.equal(workbook.getWorksheet(1)?.getCell(4, index + 1).value, label);
});
assert.equal(workbook.getWorksheet(1)?.getCell('A5').value, 1);
assert.equal(workbook.getWorksheet(1)?.getCell('B5').value, '代課');
assert.equal(workbook.getWorksheet(1)?.getCell('I5').value, 2);
assert.equal(typeof workbook.getWorksheet(1)?.getCell('I5').value, 'number');
assert.equal(workbook.getWorksheet(1)?.getCell('L5').value, '兼課');
assert.equal(
  (workbook.getWorksheet(1)?.getCell('C5').fill as { fgColor?: { argb?: string } })?.fgColor?.argb,
  'FFF8FAFC'
);
assert.equal(
  (workbook.getWorksheet(1)?.getCell('C7').fill as { fgColor?: { argb?: string } })?.fgColor?.argb,
  'FFE2E8F0'
);
// 請假日期（G 欄）寬度對應約 93 像素；其餘欄寬維持原值
assert.equal(workbook.worksheets[0].getColumn(7).width, 13.22);
assert.deepEqual(
  [1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12].map((n) => workbook.worksheets[0].getColumn(n).width),
  [6, 10, 16, 12, 12, 12, 8, 8, 14, 22, 10]
);

const buffer = await workbook.xlsx.writeBuffer();
assert.ok(buffer.byteLength > 1000);

const single = await buildNoticeWorkbook([subA], '測試高中');
assert.equal(single.worksheets.length, 1);
assert.equal(single.getWorksheet(1)?.getCell('A5').value, 1);
assert.equal(single.getWorksheet(1)?.getCell('C5').value, '115-1-0001');
assert.equal(single.getWorksheet(1)?.getCell('E5').value, '陳代課');

console.log('notice excel checks passed', {
  sheets: workbook.worksheets.map((ws) => ws.name),
  rosterRows: roster.length,
  headers: [...NOTICE_ROSTER_HEADERS],
  bytes: buffer.byteLength,
});
