import { CourseSession, DayOfWeek, SubstituteRequest } from '../types';
import { dateToIsoLocal, isNonTeachingDate } from './holidays';
import { dateToDayOfWeek } from './leaveDates';

/** 是否為暫時同班對調（不改週模板、按日調整鐘點） */
export function isTemporarySwap(req: Pick<SubstituteRequest, 'requestType' | 'swapMode' | 'effectiveDate'>): boolean {
  if (req.requestType !== 'swap') return false;
  if (req.swapMode === 'temporary') return true;
  if (req.swapMode === 'permanent') return false;
  return Boolean(req.effectiveDate?.trim());
}

/** 是否為永久同班對調（改週模板） */
export function isPermanentSwap(req: Pick<SubstituteRequest, 'requestType' | 'swapMode' | 'effectiveDate'>): boolean {
  if (req.requestType !== 'swap') return false;
  return !isTemporarySwap(req);
}

/** 建立／核准前檢核：回傳錯誤訊息或 null */
export function validateSwapRequestFields(
  data: Pick<SubstituteRequest, 'requestType' | 'swapMode' | 'effectiveDate' | 'swapTargetSession'>
): string | null {
  if (data.requestType !== 'swap') return null;
  if (!data.swapTargetSession) return '同班對調須指定對調課堂';
  const mode = data.swapMode || (data.effectiveDate?.trim() ? 'temporary' : 'permanent');
  if (mode === 'temporary' && !data.effectiveDate?.trim()) {
    return '暫時同班對調須指定生效日期';
  }
  return null;
}

/** 含 isoDate 的那週週一（本地日） */
export function mondayOfWeekContaining(isoDate: string): string {
  const d = new Date(isoDate.replace(/-/g, '/') + ' 12:00:00');
  const js = d.getDay();
  const offset = js === 0 ? -6 : 1 - js;
  d.setDate(d.getDate() + offset);
  return dateToIsoLocal(d);
}

export function dateOnWeekdayInWeek(mondayIso: string, dayOfWeek: DayOfWeek): string {
  const d = new Date(mondayIso.replace(/-/g, '/') + ' 12:00:00');
  d.setDate(d.getDate() + (dayOfWeek - 1));
  return dateToIsoLocal(d);
}

/** 暫時互調實際發生日（同星期＝當日；跨星期＝錨定週內雙方原上課日） */
export function resolveTemporarySwapOccurrenceDates(
  effectiveDate: string,
  originalDay: DayOfWeek,
  partnerDay: DayOfWeek
): { applicantDate: string; partnerDate: string } {
  if (originalDay === partnerDay) {
    return { applicantDate: effectiveDate, partnerDate: effectiveDate };
  }
  const monday = mondayOfWeekContaining(effectiveDate);
  return {
    applicantDate: dateOnWeekdayInWeek(monday, originalDay),
    partnerDate: dateOnWeekdayInWeek(monday, partnerDay),
  };
}

export function validateTemporarySwapEffectiveDate(
  effectiveDate: string | undefined,
  originalDay: DayOfWeek,
  partnerDay: DayOfWeek,
  holidaySet?: Set<string> | Iterable<string> | null
): string | null {
  if (!effectiveDate?.trim()) return '請選擇暫時對調日期';
  const dow = dateToDayOfWeek(effectiveDate);
  if (dow == null) return '暫時對調日期須為平日（週一至週五）';
  if (holidaySet && isNonTeachingDate(effectiveDate, holidaySet)) {
    return '所選日期為放假日，請改選其他日期';
  }
  if (originalDay === partnerDay && dow !== originalDay) {
    return `兩堂同為週${originalDay}，請選擇該星期的日期`;
  }
  return null;
}

export function formatTemporarySwapEffectLabel(
  effectiveDate: string,
  originalDay: DayOfWeek,
  partnerDay: DayOfWeek
): string {
  const { applicantDate, partnerDate } = resolveTemporarySwapOccurrenceDates(
    effectiveDate,
    originalDay,
    partnerDay
  );
  if (applicantDate === partnerDate) {
    return `暫時對調 ${applicantDate}`;
  }
  return `暫時對調 ${applicantDate} ⇄ ${partnerDate}`;
}

/** 課表格：此課堂是否有已核准之暫時互調（不改週模板） */
export function findApprovedTemporarySwapsForSession(
  session: CourseSession,
  requests: SubstituteRequest[]
): SubstituteRequest[] {
  return requests.filter((r) => {
    if (r.status !== 'approved' || !isTemporarySwap(r) || !r.effectiveDate) return false;
    const a = r.originalSession;
    const b = r.swapTargetSession;
    if (!b) return false;
    return (
      a.id === session.id ||
      b.id === session.id ||
      (a.dayOfWeek === session.dayOfWeek &&
        a.period === session.period &&
        a.className === session.className &&
        a.teacherId === session.teacherId) ||
      (b.dayOfWeek === session.dayOfWeek &&
        b.period === session.period &&
        b.className === session.className &&
        b.teacherId === session.teacherId)
    );
  });
}

/**
 * 月結：暫時互調使「兼課／課輔」從原日改計到對調後日（僅該次發生日）。
 * 回傳對該教師的淨加減節數（可為負）。
 */
export function temporarySwapPeriodDeltaInMonth(
  requests: SubstituteRequest[],
  teacherId: string,
  settlementMonth: number,
  settlementYear: number,
  matchSession: (s: CourseSession) => boolean,
  holidaySet?: Set<string> | null
): number {
  let delta = 0;
  const inMonth = (iso: string) => {
    const d = new Date(iso.replace(/-/g, '/') + ' 12:00:00');
    if (Number.isNaN(d.getTime())) return false;
    return d.getFullYear() === settlementYear && d.getMonth() + 1 === settlementMonth;
  };
  const billable = (iso: string) =>
    !holidaySet || !isNonTeachingDate(iso, holidaySet);

  for (const r of requests) {
    if (!isTemporarySwap(r) || r.status !== 'approved' || !r.effectiveDate) continue;
    const partner = r.swapTargetSession;
    if (!partner) continue;

    const { applicantDate, partnerDate } = resolveTemporarySwapOccurrenceDates(
      r.effectiveDate,
      r.originalSession.dayOfWeek,
      partner.dayOfWeek
    );

    // 申請人：原日少上一節（若符合 match），對調日多上一節
    if (r.applicantTeacherId === teacherId && matchSession(r.originalSession)) {
      if (inMonth(applicantDate) && billable(applicantDate)) delta -= 1;
      if (inMonth(partnerDate) && billable(partnerDate)) delta += 1;
    }
    // 對調教師：對稱
    if (r.swapTargetTeacherId === teacherId && matchSession(partner)) {
      if (inMonth(partnerDate) && billable(partnerDate)) delta -= 1;
      if (inMonth(applicantDate) && billable(applicantDate)) delta += 1;
    }
  }
  return delta;
}
