/**
 * 回歸：巡堂異常會辦收件規則（段考不含任課老師）
 */
import assert from 'node:assert/strict';
import { PatrolRecord, AcademicStaff, Teacher } from '../src/types';
import {
  resolvePatrolReviewRecipients,
  buildPatrolReviewCase,
  resolveReviewWhenIssueCleared,
  resolvePatrolNotifyGroups,
  mergeNotifyRolesFromGroups,
  defaultPatrolNotifyGroups,
  resolveNotifyGroupIdsForRecord,
  resolveNotifyGroupsForRecord,
  sanitizeItemNotifyGroupIds,
} from '../src/utils/patrolReview';
import { patrolRecordHasIssue } from '../src/components/Patrol/PatrolRoomSheet';

const teachers: Teacher[] = [
  {
    id: 't1',
    name: '王導師',
    title: '導師',
    department: '電機科',
    homeroomClass: '機二忠',
    basePeriods: 12,
    weeklyActualPeriods: 12,
    email: 'tutor@school.edu',
    phone: '',
    certifications: [],
  },
  {
    id: 't2',
    name: '李任課',
    title: '專任教師',
    department: '電機科',
    basePeriods: 16,
    weeklyActualPeriods: 16,
    email: 'sub@school.edu',
    phone: '',
    certifications: [],
  },
];

const staff: AcademicStaff[] = [
  {
    id: 'sa1',
    name: '周生輔',
    title: '生輔組長',
    badge: '',
    email: 'sa@school.edu',
    phone: '',
    responsibleScope: '',
    group: 'student_affairs',
  },
  {
    id: 'sa2',
    name: '鄭學務',
    title: '學務主任',
    badge: '',
    email: 'dean-s@school.edu',
    phone: '',
    responsibleScope: '',
    group: 'student_affairs',
  },
  {
    id: 'ac1',
    name: '陳教學',
    title: '教學組長',
    badge: '',
    email: 'ac@school.edu',
    phone: '',
    responsibleScope: '',
    group: 'academic',
  },
  {
    id: 'ac2',
    name: '吳教務',
    title: '教務主任',
    badge: '',
    email: 'dean-a@school.edu',
    phone: '',
    responsibleScope: '',
    group: 'academic',
  },
];

const base: PatrolRecord = {
  id: 'r1',
  date: '2026-10-10',
  kind: 'class',
  period: 2,
  roomId: 'room1',
  roomName: '機二忠',
  building: '忠孝',
  floor: '3F',
  className: '機二忠',
  subjectName: '電子學',
  teacherName: '李任課',
  observations: ['phone'],
  checks: {},
  itemLabels: { phone: '玩手機' },
  note: '',
  patrollerId: 'p1',
  patrollerName: '王巡堂',
  createdAt: new Date().toISOString(),
};

assert.equal(patrolRecordHasIssue(base), true);
const classRecipients = resolvePatrolReviewRecipients({
  record: base,
  teachers,
  academicStaffList: staff,
});
assert.ok(classRecipients.some((r) => r.role === 'homeroom' && r.personName === '王導師'));
assert.ok(classRecipients.some((r) => r.role === 'subject_teacher' && r.personName === '李任課'));
assert.ok(classRecipients.some((r) => r.role === 'student_affairs'));
assert.ok(classRecipients.some((r) => r.role === 'dean_student'));
assert.ok(classRecipients.some((r) => r.role === 'academic'));
assert.ok(classRecipients.some((r) => r.role === 'dean_academic' && r.personName === '吳教務'));

const { buildPatrolNotifyEmail, patrolNotifyAudienceLine } = await import('../src/utils/patrolMail');
const mail = buildPatrolNotifyEmail({
  reviewCase: {
    id: 'review_r1',
    recordId: 'r1',
    date: base.date,
    kind: base.kind,
    period: base.period,
    roomId: base.roomId,
    roomName: base.roomName,
    building: base.building,
    floor: base.floor,
    className: base.className,
    subjectName: base.subjectName,
    teacherName: base.teacherName,
    issueSummary: '玩手機',
    note: '',
    patrollerId: base.patrollerId,
    patrollerName: base.patrollerName,
    status: 'open',
    recipients: classRecipients,
    signOffs: [],
    createdAt: base.createdAt,
    updatedAt: base.createdAt,
  },
  schoolName: '測試高工',
  appBaseUrl: 'https://example.com',
});
assert.match(mail.text, /應通知身分：.*學務主任.*教務主任/);
assert.match(mail.text, /學務主任 鄭學務/);
assert.match(mail.text, /教務主任 吳教務/);
assert.match(mail.html, /學務主任/);
assert.match(mail.html, /教務主任/);

