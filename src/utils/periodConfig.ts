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

/**
 * 預設作息（對齊高雄市立中正高工常見日課表）。
 * 他校可於「系統管理員 → 學校與學制 → 各節上課時段」自行調整。
 */
export const DEFAULT_TIME_RANGES: Record<number, string> = {
  1: '08:00 - 08:50',
  2: '09:00 - 09:50',
  3: '10:10 - 11:00',
  4: '11:10 - 12:00',
  5: '13:30 - 14:20',
  6: '14:30 - 15:20',
  7: '15:30 - 16:20',
  8: '16:30 - 17:20',
  9: '17:30 - 18:20',
  10: '18:30 - 19:20',
  11: '19:30 - 20:20',
  12: '20:30 - 21:20',
};

const TIME_RANGE_RE = /^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/;

/** 正規化「HH:MM - HH:MM」；無效則回傳 null */
export function normalizeTimeRange(raw: string | undefined | null): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const m = TIME_RANGE_RE.exec(raw.trim().replace(/～|—|–/g, '-'));
  if (!m) return null;
  const h1 = Number(m[1]);
  const min1 = Number(m[2]);
  const h2 = Number(m[3]);
  const min2 = Number(m[4]);
  if (
    h1 > 23 ||
    h2 > 23 ||
    min1 > 59 ||
    min2 > 59 ||
    h1 * 60 + min1 >= h2 * 60 + min2
  ) {
    return null;
  }
  const fmt = (h: number, min: number) =>
    `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  return `${fmt(h1, min1)} - ${fmt(h2, min2)}`;
}

function parseStartMinutes(timeRange: string): number | null {
  const m = TIME_RANGE_RE.exec(timeRange.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** 合併自訂時段與預設；缺漏或格式錯用預設 */
export function resolvePeriodTimeRanges(
  config?: Pick<SystemConfig, 'maxPeriod' | 'counselingPeriods' | 'periodTimeRanges'> | null
): Record<number, string> {
  const { maxPeriod } = resolvePeriodConfig(config);
  const custom = config?.periodTimeRanges || {};
  const out: Record<number, string> = {};
  for (let period = 1; period <= Math.max(maxPeriod, 12); period++) {
    const normalized = normalizeTimeRange(custom[String(period)]);
    out[period] = normalized || DEFAULT_TIME_RANGES[period] || '';
  }
  return out;
}

/** 依系統設定產生節次定義（UI 勾選／課表矩陣／巡堂節次用） */
export function buildPeriodDefinitions(
  config?: Pick<SystemConfig, 'maxPeriod' | 'counselingPeriods' | 'periodTimeRanges'> | null
): PeriodDefinition[] {
  const { maxPeriod, counselingPeriods } = resolvePeriodConfig(config);
  const timeRanges = resolvePeriodTimeRanges(config);
  const counselingSet = new Set(counselingPeriods);
  return Array.from({ length: maxPeriod }, (_, i) => {
    const period = i + 1;
    const isCounseling = counselingSet.has(period);
    const baseLabel = PERIOD_LABELS[period] || `第${period}節`;
    const timeRange = timeRanges[period] || '';
    const startMins = parseStartMinutes(timeRange);
    return {
      period,
      label: isCounseling ? `${baseLabel}(課輔)` : baseLabel,
      timeRange,
      isAfternoon: startMins != null ? startMins >= 12 * 60 : period >= 5,
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
