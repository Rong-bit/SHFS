import type {
  CourseSession,
  MonthlyTeacherSettlement,
  SubstituteRequest,
  SystemConfig,
} from '../types';
import { leaveTypeRemarkShort } from './leaveTypes';
import {
  countLeaveSubstitutePeriods,
  countLeaveSubstitutePeriodsInMonth,
  isLeaveDatePeriodBillable,
  legacyRequestBelongsToSettlement,
} from './leaveDates';
import { nonTeachingDateSet } from './holidays';
import { isDateInSettlementMonth } from './settlementPeriod';
import { resolveTeacherSalaryCode, partialStopsForPayroll } from './salaryCodes';
import type { Teacher } from '../types';
import {
  formatPayrollMonthRangeLabel,
  formatRocYear,
  isBlankPayrollRow,
  padPayrollRowsToPage,
  PAYROLL_ROWS_LAST_PAGE,
  PAYROLL_ROWS_PER_PAGE,
} from './overloadPayrollRegister';

export { formatPayrollMonthRangeLabel, formatRocYear, PAYROLL_ROWS_PER_PAGE, isBlankPayrollRow };

export type CounselingPayrollRow = {
  teacherId: string;
  salaryCode: string;
  teacherName: string;
  weeklyHours: number;
  baseMonthlyHours: number;
  addPeriods: number;
  subtractPeriods: number;
  actualPeriods: number;
  ratePerPeriod: number;
  amount: number;
  remarks: string;
};

export type CounselingPayrollTotals = {
  weeklyHours: number;
  baseMonthlyHours: number;
  addPeriods: number;
  subtractPeriods: number;
  actualPeriods: number;
  amount: number;
};

export type CounselingPayrollPage = {
  pageIndex: number;
  rows: CounselingPayrollRow[];
  subtotal: CounselingPayrollTotals;
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

const jsDayToSchoolDay = (jsDay: number) => jsDay;

function teacherPeriod8Weekdays(
  sessions: CourseSession[],
  teacherId: string
): Set<number> {
  const days = new Set<number>();
  sessions.forEach((s) => {
    if (s.teacherId === teacherId && s.period === 8 && s.dayOfWeek >= 1 && s.dayOfWeek <= 5) {
      days.add(s.dayOfWeek);
    }
  });
  return days;
}

function listBillableLeaveDatesInMonth(
  request: Pick<SubstituteRequest, 'leaveDateStart' | 'leaveDateEnd' | 'originalSession'>,
  settlementMonth: number,
  settlementYear: number,
  excludeDates: Set<string>,
  calendarOpts: {
    temporaryMoves?: SystemConfig['temporaryScheduleMoves'];
    partialStops?: SystemConfig['partialNonTeachingDays'];
    weeksInMonth?: number;
  }
): string[] {
  if (!request.leaveDateStart || !request.originalSession) return [];
  const end = request.leaveDateEnd || request.leaveDateStart;
  const dayOfWeek = request.originalSession.dayOfWeek;
  const period = request.originalSession.period;
  const weeksInMonth = calendarOpts.weeksInMonth ?? 4;
  const billableOpts = {
    period,
    temporaryMoves: calendarOpts.temporaryMoves,
    partialStops: calendarOpts.partialStops,
    weeksInMonth,
  };

  const s = new Date(request.leaveDateStart.replace(/-/g, '/') + ' 12:00:00');
  const e = new Date(end.replace(/-/g, '/') + ' 12:00:00');
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) return [];

  const dates: string[] = [];
  for (let cur = new Date(s); cur <= e; cur.setDate(cur.getDate() + 1)) {
    if (cur.getDay() !== dayOfWeek) continue;
    const iso = dateToIsoLocal(cur);
    if (!isDateInSettlementMonth(iso, settlementMonth, settlementYear, weeksInMonth)) continue;
    if (!isLeaveDatePeriodBillable(iso, excludeDates, billableOpts)) continue;
    dates.push(iso);
  }
  return dates;
}

