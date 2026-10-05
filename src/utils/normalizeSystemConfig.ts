import type { SystemConfig } from '../types';
import { resolvePeriodConfig } from './periodConfig';
import { normalizeSchoolLevel, type SchoolLevel } from './schoolLevelPresets';
import { resolveLeaveThresholds } from './leavePayrollPolicy';
import { normalizeSchoolName } from './schoolName';
import { sanitizeConcurrentFunding } from './concurrentFunding';

/** 補齊舊 localStorage 缺少的學制／節次／假別欄位 */
export function normalizeLoadedSystemConfig(
  parsed: Partial<SystemConfig> & Record<string, unknown>,
  base: SystemConfig
): Pick<
  SystemConfig,
  | 'schoolLevel'
  | 'maxPeriod'
  | 'counselingPeriods'
  | 'personalLeavePublicDayThreshold'
  | 'sickLeaveConsecutiveDayThreshold'
  | 'wellnessLeaveHoursPerYear'
  | 'schoolName'
  | 'concurrentFundingSources'
  | 'concurrentFundingByName'
> {
  const schoolLevel = normalizeSchoolLevel(parsed.schoolLevel ?? base.schoolLevel);
  const period = resolvePeriodConfig({
    maxPeriod:
      typeof parsed.maxPeriod === 'number' ? parsed.maxPeriod : base.maxPeriod,
    counselingPeriods: Array.isArray(parsed.counselingPeriods)
      ? (parsed.counselingPeriods as number[])
      : base.counselingPeriods,
  });
  const leave = resolveLeaveThresholds({
    personalLeavePublicDayThreshold:
      typeof parsed.personalLeavePublicDayThreshold === 'number'
        ? parsed.personalLeavePublicDayThreshold
        : base.personalLeavePublicDayThreshold,
    sickLeaveConsecutiveDayThreshold:
      typeof parsed.sickLeaveConsecutiveDayThreshold === 'number'
        ? parsed.sickLeaveConsecutiveDayThreshold
        : base.sickLeaveConsecutiveDayThreshold,
    wellnessLeaveHoursPerYear:
      typeof parsed.wellnessLeaveHoursPerYear === 'number'
        ? parsed.wellnessLeaveHoursPerYear
        : base.wellnessLeaveHoursPerYear,
  });
  return {
    schoolLevel: schoolLevel as SchoolLevel,
    maxPeriod: period.maxPeriod,
    counselingPeriods: period.counselingPeriods,
    personalLeavePublicDayThreshold: leave.personalLeavePublicDayThreshold,
    sickLeaveConsecutiveDayThreshold: leave.sickLeaveConsecutiveDayThreshold,
    wellnessLeaveHoursPerYear: leave.wellnessLeaveHoursPerYear,
    schoolName: normalizeSchoolName(
      typeof parsed.schoolName === 'string' ? parsed.schoolName : base.schoolName
    ),
    ...sanitizeConcurrentFunding(
      parsed.concurrentFundingByName !== undefined ? parsed : base
    ),
  };
}
