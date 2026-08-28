import type { LeaveType, PaymentType, RequestStatus, SubstituteRequest, SystemConfig } from '../types';
import { dateToIsoLocal } from './holidays';
import {
  isLeaveDatePeriodBillable,
  resolveLeaveDateEnd,
  countLeaveSubstitutePeriods,
  countLeaveSubstitutePeriodsInMonth,
  legacyRequestBelongsToSettlement,
  type LeaveBillableOptions,
} from './leaveDates';

/** 事假：學年累計第 8 天起改公費派代 */
export const PERSONAL_LEAVE_PUBLIC_DAY_THRESHOLD = 8;

/** 病假：連續請假達 3 日（曆日）起改公費派代 */
export const SICK_LEAVE_CONSECUTIVE_DAY_THRESHOLD = 3;

/** 身心調適假：每學年 21 小時（1 節＝1 小時） */
export const WELLNESS_LEAVE_HOURS_PER_YEAR = 21;

/** 對照表涵蓋的假別（UI 選單用） */
export const IN_SCOPE_LEAVE_TYPES: LeaveType[] = [
  'official',
  'marriage',
  'maternity',
  'wellness',
  'personal',
  'sick',
];

export type LeavePayrollCategory = 'public' | 'self_pay';

export type LeavePayrollContext = {
  requests: SubstituteRequest[];
  academicYear: string | number;
  /** 計算事假累計時排除（例如草稿本身） */
  excludeRequestIds?: string[];
  /** 納入累計的狀態，預設 approved + pending */
  countStatuses?: RequestStatus[];
};

const DEFAULT_COUNT_STATUSES: RequestStatus[] = ['approved', 'pending'];

export function academicYearIsoRange(academicYear: string | number): { start: string; end: string } {
  const roc = Number(academicYear);
  if (Number.isNaN(roc) || roc < 90) {
    const y = new Date().getFullYear();
    return { start: `${y}-08-01`, end: `${y + 1}-07-31` };
  }
  return {
    start: `${roc + 1911}-08-01`,
    end: `${roc + 1912}-07-31`,
  };
}

export function normalizeLeaveType(leaveType?: LeaveType, reason?: string): LeaveType {
  if (reason && /婚假/.test(reason)) return 'marriage';
  if (leaveType === 'training' || leaveType === 'bereavement') return 'official';
  if (leaveType === 'other') return 'personal';
  if (!leaveType) return 'official';
  return leaveType;
}

export function enumerateIsoDates(start: string, end: string): string[] {
  const s = new Date(start.replace(/-/g, '/') + ' 12:00:00');
  const e = new Date(end.replace(/-/g, '/') + ' 12:00:00');
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) return [];
  const dates: string[] = [];
  for (let cur = new Date(s); cur <= e; cur.setDate(cur.getDate() + 1)) {
    dates.push(dateToIsoLocal(cur));
  }
  return dates;
}

export function leaveCalendarDayCount(start?: string, end?: string): number {
  if (!start) return 1;
  const resolved = resolveLeaveDateEnd(start, end) || start;
  return enumerateIsoDates(start, resolved).length;
}

function requestInContext(
  r: SubstituteRequest,
  ctx: LeavePayrollContext
): boolean {
  if (ctx.excludeRequestIds?.includes(r.id)) return false;
  const statuses = ctx.countStatuses ?? DEFAULT_COUNT_STATUSES;
  return statuses.includes(r.status);
}

/** 學年內已使用／申請中之事假曆日（去重、排序） */
export function collectPersonalLeaveDatesInAcademicYear(
  ctx: LeavePayrollContext,
  teacherId: string
): string[] {
  const { start, end } = academicYearIsoRange(ctx.academicYear);
  const dates = new Set<string>();
  for (const r of ctx.requests) {
    if (r.requestType !== 'substitute' || r.applicantTeacherId !== teacherId) continue;
    if (!requestInContext(r, ctx)) continue;
    if (normalizeLeaveType(r.leaveType, r.reason) !== 'personal') continue;
    if (!r.leaveDateStart) continue;
    const resolved = resolveLeaveDateEnd(r.leaveDateStart, r.leaveDateEnd) || r.leaveDateStart;
    for (const d of enumerateIsoDates(r.leaveDateStart, resolved)) {
      if (d >= start && d <= end) dates.add(d);
    }
  }
  return [...dates].sort();
}