/** 備註：段考／半日停課、請假扣節等 */
export function buildCounselingPayrollRemarks(
  teacherId: string,
  settlementMonth: number,
  settlementYear: number,
  sessions: CourseSession[],
  requests: SubstituteRequest[],
  systemConfig: SystemConfig,
  teacher?: Pick<Teacher, 'id' | 'name'>
): string {
  const holidaySet = nonTeachingDateSet(systemConfig.nonTeachingDays);
  const teacherPick = teacher ?? { id: teacherId, name: '' };
  const payrollPartialStops = partialStopsForPayroll(
    systemConfig.partialNonTeachingDays,
    teacherPick,
    systemConfig
  );
  const calendarOpts = {
    temporaryMoves: systemConfig.temporaryScheduleMoves || [],
    partialStops: payrollPartialStops,
    weeksInMonth: systemConfig.weeksInMonth ?? 4,
  };
  const period8Days = teacherPeriod8Weekdays(sessions, teacherId);
  const parts: string[] = [];

  for (const stop of payrollPartialStops) {
    if (!stop.date || !stop.periods?.includes(8)) continue;
    const d = new Date(stop.date.replace(/-/g, '/') + ' 12:00:00');
    if (Number.isNaN(d.getTime())) continue;
    if (!isDateInSettlementMonth(stop.date, settlementMonth, settlementYear, calendarOpts.weeksInMonth)) continue;
    const schoolDay = jsDayToSchoolDay(d.getDay());
    if (schoolDay < 1 || schoolDay > 5 || !period8Days.has(schoolDay)) continue;
    const label = stop.label?.trim() || '半日停課';
    parts.push(`${formatMd(stop.date)}${label}扣1節`);
  }

  for (const r of requests) {
    if (r.status !== 'approved' || r.requestType !== 'substitute') continue;
    if (r.applicantTeacherId !== teacherId || !r.substituteTeacherId) continue;
    if (r.originalSession?.period !== 8) continue;

    const leaveShort = leaveTypeRemarkShort(r.leaveType, r.reason);

    if (r.leaveDateStart) {
      const dates = listBillableLeaveDatesInMonth(
        r,
        settlementMonth,
        settlementYear,
        holidaySet,
        calendarOpts
      );
      for (const iso of dates) {
        parts.push(`${formatMd(iso)}請${leaveShort}扣1節(第8節)`);
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
        ? legacyRequestBelongsToSettlement(
            r.requestNumber,
            r.createdAt,
            settlementMonth,
            settlementYear
          )
          ? countLeaveSubstitutePeriods(r, holidaySet, {
              settlementMonth,
              settlementYear,
              ...calendarOpts,
            })
          : 0
        : inMonth;
    if (periods <= 0) continue;
    parts.push(`請${leaveShort}扣${periods}節(第8節)`);
  }

  return parts.join(' ');
}

export function buildCounselingPayrollRows(
  settlements: MonthlyTeacherSettlement[],
  systemConfig: SystemConfig,
  sessions: CourseSession[],
  requests: SubstituteRequest[],
  settlementMonth: number,
  settlementYear: number,
  counselingRate: number
): CounselingPayrollRow[] {
  return settlements
    .filter(
      (s) =>
        s.weeklyCounselingPeriods > 0 ||
        s.monthlyCounselingBasePeriods > 0 ||
        s.counselingAddPeriods > 0 ||
        s.counselingSubtractPeriods > 0 ||
        s.monthlyCounselingPeriods > 0
    )
    .map((s) => ({
      teacherId: s.teacherId,
      salaryCode: resolveTeacherSalaryCode(
        { id: s.teacherId, name: s.teacherName },
        systemConfig
      ),
      teacherName: s.teacherName,
      weeklyHours: s.weeklyCounselingPeriods,
      baseMonthlyHours: s.monthlyCounselingBasePeriods,
      addPeriods: s.counselingAddPeriods,
      subtractPeriods: s.counselingSubtractPeriods,
      actualPeriods: s.monthlyCounselingPeriods,
      ratePerPeriod: counselingRate,
      amount: s.counselingPayrollAmount,
      remarks: buildCounselingPayrollRemarks(
        s.teacherId,
        settlementMonth,
        settlementYear,
        sessions,
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

const sumTotals = (rows: CounselingPayrollRow[]): CounselingPayrollTotals =>
  rows.reduce(
    (acc, r) => ({
      weeklyHours: acc.weeklyHours + r.weeklyHours,
      baseMonthlyHours: acc.baseMonthlyHours + r.baseMonthlyHours,
      addPeriods: acc.addPeriods + r.addPeriods,
      subtractPeriods: acc.subtractPeriods + r.subtractPeriods,
      actualPeriods: acc.actualPeriods + r.actualPeriods,
      amount: acc.amount + r.amount,
    }),
    {
      weeklyHours: 0,
      baseMonthlyHours: 0,
      addPeriods: 0,
      subtractPeriods: 0,
      actualPeriods: 0,
      amount: 0,
    }
  );

const subtotalRateLabel = (rows: CounselingPayrollRow[]) => {
  if (rows.length === 0) return '';
  const rates = new Set(rows.map((r) => r.ratePerPeriod));
  return rates.size === 1 ? String(rows[0].ratePerPeriod) : '';
};

export function paginateCounselingPayroll(rows: CounselingPayrollRow[]): {
  pages: CounselingPayrollPage[];
  grandTotal: CounselingPayrollTotals;
  grandTotalRateLabel: string;
} {
  const grandTotal = sumTotals(rows);
  const grandTotalRateLabel = subtotalRateLabel(rows);
  if (rows.length === 0) {
    return { pages: [], grandTotal, grandTotalRateLabel: '' };
  }

  const pages: CounselingPayrollPage[] = [];
  const createBlank = (idx: number) => ({
    teacherId: `__blank-${idx}`,
    salaryCode: '',
    teacherName: '',
    weeklyHours: 0,
    baseMonthlyHours: 0,
    addPeriods: 0,
    subtractPeriods: 0,
    actualPeriods: 0,
    ratePerPeriod: 0,
    amount: 0,
    remarks: '',
  });
  for (let i = 0; i < rows.length; i += PAYROLL_ROWS_PER_PAGE) {
    const slice = rows.slice(i, i + PAYROLL_ROWS_PER_PAGE);
    const isLastPage = i + PAYROLL_ROWS_PER_PAGE >= rows.length;
    const padSize = isLastPage ? PAYROLL_ROWS_LAST_PAGE : PAYROLL_ROWS_PER_PAGE;
    pages.push({
      pageIndex: pages.length + 1,
      rows: padPayrollRowsToPage(slice, createBlank, padSize),
      subtotal: sumTotals(slice),
      subtotalRateLabel: subtotalRateLabel(slice),
    });
  }
  return { pages, grandTotal, grandTotalRateLabel };
}
