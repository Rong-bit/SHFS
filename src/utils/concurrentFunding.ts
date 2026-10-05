import type { MonthlyTeacherSettlement, SystemConfig } from '../types';

export const SCHOOL_FUND_NAME = '學校';

export type ConcurrentFundingConfig = Pick<
  SystemConfig,
  'concurrentFundingSources' | 'concurrentFundingByName'
>;

export type ConcurrentFundShare = {
  fundName: string;
  weekly: number;
  base: number;
  add: number;
  subtract: number;
  actual: number;
  amount: number;
};

export type ConcurrentFundingSplit = {
  shares: ConcurrentFundShare[];
  /** 外部經費每週節數合計超過課表每週兼課 */
  weeklyExceeded: boolean;
  /** 外部經費月節數超過實得兼課，已由最後一個經費往回壓低 */
  capped: boolean;
};

const toPeriods = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** 清理匯入或 localStorage 讀回的經費設定：去空白、去重複、去掉 0 節 */
export function sanitizeConcurrentFunding(
  config: Partial<ConcurrentFundingConfig> | null | undefined
): Required<ConcurrentFundingConfig> {
  const rawSources = Array.isArray(config?.concurrentFundingSources)
    ? config!.concurrentFundingSources
    : [];
  const sources: string[] = [];
  for (const s of rawSources) {
    const name = String(s ?? '').trim();
    if (name && name !== SCHOOL_FUND_NAME && !sources.includes(name)) sources.push(name);
  }

  const byName: Record<string, Record<string, number>> = {};
  const rawByName =
    config?.concurrentFundingByName && typeof config.concurrentFundingByName === 'object'
      ? config.concurrentFundingByName
      : {};
  for (const [teacher, funds] of Object.entries(rawByName)) {
    const name = teacher.trim();
    if (!name || !funds || typeof funds !== 'object') continue;
    const clean: Record<string, number> = {};
    for (const [fund, periods] of Object.entries(funds)) {
      const fundName = fund.trim();
      const n = toPeriods(periods);
      if (!fundName || fundName === SCHOOL_FUND_NAME || n <= 0) continue;
      clean[fundName] = n;
      if (!sources.includes(fundName)) sources.push(fundName);
    }
    if (Object.keys(clean).length > 0) byName[name] = clean;
  }

  return { concurrentFundingSources: sources, concurrentFundingByName: byName };
}

/** 清冊頁籤：學校在前，其後依匯入欄位順序列出全部外部經費（含本月無人使用者） */
export function listConcurrentFundNames(config: ConcurrentFundingConfig): string[] {
  return [SCHOOL_FUND_NAME, ...sanitizeConcurrentFunding(config).concurrentFundingSources];
}

/** 各經費有填節數的教師人數（頁籤標示用） */
export function countTeachersByFund(config: ConcurrentFundingConfig): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const funds of Object.values(sanitizeConcurrentFunding(config).concurrentFundingByName)) {
    for (const name of Object.keys(funds)) counts[name] = (counts[name] || 0) + 1;
  }
  return counts;
}

export function teacherExternalFunding(
  teacherName: string,
  config: ConcurrentFundingConfig
): Record<string, number> {
  return config.concurrentFundingByName?.[teacherName.trim()] || {};
}

/**
 * 依經費拆分兼課：外部經費固定「每週節數 × 週數」，不受請假／代課影響；
 * 應加、應減全數歸學校經費。外部合計超過實得兼課時，由最後一個經費往回壓低。
 */
export function splitConcurrentByFunding(
  settlement: Pick<
    MonthlyTeacherSettlement,
    | 'teacherName'
    | 'weeklyOverloadPeriods'
    | 'monthlyConcurrentBasePeriods'
    | 'concurrentAddPeriods'
    | 'concurrentSubtractPeriods'
    | 'monthlyConcurrentPeriods'
    | 'concurrentPayrollAmount'
  >,
  config: ConcurrentFundingConfig,
  weeks: number,
  ratePerPeriod: number
): ConcurrentFundingSplit {
  const funding = teacherExternalFunding(settlement.teacherName, config);
  const order = sanitizeConcurrentFunding(config).concurrentFundingSources;
  const externalNames = order.filter((name) => toPeriods(funding[name]) > 0);

  const external = externalNames.map((fundName) => {
    const weekly = toPeriods(funding[fundName]);
    return { fundName, weekly, base: Math.round(weekly * Math.max(0, weeks)) };
  });

  const totalActual = Math.max(0, settlement.monthlyConcurrentPeriods);
  let overflow = external.reduce((sum, e) => sum + e.base, 0) - totalActual;
  const capped = overflow > 0;
  const externalActual = external.map((e) => e.base);
  for (let i = externalActual.length - 1; i >= 0 && overflow > 0; i--) {
    const cut = Math.min(externalActual[i], overflow);
    externalActual[i] -= cut;
    overflow -= cut;
  }

  const externalShares: ConcurrentFundShare[] = external.map((e, i) => ({
    fundName: e.fundName,
    weekly: e.weekly,
    base: externalActual[i],
    add: 0,
    subtract: 0,
    actual: externalActual[i],
    amount: externalActual[i] * ratePerPeriod,
  }));

  const extWeekly = external.reduce((sum, e) => sum + e.weekly, 0);
  const extActual = externalActual.reduce((sum, n) => sum + n, 0);
  const extAmount = externalShares.reduce((sum, s) => sum + s.amount, 0);

  const school: ConcurrentFundShare = {
    fundName: SCHOOL_FUND_NAME,
    weekly: Math.max(0, settlement.weeklyOverloadPeriods - extWeekly),
    base: Math.max(0, settlement.monthlyConcurrentBasePeriods - extActual),
    add: settlement.concurrentAddPeriods,
    subtract: settlement.concurrentSubtractPeriods,
    actual: totalActual - extActual,
    amount: settlement.concurrentPayrollAmount - extAmount,
  };

  return {
    shares: [school, ...externalShares],
    weeklyExceeded: extWeekly > settlement.weeklyOverloadPeriods,
    capped,
  };
}