export function personalLeaveDayRank(date: string, sortedPersonalDates: string[]): number | null {
  const idx = sortedPersonalDates.indexOf(date);
  return idx >= 0 ? idx + 1 : null;
}

export function isPersonalLeaveDatePublicPayroll(
  date: string,
  sortedPersonalDates: string[]
): boolean {
  const rank = personalLeaveDayRank(date, sortedPersonalDates);
  return rank != null && rank >= PERSONAL_LEAVE_PUBLIC_DAY_THRESHOLD;
}

export function isSickLeaveSpellPublicPayroll(start?: string, end?: string): boolean {
  return leaveCalendarDayCount(start, end) >= SICK_LEAVE_CONSECUTIVE_DAY_THRESHOLD;
}

/** 永遠公費派代之假別（不含事假／病假門檻判斷） */
export function isAlwaysPublicLeaveType(leaveType?: LeaveType, reason?: string): boolean {
  const lt = normalizeLeaveType(leaveType, reason);
  return lt === 'official' || lt === 'marriage' || lt === 'maternity' || lt === 'wellness';
}

export function isLeaveDatePublicPayroll(
  date: string,
  request: Pick<SubstituteRequest, 'leaveType' | 'reason' | 'leaveDateStart' | 'leaveDateEnd'>,
  ctx: LeavePayrollContext,
  applicantTeacherId: string,
  sortedPersonalDates?: string[]
): boolean {
  const lt = normalizeLeaveType(request.leaveType, request.reason);
  if (isAlwaysPublicLeaveType(lt)) return true;
  if (lt === 'personal') {
    const personalDates =
      sortedPersonalDates ?? collectPersonalLeaveDatesInAcademicYear(ctx, applicantTeacherId);
    return isPersonalLeaveDatePublicPayroll(date, personalDates);
  }
  if (lt === 'sick') {
    return isSickLeaveSpellPublicPayroll(request.leaveDateStart, request.leaveDateEnd);
  }
  return false;
}

/** 兼課（超鐘點）請假是否扣 A 兼課費：身心調適假不扣；其餘僅公費派代日才扣 */
export function shouldDeductConcurrentOnLeaveDate(
  date: string,
  request: SubstituteRequest,
  ctx: LeavePayrollContext
): boolean {
  const lt = normalizeLeaveType(request.leaveType, request.reason);
  if (lt === 'wellness') return false;
  return isLeaveDatePublicPayroll(date, request, ctx, request.applicantTeacherId);
}

export function listBillableLeaveDatesInRange(
  request: Pick<SubstituteRequest, 'leaveDateStart' | 'leaveDateEnd' | 'originalSession'>,
  excludeDates?: Set<string>,
  billableOptions?: LeaveBillableOptions
): string[] {
  if (!request.leaveDateStart || !request.originalSession) return [];
  const end = resolveLeaveDateEnd(request.leaveDateStart, request.leaveDateEnd) || request.leaveDateStart;
  const dayOfWeek = request.originalSession.dayOfWeek;
  const opts: LeaveBillableOptions = {
    period: billableOptions?.period ?? request.originalSession.period,
    temporaryMoves: billableOptions?.temporaryMoves,
    partialStops: billableOptions?.partialStops,
  };
  const s = new Date(request.leaveDateStart.replace(/-/g, '/') + ' 12:00:00');
  const e = new Date(end.replace(/-/g, '/') + ' 12:00:00');
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) return [];

  const dates: string[] = [];
  for (let cur = new Date(s); cur <= e; cur.setDate(cur.getDate() + 1)) {
    if (cur.getDay() !== dayOfWeek) continue;
    const iso = dateToIsoLocal(cur);
    if (!isLeaveDatePeriodBillable(iso, excludeDates, opts)) continue;
    dates.push(iso);
  }
  return dates;
}

