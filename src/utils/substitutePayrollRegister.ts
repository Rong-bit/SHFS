import type { MonthlyTeacherSettlement, SubstituteRequest, SystemConfig } from '../types';
import { leaveTypeRemarkShort } from './leaveTypes';
import {
  buildLeavePayrollContext,
  countSubstitutePublicPayrollPeriodsInMonth,
  listSubstituteConcurrentAddDatesInMonth,
  listSubstitutePublicPayrollDatesInMonth,
  sumUniqueSubstitutePublicPayrollPeriods,
  isLeaveDatePublicPayroll,
  listBillableLeaveDatesInMonth,
  shouldTransferConcurrentToSubstituteOnLeaveDate,
} from './leavePayrollPolicy';
import { nonTeachingDateSet } from './holidays';
import { resolveTeacherSalaryCode, partialStopsForPayroll } from './salaryCodes';
import {
  countSubstitutePayrollWithNoticeRows,
  getRelatedSubstituteRequests,
  leaveDateMovedOffConcurrentPayroll,
  parseNoticeRowHours,
  resolveEffectiveNoticeRows,
} from './noticePayroll';
import {
  formatPayrollMonthRangeLabel,
  formatRocYear,
  isBlankPayrollRow,
  paginatePayrollByUnits,
  PAYROLL_REMARKS_COL_WIDTH,
  PAYROLL_ROWS_PER_PAGE,
} from './overloadPayrollRegister';

export { formatPayrollMonthRangeLabel, formatRocYear, PAYROLL_ROWS_PER_PAGE, isBlankPayrollRow };

export type SubstitutePayrollRow = {
  teacherId: string;
  salaryCode: string;
  teacherName: string;
  substitutePeriods: number;
  ratePerPeriod: number;
  amount: number;
  remarks: string;
};

export type SubstitutePayrollTotals = {
  substitutePeriods: number;
  amount: number;
};

export type SubstitutePayrollPage = {
  pageIndex: number;
  rows: SubstitutePayrollRow[];
  subtotal: SubstitutePayrollTotals;
  /** 小計列「每節金額」欄顯示值（同頁若費率一致則顯示，否則空白） */
  subtotalRateLabel: string;
};

const formatMd = (iso: string) => {
  const [, m, d] = iso.split('-');
  return `${Number(m)}/${Number(d)}`;
};

function formatPeriodLabel(period: number) {
  return `(第${period}節)`;
}

