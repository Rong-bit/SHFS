/**
 * 回歸測試：高職預設行為不變；國中小靠設定啟用。
 * 執行：npx tsx scripts/regression-school-levels.ts
 */
import assert from 'node:assert/strict';
import { INITIAL_SYSTEM_CONFIG } from '../src/data/mockData';
import {
  buildPeriodDefinitions,
  isCounselingPeriod,
  isCounselingSlot,
  isDaytimePeriod,
  isDaytimeSlot,
  resolvePeriodConfig,
} from '../src/utils/periodConfig';
import {
  applySchoolLevelPreset,
  normalizeSchoolLevel,
  SCHOOL_LEVEL_PRESETS,
} from '../src/utils/schoolLevelPresets';
import {
  breakdownWeeklyOverloadPeriods,
  countWeeklyConcurrentPeriods,
  countWeeklyCounselingPeriods,
  gradeYearFromClassName,
  departmentFromClassName,
  gradeYearsFromSessions,
} from '../src/utils/schoolDepartments';
import {
  isConcurrentTeachingSession,
  isPersonalLeaveDatePublicPayroll,
  isSickLeaveSpellPublicPayroll,
  resolveLeaveThresholds,
  PERSONAL_LEAVE_PUBLIC_DAY_THRESHOLD,
  SICK_LEAVE_CONSECUTIVE_DAY_THRESHOLD,
  WELLNESS_LEAVE_HOURS_PER_YEAR,
} from '../src/utils/leavePayrollPolicy';
import { parsePeriodList } from '../src/utils/scheduleImporter';
import { normalizeLoadedSystemConfig } from '../src/utils/normalizeSystemConfig';
import type { CourseSession } from '../src/types';

let passed = 0;
let failed = 0;

function check(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(`    ${(e as Error).message}`);
  }
}

const vocationalCfg = INITIAL_SYSTEM_CONFIG;
const elementaryCfg = {
  ...INITIAL_SYSTEM_CONFIG,
  ...applySchoolLevelPreset('elementary'),
};
const juniorCfg = {
  ...INITIAL_SYSTEM_CONFIG,
  ...applySchoolLevelPreset('junior'),
};

console.log('\n=== 1. 高職預設（行為不變）===');
check('INITIAL schoolLevel = vocational', () => {
  assert.equal(normalizeSchoolLevel(vocationalCfg.schoolLevel), 'vocational');
});
check('maxPeriod=8, counselingPeriods=[8]', () => {
  const p = resolvePeriodConfig(vocationalCfg);
  assert.equal(p.maxPeriod, 8);
  assert.deepEqual(p.counselingPeriods, [8]);
});
check('日間 1～7、課輔第 8（舊邏輯等價）', () => {
  for (let i = 1; i <= 7; i++) {
    assert.equal(isDaytimePeriod(i, vocationalCfg), true, `period ${i} daytime`);
    assert.equal(isCounselingPeriod(i, vocationalCfg), false, `period ${i} not counseling`);
  }
  assert.equal(isDaytimePeriod(8, vocationalCfg), false);
  assert.equal(isCounselingPeriod(8, vocationalCfg), true);
  assert.equal(isDaytimeSlot({ dayOfWeek: 1, period: 7 }, vocationalCfg), true);
  assert.equal(isCounselingSlot({ dayOfWeek: 1, period: 8 }, vocationalCfg), true);
  assert.equal(isCounselingSlot({ dayOfWeek: 6, period: 8 }, vocationalCfg), false);
});
check('PERIOD 定義 8 節且第 8 標課輔', () => {
  const defs = buildPeriodDefinitions(vocationalCfg);
  assert.equal(defs.length, 8);
  assert.match(defs[7].label, /課輔/);
});
check('假別門檻預設 8 / 3 / 21', () => {
  const t = resolveLeaveThresholds(vocationalCfg);
  assert.equal(t.personalLeavePublicDayThreshold, PERSONAL_LEAVE_PUBLIC_DAY_THRESHOLD);
  assert.equal(t.sickLeaveConsecutiveDayThreshold, SICK_LEAVE_CONSECUTIVE_DAY_THRESHOLD);
  assert.equal(t.wellnessLeaveHoursPerYear, WELLNESS_LEAVE_HOURS_PER_YEAR);
  const eightDays = [
    '2025-09-01', '2025-09-02', '2025-09-03', '2025-09-04',
    '2025-09-05', '2025-09-06', '2025-09-07', '2025-09-08',
  ];
  assert.equal(isPersonalLeaveDatePublicPayroll('2025-09-08', eightDays), true);
  assert.equal(isPersonalLeaveDatePublicPayroll('2025-09-07', eightDays), false);
  assert.equal(isSickLeaveSpellPublicPayroll('2025-09-01', '2025-09-03'), true);
  assert.equal(isSickLeaveSpellPublicPayroll('2025-09-01', '2025-09-02'), false);
});
check('費率預設 505 / 660', () => {
  assert.equal(vocationalCfg.dayHourlyRate, 505);
  assert.equal(vocationalCfg.nightHourlyRate, 660);
});
check('舊 localStorage 無新欄位時補齊為高職預設', () => {
  const n = normalizeLoadedSystemConfig({}, INITIAL_SYSTEM_CONFIG);
  assert.equal(n.schoolLevel, 'vocational');
  assert.equal(n.maxPeriod, 8);
  assert.deepEqual(n.counselingPeriods, [8]);
});
check('vocational 預設集與 INITIAL 節次一致', () => {
  assert.equal(SCHOOL_LEVEL_PRESETS.vocational.maxPeriod, vocationalCfg.maxPeriod);
  assert.deepEqual(
    SCHOOL_LEVEL_PRESETS.vocational.counselingPeriods,
    vocationalCfg.counselingPeriods
  );
});

