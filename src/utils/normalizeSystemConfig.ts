import type { SystemConfig } from '../types';
import { normalizeTimeRange, resolvePeriodConfig } from './periodConfig';
import { resolveHomeroomSlot } from './schoolDepartments';
import { normalizeSchoolLevel, type SchoolLevel } from './schoolLevelPresets';
import { resolveLeaveThresholds } from './leavePayrollPolicy';
import { normalizeSchoolName } from './schoolName';
import { sanitizeConcurrentFunding } from './concurrentFunding';

function normalizeLoadedPeriodTimeRanges(
  raw: unknown,
  base?: Record<string, string>
): Record<string, string> | undefined {
  const source =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : base && typeof base === 'object'
        ? base
        : null;
  if (!source) return undefined;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (!/^\d{1,2}$/.test(key)) continue;
    const n = Number(key);
    if (n < 1 || n > 12) continue;
    const normalized = normalizeTimeRange(typeof value === 'string' ? value : '');
    if (normalized) out[key] = normalized;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** 補齊舊 localStorage 缺少的學制／節次／假別欄位 */
export function normalizeLoadedSystemConfig(
  parsed: Partial<SystemConfig> & Record<string, unknown>,
  base: SystemConfig
): Pick<
  SystemConfig,
  | 'schoolLevel'
  | 'maxPeriod'
  | 'periodTimeRanges'
  | 'homeroomDayOfWeek'
  | 'homeroomPeriod'
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
  const homeroom = resolveHomeroomSlot({
    homeroomDayOfWeek:
      typeof parsed.homeroomDayOfWeek === 'number'
        ? parsed.homeroomDayOfWeek
        : base.homeroomDayOfWeek,
    homeroomPeriod:
      typeof parsed.homeroomPeriod === 'number' ? parsed.homeroomPeriod : base.homeroomPeriod,
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
    periodTimeRanges: normalizeLoadedPeriodTimeRanges(
      parsed.periodTimeRanges,
      base.periodTimeRanges
    ),
    homeroomDayOfWeek: homeroom.dayOfWeek,
    homeroomPeriod: homeroom.period,
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
