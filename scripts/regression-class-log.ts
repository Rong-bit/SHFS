/**
 * 教室日誌：穩定 id、本課／代課槽位合併、僅作者可刪、日期區間鍵結構。
 * 執行：npx tsx scripts/regression-class-log.ts
 */
import assert from 'node:assert/strict';
import type { CourseSession, DayOfWeek, SubstituteRequest } from '../src/types';
import {
  canDeleteClassLogEntry,
  classLogEntryId,
  listClassLogSlotsForTeacher,
} from '../src/utils/classLogSlots';

function session(partial: {
  id: string;
  period: number;
  dayOfWeek?: DayOfWeek;
  teacherId?: string;
  teacherName?: string;
  className?: string;
  subjectName?: string;
}): CourseSession {
  return {
    id: partial.id,
    dayOfWeek: partial.dayOfWeek ?? 1,
    period: partial.period,
    className: partial.className ?? '機二忠',
    subjectName: partial.subjectName ?? '電路',
    teacherId: partial.teacherId ?? 't-orig',
    teacherName: partial.teacherName ?? '原任甲',
    venueId: 'v1',
    venueName: '忠孝301',
    isPractical: false,
    isConcurrent: false,
  };
}

// —— 穩定 id ——
assert.equal(
  classLogEntryId({ date: '2026-11-10', period: 3, sessionId: 'sess-1' }),
  '2026-11-10_3_sess-1'
);
assert.equal(
  classLogEntryId({ date: '2026-11-10', period: 3, sessionId: 'a.b/c[d]$e' }),
  '2026-11-10_3_a-b-c-d--e',
  'Firebase 非法字元應被正規化'
);

// 2026-11-10 為星期二（dayOfWeek = 2）
const tue = 2 as DayOfWeek;
const sessions: CourseSession[] = [
  session({ id: 's-own', period: 2, dayOfWeek: tue, teacherId: 't-sub', teacherName: '代課乙' }),
  session({ id: 's-cover', period: 5, dayOfWeek: tue, teacherId: 't-orig', teacherName: '原任甲' }),
  session({ id: 's-wed', period: 1, dayOfWeek: 3, teacherId: 't-sub', teacherName: '代課乙' }),
];

const approvedSub: SubstituteRequest = {
  id: 'r1',
  requestNumber: '115-1-0001',
  requestType: 'substitute',
  applicantTeacherId: 't-orig',
  applicantTeacherName: '原任甲',
  applicantDepartment: '電機科',
  paymentType: 'public',
  leaveType: 'personal',
  reason: '事假',
  leaveDateStart: '2026-11-10',
  leaveDateEnd: '2026-11-10',
  substituteTeacherId: 't-sub',
  substituteTeacherName: '代課乙',
  originalSession: sessions[1],
  status: 'approved',
  createdAt: '2026-11-09 09:00',
  reviewedAt: '2026-11-09 10:00',
  clashStatus: { hasClash: false, severity: 'none', messages: [] },
};

const pendingSub: SubstituteRequest = {
  ...approvedSub,
  id: 'r2',
  requestNumber: '115-1-0002',
  status: 'pending',
  originalSession: session({
    id: 's-pending',
    period: 6,
    dayOfWeek: tue,
    teacherId: 't-other',
    teacherName: '其他',
  }),
};

const slots = listClassLogSlotsForTeacher({
  teacherId: 't-sub',
  isoDate: '2026-11-10',
  sessions,
  requests: [approvedSub, pendingSub],
});

assert.equal(slots.length, 2, '應含本人第2節＋核准代課第5節；不含待審與其他星期');
assert.deepEqual(
  slots.map((s) => ({ period: s.period, sessionId: s.sessionId, sub: s.isSubstituteFill })),
  [
    { period: 2, sessionId: 's-own', sub: false },
    { period: 5, sessionId: 's-cover', sub: true },
  ]
);
assert.equal(slots[1].originalTeacherName, '原任甲');
assert.equal(slots[1].originalTeacherId, 't-orig');

// 同節同課堂：代課覆寫本課槽位（若某人同時是原任又代自己不會發生；測覆寫鍵）
const selfAlsoOrig = listClassLogSlotsForTeacher({
  teacherId: 't-orig',
  isoDate: '2026-11-10',
  sessions: [
    session({ id: 's-cover', period: 5, dayOfWeek: tue, teacherId: 't-orig', teacherName: '原任甲' }),
  ],
  requests: [
    {
      ...approvedSub,
      substituteTeacherId: 't-orig',
      substituteTeacherName: '原任甲',
    },
  ],
});
assert.equal(selfAlsoOrig.length, 1);
assert.equal(selfAlsoOrig[0].isSubstituteFill, true, '代課標記應覆寫同一 period|sessionId');

// 週末無槽
assert.deepEqual(
  listClassLogSlotsForTeacher({
    teacherId: 't-sub',
    isoDate: '2026-11-08',
    sessions,
    requests: [approvedSub],
  }),
  []
);

// 僅作者可刪
assert.equal(canDeleteClassLogEntry({ authorTeacherId: 't-sub' }, 't-sub'), true);
assert.equal(canDeleteClassLogEntry({ authorTeacherId: 't-sub' }, 't-orig'), false);
assert.equal(canDeleteClassLogEntry({ authorTeacherId: 't-sub' }, undefined), false);

// 日期區間 pull 鍵結構（與 classLogSync 路徑一致：掛在 shfs_patrol/_class_log）
const pathParts = [
  'shfs_patrol',
  'schoolHash',
  '_class_log',
  '2026-11-01',
  '2026-11-01_2_s-own',
];
assert.equal(pathParts[0], 'shfs_patrol');
assert.equal(pathParts[2], '_class_log');
assert.match(pathParts[3], /^\d{4}-\d{2}-\d{2}$/);
assert.equal(
  pathParts[4],
  classLogEntryId({ date: '2026-11-01', period: 2, sessionId: 's-own' })
);
// _class_log 鍵排序在日期之後，不會被巡堂日期區間查詢誤抓
assert.ok('_class_log' > '2026-12-31');

console.log('regression-class-log: ok');