console.log('\n=== 2. 兼課結算引擎（高職）===');
const vocationalSessions: CourseSession[] = [
  {
    id: '1', dayOfWeek: 1, period: 1, className: '電機二甲', subjectName: '基本電學',
    teacherId: 't1', teacherName: '甲', venueId: 'v1', venueName: '教室',
    isPractical: false, isConcurrent: true,
  },
  {
    id: '2', dayOfWeek: 1, period: 2, className: '電機二甲', subjectName: '基本電學',
    teacherId: 't1', teacherName: '甲', venueId: 'v1', venueName: '教室',
    isPractical: false, isConcurrent: false,
  },
  {
    id: '3', dayOfWeek: 2, period: 8, className: '電機二甲', subjectName: '課輔',
    teacherId: 't1', teacherName: '甲', venueId: 'v1', venueName: '教室',
    isPractical: false, isConcurrent: false,
  },
];
check('兼課只計日間；課輔另計', () => {
  assert.equal(countWeeklyConcurrentPeriods(vocationalSessions, 't1', vocationalCfg), 1);
  assert.equal(countWeeklyCounselingPeriods(vocationalSessions, 't1', vocationalCfg), 1);
  const b = breakdownWeeklyOverloadPeriods(vocationalSessions, 't1', vocationalCfg);
  assert.equal(b.concurrent, 1);
  assert.equal(b.counseling, 1);
});
check('isConcurrentTeachingSession：第8節兼課不算日間超鐘點', () => {
  assert.equal(
    isConcurrentTeachingSession(
      { ...vocationalSessions[0], period: 8, isConcurrent: true } as any,
      vocationalCfg
    ),
    false
  );
  assert.equal(
    isConcurrentTeachingSession(vocationalSessions[0] as any, vocationalCfg),
    true
  );
});
check('高職科別／年級：電機二甲', () => {
  assert.equal(departmentFromClassName('電機二甲'), '電機科');
  assert.equal(gradeYearFromClassName('電機二甲'), 2);
});

