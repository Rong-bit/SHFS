import {
  CourseSession,
  DayOfWeek,
  PatrolRoom,
  PeriodDefinition,
  SubstituteRequest,
  SystemConfig,
} from '../types';
import { isNonTeachingDate } from './holidays';
import { dateToDayOfWeek, leaveRangeCoversDate } from './leaveDates';
import { resolveOutdoorVenueKeywords } from './patrolConfig';
import { isTemporarySwap, resolveTemporarySwapOccurrenceDates } from './temporarySwap';
import { classifyVenueKind } from './venueKinds';

const toMinutes = (hhmm: string): number | null => {
  const m = /(\d{1,2}):(\d{2})/.exec(hhmm || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** 依節次時間判斷現在第幾節；下課時間回傳下一節；放學後回傳 null */
export function currentPeriod(now: Date, periodDefs: PeriodDefinition[]): number | null {
  const mins = now.getHours() * 60 + now.getMinutes();
  for (const def of periodDefs) {
    const [startRaw, endRaw] = def.timeRange.split(/\s*-\s*/);
    const start = toMinutes(startRaw);
    const end = toMinutes(endRaw);
    if (start == null || end == null) continue;
    if (mins < start) return def.period;
    if (mins <= end) return def.period;
  }
  return null;
}

/** 該日該節實際依哪一天的週課表上課；null＝停課／放假／週末無補課 */
export function effectiveScheduleDay(
  isoDate: string,
  period: number,
  config: Pick<SystemConfig, 'nonTeachingDays' | 'temporaryScheduleMoves' | 'partialNonTeachingDays'>
): { dayOfWeek: DayOfWeek | null; reason?: string } {
  const move = (config.temporaryScheduleMoves || []).find(
    (m) => m.targetDate === isoDate && (!m.periods || m.periods.length === 0 || m.periods.includes(period))
  );
  if (move) {
    return { dayOfWeek: dateToDayOfWeek(move.sourceDate), reason: move.label || '暫時移課／補課' };
  }
  if (isNonTeachingDate(isoDate, config.nonTeachingDays)) {
    const label = (config.nonTeachingDays || []).find((d) => d.date === isoDate)?.label;
    return { dayOfWeek: null, reason: label ? `放假：${label}` : '放假日' };
  }
  const partial = (config.partialNonTeachingDays || []).find(
    (p) => p.date === isoDate && p.periods.includes(period)
  );
  if (partial) return { dayOfWeek: null, reason: `停課：${partial.label || '節次停課'}` };
  const dow = dateToDayOfWeek(isoDate);
  return { dayOfWeek: dow, reason: dow ? undefined : '週末' };
}

export interface PatrolSessionInfo {
  className: string;
  subjectName: string;
  /** 實際上課老師（已核准代課時為代課老師） */
  teacherNames: string[];
  /** 原任課老師（有代課時才不同） */
  originalTeacherNames: string[];
  venueName: string;
  isOutdoor: boolean;
}

export type PatrolRoomStatus =
  /** 原班或本教室有課 */
  | 'in_class'
  /** 原班外出上課（體育、實習工場等），教室空著 */
  | 'away'
  /** 本節無課 */
  | 'free'
  /** 放假／停課 */
  | 'closed';

export interface PatrolRoomOccupancy {
  room: PatrolRoom;
  status: PatrolRoomStatus;
  /** 在本教室上課的課程 */
  here: PatrolSessionInfo | null;
  /** 原班外出時的去向 */
  away: PatrolSessionInfo | null;
  reason?: string;
}

const isOutdoorVenue = (venueName: string, keywords: string[]) =>
  keywords.some((k) => k && (venueName || '').includes(k));

/** 一看就是專科教室／特別教室的場地名稱 */
const SPECIAL_ROOM_PATTERN =
  /電腦|專科|實驗|音樂|美術|體育|圖書|視聽|會議|多功能|分組|語言|禮堂|活動中心|工場|實習/;

/**
 * 該節課是否在原班教室上。
 * 課表場地若只是一般教室名稱（如「301 教室」）無法判斷，視為在原班；
 * 明確是工場、室外、專科教室或其他巡堂教室時才算外出。
 */
const isHomeroomVenueFor = (
  venueName: string,
  room: PatrolRoom,
  otherRoomNames: string[],
  keywords: string[]
) => {
  const v = (venueName || '').trim();
  if (!v) return true;
  if (room.name && v.includes(room.name)) return true;
  const kind = classifyVenueKind(v);
  if (room.homeroomClass && v.includes(room.homeroomClass)) return kind !== 'workshop';
  if (otherRoomNames.some((n) => v.includes(n))) return false;
  if (kind === 'homeroom') return true;
  if (kind === 'workshop' || isOutdoorVenue(v, keywords)) return false;
  return !SPECIAL_ROOM_PATTERN.test(v);
};

/** 已核准「暫時同班對調」在發生日改由對方老師上對方科目 */
function applyTemporarySwap(
  s: CourseSession,
  isoDate: string,
  requests: SubstituteRequest[]
): CourseSession {
  for (const r of requests) {
    if (r.status !== 'approved' || !isTemporarySwap(r) || !r.effectiveDate || !r.swapTargetSession) continue;
    const a = r.originalSession;
    const b = r.swapTargetSession;
    const matches = (x: CourseSession) =>
      x.id === s.id ||
      (sameSlot(x, s) && x.className === s.className && x.teacherId === s.teacherId);
    const { applicantDate, partnerDate } = resolveTemporarySwapOccurrenceDates(
      r.effectiveDate,
      a.dayOfWeek,
      b.dayOfWeek
    );
    if (matches(a) && isoDate === applicantDate) {
      return { ...s, teacherId: b.teacherId, teacherName: b.teacherName, subjectName: b.subjectName, venueName: b.venueName };
    }
    if (matches(b) && isoDate === partnerDate) {
      return { ...s, teacherId: a.teacherId, teacherName: a.teacherName, subjectName: a.subjectName, venueName: a.venueName };
    }
  }
  return s;
}

const sameSlot = (a: Pick<CourseSession, 'dayOfWeek' | 'period'>, b: Pick<CourseSession, 'dayOfWeek' | 'period'>) =>
  a.dayOfWeek === b.dayOfWeek && a.period === b.period;

/** 合併同班同節多位老師（協同教學），並套用已核准請假派代 */
function summarizeSessions(
  list: CourseSession[],
  isoDate: string,
  requests: SubstituteRequest[],
  keywords: string[]
): PatrolSessionInfo | null {
  if (list.length === 0) return null;
  const first = list[0];
  const originalTeacherNames: string[] = [];
  const teacherNames: string[] = [];
  for (const s of list) {
    originalTeacherNames.push(s.teacherName);
    const cover = requests.find(
      (r) =>
        r.status === 'approved' &&
        r.requestType === 'substitute' &&
        r.originalSession &&
        r.applicantTeacherId === s.teacherId &&
        (r.originalSession.id === s.id ||
          (sameSlot(r.originalSession, s) &&
            (!r.originalSession.className || r.originalSession.className === s.className))) &&
        Boolean(r.leaveDateStart) &&
        leaveRangeCoversDate(r.leaveDateStart, r.leaveDateEnd, isoDate)
    );
    teacherNames.push(cover?.substituteTeacherName ? cover.substituteTeacherName : s.teacherName);
  }
  return {
    className: first.className,
    subjectName: first.subjectName,
    teacherNames: Array.from(new Set(teacherNames)),
    originalTeacherNames: Array.from(new Set(originalTeacherNames)),
    venueName: first.venueName,
    isOutdoor: isOutdoorVenue(first.venueName, keywords),
  };
}

/** 每間巡堂教室在指定日期、節次的使用狀況 */
export function computeRoomOccupancy(params: {
  rooms: PatrolRoom[];
  sessions: CourseSession[];
  requests: SubstituteRequest[];
  config: SystemConfig;
  isoDate: string;
  period: number;
}): PatrolRoomOccupancy[] {
  const { rooms, sessions, requests, config, isoDate, period } = params;
  const { dayOfWeek, reason } = effectiveScheduleDay(isoDate, period, config);
  if (!dayOfWeek) {
    return rooms.map((room) => ({ room, status: 'closed', here: null, away: null, reason }));
  }
  const keywords = resolveOutdoorVenueKeywords(config);
  const slot = sessions
    .filter((s) => s.dayOfWeek === dayOfWeek && s.period === period)
    .map((s) => applyTemporarySwap(s, isoDate, requests));
  const allRoomNames = rooms.map((r) => r.name.trim()).filter((n) => n.length >= 2);

  return rooms.map((room) => {
    const otherRoomNames = allRoomNames.filter(
      (n) => n !== room.name && !(room.name && room.name.includes(n))
    );
    const atHome = (s: CourseSession) => isHomeroomVenueFor(s.venueName, room, otherRoomNames, keywords);
    const classSessions = room.homeroomClass
      ? slot.filter((s) => s.className === room.homeroomClass)
      : [];
    const homeroomHere = classSessions.filter(atHome);
    const otherClassHere = slot.filter(
      (s) =>
        s.className !== room.homeroomClass &&
        Boolean(room.name) &&
        (s.venueName || '').includes(room.name)
    );
    const hereList = homeroomHere.length > 0 ? homeroomHere : otherClassHere;
    const here = summarizeSessions(hereList, isoDate, requests, keywords);
    if (here) return { room, status: 'in_class', here, away: null, reason };

    const awayList = classSessions.filter((s) => !atHome(s));
    const away = summarizeSessions(awayList, isoDate, requests, keywords);
    if (away) return { room, status: 'away', here: null, away, reason };
    return { room, status: 'free', here: null, away: null, reason };
  });
}

/** 室外課巡查目標：原班外出或本節無課的原班教室 */
export function emptyHomerooms(occupancy: PatrolRoomOccupancy[]): PatrolRoomOccupancy[] {
  return occupancy.filter(
    (o) => Boolean(o.room.homeroomClass) && (o.status === 'away' || o.status === 'free')
  );
}

/** 課表裡實際存在的班級（供教室配置對照） */
export function scheduleClassNames(sessions: CourseSession[]): string[] {
  return Array.from(new Set(sessions.map((s) => s.className.trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, 'zh-Hant')
  );
}
