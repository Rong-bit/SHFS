import type { MonthlyTeacherSettlement, SubstituteRequest, SystemConfig } from '../types';
import { leaveTypeRemarkShort } from './leaveTypes';
import {
  countLeaveSubstitutePeriods,
  countLeaveSubstitutePeriodsInMonth,
  inferRequestMonth,
  isLeaveDatePeriodBillable,
} from './leaveDates';
import { nonTeachingDateSet } from './holidays';
import { resolveTeacherSalaryCode } from './salaryCodes';
import {
  formatPayrollMonthRangeLabel,
  formatRocYear,
  PAYROLL_ROWS_PER_PAGE,
} from './overloadPayrollRegister';

export { formatPayrollMonthRangeLabel, formatRocYear, PAYROLL_ROWS_PER_PAGE };

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

const dateToIsoLocal = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/** 請假區間內、落在結算月且星期相符的可計費日期 */
function listBillableLeaveDatesInMonth(
  request: Pick<SubstituteRequest, 'leaveDateStart' | 'leaveDateEnd' | 'originalSession'>,
  settlementMonth: number,
  settlementYear: number,
  excludeDates: Set<string>,
  calendarOpts: {
    temporaryMoves?: SystemConfig['temporaryScheduleMoves'];
    partialStops?: SystemConfig['partialNonTeachingDays'];
  }
): string[] {
  if (!request.leaveDateStart || !request.originalSession) return [];
  const end = request.leaveDateEnd || request.leaveDateStart;
  const dayOfWeek = request.originalSession.dayOfWeek;
  const period = request.originalSession.period;
  const billableOpts = {
    period,
    temporaryMoves: calendarOpts.temporaryMoves,
    partialStops: calendarOpts.partialStops,
  };

  const s = new Date(request.leaveDateStart.replace(/-/g, '/') + ' 12:00:00');
  const e = new Date(end.replace(/-/g, '/') + ' 12:00:00');
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) return [];

  const dates: string[] = [];
  for (let cur = new Date(s); cur <= e; cur.setDate(cur.getDate() + 1)) {
    if (cur.getDay() !== dayOfWeek) continue;
    if (cur.getMonth() + 1 !== settlementMonth) continue;
    if (cur.getFullYear() !== settlementYear) continue;
    const iso = dateToIsoLocal(cur);
    if (!isLeaveDatePeriodBillable(iso, excludeDates, billableOpts)) continue;
    dates.push(iso);
  }
  return dates;
}

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
  const calendarOpts = {
    temporaryMoves: systemConfig.temporaryScheduleMoves || [],
    partialStops: systemConfig.partialNonTeachingDays || [],
  };
  const parts: string[] = [];

  for (const r of requests) {
    if (r.status !== 'approved' || r.requestType !== 'substitute') continue;
    if (r.substituteTeacherId !== teacherId || !r.substituteTeacherId) continue;

    const period = r.originalSession?.period;
    const leaveShort = leaveTypeRemarkShort(r.leaveType, r.reason);
    const prefix = `代${r.applicantTeacherName}${leaveShort}`;

    if (r.leaveDateStart && period) {
      const dates = listBillableLeaveDatesInMonth(
        r,
        settlementMonth,
        settlementYear,
        holidaySet,
        calendarOpts
      );
      for (const iso of dates) {
        parts.push(`${formatMd(iso)}${prefix}1節${formatPeriodLabel(period)}`);
      }
      continue;
    }

    const inMonth = countLeaveSubstitutePeriodsInMonth(
      r,
      settlementMonth,
      settlementYear,
      holidaySet,
      calendarOpts
    );
    const periods =
      inMonth === null
        ? inferRequestMonth(r.requestNumber, r.createdAt) === settlementMonth
          ? countLeaveSubstitutePeriods(r, holidaySet, {
              settlementMonth,
              settlementYear,
              ...calendarOpts,
            })
          : 0
        : inMonth;
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
    .filter((s) => s.publicSubstitutePeriods + s.privateSubstituteEarnPeriods > 0)
    .map((s) => {
      const substitutePeriods = s.publicSubstitutePeriods + s.privateSubstituteEarnPeriods;
      const amount = s.publicSubstituteAmount + s.privateSubstituteEarnAmount;
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

  const pages: SubstitutePayrollPage[] = [];
  for (let i = 0; i < rows.length; i += PAYROLL_ROWS_PER_PAGE) {
    const slice = rows.slice(i, i + PAYROLL_ROWS_PER_PAGE);
    pages.push({
      pageIndex: pages.length + 1,
      rows: slice,
      subtotal: sumTotals(slice),
      subtotalRateLabel: subtotalRateLabel(slice),
    });
  }
  return { pages, grandTotal, grandTotalRateLabel };
}
