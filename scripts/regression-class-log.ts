/**
 * 教室日誌：穩定 id、本課／代課槽位合併、僅作者可刪、日期區間鍵結構。
 * 執行：npx tsx scripts/regression-class-log.ts
 */
import assert from 'node:assert/strict';
import type { ClassLogTransfer, CourseSession, DayOfWeek, SubstituteRequest } from '../src/types';
import {
  canDeleteClassLogEntry,
  classLogEntryId,
  findConsecutiveClassLogSlots,
  listClassLogSlotsForTeacher,
  resolveClassLogDisplayEntry,
  shouldDefaultApplyConsecutive,
} from '../src/utils/classLogSlots';
import { retainClassLogEntries, trimPendingOps } from '../src/utils/classLogSync';
import type { ClassLogEntry } from '../src/types';

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

// 原任課已核准派代給他人：原任當天不應再出現該節（避免與代課搶同一 id）
const origOnLeave = listClassLogSlotsForTeacher({
  teacherId: 't-orig',
  isoDate: '2026-11-10',
  sessions: [
    session({ id: 's-cover', period: 5, dayOfWeek: tue, teacherId: 't-orig', teacherName: '原任甲' }),
    session({ id: 's-free', period: 1, dayOfWeek: tue, teacherId: 't-orig', teacherName: '原任甲' }),
  ],
  requests: [approvedSub],
});
assert.deepEqual(
  origOnLeave.map((s) => s.sessionId),
  ['s-free'],
  '已派代之 s-cover 不應再出現在原任待填清單'
);

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

// —— 連續節次：同班同科目相鄰節合成一塊 ——
const consecutiveSessions = [
  session({
    id: 'c2',
    period: 2,
    dayOfWeek: tue,
    teacherId: 't-sub',
    teacherName: '代課乙',
    className: '機二忠',
    subjectName: '實習',
  }),
  session({
    id: 'c3',
    period: 3,
    dayOfWeek: tue,
    teacherId: 't-sub',
    teacherName: '代課乙',
    className: '機二忠',
    subjectName: '實習',
  }),
  session({
    id: 'c4',
    period: 4,
    dayOfWeek: tue,
    teacherId: 't-sub',
    teacherName: '代課乙',
    className: '機二忠',
    subjectName: '實習',
  }),
  session({
    id: 'c6',
    period: 6,
    dayOfWeek: tue,
    teacherId: 't-sub',
    teacherName: '代課乙',
    className: '機二忠',
    subjectName: '實習',
  }),
  session({
    id: 'other',
    period: 5,
    dayOfWeek: tue,
    teacherId: 't-sub',
    teacherName: '代課乙',
    className: '機二忠',
    subjectName: '國文',
  }),
];
const consecutiveDaySlots = listClassLogSlotsForTeacher({
  teacherId: 't-sub',
  isoDate: '2026-11-10',
  sessions: consecutiveSessions,
  requests: [],
});
const block = findConsecutiveClassLogSlots(
  consecutiveDaySlots,
  consecutiveDaySlots.find((s) => s.period === 3)!
);
assert.deepEqual(
  block.map((s) => s.period),
  [2, 3, 4],
  '第3節應連到第2～4節；第6節中斷、國文不同科目不併入'
);

const entryP2: ClassLogEntry = {
  id: classLogEntryId({ date: '2026-11-10', period: 2, sessionId: 'c2' }),
  date: '2026-11-10',
  period: 2,
  dayOfWeek: tue,
  sessionId: 'c2',
  className: '機二忠',
  subjectName: '實習',
  venueName: '忠孝301',
  originalTeacherId: 't-sub',
  originalTeacherName: '代課乙',
  authorTeacherId: 't-sub',
  authorTeacherName: '代課乙',
  isSubstituteFill: false,
  progress: '實習進度 A',
  stampedAt: '2026-11-10T08:00:00.000Z',
  stampCaption: '教師',
  createdAt: '2026-11-10T08:00:00.000Z',
  updatedAt: '2026-11-10T08:00:00.000Z',
};
const byId = new Map<string, ClassLogEntry>([[entryP2.id, entryP2]]);
const mirrored = resolveClassLogDisplayEntry({
  slot: consecutiveDaySlots.find((s) => s.period === 4)!,
  date: '2026-11-10',
  slots: consecutiveDaySlots,
  entriesById: byId,
});
assert.equal(mirrored?.progress, '實習進度 A', '連續未填節應顯示同區塊已填內容');
assert.equal(
  resolveClassLogDisplayEntry({
    slot: consecutiveDaySlots.find((s) => s.period === 6)!,
    date: '2026-11-10',
    slots: consecutiveDaySlots,
    entriesById: byId,
  }),
  undefined,
  '中斷的第6節不應鏡射第2節內容'
);

