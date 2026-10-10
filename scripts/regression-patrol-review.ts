/**
 * 回歸：巡堂異常會辦收件規則（段考不含任課老師）
 */
import assert from 'node:assert/strict';
import { PatrolRecord, AcademicStaff, Teacher } from '../src/types';
import {
  resolvePatrolReviewRecipients,
  buildPatrolReviewCase,
  resolveReviewWhenIssueCleared,
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
  patrollerName: '尋堂',
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

console.log('regression-patrol-review: ok');
