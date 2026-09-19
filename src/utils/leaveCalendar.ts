import { PERIOD_DEFINITIONS } from '../data/mockData';
import {
  LeaveType,
  PaymentType,
  RequestStatus,
  SubstituteRequest,
} from '../types';
import { isActingHomeroomOnlyRequest } from './actingHomeroomPayrollRegister';
import { dateToIsoLocal } from './holidays';
import { dateToDayOfWeek, resolveLeaveDateEnd } from './leaveDates';
import { leaveTypeRemarkShort, normalizeLeaveTypeForForm } from './leaveTypes';
import { isPlaceholderSession } from './resolveOriginalSession';

export type LeaveCalendarPeriodDetail = {
  period: number;
  className: string;
  subjectName: string;
  venueName: string;
  substituteTeacherName?: string;
  requestNumber: string;
  requestId: string;
  status: RequestStatus;
  isActingHomeroomOnly: boolean;
};

export type LeaveCalendarEvent = {
  id: string;
  date: string;
  teacherId: string;
  teacherName: string;
  leaveType: LeaveType;
  leaveLabel: string;
  title: string;
  periods: number[];
  periodDetails: LeaveCalendarPeriodDetail[];
  paymentType: PaymentType;
  status: RequestStatus;
  reason?: string;
  actingHomeroomTeacherName?: string;
  actingHomeroomOnly: boolean;
  requestNumbers: string[];
};

export const LEAVE_CALENDAR_COLORS: Record<
  string,
  { bg: string; text: string; soft: string }
> = {
  official: { bg: '#1a73e8', text: '#ffffff', soft: '#d2e3fc' },
  personal: { bg: '#0b8043', text: '#ffffff', soft: '#ceead6' },
  sick: { bg: '#d50000', text: '#ffffff', soft: '#fad2cf' },
  marriage: { bg: '#e67c73', text: '#ffffff', soft: '#fde7e3' },
  maternity: { bg: '#8e24aa', text: '#ffffff', soft: '#f3e8fd' },
  wellness: { bg: '#33b679', text: '#ffffff', soft: '#d4edda' },
};

export function leaveCalendarColor(leaveType?: LeaveType) {
  const key = normalizeLeaveTypeForForm(leaveType || 'official');
  return LEAVE_CALENDAR_COLORS[key] || LEAVE_CALENDAR_COLORS.official;
}

/** 去掉職稱後綴，例如「黃宗翰 老師」→「黃宗翰」 */
export function stripTeacherHonorific(name: string): string {
  return String(name || '')
    .replace(/\s+/g, '')
    .replace(/(老師|教師|科主任|主任|組長|導師)$/g, '');
}

/** 行事曆用「○○○師」 */
export function formatLeaveCalendarTeacherLabel(name: string): string {
  const core = stripTeacherHonorific(name);
  if (!core) return '教師';
  return core.endsWith('師') ? core : `${core}師`;
}

/** 連續節次用連字號：第5-7節；有缺口則第2、5-7節 */
export function formatLeaveCalendarPeriodRange(periods: number[]): string {
  const uniq = [...new Set(periods.filter((p) => Number.isFinite(p) && p >= 1))].sort(
    (a, b) => a - b
  );
  if (uniq.length === 0) return '';
  const runs: Array<[number, number]> = [];
  let start = uniq[0];
  let end = uniq[0];
  for (let i = 1; i < uniq.length; i += 1) {
    if (uniq[i] === end + 1) {
      end = uniq[i];
    } else {
      runs.push([start, end]);
      start = uniq[i];
      end = uniq[i];
    }
  }
  runs.push([start, end]);
  const body = runs.map(([a, b]) => (a === b ? String(a) : `${a}-${b}`)).join('、');
  return `第${body}節`;
}