const slot2 = consecutiveDaySlots.find((s) => s.period === 2)!;
const slot3 = consecutiveDaySlots.find((s) => s.period === 3)!;
const block234 = findConsecutiveClassLogSlots(consecutiveDaySlots, slot3);
// 本節已填、連續節尚無獨立紀錄：預設一併套用，更新時也寫入第3節
assert.equal(
  shouldDefaultApplyConsecutive({
    block: block234,
    center: slot2,
    date: '2026-11-10',
    entriesById: byId,
    displayProgress: entryP2.progress,
    displayNote: '',
  }),
  true,
  '僅本節有紀錄時仍預設勾選一併套用（可手動取消）'
);
// 開空的第3節（鏡射第2節內容）：應預設套用以便寫入整段
assert.equal(
  shouldDefaultApplyConsecutive({
    block: block234,
    center: slot3,
    date: '2026-11-10',
    entriesById: byId,
    displayProgress: entryP2.progress,
    displayNote: '',
  }),
  true,
  '開尚未寫入的連續節應預設套用'
);
// 連續節已有不同進度：不可預設覆寫
const entryP3Diff: ClassLogEntry = {
  ...entryP2,
  id: classLogEntryId({ date: '2026-11-10', period: 3, sessionId: 'c3' }),
  period: 3,
  sessionId: 'c3',
  progress: '另一進度',
};
assert.equal(
  shouldDefaultApplyConsecutive({
    block: block234,
    center: slot2,
    date: '2026-11-10',
    entriesById: new Map([
      [entryP2.id, entryP2],
      [entryP3Diff.id, entryP3Diff],
    ]),
    displayProgress: entryP2.progress,
    displayNote: '',
  }),
  false,
  '連續節進度不同時預設不勾選，避免覆寫'
);

// —— 本機保留／佇列修剪（配額不足時依此縮短）——
const retentionSamples: ClassLogEntry[] = [
  { ...entryP2, id: 'old', date: '2026-01-01' },
  { ...entryP2, id: 'mid', date: '2026-10-01' },
  { ...entryP2, id: 'new', date: '2026-11-10' },
];
assert.deepEqual(
  retainClassLogEntries(retentionSamples, 30, '2026-11-10').map((r) => r.id),
  ['new'],
  '保留 30 天應只留下近期'
);
assert.deepEqual(
  retainClassLogEntries(retentionSamples, 60, '2026-11-10').map((r) => r.id).sort(),
  ['mid', 'new'],
  '保留 60 天應含 10 月與 11 月'
);
assert.deepEqual(
  trimPendingOps([1, 2, 3, 4, 5], 3),
  [3, 4, 5],
  '佇列過長只留尾端'
);
assert.deepEqual(trimPendingOps([1, 2], 5), [1, 2], '未超限不修剪');

// —— 填寫責任轉移 ——
function transfer(partial: Partial<ClassLogTransfer> & Pick<ClassLogTransfer, 'toTeacherId' | 'toTeacherName' | 'sessionId' | 'period'>): ClassLogTransfer {
  const id = classLogEntryId({
    date: '2026-11-10',
    period: partial.period,
    sessionId: partial.sessionId,
  });
  return {
    id,
    date: '2026-11-10',
    period: partial.period,
    dayOfWeek: tue,
    sessionId: partial.sessionId,
    className: '機二忠',
    subjectName: '實習',
    venueName: '忠孝301',
    originalTeacherId: 't-sub',
    originalTeacherName: '代課乙',
    naturalHolderId: 't-sub',
    naturalHolderName: '代課乙',
    fromTeacherId: 't-sub',
    fromTeacherName: '代課乙',
    toTeacherId: partial.toTeacherId,
    toTeacherName: partial.toTeacherName,
    actorId: 't-sub',
    actorName: '代課乙',
    actorKind: 'teacher',
    createdAt: '2026-11-10T01:00:00.000Z',
    updatedAt: '2026-11-10T01:00:00.000Z',
    ...partial,
  };
}