/** 備註：6/17代洪宥均婚假1節(第7節)；多筆以 . 連接 */
export function buildSubstitutePayrollRemarks(
  teacherId: string,
  settlementMonth: number,
  settlementYear: number,
  requests: SubstituteRequest[],
  systemConfig: SystemConfig
): string {
  const holidaySet = nonTeachingDateSet(systemConfig.nonTeachingDays);
  const baseCalendarOpts = {
    temporaryMoves: systemConfig.temporaryScheduleMoves || [],
  };
  const payrollCtx = buildLeavePayrollContext(requests, systemConfig, {
    countStatuses: ['approved'],
  });
  const parts: string[] = [];
  const noticeBatchHandled = new Set<string>();
  const seenPaySlot = new Set<string>();
  const concurrentPaySlots = new Set<string>();
  for (const r of requests) {
    if (r.status !== 'approved' || r.requestType !== 'substitute') continue;
    if (r.substituteTeacherId !== teacherId || !r.substituteTeacherId) continue;
    const period = r.originalSession?.period ?? 0;
    for (const iso of listSubstituteConcurrentAddDatesInMonth(
      r,
      settlementMonth,
      settlementYear,
      payrollCtx,
      holidaySet,
      {
        ...baseCalendarOpts,
        period,
        partialStops: partialStopsForPayroll(
          systemConfig.partialNonTeachingDays,
          { id: r.applicantTeacherId, name: r.applicantTeacherName },
          systemConfig
        ),
      }
    )) {
      if (leaveDateMovedOffConcurrentPayroll(r, requests, iso)) continue;
      concurrentPaySlots.add(`${iso}|${period}`);
    }
  }
  const weeksInMonth = systemConfig.weeksInMonth ?? 5;

  for (const r of requests) {
    if (r.status !== 'approved' || r.requestType !== 'substitute') continue;
    if (r.substituteTeacherId !== teacherId || !r.substituteTeacherId) continue;

    const period = r.originalSession?.period;
    const leaveShort = leaveTypeRemarkShort(r.leaveType, r.reason);
    const prefix = `代${r.applicantTeacherName}${leaveShort}`;
    const periodOpts = {
      ...baseCalendarOpts,
      period,
      partialStops: partialStopsForPayroll(
        systemConfig.partialNonTeachingDays,
        { id: r.applicantTeacherId, name: r.applicantTeacherName },
        systemConfig
      ),
    };

    const effectiveNoticeRows = resolveEffectiveNoticeRows(r, requests);
    if (effectiveNoticeRows) {
      const batchKey = r.batchGroupId ? `${r.batchGroupId}::${teacherId}` : r.id;
      if (noticeBatchHandled.has(batchKey)) continue;
      noticeBatchHandled.add(batchKey);
      const related = getRelatedSubstituteRequests(r, requests);
      const relatedForTeacher = related.filter((item) => item.substituteTeacherId === teacherId);
      const payrollResult = countSubstitutePayrollWithNoticeRows(
        effectiveNoticeRows,
        relatedForTeacher,
        settlementMonth,
        settlementYear,
        weeksInMonth,
        holidaySet,
        periodOpts,
        payrollCtx,
        () =>
          sumUniqueSubstitutePublicPayrollPeriods(
            relatedForTeacher,
            settlementMonth,
            settlementYear,
            payrollCtx,
            holidaySet,
            (req) => ({
              ...baseCalendarOpts,
              period: req.originalSession?.period,
              partialStops: periodOpts.partialStops,
            })
          ),
        teacherId
      );
      if (payrollResult.useBasicRate) {
        for (const { row, iso } of payrollResult.resolvedRows) {
          const slotKey = `${iso}|${row.period}`;
          if (seenPaySlot.has(slotKey) || concurrentPaySlots.has(slotKey)) continue;
          seenPaySlot.add(slotKey);
          const hours = parseNoticeRowHours(row.hours);
          const periodLabel = row.period ? formatPeriodLabel(Number(row.period)) : '';
          parts.push(`${formatMd(iso)}${prefix}${hours}節${periodLabel}`);
        }
      } else if (r.leaveDateStart && period) {
        const dates = listBillableLeaveDatesInMonth(
          r,
          settlementMonth,
          settlementYear,
          holidaySet,
          periodOpts
        ).filter(
          (iso) =>
            isLeaveDatePublicPayroll(iso, r, payrollCtx, r.applicantTeacherId) &&
            !shouldTransferConcurrentToSubstituteOnLeaveDate(iso, r, payrollCtx)
        );
        for (const iso of dates) {
          if (concurrentPaySlots.has(`${iso}|${period}`)) continue;
          parts.push(`${formatMd(iso)}${prefix}1節${formatPeriodLabel(period)}`);
        }
      } else if (payrollResult.periods > 0) {
        const periodLabel = period ? formatPeriodLabel(period) : '';
        parts.push(`${prefix}${payrollResult.periods}節${periodLabel}`);
      }
      continue;
    }

    if (r.leaveDateStart && period) {
      const dates = listSubstitutePublicPayrollDatesInMonth(
        r,
        settlementMonth,
        settlementYear,
        payrollCtx,
        holidaySet,
        periodOpts
      );
      for (const iso of dates) {
        const slotKey = `${iso}|${period}`;
        if (seenPaySlot.has(slotKey) || concurrentPaySlots.has(slotKey)) continue;
        seenPaySlot.add(slotKey);
        parts.push(`${formatMd(iso)}${prefix}1節${formatPeriodLabel(period)}`);
      }
      continue;
    }

    const periods = countSubstitutePublicPayrollPeriodsInMonth(
      r,
      settlementMonth,
      settlementYear,
      payrollCtx,
      holidaySet,
      periodOpts
    );
    if (periods <= 0) continue;
    const periodLabel = period ? formatPeriodLabel(period) : '';
    parts.push(`${prefix}${periods}節${periodLabel}`);
  }

  return parts.join('.');
}

