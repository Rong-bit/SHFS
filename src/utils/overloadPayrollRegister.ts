import type { MonthlyTeacherSettlement, SubstituteRequest, SystemConfig } from '../types';
import { formatPayrollMonthRangeLabel as formatSettlementMonthRangeLabel } from './settlementPeriod';
import { leaveTypeRemarkShort } from './leaveTypes';
import {
  buildLeavePayrollContext,
  countConcurrentDeductPeriodsInMonth,
  countSubstituteConcurrentAddPeriodsInMonth,
  listBillableLeaveDatesInMonth,
  shouldDeductConcurrentOnLeaveDate,
  shouldTransferConcurrentToSubstituteOnLeaveDate,
} from './leavePayrollPolicy';
import { requestHasModifiedNoticePayrollRow } from './noticePayroll';
import { nonTeachingDateSet } from './holidays';
import { resolveTeacherSalaryCode, partialStopsForPayroll } from './salaryCodes';
import type { Teacher } from '../types';

/**
 * 中間頁資料列（含空白補列）；非末頁小計後換頁。
 * Excel／畫面／列印共用；44 為 A4 實測（緊湊列高）可容納量。
 */
export const PAYROLL_ROWS_PER_PAGE = 44;

/**
 * 末頁空白補列上限（實際資料列仍最多 44）。
 * 略少補幾列以預留合計＋簽核；不另拆頁。
 */
export const PAYROLL_ROWS_LAST_PAGE = 41;

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
  weeksInMonth = 4
) => formatSettlementMonthRangeLabel(month, westernYear, weeksInMonth);

const formatMd = (dateStr: string) => {
  const [, m, d] = dateStr.split('-');
  return `${Number(m)}/${Number(d)}`;
};

/** 備註：請假應減兼課；代課超鐘點應加兼課（依薪資對照表） */
export function buildConcurrentPayrollRemarks(
  teacherId: string,
  settlementMonth: number,
  settlementYear: number,
  requests: SubstituteRequest[],
  systemConfig: SystemConfig,
  teacher?: Pick<Teacher, 'id' | 'name'>
): string {
  const holidaySet = nonTeachingDateSet(systemConfig.nonTeachingDays);
  const teacherPick = teacher ?? { id: teacherId, name: '' };
  const calendarOpts = {
    temporaryMoves: systemConfig.temporaryScheduleMoves || [],
    partialStops: partialStopsForPayroll(
      systemConfig.partialNonTeachingDays,
      teacherPick,
      systemConfig
    ),
  };
  const payrollCtx = buildLeavePayrollContext(requests, systemConfig, {
    countStatuses: ['approved'],
  });
  const parts: string[] = [];

  const pushDateLines = (
    r: SubstituteRequest,
    prefix: string,
    matchDate: (iso: string) => boolean,
    countPeriods: () => number
  ) => {
    const period = r.originalSession?.period;
    const periodLabel = period ? `(第${period}節)` : '';
    const periodOpts = { ...calendarOpts, period };
    const dates = r.leaveDateStart
      ? listBillableLeaveDatesInMonth(
          r,
          settlementMonth,
          settlementYear,
          holidaySet,
          periodOpts
        ).filter(matchDate)
      : [];
    if (dates.length > 0) {
      for (const iso of dates) {
        parts.push(`${formatMd(iso)}${prefix}1節${periodLabel}`);
      }
      return;
    }
    const periods = countPeriods();
    if (periods <= 0) return;
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
    if (!r.originalSession?.isConcurrent) continue;
    if (r.originalSession.period < 1 || r.originalSession.period > 7) continue;
    if (r.applicantTeacherId !== teacherId) continue;
    if (!r.substituteTeacherId) continue;

    const periodOpts = { ...calendarOpts, period: r.originalSession.period };
    pushDateLines(
      r,
      `請${leaveTypeRemarkShort(r.leaveType, r.reason)}扣兼課`,
      (iso) => shouldDeductConcurrentOnLeaveDate(iso, r, payrollCtx),
      () =>
        countConcurrentDeductPeriodsInMonth(
          r,
          settlementMonth,
          settlementYear,
          payrollCtx,
          holidaySet,
          periodOpts
        )
    );
  }

  for (const r of requests) {
    if (r.status !== 'approved' || r.requestType !== 'substitute') continue;
    if (!r.originalSession?.isConcurrent) continue;
    if (r.originalSession.period < 1 || r.originalSession.period > 7) continue;
    if (r.substituteTeacherId !== teacherId) continue;
    if (requestHasModifiedNoticePayrollRow(r, requests)) continue;

    const leaveShort = leaveTypeRemarkShort(r.leaveType, r.reason);
    const periodOpts = { ...calendarOpts, period: r.originalSession.period };
    pushDateLines(
      r,
      `代${r.applicantTeacherName}${leaveShort}兼課`,
      (iso) => shouldTransferConcurrentToSubstituteOnLeaveDate(iso, r, payrollCtx),
      () =>
        countSubstituteConcurrentAddPeriodsInMonth(
          r,
          settlementMonth,
          settlementYear,
          payrollCtx,
          holidaySet,
          periodOpts
        )
    );
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
        systemConfig,
        { id: s.teacherId, name: s.teacherName }
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
    const isLastPage = i + PAYROLL_ROWS_PER_PAGE >= rows.length;
    const padSize = isLastPage ? PAYROLL_ROWS_LAST_PAGE : PAYROLL_ROWS_PER_PAGE;
    pages.push({
      pageIndex: pages.length + 1,
      rows: padPayrollRowsToPage(slice, createBlankOverloadRow, padSize),
      subtotal: sumTotals(slice),
    });
  }
  return { pages, grandTotal };
}