const xferSessions = [
  session({
    id: 'c2',
    period: 2,
    dayOfWeek: tue,
    teacherId: 't-sub',
    teacherName: '代課乙',
    className: '機二忠',
    subjectName: '實習',
  }),
  session({
    id: 'c3',
    period: 3,
    dayOfWeek: tue,
    teacherId: 't-sub',
    teacherName: '代課乙',
    className: '機二忠',
    subjectName: '實習',
  }),
  session({
    id: 'c4',
    period: 4,
    dayOfWeek: tue,
    teacherId: 't-sub',
    teacherName: '代課乙',
    className: '機二忠',
    subjectName: '實習',
  }),
];
const moved = transfer({
  sessionId: 'c3',
  period: 3,
  toTeacherId: 't-orig',
  toTeacherName: '原任甲',
});
const giverSlots = listClassLogSlotsForTeacher({
  teacherId: 't-sub',
  isoDate: '2026-11-10',
  sessions: xferSessions,
  requests: [],
  transfers: [moved],
});
const receiverSlots = listClassLogSlotsForTeacher({
  teacherId: 't-orig',
  isoDate: '2026-11-10',
  sessions: xferSessions,
  requests: [],
  transfers: [moved],
});
assert.equal(
  giverSlots.find((s) => s.sessionId === 'c3')?.transferredOut,
  true,
  '轉出者該節應標成已轉出'
);
assert.equal(
  receiverSlots.find((s) => s.sessionId === 'c3')?.transferredIn,
  true,
  '轉入者應看到這一節'
);
assert.equal(receiverSlots.filter((s) => s.transferredIn).length, 1);

const withSub = listClassLogSlotsForTeacher({
  teacherId: 't-cover',
  isoDate: '2026-11-10',
  sessions: xferSessions,
  requests: [
    {
      ...approvedSub,
      substituteTeacherId: 't-cover',
      substituteTeacherName: '正式代課',
      originalSession: xferSessions[1],
    },
  ],
  transfers: [moved],
});
assert.equal(
  withSub.find((s) => s.sessionId === 'c3')?.transferredOut,
  false,
  '已核准代課者應接手，不被先前轉給別人的紀錄蓋過'
);
assert.equal(
  listClassLogSlotsForTeacher({
    teacherId: 't-orig',
    isoDate: '2026-11-10',
    sessions: xferSessions,
    requests: [
      {
        ...approvedSub,
        substituteTeacherId: 't-cover',
        substituteTeacherName: '正式代課',
        originalSession: xferSessions[1],
      },
    ],
    transfers: [moved],
  }).some((s) => s.sessionId === 'c3'),
  false,
  '舊的轉入者在改派代課後不應再看到這一節'
);

const stillMoved = transfer({
  sessionId: 'c3',
  period: 3,
  naturalHolderId: 't-cover',
  naturalHolderName: '正式代課',
  toTeacherId: 't-orig',
  toTeacherName: '原任甲',
});
assert.equal(
  listClassLogSlotsForTeacher({
    teacherId: 't-cover',
    isoDate: '2026-11-10',
    sessions: xferSessions,
    requests: [
      {
        ...approvedSub,
        substituteTeacherId: 't-cover',
        substituteTeacherName: '正式代課',
        originalSession: xferSessions[1],
      },
    ],
    transfers: [stillMoved],
  }).find((s) => s.sessionId === 'c3')?.transferredOut,
  true,
  '代課者自己再轉出時仍然有效'
);

const gapSlots = listClassLogSlotsForTeacher({
  teacherId: 't-sub',
  isoDate: '2026-11-10',
  sessions: xferSessions,
  requests: [],
  transfers: [moved],
});
assert.equal(
  resolveClassLogDisplayEntry({
    slot: gapSlots.find((s) => s.period === 4)!,
    date: '2026-11-10',
    slots: gapSlots,
    entriesById: new Map([
      [
        classLogEntryId({ date: '2026-11-10', period: 2, sessionId: 'c2' }),
        { ...entryP2, subjectName: '實習' },
      ],
    ]),
  }),
  undefined,
  '中間節已轉出時，左右節不應再鏡射同一段進度'
);

assert.equal(
  shouldDefaultApplyConsecutive({
    block: block234,
    center: slot2,
    date: '2026-11-10',
    entriesById: new Map([
      [entryP2.id, { ...entryP2, assessment: '小考' }],
      [
        classLogEntryId({ date: '2026-11-10', period: 3, sessionId: 'c3' }),
        {
          ...entryP2,
          id: classLogEntryId({ date: '2026-11-10', period: 3, sessionId: 'c3' }),
          period: 3,
          sessionId: 'c3',
          assessment: '作業',
        },
      ],
    ]),
    displayProgress: entryP2.progress,
    displayNote: '',
    displayAssessment: '小考',
  }),
  false,
  '連續節的測驗或作業不同時，不預設覆寫'
);

assert.ok('_class_log_xfer' > '2026-12-31', '轉移鍵不可被巡堂日期查詢掃到');

console.log('regression-class-log: ok');