export function listBillableLeaveDatesInMonth(
  request: Pick<SubstituteRequest, 'leaveDateStart' | 'leaveDateEnd' | 'originalSession'>,
  settlementMonth: number,
  settlementYear: number,
  excludeDates?: Set<string>,
  billableOptions?: LeaveBillableOptions
): string[] {
  return listBillableLeaveDatesInRange(request, excludeDates, billableOptions).filter((iso) => {
    const d = new Date(iso.replace(/-/g, '/') + ' 12:00:00');
    return d.getMonth() + 1 === settlementMonth && d.getFullYear() === settlementYear;
  });
}

export function countPublicPayrollPeriodsInMonth(
  request: SubstituteRequest,
  settlementMonth: number,
  settlementYear: number,
  ctx: LeavePayrollContext,
  excludeDates?: Set<string>,
  billableOptions?: LeaveBillableOptions
): number {
  if (request.requestType !== 'substitute') return 0;
  if (!request.leaveDateStart) return 0;
  const dates = listBillableLeaveDatesInMonth(
    request,
    settlementMonth,
    settlementYear,
    excludeDates,
    billableOptions
  );
  if (dates.length === 0) return 0;
  const personalDates = collectPersonalLeaveDatesInAcademicYear(ctx, request.applicantTeacherId);
  return dates.filter((d) =>
    isLeaveDatePublicPayroll(d, request, ctx, request.applicantTeacherId, personalDates)
  ).length;
}

export function countConcurrentDeductPeriodsInMonth(
  request: SubstituteRequest,
  settlementMonth: number,
  settlementYear: number,
  ctx: LeavePayrollContext,
  excludeDates?: Set<string>,
  billableOptions?: LeaveBillableOptions
): number {
  if (request.requestType !== 'substitute') return 0;
  if (!request.leaveDateStart) return 0;
  const dates = listBillableLeaveDatesInMonth(
    request,
    settlementMonth,
    settlementYear,
    excludeDates,
    billableOptions
  );
  return dates.filter((d) => shouldDeductConcurrentOnLeaveDate(d, request, ctx)).length;
}

/** 整張請假單是否含任一公費派代節次（UI／篩選用） */
export function resolveRequestPaymentType(
  request: SubstituteRequest,
  ctx: LeavePayrollContext,
  excludeDates?: Set<string>,
  billableOptions?: LeaveBillableOptions
): PaymentType {
  if (request.requestType !== 'substitute') return 'private';
  if (!request.leaveDateStart) {
    const lt = normalizeLeaveType(request.leaveType, request.reason);
    if (isAlwaysPublicLeaveType(lt)) return 'public';
    if (lt === 'sick' && isSickLeaveSpellPublicPayroll(request.leaveDateStart, request.leaveDateEnd)) {
      return 'public';
    }
    return 'private';
  }
  const dates = listBillableLeaveDatesInRange(request, excludeDates, billableOptions);
  const personalDates = collectPersonalLeaveDatesInAcademicYear(ctx, request.applicantTeacherId);
  const hasPublic = dates.some((d) =>
    isLeaveDatePublicPayroll(d, request, ctx, request.applicantTeacherId, personalDates)
  );
  return hasPublic ? 'public' : 'private';
}

export function resolvePaymentTypeForLeaveDraft(
  draft: Pick<
    SubstituteRequest,
    'id' | 'leaveType' | 'reason' | 'leaveDateStart' | 'leaveDateEnd' | 'originalSession' | 'applicantTeacherId' | 'requestType'
  >,
  ctx: LeavePayrollContext,
  excludeDates?: Set<string>,
  billableOptions?: LeaveBillableOptions
): PaymentType {
  return resolveRequestPaymentType(
    {
      ...draft,
      status: 'pending',
      paymentType: 'private',
      requestNumber: '',
      createdAt: '',
      applicantTeacherName: '',
      applicantDepartment: '普通科',
    } as SubstituteRequest,
    {
      ...ctx,
      excludeRequestIds: draft.id
        ? [...(ctx.excludeRequestIds ?? []), draft.id]
        : ctx.excludeRequestIds,
    },
    excludeDates,
    billableOptions
  );
}