const exam: PatrolRecord = { ...base, id: 'r2', kind: 'exam', teacherName: '李任課', subjectName: undefined };
assert.equal(patrolRecordHasIssue(exam), true);
const examRecipients = resolvePatrolReviewRecipients({
  record: exam,
  teachers,
  academicStaffList: staff,
});
assert.ok(examRecipients.some((r) => r.role === 'homeroom'));
assert.equal(
  examRecipients.some((r) => r.role === 'subject_teacher'),
  false,
  '段考不應通知任課老師'
);

// 選項關閉部分身分 → 解析結果不含該角色
const filteredRecipients = resolvePatrolReviewRecipients({
  record: base,
  teachers,
  academicStaffList: staff,
  notifyRoles: {
    student_affairs: false,
    dean_student: true,
    academic: false,
    dean_academic: true,
    homeroom: true,
    subject_teacher: false,
  },
});
assert.equal(
  filteredRecipients.some((r) => r.role === 'student_affairs'),
  false,
  '選項關閉生輔組後不應納入'
);
assert.equal(
  filteredRecipients.some((r) => r.role === 'academic'),
  false,
  '選項關閉教學組後不應納入'
);
assert.equal(
  filteredRecipients.some((r) => r.role === 'subject_teacher'),
  false,
  '選項關閉任課老師後不應納入'
);
assert.ok(filteredRecipients.some((r) => r.role === 'dean_student'));
assert.ok(filteredRecipients.some((r) => r.role === 'dean_academic'));
assert.ok(filteredRecipients.some((r) => r.role === 'homeroom'));

assert.match(
  patrolNotifyAudienceLine('class', {
    student_affairs: false,
    dean_student: true,
    academic: false,
    dean_academic: true,
    homeroom: true,
    subject_teacher: false,
  }),
  /^學務主任、教務主任、該班導師$/
);
assert.match(
  patrolNotifyAudienceLine('exam', {
    student_affairs: true,
    dean_student: true,
    academic: true,
    dean_academic: true,
    homeroom: true,
    subject_teacher: true,
  }),
  /段考不含任課老師/
);

// 通知群組：預設兩組；勾選聯集；舊版 notifyRoles 收成一組
const defaultGroups = defaultPatrolNotifyGroups();
assert.equal(defaultGroups.length, 2);
const resolvedDefault = resolvePatrolNotifyGroups(null);
assert.equal(resolvedDefault.length, 2);
const legacyOne = resolvePatrolNotifyGroups({
  notifyRoles: {
    student_affairs: true,
    dean_student: false,
    academic: false,
    dean_academic: false,
    homeroom: true,
    subject_teacher: false,
  },
});
assert.equal(legacyOne.length, 1);
assert.equal(legacyOne[0].name, '預設');
const affairsOnly = mergeNotifyRolesFromGroups(defaultGroups, ['png-affairs']);
assert.equal(affairsOnly.student_affairs, true);
assert.equal(affairsOnly.dean_student, true);
assert.equal(affairsOnly.homeroom, true);
assert.equal(affairsOnly.academic, false);
assert.equal(affairsOnly.subject_teacher, false);
const bothGroups = mergeNotifyRolesFromGroups(defaultGroups, [
  'png-affairs',
  'png-academic',
]);
assert.equal(bothGroups.academic, true);
assert.equal(bothGroups.subject_teacher, true);
const groupRecipients = resolvePatrolReviewRecipients({
  record: base,
  teachers,
  academicStaffList: staff,
  notifyRoles: affairsOnly,
});
assert.ok(groupRecipients.some((r) => r.role === 'student_affairs'));
assert.equal(groupRecipients.some((r) => r.role === 'academic'), false);
assert.equal(groupRecipients.some((r) => r.role === 'subject_teacher'), false);

// 異常項目 → 群組對應：睡覺／玩手機 → 學務線；教師未到 → 教務線
const itemMapped = resolveNotifyGroupIdsForRecord({
  record: { ...base, observations: ['sleeping', 'phone'] },
  mailConfig: {
    notifyGroups: defaultGroups,
    itemNotifyGroupIds: {
      sleeping: ['png-affairs'],
      phone: ['png-affairs'],
      teacher_absent: ['png-academic'],
    },
  },
});
assert.deepEqual(itemMapped, ['png-affairs']);
const itemMappedBoth = resolveNotifyGroupIdsForRecord({
  record: { ...base, observations: ['sleeping', 'teacher_absent'] },
  mailConfig: {
    notifyGroups: defaultGroups,
    itemNotifyGroupIds: {
      sleeping: ['png-affairs'],
      teacher_absent: ['png-academic'],
    },
  },
});
assert.deepEqual(itemMappedBoth, ['png-affairs', 'png-academic']);
const outdoorMapped = resolveNotifyGroupIdsForRecord({
  record: {
    ...base,
    kind: 'after_school',
    observations: [],
    checks: { lights: false, aircon: true },
  },
  mailConfig: {
    notifyGroups: defaultGroups,
    itemNotifyGroupIds: { lights: ['png-academic'] },
  },
});
assert.deepEqual(outdoorMapped, ['png-academic']);
const sanitized = sanitizeItemNotifyGroupIds(
  { sleeping: ['png-affairs', 'gone'], phone: ['gone'] },
  defaultGroups
);
assert.deepEqual(sanitized, { sleeping: ['png-affairs'] });