export function formatLeaveCalendarEventTitle(params: {
  teacherName: string;
  periods: number[];
  leaveType?: LeaveType;
  reason?: string;
  actingHomeroomOnly?: boolean;
}): string {
  const teacher = formatLeaveCalendarTeacherLabel(params.teacherName);
  const leave = leaveTypeRemarkShort(params.leaveType, params.reason);
  const range = formatLeaveCalendarPeriodRange(params.periods);
  if (!range) {
    return params.actingHomeroomOnly ? `${teacher}全日${leave}（代導師）` : `${teacher}${leave}`;
  }
  return `${teacher}${range}${leave}`;
}

/** 彈窗細節列：第5節-蔡宏達代 */
export function formatSubstitutePeriodLine(period: number, substituteName?: string): string {
  const who = stripTeacherHonorific(substituteName || '');
  return who ? `第${period}節-${who}代` : `第${period}節-尚未派代`;
}

export function periodTimeRange(period: number): string {
  return PERIOD_DEFINITIONS.find((p) => p.period === period)?.timeRange || '';
}

export function eventTimeRangeLabel(periods: number[]): string {
  const uniq = [...new Set(periods)].sort((a, b) => a - b);
  if (uniq.length === 0) return '全日';
  const start = PERIOD_DEFINITIONS.find((p) => p.period === uniq[0]);
  const end = PERIOD_DEFINITIONS.find((p) => p.period === uniq[uniq.length - 1]);
  if (!start || !end) return formatLeaveCalendarPeriodRange(uniq);
  const startTime = start.timeRange.split(/\s*-\s*/)[0];
  const endTime = end.timeRange.split(/\s*-\s*/)[1];
  return `${startTime} – ${endTime}`;
}

export function eachIsoDateInclusive(start: string, end: string): string[] {
  const s = new Date(start.replace(/-/g, '/') + ' 12:00:00');
  const e = new Date(end.replace(/-/g, '/') + ' 12:00:00');
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) return [];
  const out: string[] = [];
  for (let cur = new Date(s); cur <= e; cur.setDate(cur.getDate() + 1)) {
    out.push(dateToIsoLocal(cur));
  }
  return out;
}

export function formatCalendarHeading(year: number, monthIndex: number): string {
  return `${year}年${monthIndex + 1}月`;
}