/** 身心調適假：學年已用＋本次時數（1 節＝1 小時） */
export function countWellnessHoursInAcademicYear(
  ctx: LeavePayrollContext,
  teacherId: string,
  excludeDates?: Set<string>,
  billableOptions?: LeaveBillableOptions
): number {
  const { start, end } = academicYearIsoRange(ctx.academicYear);
  let total = 0;
  for (const r of ctx.requests) {
    if (r.requestType !== 'substitute' || r.applicantTeacherId !== teacherId) continue;
    if (!requestInContext(r, ctx)) continue;
    if (normalizeLeaveType(r.leaveType, r.reason) !== 'wellness') continue;
    if (!r.leaveDateStart) continue;
    const dates = listBillableLeaveDatesInRange(r, excludeDates, {
      ...billableOptions,
      period: billableOptions?.period ?? r.originalSession?.period,
    });
    total += dates.filter((d) => d >= start && d <= end).length;
  }
  return total;
}

export function estimateWellnessHoursForDraft(
  draft: Pick<
    SubstituteRequest,
    'leaveDateStart' | 'leaveDateEnd' | 'originalSession' | 'applicantTeacherId'
  >,
  academicYear: string | number,
  excludeDates?: Set<string>,
  billableOptions?: LeaveBillableOptions
): number {
  if (!draft.leaveDateStart) return 0;
  const { start, end } = academicYearIsoRange(academicYear);
  const dates = listBillableLeaveDatesInRange(draft, excludeDates, billableOptions);
  return dates.filter((d) => d >= start && d <= end).length;
}

export function validateWellnessLeaveHours(
  draft: Pick<
    SubstituteRequest,
    'leaveDateStart' | 'leaveDateEnd' | 'originalSession' | 'applicantTeacherId'
  >,
  ctx: LeavePayrollContext,
  excludeDates?: Set<string>,
  calendarOpts?: LeaveBillableOptions & { academicYear?: string | number }
): { ok: true } | { ok: false; message: string } {
  const { start, end } = academicYearIsoRange(ctx.academicYear);
  const used = countWellnessHoursInAcademicYear(ctx, draft.applicantTeacherId, excludeDates, calendarOpts);
  const draftDates = listBillableLeaveDatesInRange(draft, excludeDates, calendarOpts).filter(
    (d) => d >= start && d <= end
  );
  const draftHours = draftDates.length;
  if (used + draftHours > WELLNESS_LEAVE_HOURS_PER_YEAR) {
    return {
      ok: false,
      message: `身心調適假每學年限 ${WELLNESS_LEAVE_HOURS_PER_YEAR} 小時（1 節＝1 小時）。本學年已用 ${used} 小時，本次 ${draftHours} 小時，合計超出上限。`,
    };
  }
  return { ok: true };
}

export function leavePaymentDisplayLabel(
  paymentType: PaymentType,
  leaveType?: LeaveType,
  reason?: string
): { kind: 'public' | 'self_pay'; label: string; detail: string } {
  const lt = normalizeLeaveType(leaveType, reason);
  if (paymentType === 'public') {
    return {
      kind: 'public',
      label: '公費派代',
      detail: '代課鐘點費由學校支給（代課清冊）',
    };
  }
  if (lt === 'personal') {
    return {
      kind: 'self_pay',
      label: '教師自理',
      detail: `事假未達學年第 ${PERSONAL_LEAVE_PUBLIC_DAY_THRESHOLD} 日，不入代課清冊`,
    };
  }
  if (lt === 'sick') {
    return {
      kind: 'self_pay',
      label: '教師自理',
      detail: `病假未達連續 ${SICK_LEAVE_CONSECUTIVE_DAY_THRESHOLD} 日，不入代課清冊`,
    };
  }
  return {
    kind: 'self_pay',
    label: '教師自理',
    detail: '不入代課清冊，請假人自行與代課教師約定',
  };
}

