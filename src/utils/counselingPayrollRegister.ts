import type {
  CourseSession,
  MonthlyTeacherSettlement,
  NonTeachingDay,
  PartialNonTeachingDay,
  SubstituteRequest,
  SystemConfig,
  Teacher,
  TemporaryScheduleMove,
} from '../types';
import { leaveTypeRemarkShort } from './leaveTypes';
import {
  countLeaveSubstitutePeriods,
  countLeaveSubstitutePeriodsInMonth,
  dateToDayOfWeek,
  isLeaveDatePeriodBillable,
  legacyRequestBelongsToSettlement,
} from './leaveDates';
import { nonTeachingDateSet } from './holidays';
import { isDateInSettlementMonth } from './settlementPeriod';
import { resolveTeacherSalaryCode } from './salaryCodes';
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

export type CounselingHolidayDeduct = { date: string; label: string };

/**
 * 課輔小計先按課表週次計（含國定假日那天的第 8 節），放假日改列應減。
 * 若該日已暫時移走或半日停課含第 8 節，小計本來就不含，不重複扣。
 */
export function listCounselingHolidayDeducts(
  sessions: CourseSession[],
  teacherId: string,
  settlementMonth: number,
  settlementYear: number,
  nonTeachingDays: NonTeachingDay[] | undefined,
  options?: {
    temporaryMoves?: TemporaryScheduleMove[] | null;
    partialStops?: PartialNonTeachingDay[] | null;
    weeksInMonth?: number;
    activeStartIso?: string | null;
    activeEndIso?: string | null;
  }
): CounselingHolidayDeduct[] {
  const period8Days = teacherPeriod8Weekdays(sessions, teacherId);
  if (period8Days.size === 0 || !nonTeachingDays?.length) return [];
  const weeksInMonth = options?.weeksInMonth ?? 4;
  const billableOpts = {
    period: 8,
    temporaryMoves: options?.temporaryMoves,
    partialStops: options?.partialStops,
    weeksInMonth,
    activeStartIso: options?.activeStartIso,
    activeEndIso: options?.activeEndIso,
  };
  const out: CounselingHolidayDeduct[] = [];
  const seen = new Set<string>();
  for (const day of nonTeachingDays) {
    const iso = day?.date?.trim();
    if (!iso || seen.has(iso)) continue;
    if (!isDateInSettlementMonth(iso, settlementMonth, settlementYear, weeksInMonth)) continue;
    const dow = dateToDayOfWeek(iso);
    if (dow == null || !period8Days.has(dow)) continue;
    if (!isLeaveDatePeriodBillable(iso, new Set(), billableOpts)) continue;
    seen.add(iso);
    out.push({ date: iso, label: day.label?.trim() || '放假' });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * 段考／運動會等半日停課含第 8 節：課輔全員應減 1（不限外聘）。
 * 整天放假已列應減者不重複扣；暫時移走的原日也不扣。
 */
export function listCounselingPartialStopDeducts(
  sessions: CourseSession[],
  teacherId: string,
  settlementMonth: number,
  settlementYear: number,
  partialStops: PartialNonTeachingDay[] | undefined,
  options?: {
    holidaySet?: Set<string> | null;
    temporaryMoves?: TemporaryScheduleMove[] | null;
    weeksInMonth?: number;
    activeStartIso?: string | null;
    activeEndIso?: string | null;
  }
): CounselingHolidayDeduct[] {
  const period8Days = teacherPeriod8Weekdays(sessions, teacherId);
  if (period8Days.size === 0 || !partialStops?.length) return [];
  const weeksInMonth = options?.weeksInMonth ?? 4;
  const holidaySet = options?.holidaySet ?? new Set<string>();
  const billableOpts = {
    period: 8,
    temporaryMoves: options?.temporaryMoves,
    weeksInMonth,
    activeStartIso: options?.activeStartIso,
    activeEndIso: options?.activeEndIso,
  };
  const out: CounselingHolidayDeduct[] = [];
  const seen = new Set<string>();
  for (const stop of partialStops) {
    const iso = stop?.date?.trim();
    if (!iso || seen.has(iso)) continue;
    if (!stop.periods?.includes(8)) continue;
    if (holidaySet.has(iso)) continue;
    if (!isDateInSettlementMonth(iso, settlementMonth, settlementYear, weeksInMonth)) continue;
    const dow = dateToDayOfWeek(iso);
    if (dow == null || !period8Days.has(dow)) continue;
    if (!isLeaveDatePeriodBillable(iso, new Set(), billableOpts)) continue;
    seen.add(iso);
    out.push({ date: iso, label: stop.label?.trim() || '停課輔' });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
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
    activeStartIso?: string | null;
    activeEndIso?: string | null;
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
    activeStartIso: calendarOpts.activeStartIso,
    activeEndIso: calendarOpts.activeEndIso,
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
  _teacher?: Pick<Teacher, 'id' | 'name'>
): string {
  const holidaySet = nonTeachingDateSet(systemConfig.nonTeachingDays);
  const allPartialStops = systemConfig.partialNonTeachingDays || [];
  const calendarOpts = {
    temporaryMoves: systemConfig.temporaryScheduleMoves || [],
    partialStops: allPartialStops,
    weeksInMonth: systemConfig.weeksInMonth ?? 4,
    activeStartIso: systemConfig.counselingStartDate?.trim() || undefined,
    activeEndIso: systemConfig.counselingEndDate?.trim() || undefined,
  };
  const parts: string[] = [];

  for (const item of listCounselingHolidayDeducts(
    sessions,
    teacherId,
    settlementMonth,
    settlementYear,
    systemConfig.nonTeachingDays,
    {
      ...calendarOpts,
      partialStops: [],
    }
  )) {
    parts.push(`${formatMd(item.date)}${item.label}未上課，扣1節。`);
  }

  for (const item of listCounselingPartialStopDeducts(
    sessions,
    teacherId,
    settlementMonth,
    settlementYear,
    allPartialStops,
    {
      holidaySet,
      temporaryMoves: calendarOpts.temporaryMoves,
      weeksInMonth: calendarOpts.weeksInMonth,
      activeStartIso: calendarOpts.activeStartIso,
      activeEndIso: calendarOpts.activeEndIso,
    }
  )) {
    parts.push(`${formatMd(item.date)}${item.label}未上課，扣1節。`);
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
        parts.push(`${formatMd(iso)}請${leaveShort}未上課，扣1節。`);
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
    parts.push(`請${leaveShort}未上課，扣${periods}節。`);
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