export function buildSubstitutePayrollRows(
  settlements: MonthlyTeacherSettlement[],
  systemConfig: SystemConfig,
  requests: SubstituteRequest[],
  settlementMonth: number,
  settlementYear: number
): SubstitutePayrollRow[] {
  return settlements
    .filter((s) => s.publicSubstitutePeriods > 0)
    .map((s) => {
      const substitutePeriods = s.publicSubstitutePeriods;
      const amount = s.publicSubstituteAmount;
      const ratePerPeriod =
        substitutePeriods > 0
          ? Math.round(amount / substitutePeriods)
          : systemConfig.dayHourlyRate;
      return {
        teacherId: s.teacherId,
        salaryCode: resolveTeacherSalaryCode(
          { id: s.teacherId, name: s.teacherName },
          systemConfig
        ),
        teacherName: s.teacherName,
        substitutePeriods,
        ratePerPeriod,
        amount,
        remarks: buildSubstitutePayrollRemarks(
          s.teacherId,
          settlementMonth,
          settlementYear,
          requests,
          systemConfig
        ),
      };
    })
    .sort((a, b) => {
      const codeA = a.salaryCode || '999999';
      const codeB = b.salaryCode || '999999';
      if (codeA !== codeB) return codeA.localeCompare(codeB, undefined, { numeric: true });
      return a.teacherName.localeCompare(b.teacherName, 'zh-Hant');
    });
}

const sumTotals = (rows: SubstitutePayrollRow[]): SubstitutePayrollTotals =>
  rows.reduce(
    (acc, r) => ({
      substitutePeriods: acc.substitutePeriods + r.substitutePeriods,
      amount: acc.amount + r.amount,
    }),
    { substitutePeriods: 0, amount: 0 }
  );

const subtotalRateLabel = (rows: SubstitutePayrollRow[]) => {
  if (rows.length === 0) return '';
  const rates = new Set(rows.map((r) => r.ratePerPeriod));
  return rates.size === 1 ? String(rows[0].ratePerPeriod) : '';
};

export function paginateSubstitutePayroll(rows: SubstitutePayrollRow[]): {
  pages: SubstitutePayrollPage[];
  grandTotal: SubstitutePayrollTotals;
  grandTotalRateLabel: string;
} {
  const grandTotal = sumTotals(rows);
  const grandTotalRateLabel = subtotalRateLabel(rows);
  if (rows.length === 0) {
    return { pages: [], grandTotal, grandTotalRateLabel: '' };
  }

  const createBlank = (idx: number) => ({
    teacherId: `__blank-${idx}`,
    salaryCode: '',
    teacherName: '',
    substitutePeriods: 0,
    ratePerPeriod: 0,
    amount: 0,
    remarks: '',
  });
  const slices = paginatePayrollByUnits(
    rows,
    (r) => r.remarks,
    createBlank,
    PAYROLL_REMARKS_COL_WIDTH.substitute
  );
  const pages: SubstitutePayrollPage[] = slices.map((slice, idx) => ({
    pageIndex: idx + 1,
    rows: slice.paddedRows,
    subtotal: sumTotals(slice.rows),
    subtotalRateLabel: subtotalRateLabel(slice.rows),
  }));
  return { pages, grandTotal, grandTotalRateLabel };
}
