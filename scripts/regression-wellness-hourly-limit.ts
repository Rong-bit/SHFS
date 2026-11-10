/**
 * 身心調適假上限：得以時計（1 節＝1 小時），單日最高 7 小時。
 * 六節分多日請仍應未超 21 小時上限，可繼續公費派代。
 * 執行：npx tsx scripts/regression-wellness-hourly-limit.ts
 */
import assert from 'node:assert/strict';
import type { CourseSession, DayOfWeek, SubstituteRequest } from '../src/types';
import { INITIAL_SYSTEM_CONFIG } from '../src/data/mockData';
import {
  WELLNESS_HOURS_PER_LEAVE_DAY,
  WELLNESS_LEAVE_HOURS_PER_YEAR,
  buildLeavePayrollContext,
  countWellnessHoursInAcademicYear,
  getWellnessLeaveHoursStatus,
  validateWellnessLeaveHoursForDrafts,
  wellnessHoursFromSlots,
} from '../src/utils/leavePayrollPolicy';

function sessionAt(period: number, dayOfWeek: DayOfWeek = 1): CourseSession {
  return {
    id: `s-p${period}`,
    dayOfWeek,
    period,
    className: '電機一甲',
    subjectName: '電路',
    teacherId: 't-a',
    teacherName: '請假甲',
    venueId: 'v1',
    venueName: '教室',
    isPractical: false,
    isConcurrent: false,
  };
}

function makeReq(
  partial: Pick<
    SubstituteRequest,
    'id' | 'requestNumber' | 'leaveDateStart' | 'leaveDateEnd'
  > & { period: number; dayOfWeek?: DayOfWeek }
): SubstituteRequest {
  const { period, dayOfWeek = 1, ...rest } = partial;
  return {
    requestType: 'substitute',
    applicantTeacherId: 't-a',
    applicantTeacherName: '請假甲',
    applicantDepartment: '電機科',
    paymentType: 'public',
    leaveType: 'wellness',
    reason: '身心調適',
    substituteTeacherId: 't-b',
    substituteTeacherName: '代課乙',
    originalSession: sessionAt(period, dayOfWeek),
    status: 'approved',
    createdAt: '2026-09-01 09:00',
    reviewedAt: '2026-09-01 10:00',
    clashStatus: { hasClash: false, severity: 'none', messages: [] },
    ...rest,
  };
}

// —— 槽位加總：單日最高 7 ——
assert.equal(
  wellnessHoursFromSlots(new Set(['2026-09-01|1', '2026-09-01|2', '2026-09-01|3'])),
  3,
  '同日 3 節＝3 小時'
);
assert.equal(
  wellnessHoursFromSlots(
    new Set(
      Array.from({ length: 8 }, (_, i) => `2026-09-01|${i + 1}`)
    )
  ),
  WELLNESS_HOURS_PER_LEAVE_DAY,
  '同日超過 7 節仍只計 7 小時'
);

// —— 六節分四日：舊邏輯會算 28 小時誤擋；正確應為 6 小時 ——
// 2026-09-01、09-02、09-03、09-04 皆為星期二～五（dayOfWeek 2～5）
const sixPeriodReqs: SubstituteRequest[] = [
  makeReq({
    id: 'r1',
    requestNumber: '115-1-0601',
    leaveDateStart: '2026-09-01',
    leaveDateEnd: '2026-09-01',
    period: 1,
    dayOfWeek: 2,
  }),
  makeReq({
    id: 'r2',
    requestNumber: '115-1-0602',
    leaveDateStart: '2026-09-01',
    leaveDateEnd: '2026-09-01',
    period: 3,
    dayOfWeek: 2,
  }),
  makeReq({
    id: 'r3',
    requestNumber: '115-1-0603',
    leaveDateStart: '2026-09-02',
    leaveDateEnd: '2026-09-02',
    period: 2,
    dayOfWeek: 3,
  }),
  makeReq({
    id: 'r4',
    requestNumber: '115-1-0604',
    leaveDateStart: '2026-09-03',
    leaveDateEnd: '2026-09-03',
    period: 4,
    dayOfWeek: 4,
  }),
  makeReq({
    id: 'r5',
    requestNumber: '115-1-0605',
    leaveDateStart: '2026-09-04',
    leaveDateEnd: '2026-09-04',
    period: 1,
    dayOfWeek: 5,
  }),
  makeReq({
    id: 'r6',
    requestNumber: '115-1-0606',
    leaveDateStart: '2026-09-04',
    leaveDateEnd: '2026-09-04',
    period: 5,
    dayOfWeek: 5,
  }),
];

const ctxSix = buildLeavePayrollContext(sixPeriodReqs, {
  ...INITIAL_SYSTEM_CONFIG,
  academicYear: '115',
});
assert.equal(
  countWellnessHoursInAcademicYear(ctxSix, 't-a'),
  6,
  '六節應計 6 小時，不可按日×7'
);
assert.ok(6 <= WELLNESS_LEAVE_HOURS_PER_YEAR, '六節未達學年上限');