// 部分項目有對應、部分沒有 → 不可自動會辦（避免漏通知）
const partialMap = resolveNotifyGroupsForRecord({
  record: { ...base, observations: ['sleeping', 'teacher_absent'] },
  mailConfig: {
    notifyGroups: defaultGroups,
    itemNotifyGroupIds: { sleeping: ['png-affairs'] },
  },
});
assert.equal(partialMap.fullyMapped, false);
assert.deepEqual(partialMap.groupIds, ['png-affairs']);
const fullMap = resolveNotifyGroupsForRecord({
  record: { ...base, observations: ['sleeping', 'phone'] },
  mailConfig: {
    notifyGroups: defaultGroups,
    itemNotifyGroupIds: {
      sleeping: ['png-affairs'],
      phone: ['png-affairs'],
    },
  },
});
assert.equal(fullMap.fullyMapped, true);
assert.deepEqual(fullMap.groupIds, ['png-affairs']);

const okRecord: PatrolRecord = { ...base, observations: [] };
assert.equal(patrolRecordHasIssue(okRecord), false);

const review = buildPatrolReviewCase({ record: base, teachers, academicStaffList: staff });
assert.equal(review.status, 'open');
assert.match(review.issueSummary, /玩手機/);

// 未通知 → 改正常直接結案
const closed = resolveReviewWhenIssueCleared(review);
assert.equal(closed.status, 'closed');

// 已通知 → 改正常應保留可見並標示更正
const notified = { ...review, notifiedAt: new Date().toISOString() };
const corrected = resolveReviewWhenIssueCleared(notified);
assert.equal(corrected.status, 'reviewed');
assert.match(corrected.issueSummary, /已更正為正常/);

// closed 後再異常 → 應重開並清除 notifiedAt 以便重寄
const reopened = buildPatrolReviewCase({
  record: base,
  teachers,
  academicStaffList: staff,
  existing: { ...notified, status: 'closed', notifiedAt: '2026-01-01T00:00:00.000Z' },
});
assert.equal(reopened.status, 'open');
assert.equal(reopened.notifiedAt, undefined);

// 「已更正為正常」後再異常 → 亦應重開可重寄
const fromCorrected = buildPatrolReviewCase({
  record: base,
  teachers,
  academicStaffList: staff,
  existing: {
    ...corrected,
    notifiedAt: '2026-01-01T00:00:00.000Z',
    status: 'reviewed',
  },
});
assert.equal(fromCorrected.status, 'open');
assert.equal(fromCorrected.notifiedAt, undefined);
assert.match(fromCorrected.issueSummary, /玩手機/);

// 任課姓名模糊比對（課表「李任課老師」應對上名冊「李任課」）
const fuzzyRecipients = resolvePatrolReviewRecipients({
  record: { ...base, id: 'r3', teacherName: '李任課老師' },
  teachers,
  academicStaffList: staff,
});
assert.ok(
  fuzzyRecipients.some((r) => r.role === 'subject_teacher' && r.personId === 't2'),
  '任課姓名應能模糊對上名冊'
);

const { applySignOff, makeSignOff, viewerReviewRoles } = await import('../src/utils/patrolReview');
const stamp = makeSignOff({
  role: 'student_affairs',
  personId: 'sa1',
  personName: '周生輔',
  action: '閱畢',
  instruction: undefined,
});
const noBleed = applySignOff(review, stamp, { instruction: '不應寫入非校長章' });
assert.equal(noBleed.signOffs[0]?.instruction, undefined, '非校長章不得帶指示用語');
const principalStamp = makeSignOff({
  role: 'principal',
  personId: 'p1',
  personName: '校長',
  action: '校長核章',
});
const withInstruction = applySignOff(review, principalStamp, {
  archive: true,
  instruction: '請持續關懷',
});
assert.equal(withInstruction.signOffs.at(-1)?.instruction, '請持續關懷');
assert.equal(withInstruction.status, 'archived');

const teacherRoles = viewerReviewRoles({
  reviewCase: {
    ...review,
    recipients: [
      { role: 'subject_teacher', personName: '李任課老師', email: 'sub@school.edu' },
    ],
  },
  viewer: { kind: 'teacher', id: 't2', name: '李任課' },
});
assert.ok(teacherRoles.includes('subject_teacher'), '無 personId 時應能以姓名核章');

const principalAsAcademic = viewerReviewRoles({
  reviewCase: review,
  viewer: {
    kind: 'staff',
    id: 'p1',
    name: '校長',
    staffGroup: 'principal',
    staffTitle: '校長',
  },
});
assert.ok(principalAsAcademic.includes('principal'));

console.log('regression-patrol-review: ok');