console.log('\n=== 3. 國小設定啟用 ===');
check('國小預設 maxPeriod=6、無課輔', () => {
  assert.equal(elementaryCfg.schoolLevel, 'elementary');
  const p = resolvePeriodConfig(elementaryCfg);
  assert.equal(p.maxPeriod, 6);
  assert.deepEqual(p.counselingPeriods, []);
  assert.equal(buildPeriodDefinitions(elementaryCfg).length, 6);
  assert.equal(isCounselingPeriod(6, elementaryCfg), false);
  assert.equal(isDaytimePeriod(6, elementaryCfg), true);
  assert.equal(isDaytimePeriod(7, elementaryCfg), false);
});
check('國小課表：兼課結算正確、課輔為 0', () => {
  const sessions: CourseSession[] = [
    {
      id: 'e1', dayOfWeek: 1, period: 1, className: '112', subjectName: '國語',
      teacherId: 't2', teacherName: '乙', venueId: 'v2', venueName: '112',
      isPractical: false, isConcurrent: true,
    },
    {
      id: 'e2', dayOfWeek: 1, period: 6, className: '112', subjectName: '數學',
      teacherId: 't2', teacherName: '乙', venueId: 'v2', venueName: '112',
      isPractical: false, isConcurrent: true,
    },
  ];
  assert.equal(countWeeklyConcurrentPeriods(sessions, 't2', elementaryCfg), 2);
  assert.equal(countWeeklyCounselingPeriods(sessions, 't2', elementaryCfg), 0);
});
check('匯入節次依 maxPeriod=6 驗證', () => {
  assert.deepEqual(parsePeriodList('6', 6), [6]);
  assert.deepEqual(parsePeriodList('7', 6), []);
  assert.deepEqual(parsePeriodList('1-3', 6), [1, 2, 3]);
  assert.deepEqual(parsePeriodList('8', 8), [8]);
});

console.log('\n=== 4. 國中設定啟用 ===');
check('國中預設 maxPeriod=7、無課輔', () => {
  assert.equal(juniorCfg.schoolLevel, 'junior');
  const p = resolvePeriodConfig(juniorCfg);
  assert.equal(p.maxPeriod, 7);
  assert.deepEqual(p.counselingPeriods, []);
});
check('班級 701／112／802／810甲 年級解析', () => {
  assert.equal(gradeYearFromClassName('701'), 1); // 七年級＝國一
  assert.equal(gradeYearFromClassName('802'), 2);
  assert.equal(gradeYearFromClassName('903'), 3);
  assert.equal(gradeYearFromClassName('810甲'), 2);
  assert.equal(gradeYearFromClassName('112'), 1); // 國小一年級
  assert.equal(gradeYearFromClassName('605'), 6);
});
check('課表動態篩選含 701／112', () => {
  const sessions: CourseSession[] = [
    {
      id: 'j1', dayOfWeek: 1, period: 1, className: '701', subjectName: '國文',
      teacherId: 't3', teacherName: '丙', venueId: 'v3', venueName: '701',
      isPractical: false,
    },
    {
      id: 'j2', dayOfWeek: 2, period: 2, className: '112', subjectName: '生活',
      teacherId: 't3', teacherName: '丙', venueId: 'v4', venueName: '112',
      isPractical: false,
    },
  ];
  const grades = gradeYearsFromSessions(sessions);
  assert.ok(grades.includes(1));
  assert.deepEqual(grades, [1]);
});

console.log('\n=== 5. 假別門檻可覆寫 ===');
check('改門檻後判定跟著變', () => {
  assert.equal(
    isPersonalLeaveDatePublicPayroll('2025-09-03', ['2025-09-01', '2025-09-02', '2025-09-03'], 3),
    true
  );
  assert.equal(
    isPersonalLeaveDatePublicPayroll('2025-09-02', ['2025-09-01', '2025-09-02', '2025-09-03'], 3),
    false
  );
  assert.equal(isSickLeaveSpellPublicPayroll('2025-09-01', '2025-09-02', 2), true);
  assert.equal(isSickLeaveSpellPublicPayroll('2025-09-01', '2025-09-01', 2), false);
});

console.log('\n=== 6. 套用預設不破壞高職回歸路徑 ===');
check('套用高職預設後仍為 8+[8]', () => {
  const patch = applySchoolLevelPreset('vocational');
  assert.equal(patch.maxPeriod, 8);
  assert.deepEqual(patch.counselingPeriods, [8]);
  assert.equal(patch.dayHourlyRate, 505);
  assert.equal(patch.nightHourlyRate, 660);
});
check('未傳 periodCfg 時預設等同高職（相容舊呼叫）', () => {
  assert.equal(countWeeklyConcurrentPeriods(vocationalSessions, 't1'), 1);
  assert.equal(countWeeklyCounselingPeriods(vocationalSessions, 't1'), 1);
});

console.log(`\n結果：${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