// 再開一節仍應可派代
const draftSeventh = {
  leaveDateStart: '2026-09-08',
  leaveDateEnd: '2026-09-08',
  originalSession: sessionAt(2, 2), // 2026-09-08 星期二
  applicantTeacherId: 't-a',
};
const statusAfterSix = getWellnessLeaveHoursStatus([draftSeventh], ctxSix);
assert.ok(statusAfterSix, '應有時數狀態');
assert.equal(statusAfterSix!.usedHours, 6);
assert.equal(statusAfterSix!.draftHours, 1);
assert.equal(statusAfterSix!.totalHours, 7);
assert.equal(statusAfterSix!.exceeded, false, '六節後再請 1 節仍未超上限，應可派代');
assert.equal(
  validateWellnessLeaveHoursForDrafts([draftSeventh], ctxSix).ok,
  true,
  '驗證應通過'
);

// —— 跨班同日同節只計 1 小時 ——
const crossClass = [
  makeReq({
    id: 'c1',
    requestNumber: '115-1-0701',
    leaveDateStart: '2026-10-06',
    leaveDateEnd: '2026-10-06',
    period: 3,
    dayOfWeek: 2,
  }),
  {
    ...makeReq({
      id: 'c2',
      requestNumber: '115-1-0701',
      leaveDateStart: '2026-10-06',
      leaveDateEnd: '2026-10-06',
      period: 3,
      dayOfWeek: 2,
    }),
    originalSession: {
      ...sessionAt(3, 2),
      id: 's-cross',
      className: '電機一乙',
    },
  },
];
const ctxCross = buildLeavePayrollContext(crossClass, {
  ...INITIAL_SYSTEM_CONFIG,
  academicYear: '115',
});
assert.equal(
  countWellnessHoursInAcademicYear(ctxCross, 't-a'),
  1,
  '跨班同日同節只計 1 小時'
);

// —— 單日已請 7 節後，同日再加仍不增加時數 ——
const fullDay = Array.from({ length: 7 }, (_, i) =>
  makeReq({
    id: `f${i}`,
    requestNumber: `115-1-08${10 + i}`,
    leaveDateStart: '2026-10-07',
    leaveDateEnd: '2026-10-07',
    period: i + 1,
    dayOfWeek: 3,
  })
);
const ctxFull = buildLeavePayrollContext(fullDay, {
  ...INITIAL_SYSTEM_CONFIG,
  academicYear: '115',
});
assert.equal(countWellnessHoursInAcademicYear(ctxFull, 't-a'), 7);
const sameDayExtra = getWellnessLeaveHoursStatus(
  [
    {
      leaveDateStart: '2026-10-07',
      leaveDateEnd: '2026-10-07',
      originalSession: sessionAt(8, 3),
      applicantTeacherId: 't-a',
    },
  ],
  ctxFull
);
assert.equal(sameDayExtra?.draftHours, 0, '單日已滿 7 小時後同日不再累加');
assert.equal(sameDayExtra?.totalHours, 7);
assert.equal(sameDayExtra?.exceeded, false);

// —— 超過 21 小時才擋 ——
const twentyTwoDays = [
  '2026-09-01',
  '2026-09-02',
  '2026-09-03',
  '2026-09-04',
  '2026-09-07',
  '2026-09-08',
  '2026-09-09',
  '2026-09-10',
  '2026-09-11',
  '2026-09-14',
  '2026-09-15',
  '2026-09-16',
  '2026-09-17',
  '2026-09-18',
  '2026-09-21',
  '2026-09-22',
  '2026-09-23',
  '2026-09-24',
  '2026-09-25',
  '2026-09-28',
  '2026-09-29',
  '2026-09-30',
];
assert.equal(twentyTwoDays.length, 22);
const overDraftList = twentyTwoDays.map((iso) => {
  const dow = new Date(iso.replace(/-/g, '/') + ' 12:00:00').getDay() as DayOfWeek;
  return {
    leaveDateStart: iso,
    leaveDateEnd: iso,
    originalSession: sessionAt(1, dow),
    applicantTeacherId: 't-a',
  };
});
const emptyCtx = buildLeavePayrollContext([], {
  ...INITIAL_SYSTEM_CONFIG,
  academicYear: '115',
});
const overStatus = getWellnessLeaveHoursStatus(overDraftList, emptyCtx);
assert.equal(overStatus?.totalHours, 22);
assert.equal(overStatus?.exceeded, true, '22 節應超出 21 小時上限');
assert.equal(validateWellnessLeaveHoursForDrafts(overDraftList, emptyCtx).ok, false);

console.log('wellness hourly limit checks passed', {
  sixPeriods: 6,
  afterSixPlusOne: statusAfterSix!.totalHours,
  crossClassHours: 1,
  fullDayCap: 7,
  overLimit: overStatus!.totalHours,
});