export function formatEventDateLabel(iso: string): string {
  const d = new Date(iso.replace(/-/g, '/') + ' 12:00:00');
  if (Number.isNaN(d.getTime())) return iso;
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${weekdays[d.getDay()]}）`;
}

type Bucket = {
  date: string;
  teacherId: string;
  teacherName: string;
  leaveType: LeaveType;
  reason?: string;
  paymentType: PaymentType;
  actingHomeroomTeacherName?: string;
  actingHomeroomOnly: boolean;
  details: LeaveCalendarPeriodDetail[];
};

/**
 * 將請假派代展開成行事曆事件：同一日、同一教師、同一假別合併為一筆，
 * 標題如「林美惠師第5-7節公假」。
 */
export function buildLeaveCalendarEvents(requests: SubstituteRequest[]): LeaveCalendarEvent[] {
  const buckets = new Map<string, Bucket>();

  for (const r of requests) {
    if (r.requestType !== 'substitute') continue;
    if (r.status !== 'pending' && r.status !== 'approved') continue;
    if (!r.leaveDateStart) continue;

    const end = resolveLeaveDateEnd(r.leaveDateStart, r.leaveDateEnd) || r.leaveDateStart;
    const leaveType = normalizeLeaveTypeForForm(r.leaveType || 'official');
    const actingOnly = isActingHomeroomOnlyRequest(r);
    const orig = r.originalSession;
    const placeholder = isPlaceholderSession(orig);

    for (const iso of eachIsoDateInclusive(r.leaveDateStart, end)) {
      const dow = dateToDayOfWeek(iso);
      if (dow == null) continue;

      if (actingOnly) {
        if (!placeholder && orig?.dayOfWeek && orig.dayOfWeek !== dow) continue;
      } else if (!orig || orig.dayOfWeek !== dow) {
        continue;
      }

      const key = `${iso}|${r.applicantTeacherId}|${leaveType}`;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = {
          date: iso,
          teacherId: r.applicantTeacherId,
          teacherName: r.applicantTeacherName,
          leaveType,
          reason: r.reason,
          paymentType: r.paymentType,
          actingHomeroomTeacherName: r.actingHomeroomTeacherName,
          actingHomeroomOnly: actingOnly,
          details: [],
        };
        buckets.set(key, bucket);
      } else {
        if (r.actingHomeroomTeacherName && !bucket.actingHomeroomTeacherName) {
          bucket.actingHomeroomTeacherName = r.actingHomeroomTeacherName;
        }
        if (actingOnly) bucket.actingHomeroomOnly = true;
        if (!bucket.reason && r.reason) bucket.reason = r.reason;
      }

      if (placeholder || orig?.period == null) continue;

      const existing = bucket.details.find((d) => d.period === orig.period);
      const detail: LeaveCalendarPeriodDetail = {
        period: orig.period,
        className: orig.className,
        subjectName: orig.subjectName,
        venueName: orig.venueName,
        substituteTeacherName: r.substituteTeacherName,
        requestNumber: r.requestNumber,
        requestId: r.id,
        status: r.status,
        isActingHomeroomOnly: actingOnly,
      };
      if (!existing) {
        bucket.details.push(detail);
      } else if (!existing.substituteTeacherName && detail.substituteTeacherName) {
        Object.assign(existing, detail);
      }
    }
  }

  return Array.from(buckets.values())
    .map((bucket) => {
      const periods = bucket.details.map((d) => d.period).sort((a, b) => a - b);
      const status: RequestStatus = bucket.details.some((d) => d.status === 'pending')
        ? 'pending'
        : 'approved';
      if (bucket.details.length === 0 && bucket.actingHomeroomOnly) {
        // 僅代導師、無授課節次：仍顯示全日事件
      }
      const requestNumbers = [
        ...new Set(bucket.details.map((d) => d.requestNumber).filter(Boolean)),
      ];
      return {
        id: `${bucket.date}|${bucket.teacherId}|${bucket.leaveType}`,
        date: bucket.date,
        teacherId: bucket.teacherId,
        teacherName: bucket.teacherName,
        leaveType: bucket.leaveType,
        leaveLabel: leaveTypeRemarkShort(bucket.leaveType, bucket.reason),
        title: formatLeaveCalendarEventTitle({
          teacherName: bucket.teacherName,
          periods,
          leaveType: bucket.leaveType,
          reason: bucket.reason,
          actingHomeroomOnly: bucket.actingHomeroomOnly && periods.length === 0,
        }),
        periods,
        periodDetails: [...bucket.details].sort((a, b) => a.period - b.period),
        paymentType: bucket.paymentType,
        status: bucket.details.length === 0 ? 'approved' : status,
        reason: bucket.reason,
        actingHomeroomTeacherName: bucket.actingHomeroomTeacherName,
        actingHomeroomOnly: bucket.actingHomeroomOnly && periods.length === 0,
        requestNumbers,
      };
    })
    .sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      const pa = a.periods[0] ?? 99;
      const pb = b.periods[0] ?? 99;
      if (pa !== pb) return pa - pb;
      return a.teacherName.localeCompare(b.teacherName, 'zh-Hant');
    });
}

export type CalendarCell = {
  iso: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
  isWeekend: boolean;
};

/** 週日起算、6 週格子（Google 月檢視） */
export function buildMonthCells(year: number, monthIndex: number, todayIso: string): CalendarCell[] {
  const first = new Date(year, monthIndex, 1);
  const startOffset = first.getDay(); // 0=日
  const gridStart = new Date(year, monthIndex, 1 - startOffset);
  const cells: CalendarCell[] = [];
  for (let i = 0; i < 42; i += 1) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    const iso = dateToIsoLocal(d);
    const js = d.getDay();
    cells.push({
      iso,
      day: d.getDate(),
      inMonth: d.getMonth() === monthIndex,
      isToday: iso === todayIso,
      isWeekend: js === 0 || js === 6,
    });
  }
  return cells;
}
