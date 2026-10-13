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
  {
    id: 'in1',
    name: '林實習',
    title: '實習組長',
    badge: '實習課務',
    email: 'intern@school.edu',
    phone: '',
    responsibleScope: '實習工場',
    group: 'academic',
  },
  {
    id: 'in2',
    name: '黃實習主',
    title: '實習主任',
    badge: '',
    email: 'dean-i@school.edu',
    phone: '',
    responsibleScope: '',
    group: 'academic',
  },
  {
    id: 'ga1',
    name: '蔡總務',
    title: '總務主任',
    badge: '',
    email: 'dean-g@school.edu',
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
assert.equal(
  classRecipients.some((r) => r.personName === '黃實習主' || r.personName === '蔡總務' || r.personName === '林實習'),
  false,
  '預設身分未勾實習／總務時，實習／總務人員不應被當成教學組收件'
);

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

// 新增身分：實習組／實習主任／總務主任
const extraRecipients = resolvePatrolReviewRecipients({
  record: base,
  teachers,
  academicStaffList: staff,
  notifyRoles: {
    student_affairs: false,
    dean_student: false,
    academic: false,
    dean_academic: false,
    homeroom: false,
    subject_teacher: false,
    internship: true,
    dean_internship: true,
    dean_general_affairs: true,
  },
});
assert.ok(extraRecipients.some((r) => r.role === 'internship' && r.personName === '林實習'));
assert.ok(extraRecipients.some((r) => r.role === 'dean_internship' && r.personName === '黃實習主'));
assert.ok(extraRecipients.some((r) => r.role === 'dean_general_affairs' && r.personName === '蔡總務'));
assert.equal(
  extraRecipients.some((r) => r.role === 'academic' || r.role === 'dean_academic'),
  false,
  '僅開實習／總務身分時不應夾帶教學組／教務主任'
);

// 無教務主任時：不可把實習主任／總務主任升級成教務主任
const staffWithoutAcademicDean = staff.filter((s) => s.id !== 'ac2');
const noDeanFallback = resolvePatrolReviewRecipients({
  record: base,
  teachers,
  academicStaffList: staffWithoutAcademicDean,
  notifyRoles: {
    student_affairs: false,
    dean_student: false,
    academic: true,
    dean_academic: true,
    homeroom: false,
    subject_teacher: false,
    internship: true,
    dean_internship: true,
    dean_general_affairs: true,
  },
});
assert.equal(
  noDeanFallback.some((r) => r.role === 'dean_academic'),
  false,
  '名冊無教務主任時不應把其他主任升級為教務主任'
);
assert.ok(noDeanFallback.some((r) => r.role === 'dean_internship' && r.personName === '黃實習主'));
assert.ok(noDeanFallback.some((r) => r.role === 'dean_general_affairs' && r.personName === '蔡總務'));
assert.equal(
  noDeanFallback.some((r) => r.role === 'academic' && (r.personName === '黃實習主' || r.personName === '蔡總務')),
  false,
  '實習／總務主任不可列入教學組收件'
);

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

const {
  applySignOff,
  makeSignOff,
  viewerReviewRoles,
  stampOfficeAndTitle,
  preferredStampRole,
} = await import('../src/utils/patrolReview');

// 職銜二排拆字：教師兼／教務主任
const { splitStampCaptionLines } = await import('../src/components/Common/ElectronicStamp');
assert.deepEqual(splitStampCaptionLines('教師兼教務主任'), ['教師兼', '教務主任']);
assert.deepEqual(splitStampCaptionLines('教師兼教學組長'), ['教師兼', '教學組長']);
assert.deepEqual(splitStampCaptionLines('校長'), ['校長']);

// 電子戳章：職銜列為「教師兼…」，不可把「閱畢／會畢」寫進戳章
const academicStamp = stampOfficeAndTitle('academic', '閱畢', '教學組長');
assert.equal(academicStamp.officeLabel, '教學組');
assert.equal(academicStamp.titleLabel, '組長', '教學組長短職稱仍保留');
assert.equal(academicStamp.stampCaption, '教師兼教學組長');
assert.notEqual(academicStamp.stampCaption, '閱畢');
const deanStampLayout = stampOfficeAndTitle('dean_academic', '會畢');
assert.equal(deanStampLayout.officeLabel, '教務處');
assert.equal(deanStampLayout.titleLabel, '主任');
assert.equal(deanStampLayout.stampCaption, '教師兼教務主任');
const principalStampLayout = stampOfficeAndTitle('principal', '校長核章');
assert.equal(principalStampLayout.titleLabel, '校長');
assert.equal(principalStampLayout.stampCaption, '校長', '校長不加「教師兼」');
// 其他主任／組長同「教師兼…」
assert.equal(stampOfficeAndTitle('dean_student', '閱畢').stampCaption, '教師兼學務主任');
assert.equal(stampOfficeAndTitle('dean_internship', '閱畢').stampCaption, '教師兼實習主任');
assert.equal(stampOfficeAndTitle('dean_general_affairs', '閱畢').stampCaption, '教師兼總務主任');
assert.equal(stampOfficeAndTitle('student_affairs', '閱畢', '生輔組長').stampCaption, '教師兼生輔組長');
// 教務主任即使誤帶 academic 角色，戳章仍應為教師兼教務主任
const deanAsAcademic = stampOfficeAndTitle('academic', '閱畢', '教務主任');
assert.equal(deanAsAcademic.officeLabel, '教務處');
assert.equal(deanAsAcademic.titleLabel, '主任');
assert.equal(deanAsAcademic.stampCaption, '教師兼教務主任');
const stamp = makeSignOff({
  role: 'student_affairs',
  personId: 'sa1',
  personName: '周生輔',
  action: '閱畢',
  instruction: undefined,
});
const noBleed = applySignOff(review, stamp, { instruction: '不應寫入組長章' });
assert.equal(noBleed.signOffs[0]?.instruction, undefined, '生輔組長不得帶簽文');
const deanSignOff = makeSignOff({
  role: 'dean_academic',
  personId: 'ac2',
  personName: '陳柏宇',
  action: '會畢',
});
const withDeanRemark = applySignOff(review, deanSignOff, {
  instruction: '請加強該班秩序宣導',
});
assert.equal(
  withDeanRemark.signOffs.find((s) => s.role === 'dean_academic')?.instruction,
  '請加強該班秩序宣導',
  '教務主任可寫簽文'
);
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

const internshipDeanRoles = viewerReviewRoles({
  reviewCase: {
    ...review,
    recipients: [
      { role: 'dean_internship', personId: 'in2', personName: '黃實習主', email: 'dean-i@school.edu' },
      { role: 'academic', personId: 'in2', personName: '黃實習主', email: 'dean-i@school.edu' },
    ],
  },
  viewer: {
    kind: 'staff',
    id: 'in2',
    name: '黃實習主',
    staffGroup: 'academic',
    staffTitle: '實習主任',
  },
});
assert.ok(internshipDeanRoles.includes('dean_internship'));
assert.equal(
  internshipDeanRoles.includes('academic'),
  false,
  '實習主任登入不應取得教學組核章角色'
);
assert.equal(
  internshipDeanRoles.includes('dean_academic'),
  false,
  '實習主任登入不應取得教務主任核章角色'
);

// 教務主任：只給教務主任角色，預選亦應為教務主任（勿預設教學組）
const deanAcademicRoles = viewerReviewRoles({
  reviewCase: review,
  viewer: {
    kind: 'staff',
    id: 'ac-dean',
    name: '陳柏宇',
    staffGroup: 'academic',
    staffTitle: '教務主任',
  },
});
assert.deepEqual(deanAcademicRoles, ['dean_academic']);
assert.equal(preferredStampRole(deanAcademicRoles), 'dean_academic');
assert.equal(
  preferredStampRole(['academic', 'dean_academic']),
  'dean_academic',
  '同時有教學組與教務主任時應預選教務主任'
);

console.log('regression-patrol-review: ok');
