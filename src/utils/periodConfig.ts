import type { PeriodDefinition, SystemConfig } from '../types';

/** 預設：高職／高中常見 1～7 日間 + 第 8 節課輔 */
export const DEFAULT_MAX_PERIOD = 8;
export const DEFAULT_COUNSELING_PERIODS: number[] = [8];

export type PeriodSlotConfig = {
  maxPeriod: number;
  counselingPeriods: number[];
};

export function resolvePeriodConfig(
  config?: Pick<SystemConfig, 'maxPeriod' | 'counselingPeriods'> | null
): PeriodSlotConfig {
  const maxPeriod = Math.max(
    1,
    Math.min(12, Number(config?.maxPeriod) || DEFAULT_MAX_PERIOD)
  );
  const raw = Array.isArray(config?.counselingPeriods)
    ? config!.counselingPeriods!
    : DEFAULT_COUNSELING_PERIODS;
  const counselingPeriods = [
    ...new Set(
      raw
        .map((n) => Number(n))
        .filter((n) => Number.isFinite(n) && n >= 1 && n <= maxPeriod)
    ),
  ].sort((a, b) => a - b);
  return { maxPeriod, counselingPeriods };
}

export function isCounselingPeriod(
  period: number,
  config?: Pick<SystemConfig, 'maxPeriod' | 'counselingPeriods'> | null
): boolean {
  const { counselingPeriods } = resolvePeriodConfig(config);
  return counselingPeriods.includes(period);
}

/** 平日日間正課（含兼課超鐘點）：非課輔、且在 1～maxPeriod */
export function isDaytimePeriod(
  period: number,
  config?: Pick<SystemConfig, 'maxPeriod' | 'counselingPeriods'> | null
): boolean {
  const { maxPeriod, counselingPeriods } = resolvePeriodConfig(config);
  return period >= 1 && period <= maxPeriod && !counselingPeriods.includes(period);
}

export function isCounselingSlot(
  s: Pick<{ dayOfWeek: number; period: number }, 'dayOfWeek' | 'period'>,
  config?: Pick<SystemConfig, 'maxPeriod' | 'counselingPeriods'> | null
): boolean {
  return s.dayOfWeek >= 1 && s.dayOfWeek <= 5 && isCounselingPeriod(s.period, config);
}

export function isDaytimeSlot(
  s: Pick<{ dayOfWeek: number; period: number }, 'dayOfWeek' | 'period'>,
  config?: Pick<SystemConfig, 'maxPeriod' | 'counselingPeriods'> | null
): boolean {
  return s.dayOfWeek >= 1 && s.dayOfWeek <= 5 && isDaytimePeriod(s.period, config);
}

const PERIOD_LABELS: Record<number, string> = {
  1: '第一節',
  2: '第二節',
  3: '第三節',
  4: '第四節',
  5: '第五節',
  6: '第六節',
  7: '第七節',
  8: '第八節',
  9: '第九節',
  10: '第十節',
  11: '第十一節',
  12: '第十二節',
};

const DEFAULT_TIME_RANGES: Record<number, string> = {
  1: '08:10 - 09:00',
  2: '09:10 - 10:00',
  3: '10:10 - 11:00',
  4: '11:10 - 12:00',
  5: '13:10 - 14:00',
  6: '14:10 - 15:00',
  7: '15:10 - 16:00',
  8: '16:10 - 17:00',
  9: '17:10 - 18:00',
  10: '18:10 - 19:00',
  11: '19:10 - 20:00',
  12: '20:10 - 21:00',
};

/** 依系統設定產生節次定義（UI 勾選／課表矩陣用） */
export function buildPeriodDefinitions(
  config?: Pick<SystemConfig, 'maxPeriod' | 'counselingPeriods'> | null
): PeriodDefinition[] {
  const { maxPeriod, counselingPeriods } = resolvePeriodConfig(config);
  const counselingSet = new Set(counselingPeriods);
  return Array.from({ length: maxPeriod }, (_, i) => {
    const period = i + 1;
    const isCounseling = counselingSet.has(period);
    const baseLabel = PERIOD_LABELS[period] || `第${period}節`;
    return {
      period,
      label: isCounseling ? `${baseLabel}(課輔)` : baseLabel,
      timeRange: DEFAULT_TIME_RANGES[period] || '',
      isAfternoon: period >= 5,
    };
  });
}

export function counselingPeriodsLabel(
  config?: Pick<SystemConfig, 'maxPeriod' | 'counselingPeriods'> | null
): string {
  const { counselingPeriods } = resolvePeriodConfig(config);
  if (counselingPeriods.length === 0) return '無課輔節';
  return counselingPeriods.map((p) => `第${p}節`).join('、');
}