export function buildLeavePayrollContext(
  requests: SubstituteRequest[],
  systemConfig: Pick<SystemConfig, 'academicYear'>,
  options?: Partial<LeavePayrollContext>
): LeavePayrollContext {
  return {
    requests,
    academicYear: systemConfig.academicYear,
    ...options,
  };
}

type ConcurrentDeductOptions = {
  matchSession?: (session: SubstituteRequest['originalSession']) => boolean;
  includeLegacyWithoutDates?: (r: SubstituteRequest) => boolean;
  temporaryMoves?: SystemConfig['temporaryScheduleMoves'];
  partialStops?: SystemConfig['partialNonTeachingDays'];
};

/** 請假兼課扣減：依對照表，身心調適假不扣；事病假僅公費派代日扣 */
export function countApplicantConcurrentDeductPeriodsInMonth(
  requests: SubstituteRequest[],
  applicantTeacherId: string,
  settlementMonth: number,
  settlementYear: number,
  ctx: LeavePayrollContext,
  excludeDates?: Set<string>,
  options?: ConcurrentDeductOptions
): number {
  const match = options?.matchSession ?? (() => true);
  const calendarOpts: LeaveBillableOptions = {
    temporaryMoves: options?.temporaryMoves,
    partialStops: options?.partialStops,
  };
  let total = 0;
  for (const r of requests) {
    if (r.status !== 'approved' || r.requestType !== 'substitute') continue;
    if (r.applicantTeacherId !== applicantTeacherId || !r.substituteTeacherId) continue;
    if (!match(r.originalSession)) continue;

    const periodOpts: LeaveBillableOptions = {
      ...calendarOpts,
      period: r.originalSession?.period,
    };

    if (!r.leaveDateStart) {
      if (!options?.includeLegacyWithoutDates?.(r)) continue;
      if (normalizeLeaveType(r.leaveType, r.reason) === 'wellness') continue;
      if (resolveRequestPaymentType(r, ctx, excludeDates, periodOpts) !== 'public') continue;
      total += countLeaveSubstitutePeriods(r, excludeDates, {
        settlementMonth,
        settlementYear,
        ...periodOpts,
      });
      continue;
    }

    total += countConcurrentDeductPeriodsInMonth(
      r,
      settlementMonth,
      settlementYear,
      ctx,
      excludeDates,
      periodOpts
    );
  }
  return total;
}

/** 結算月公費代課節數（代課清冊） */
export function countSubstitutePublicPayrollPeriodsInMonth(
  request: SubstituteRequest,
  settlementMonth: number,
  settlementYear: number,
  ctx: LeavePayrollContext,
  excludeDates?: Set<string>,
  billableOptions?: LeaveBillableOptions
): number {
  if (request.status !== 'approved' || request.requestType !== 'substitute') return 0;
  if (!request.substituteTeacherId) return 0;

  if (!request.leaveDateStart) {
    if (resolveRequestPaymentType(request, ctx, excludeDates, billableOptions) !== 'public') return 0;
    const inMonth = countLeaveSubstitutePeriodsInMonth(
      request,
      settlementMonth,
      settlementYear,
      excludeDates,
      billableOptions
    );
    if (inMonth === null) {
      return legacyRequestBelongsToSettlement(
        request.requestNumber,
        request.createdAt,
        settlementMonth,
        settlementYear
      )
        ? countLeaveSubstitutePeriods(request, excludeDates, {
            settlementMonth,
            settlementYear,
            ...billableOptions,
          })
        : 0;
    }
    return inMonth;
  }

  return countPublicPayrollPeriodsInMonth(
    request,
    settlementMonth,
    settlementYear,
    ctx,
    excludeDates,
    billableOptions
  );
}
