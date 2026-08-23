import type { MonthlyTeacherSettlement, SubstituteRequest, SystemConfig } from '../types';
import { leaveTypeRemarkShort } from './leaveTypes';
import {
  countLeaveSubstitutePeriods,
  countLeaveSubstitutePeriodsInMonth,
} from './leaveDates';
import { nonTeachingDateSet } from './holidays';
import { resolveTeacherSalaryCode } from './salaryCodes';

/** 每頁資料列（含空白補列）；其後接小計再換頁 */
export const PAYROLL_ROWS_PER_PAGE = 45;

/** 空白列（補滿一頁用，不計入小計） */
export function isBlankPayrollRow(teacherId: string): boolean {
  return teacherId.startsWith('__blank-');
}

export function createBlankOverloadRow(index: number): OverloadPayrollRow {
  return {
    teacherId: `__blank-${index}`,
    salaryCode: '',
    teacherName: '',
    weeklyConcurrent: 0,
    baseMonthlyConcurrent: 0,
    addConcurrent: 0,
    subtractConcurrent: 0,
    actualConcurrent: 0,
    amount: 0,
    remarks: '',
  };
}

export function padPayrollRowsToPage<T>(
  rows: T[],
  createBlank: (index: number) => T,
  pageSize = PAYROLL_ROWS_PER_PAGE
): T[] {
  if (rows.length >= pageSize) return rows;
  const out = [...rows];
  let i = 0;
  while (out.length < pageSize) {
    out.push(createBlank(i++));
  }
  return out;
}

export type OverloadPayrollRow = {
  teacherId: string;
  salaryCode: string;
  teacherName: string;
  weeklyConcurrent: number;
  baseMonthlyConcurrent: number;
  addConcurrent: number;
  subtractConcurrent: number;
  actualConcurrent: number;
  amount: number;
  remarks: string;
};

export type OverloadPayrollTotals = {
  weeklyConcurrent: number;
  baseMonthlyConcurrent: number;
  addConcurrent: number;
  subtractConcurrent: number;
  actualConcurrent: number;
  amount: number;
};

export type OverloadPayrollPage = {
  pageIndex: number;
  rows: OverloadPayrollRow[];
  subtotal: OverloadPayrollTotals;
};

const sumTotals = (rows: OverloadPayrollRow[]): OverloadPayrollTotals =>
  rows.reduce(
    (acc, r) => ({
      weeklyConcurrent: acc.weeklyConcurrent + r.weeklyConcurrent,
      baseMonthlyConcurrent: acc.baseMonthlyConcurrent + r.baseMonthlyConcurrent,
      addConcurrent: acc.addConcurrent + r.addConcurrent,
      subtractConcurrent: acc.subtractConcurrent + r.subtractConcurrent,
      actualConcurrent: acc.actualConcurrent + r.actualConcurrent,
      amount: acc.amount + r.amount,
    }),
    {
      weeklyConcurrent: 0,
      baseMonthlyConcurrent: 0,
      addConcurrent: 0,
      subtractConcurrent: 0,
      actualConcurrent: 0,
      amount: 0,
    }
  );

export const formatRocYear = (westernYear: number) => westernYear - 1911;

export const formatPayrollMonthRangeLabel = (
  month: number,
  westernYear: number,
  weeks: number
) => {
  const roc = formatRocYear(westernYear);
  const lastDay = new Date(westernYear, month, 0).getDate();
  const weekLabel = Number.isInteger(weeks) ? weeks : Math.round(weeks * 10) / 10;
  return `${roc}年${month}月1日 ~ ${roc}年${month}月${lastDay}日 共(${weekLabel}週)`;
};

const formatMd = (dateStr: string) => {
  const [, m, d] = dateStr.split('-');
  return `${Number(m)}/${Number(d)}`;
};

