/**
 * 請假派代節數：跨多週請假時，應依區間內相符星期次數加總，不可只算每週課表格數。
 * 執行：npx tsx scripts/regression-leave-period-count.ts
 */
import assert from 'node:assert/strict';
import type { CourseSession, DayOfWeek, SubstituteRequest } from '../src/types';
import {
  countCombinedLeavePeriods,
  countLeaveSubstitutePeriods,
} from '../src/utils/leaveDates';
import { formatDayPeriodSummary } from '../src/utils/periodLabels';
import { formatCombinedLeaveCount } from '../src/utils/schoolDepartments';

function session(partial: {
  id: string;
  period: number;
  dayOfWeek: DayOfWeek;
  className?: string;
}): CourseSession {
  return {
    id: partial.id,
    dayOfWeek: partial.dayOfWeek,
    period: partial.period,
    className: partial.className ?? '普通一忠',
    subjectName: '英語文',
    teacherId: 't1',
    teacherName: '林冠妙',
    venueId: 'v1',
    venueName: '教室',
    isPractical: false,
  };
}

function leaveReq(session: CourseSession, id: string): SubstituteRequest {
  return {
    id,
    requestNumber: '115-1-0095',
    requestType: 'substitute',
    applicantTeacherId: 't1',
    applicantTeacherName: '林冠妙',
    applicantDepartment: '共同科目',
    paymentType: 'public',
    leaveType: 'wellness',
    reason: '申請身心調適假',
    leaveDateStart: '2026-11-10',
    leaveDateEnd: '2026-11-17',
    substituteTeacherId: 't2',
    substituteTeacherName: '廖紫玲',
    originalSession: session,
    status: 'approved',
    createdAt: '2026-11-09 09:00',
    reviewedAt: '2026-11-09 10:00',
    clashStatus: { hasClash: false, severity: 'none', messages: [] },
  };
}

// 週二第1～2節、週五第3～4節；請假 11/10～11/17
// 11/10 週二、11/13 週五、11/17 週二 → 2+2+1+1 = 6
const items = [
  leaveReq(session({ id: 'tue1', period: 1, dayOfWeek: 2 }), 'r1'),
  leaveReq(session({ id: 'tue2', period: 2, dayOfWeek: 2 }), 'r2'),
  leaveReq(session({ id: 'fri3', period: 3, dayOfWeek: 5 }), 'r3'),
  leaveReq(session({ id: 'fri4', period: 4, dayOfWeek: 5 }), 'r4'),
];

assert.equal(countLeaveSubstitutePeriods(items[0]), 2, '週二第1節應涵蓋兩個週二');
assert.equal(countLeaveSubstitutePeriods(items[2]), 1, '週五第3節應涵蓋一個週五');
assert.equal(countCombinedLeavePeriods(items), 6, '區間內實際應派 6 節');
assert.equal(formatCombinedLeaveCount(items), '6 節');
assert.equal(
  formatDayPeriodSummary(
    items.map((r) => ({
      dayOfWeek: r.originalSession.dayOfWeek,
      period: r.originalSession.period,
    })),
    undefined,
    {
      leaveDateStart: '2026-11-10',
      leaveDateEnd: '2026-11-17',
    }
  ),
  '週二 第1～2節；週五 第3～4節 · 共 6 節'
);

// 無請假日期：維持每週課表格數
const legacy = items.map((r) => ({
  ...r,
  leaveDateStart: undefined,
  leaveDateEnd: undefined,
}));
assert.equal(countCombinedLeavePeriods(legacy), 4);
assert.equal(formatCombinedLeaveCount(legacy), '4 節');

// 跨班同一節：班數另標，節數仍依區間
const crossClass = [
  leaveReq(session({ id: 'a', period: 3, dayOfWeek: 2, className: '電機二忠' }), 'c1'),
  leaveReq(session({ id: 'b', period: 3, dayOfWeek: 2, className: '電機二孝' }), 'c2'),
];
assert.equal(countCombinedLeavePeriods(crossClass), 2);
assert.equal(formatCombinedLeaveCount(crossClass), '2 節（2 班）');

// 放假日不計
assert.equal(
  countCombinedLeavePeriods(items, new Set(['2026-11-17'])),
  4,
  '區間終點若放假，週二只剩 11/10 的 2 節，加週五 2 節＝4'
);

console.log('regression-leave-period-count: ok');
