import type { SystemConfig } from '../types';
import { DEFAULT_COUNSELING_PERIODS, DEFAULT_MAX_PERIOD } from './periodConfig';

export type SchoolLevel = 'elementary' | 'junior' | 'senior' | 'vocational';

export const SCHOOL_LEVEL_OPTIONS: Array<{ value: SchoolLevel; label: string }> = [
  { value: 'elementary', label: '國小' },
  { value: 'junior', label: '國中' },
  { value: 'senior', label: '高中' },
  { value: 'vocational', label: '高職' },
];

export function normalizeSchoolLevel(value: unknown): SchoolLevel {
  if (value === 'elementary' || value === 'junior' || value === 'senior' || value === 'vocational') {
    return value;
  }
  return 'vocational';
}

/**
 * 一鍵套用預設：費率、節次、課輔、假別門檻、基本鐘點。
 * 數字之後仍可於 Admin 手改；不覆寫學校名稱／學年度／放假日。
 */
export type SchoolLevelPresetPatch = Pick<
  SystemConfig,
  | 'schoolLevel'
  | 'dayHourlyRate'
  | 'nightHourlyRate'
  | 'actingHomeroomDailyRate'
  | 'maxWeeklyOverloadPeriods'
  | 'standardBasePeriods'
  | 'maxPeriod'
  | 'counselingPeriods'
  | 'personalLeavePublicDayThreshold'
  | 'sickLeaveConsecutiveDayThreshold'
  | 'wellnessLeaveHoursPerYear'
>;

const COMMON_LEAVE = {
  personalLeavePublicDayThreshold: 8,
  sickLeaveConsecutiveDayThreshold: 3,
  wellnessLeaveHoursPerYear: 21,
} as const;

export const SCHOOL_LEVEL_PRESETS: Record<SchoolLevel, SchoolLevelPresetPatch> = {
  elementary: {
    schoolLevel: 'elementary',
    dayHourlyRate: 400,
    nightHourlyRate: 400,
    actingHomeroomDailyRate: 320,
    maxWeeklyOverloadPeriods: 9,
    maxPeriod: 6,
    counselingPeriods: [],
    standardBasePeriods: {
      head: 12,
      homeroom: 16,
      fulltime: 20,
      sectionChief: 10,
      director: 0,
    },
    ...COMMON_LEAVE,
  },
  junior: {
    schoolLevel: 'junior',
    dayHourlyRate: 450,
    nightHourlyRate: 450,
    actingHomeroomDailyRate: 360,
    maxWeeklyOverloadPeriods: 9,
    maxPeriod: 7,
    counselingPeriods: [],
    standardBasePeriods: {
      head: 12,
      homeroom: 14,
      fulltime: 18,
      sectionChief: 10,
      director: 0,
    },
    ...COMMON_LEAVE,
  },
  senior: {
    schoolLevel: 'senior',
    dayHourlyRate: 505,
    nightHourlyRate: 660,
    actingHomeroomDailyRate: 404,
    maxWeeklyOverloadPeriods: 9,
    maxPeriod: 8,
    counselingPeriods: [8],
    standardBasePeriods: {
      head: 10,
      homeroom: 12,
      fulltime: 16,
      sectionChief: 8,
      director: 0,
    },
    ...COMMON_LEAVE,
  },
  vocational: {
    schoolLevel: 'vocational',
    dayHourlyRate: 505,
    nightHourlyRate: 660,
    actingHomeroomDailyRate: 404,
    maxWeeklyOverloadPeriods: 9,
    maxPeriod: DEFAULT_MAX_PERIOD,
    counselingPeriods: [...DEFAULT_COUNSELING_PERIODS],
    standardBasePeriods: {
      head: 10,
      homeroom: 12,
      fulltime: 16,
      sectionChief: 8,
      director: 0,
    },
    ...COMMON_LEAVE,
  },
};

export function applySchoolLevelPreset(level: SchoolLevel): SchoolLevelPresetPatch {
  return { ...SCHOOL_LEVEL_PRESETS[normalizeSchoolLevel(level)] };
}

export function schoolLevelLabel(level: SchoolLevel | undefined): string {
  const found = SCHOOL_LEVEL_OPTIONS.find((o) => o.value === normalizeSchoolLevel(level));
  return found?.label ?? '高職';
}