/** 備註：代課應加、請假應減（兼課節次） */
export function buildConcurrentPayrollRemarks(
  teacherId: string,
  settlementMonth: number,
  settlementYear: number,
  requests: SubstituteRequest[],
  systemConfig: SystemConfig
): string {
  const holidaySet = nonTeachingDateSet(systemConfig.nonTeachingDays);
  const calendarOpts = {
    temporaryMoves: systemConfig.temporaryScheduleMoves || [],
    partialStops: systemConfig.partialNonTeachingDays || [],
  };
  const parts: string[] = [];

  const pushDates = (
    r: SubstituteRequest,
    periods: number,
    prefix: string
  ) => {
    if (periods <= 0) return;
    const period = r.originalSession?.period;
    const periodLabel = period ? `(第${period}節)` : '';
    const start = r.leaveDateStart;
    const end = r.leaveDateEnd || r.leaveDateStart;
    if (start) {
      if (end && end !== start) {
        parts.push(`${formatMd(start)}~${formatMd(end)}${prefix}${periods}節${periodLabel}`);
      } else {
        parts.push(`${formatMd(start)}${prefix}${periods}節${periodLabel}`);
      }
      return;
    }
    parts.push(`${prefix}${periods}節${periodLabel}`);
  };

  for (const r of requests) {
    if (r.status !== 'approved' || r.requestType !== 'substitute') continue;
    if (!r.substituteTeacherId || !r.originalSession?.isConcurrent) continue;
    if (r.originalSession.period < 1 || r.originalSession.period > 7) continue;

    const inMonth = countLeaveSubstitutePeriodsInMonth(
      r,
      settlementMonth,
      settlementYear,
      holidaySet,
      calendarOpts
    );
    const periods =
      inMonth === null
        ? countLeaveSubstitutePeriods(r, holidaySet, {
            settlementMonth,
            settlementYear,
            ...calendarOpts,
          })
        : inMonth;
    if (periods <= 0) continue;

    if (r.substituteTeacherId === teacherId) {
      const leaveShort = leaveTypeRemarkShort(r.leaveType, r.reason);
      pushDates(r, periods, `代${r.applicantTeacherName}${leaveShort}`);
    }
    if (r.applicantTeacherId === teacherId) {
      pushDates(r, periods, `請${leaveTypeRemarkShort(r.leaveType)}扣兼課`);
    }
  }

  return parts.join('；');
}

export function buildOverloadPayrollRows(
  settlements: MonthlyTeacherSettlement[],
  systemConfig: SystemConfig,
  requests: SubstituteRequest[],
  settlementMonth: number,
  settlementYear: number
): OverloadPayrollRow[] {
  return settlements
    .filter(
      (s) =>
        s.weeklyOverloadPeriods > 0 ||
        s.monthlyConcurrentBasePeriods > 0 ||
        s.concurrentAddPeriods > 0 ||
        s.concurrentSubtractPeriods > 0 ||
        s.monthlyConcurrentPeriods > 0
    )
    .map((s) => ({
      teacherId: s.teacherId,
      salaryCode: resolveTeacherSalaryCode(
        { id: s.teacherId, name: s.teacherName },
        systemConfig
      ),
      teacherName: s.teacherName,
      weeklyConcurrent: s.weeklyOverloadPeriods,
      baseMonthlyConcurrent: s.monthlyConcurrentBasePeriods,
      addConcurrent: s.concurrentAddPeriods,
      subtractConcurrent: s.concurrentSubtractPeriods,
      actualConcurrent: s.monthlyConcurrentPeriods,
      amount: s.concurrentPayrollAmount,
      remarks: buildConcurrentPayrollRemarks(
        s.teacherId,
        settlementMonth,
        settlementYear,
        requests,
        systemConfig
      ),
    }))
    .sort((a, b) => {
      const codeA = a.salaryCode || '999999';
      const codeB = b.salaryCode || '999999';
      if (codeA !== codeB) return codeA.localeCompare(codeB, undefined, { numeric: true });
      return a.teacherName.localeCompare(b.teacherName, 'zh-Hant');
    });
}

export function paginateOverloadPayroll(rows: OverloadPayrollRow[]): {
  pages: OverloadPayrollPage[];
  grandTotal: OverloadPayrollTotals;
} {
  const grandTotal = sumTotals(rows);
  if (rows.length === 0) {
    return { pages: [], grandTotal };
  }

  const pages: OverloadPayrollPage[] = [];
  for (let i = 0; i < rows.length; i += PAYROLL_ROWS_PER_PAGE) {
    const slice = rows.slice(i, i + PAYROLL_ROWS_PER_PAGE);
    pages.push({
      pageIndex: pages.length + 1,
      rows: padPayrollRowsToPage(slice, createBlankOverloadRow),
      subtotal: sumTotals(slice),
    });
  }
  return { pages, grandTotal };
}
