import { CourseSession, DepartmentType, Teacher, TeacherTitle } from '../types';
import {
  CalendarSettlementOptions,
  slotOccurrenceCountsInMonth,
  weekdayCountsFromSlotMap,
} from './calendarSettlement';

/** 本校課表會出現的科別（含示範資料用的餐飲／廣告） */
export const SCHOOL_DEPARTMENTS: DepartmentType[] = [
  '電機科',
  '電子科',
  '控制科',
  '冷凍科',
  '化工科',
  '建築科',
  '汽車科',
  '機械科',
  '資訊科',
  '製圖科',
  '金工科',
  '電圖科',
  '服務科',
  '普通科',
  '共同科目',
];

/** 班級名稱字首，較長／易混淆的（電圖、電子、電機）放前面 */
const CLASS_DEPT_PREFIXES: Array<[string, DepartmentType]> = [
  ['電圖', '電圖科'],
  ['電子', '電子科'],
  ['電機', '電機科'],
  ['冷凍', '冷凍科'],
  ['化工', '化工科'],
  ['建築', '建築科'],
  ['控制', '控制科'],
  ['普通', '普通科'],
  ['服務', '服務科'],
  ['機械', '機械科'],
  ['汽車', '汽車科'],
  ['製圖', '製圖科'],
  ['資訊', '資訊科'],
  ['金工', '金工科'],
];

const compactText = (text: string) => String(text || '').replace(/\s+/g, '');

/** 從班級名稱判斷科別，例如 電機一忠 → 電機科。選修班不計。 */
export const departmentFromClassName = (className: string): DepartmentType | null => {
  const text = compactText(className);
  if (!text || /選修/.test(text)) return null;
  for (const [prefix, dept] of CLASS_DEPT_PREFIXES) {
    if (text.startsWith(prefix)) return dept;
  }
  return null;
};

/** 從教室／科目等文字判斷科別（教室名不一定在開頭） */
export const departmentFromLabel = (text: string): DepartmentType | null => {
  const compact = compactText(text);
  if (!compact || /選修/.test(compact)) return null;
  const fromClass = departmentFromClassName(compact);
  if (fromClass) return fromClass;
  for (const [prefix, dept] of CLASS_DEPT_PREFIXES) {
    if (compact.includes(prefix)) return dept;
  }
  return null;
};

const teacherNameMatches = (rowTeacherName: string, teacherName: string) => {
  const name = teacherName.trim();
  if (!name || !rowTeacherName) return false;
  if (rowTeacherName.trim() === name) return true;
  const rowParts = rowTeacherName.split('/').map((s) => s.trim()).filter(Boolean);
  const nameParts = name.split('/').map((s) => s.trim()).filter(Boolean);
  return rowParts.includes(name) || nameParts.some((p) => rowParts.includes(p));
};

/** 班會／班級活動：用來判斷導師，並計入正課（法規：班級活動節數併入計算） */
export const isHomeroomActivity = (subjectName: string) => /班會|班級活動/.test(subjectName || '');

/** 課表匯入常把三節都寫成「團體活動」；星期三第 7 節實際為班會 */
export const isWednesdayHomeroomPeriod = (dayOfWeek?: number, period?: number) =>
  dayOfWeek === 3 && period === 7;

/** 對開社團／團體活動（非班會）：不計入每週授課節數，通常 2 節 */
export const isExcludedGroupActivity = (
  subjectName: string,
  dayOfWeek?: number,
  period?: number
) => {
  if (isWednesdayHomeroomPeriod(dayOfWeek, period)) return false;
  const name = subjectName || '';
  if (isHomeroomActivity(name) && !/社團/.test(name)) return false;
  return /團體活動|社團/.test(name);
};

/** 課表上的團體活動時間（含班會）：用來判斷導師 */
export const isGroupActivity = (subjectName: string) =>
  isHomeroomActivity(subjectName) || /團體活動|社團/.test(subjectName || '');

const isAfternoonPeriod = (period: number) => period >= 5;

export type WeeklyOverloadBreakdown = {
  scheduleTotal: number;
  regularTeaching: number;
  groupActivityExcluded: number;
  concurrent: number;
  counted: number;
  sessionRows: number;
  hiddenRows: number;
  counseling: number;
};

const isDaytimeSlot = (s: CourseSession) =>
  s.dayOfWeek >= 1 && s.dayOfWeek <= 5 && s.period >= 1 && s.period <= 7;

export const isCounselingSlot = (s: Pick<CourseSession, 'dayOfWeek' | 'period'>) =>
  s.dayOfWeek >= 1 && s.dayOfWeek <= 5 && s.period === 8;

/** 舊版「任課已改成代課老師」的課堂（notes 含原任課）；新版 [請假派代] 僅標註、不排除月結模板 */
export const isSubstituteCoverSession = (s: Pick<CourseSession, 'notes' | 'teacherId'>) =>
  Boolean(s.notes && s.notes.includes('[代課]') && s.notes.includes('原任課'));

export const breakdownWeeklyOverloadPeriods = (
  sessions: CourseSession[],
  teacherId: string
): WeeklyOverloadBreakdown => {
  const mine = sessions.filter((s) => s.teacherId === teacherId);
  // 代課覆蓋節次改由代課申請計費，不計入週兼課／超鐘點格數（與月結一致）
  const visible = mine.filter((s) => isDaytimeSlot(s) && !isSubstituteCoverSession(s));
  const counselingMine = mine.filter(
    (s) => isCounselingSlot(s) && !isSubstituteCoverSession(s)
  );
  const counselingSlots = new Set(counselingMine.map((s) => `${s.dayOfWeek}-${s.period}`));
  const slotMap = new Map<string, CourseSession[]>();
  visible.forEach((s) => {
    const key = `${s.dayOfWeek}-${s.period}`;
    const list = slotMap.get(key) || [];
    list.push(s);
    slotMap.set(key, list);
  });

  let groupActivityExcluded = 0;
  let counted = 0;
  let concurrent = 0;
  const clubOnlySlots: Array<{ key: string; list: CourseSession[] }> = [];

  slotMap.forEach((list, key) => {
    const teaching = list.filter((s) => !isExcludedGroupActivity(s.subjectName, s.dayOfWeek, s.period));
    if (teaching.length === 0) {
      clubOnlySlots.push({ key, list });
      return;
    }
    counted += 1;
    if (teaching.some((s) => s.isConcurrent)) concurrent += 1;
  });

  // 團體活動 3 節＝班會 1 節計入＋對開社團最多 2 節不計
  const MAX_EXCLUDED_CLUB_PERIODS = 2;
  clubOnlySlots.sort((a, b) => {
    const [aDay, aPeriod] = a.key.split('-').map(Number);
    const [bDay, bPeriod] = b.key.split('-').map(Number);
    return aDay - bDay || aPeriod - bPeriod;
  });
  const extraHomeroom = Math.max(0, clubOnlySlots.length - MAX_EXCLUDED_CLUB_PERIODS);
  clubOnlySlots.forEach((slot, index) => {
    if (index < extraHomeroom) {
      counted += 1;
      if (slot.list.some((s) => s.isConcurrent)) concurrent += 1;
      return;
    }
    groupActivityExcluded += 1;
  });

  return {
    scheduleTotal: slotMap.size,
    regularTeaching: counted,
    groupActivityExcluded,
    concurrent,
    counted,
    sessionRows: visible.length,
    hiddenRows: mine.length - visible.length - counselingMine.length,
    counseling: counselingSlots.size,
  };
};

export const countWeeklyTeachingPeriods = (sessions: CourseSession[], teacherId: string) =>
  breakdownWeeklyOverloadPeriods(sessions, teacherId).counted;

export const countWeeklyConcurrentPeriods = (sessions: CourseSession[], teacherId: string) =>
  breakdownWeeklyOverloadPeriods(sessions, teacherId).concurrent;

export const countWeeklyCounselingPeriods = (sessions: CourseSession[], teacherId: string) =>
  breakdownWeeklyOverloadPeriods(sessions, teacherId).counseling;

/** 依目前日期推估應為哪個民國學年度（8 月起為新學年） */
export const expectedRocAcademicYear = (now = new Date()) => {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  return m >= 8 ? y - 1911 : y - 1912;
};

/** 無學年度（或學年度過期）時：以西曆推估結算月所屬年 */
const calendarYearFromWallClock = (month: number, now: Date) => {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  if (month >= 8) {
    // 8–12 月：若目前在上半年，代表上一學年的秋季
    return m >= 8 ? y : y - 1;
  }
  // 1–7 月：取「本西元年」的該月（現在 8 月選 1 月 → 今年 1 月，不是明年）
  return y;
};

/** 結算月份對應的西元年。
 * 優先依學年度：學年 N 的 8–12 月 → N+1911；1–7 月 → N+1912。
 * 若設定的學年度已落後於目前應有學年（忘記換學年），改以西曆推估。
 * 若依學年映射會落到「未來的同月」（例如 8 月已換 115 卻補結 6 月變成 2027），改採西曆，避免補結舊學期偏到明年。
 */
export const calendarYearForSettlementMonth = (
  month: number,
  now = new Date(),
  academicYear?: string | number
) => {
  if (academicYear != null && String(academicYear).trim() !== '') {
    const roc = Number(academicYear);
    if (!Number.isNaN(roc) && roc > 90) {
      const expected = expectedRocAcademicYear(now);
      if (roc < expected) {
        return calendarYearFromWallClock(month, now);
      }
      const mapped = month >= 8 ? roc + 1911 : roc + 1912;
      const wall = calendarYearFromWallClock(month, now);
      // 映射年若已超過「目前可合理結算的該月西元年」，改用西曆（補結剛結束的學期）
      if (mapped > wall) return wall;
      return mapped;
    }
  }
  return calendarYearFromWallClock(month, now);
};

/** 該月各星期幾出現次數（JS：0 日、1 一 … 6 六）；excludeDates 為 YYYY-MM-DD 放假日 */
export const weekdayOccurrencesInMonth = (
  year: number,
  month: number,
  excludeDates?: Iterable<string> | Set<string> | null
) => {
  const exclude =
    excludeDates instanceof Set
      ? excludeDates
      : excludeDates
      ? new Set(excludeDates)
      : null;
  const lastDay = new Date(year, month, 0).getDate();
  const counts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  for (let day = 1; day <= lastDay; day += 1) {
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (exclude?.has(iso)) continue;
    const jsDay = new Date(year, month - 1, day).getDay();
    counts[jsDay] += 1;
  }
  return counts;
};

export const countMondaysInMonth = (
  year: number,
  month: number,
  excludeDates?: Iterable<string> | Set<string> | null
) => weekdayOccurrencesInMonth(year, month, excludeDates)[1];

/** 週一至週五平均出現次數，用來折算每週基本鐘點／任務減授 */
export const averageWeekdayWeeks = (
  year: number,
  month: number,
  excludeDates?: Iterable<string> | Set<string> | null
) => {
  const c = weekdayOccurrencesInMonth(year, month, excludeDates);
  return (c[1] + c[2] + c[3] + c[4] + c[5]) / 5;
};

/** 該月實際正課節數：每堂課 × 該星期幾在當月出現次數（放假日已從次數扣除） */
export const monthlyTeachingPeriods = (
  sessions: CourseSession[],
  teacherId: string,
  year: number,
  month: number,
  excludeDates?: Iterable<string> | Set<string> | null
) => {
  const counts = weekdayOccurrencesInMonth(year, month, excludeDates);
  return sessions
    .filter(
      (s) =>
        s.teacherId === teacherId &&
        isDaytimeSlot(s) &&
        !isExcludedGroupActivity(s.subjectName, s.dayOfWeek, s.period)
    )
    .reduce((sum, s) => sum + (counts[s.dayOfWeek] || 0), 0);
};

/** 該月兼課節數：每個有兼課的時段 × 該「星期–節次」在當月應計次數（含暫時移課／半日停課） */
export const monthlyConcurrentPeriods = (
  sessions: CourseSession[],
  teacherId: string,
  year: number,
  month: number,
  excludeDates?: Iterable<string> | Set<string> | null,
  calendar?: CalendarSettlementOptions
) => {
  const holidaySet =
    calendar?.holidaySet ??
    (excludeDates instanceof Set
      ? excludeDates
      : excludeDates
      ? new Set(excludeDates)
      : new Set<string>());
  const slotCounts = slotOccurrenceCountsInMonth(year, month, {
    holidaySet,
    temporaryMoves: calendar?.temporaryMoves,
    partialStops: calendar?.partialStops,
  });
  const slots = new Set<string>();
  sessions.forEach((s) => {
    if (s.teacherId !== teacherId) return;
    if (!s.isConcurrent || isExcludedGroupActivity(s.subjectName, s.dayOfWeek, s.period)) return;
    if (!isDaytimeSlot(s)) return;
    if (isSubstituteCoverSession(s)) return;
    slots.add(`${s.dayOfWeek}-${s.period}`);
  });
  let total = 0;
  slots.forEach((key) => {
    total += slotCounts.get(key) || 0;
  });
  return total;
};

export const monthlyCounselingPeriods = (
  sessions: CourseSession[],
  teacherId: string,
  month: number,
  now = new Date(),
  excludeDates?: Iterable<string> | Set<string> | null,
  academicYear?: string | number,
  calendar?: CalendarSettlementOptions
) => {
  const year = calendarYearForSettlementMonth(month, now, academicYear);
  const holidaySet =
    calendar?.holidaySet ??
    (excludeDates instanceof Set
      ? excludeDates
      : excludeDates
      ? new Set(excludeDates)
      : new Set<string>());
  const slotCounts = slotOccurrenceCountsInMonth(year, month, {
    holidaySet,
    temporaryMoves: calendar?.temporaryMoves,
    partialStops: calendar?.partialStops,
  });
  const slots = new Set<string>();
  sessions.forEach((s) => {
    if (s.teacherId !== teacherId || !isCounselingSlot(s) || isSubstituteCoverSession(s)) return;
    slots.add(`${s.dayOfWeek}-${s.period}`);
  });
  let total = 0;
  slots.forEach((key) => {
    total += slotCounts.get(key) || 0;
  });
  return total;
};

export const monthlyOverloadPeriods = (
  sessions: CourseSession[],
  teacher: Pick<Teacher, 'id'>,
  month: number,
  now = new Date(),
  excludeDates?: Iterable<string> | Set<string> | null,
  academicYear?: string | number,
  calendar?: CalendarSettlementOptions
) => {
  const year = calendarYearForSettlementMonth(month, now, academicYear);
  return monthlyConcurrentPeriods(
    sessions,
    teacher.id,
    year,
    month,
    excludeDates,
    calendar
  );
};

/** 折算週數：平日平均出現次數；有暫時移課／半日停課時以 slot 計次回推 */
export const settlementWeeksForMonth = (
  month: number,
  now = new Date(),
  excludeDates?: Iterable<string> | Set<string> | null,
  academicYear?: string | number,
  calendar?: CalendarSettlementOptions
) => {
  const year = calendarYearForSettlementMonth(month, now, academicYear);
  if (
    calendar?.temporaryMoves?.length ||
    calendar?.partialStops?.length
  ) {
    const holidaySet =
      calendar.holidaySet ??
      (excludeDates instanceof Set
        ? excludeDates
        : excludeDates
        ? new Set(excludeDates)
        : new Set<string>());
    const slotCounts = slotOccurrenceCountsInMonth(year, month, {
      holidaySet,
      temporaryMoves: calendar.temporaryMoves,
      partialStops: calendar.partialStops,
    });
    const c = weekdayCountsFromSlotMap(slotCounts);
    return (c[1] + c[2] + c[3] + c[4] + c[5]) / 5;
  }
  return averageWeekdayWeeks(year, month, excludeDates);
};

/** 每週超鐘點 = 課表標示兼課的節數 */
export const weeklyOverloadPeriods = (
  teachingPeriods: number,
  dutyReductionPeriods: number,
  basePeriods: number
) => Math.max(0, teachingPeriods + Math.max(0, dutyReductionPeriods) - basePeriods);

export const teacherWeeklyOverload = (
  teacher: Pick<Teacher, 'id' | 'weeklyActualPeriods' | 'dutyReductionPeriods' | 'basePeriods'>,
  sessions?: CourseSession[]
) =>
  sessions
    ? countWeeklyConcurrentPeriods(sessions, teacher.id)
    : weeklyOverloadPeriods(
        teacher.weeklyActualPeriods,
        teacher.dutyReductionPeriods ?? 0,
        teacher.basePeriods
      );

/** 各職稱基本鐘點由系統設定；未填時專任預設 16。 */
export const HOMEROOM_DEFAULT_DUTY_REDUCTION = 1;
export const HOMEROOM_BASE_PERIODS = 12;
export const HEAD_DEFAULT_DUTY_REDUCTION = 2;
export const HEAD_BASE_PERIODS = 7;
export const CHIEF_DEFAULT_DUTY_REDUCTION = 0;
export const CHIEF_BASE_PERIODS = 0;
export const DIRECTOR_DEFAULT_DUTY_REDUCTION = 0;
export const DIRECTOR_BASE_PERIODS = 0;
export const FULLTIME_BASE_PERIODS = 16;

export type StandardBasePeriodsConfig = {
  fulltime: number;
  homeroom: number;
  head: number;
  sectionChief: number;
  director: number;
};

const asNonNegInt = (value: unknown, fallback: number) => {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : fallback;
};

/** 五種職稱基本鐘點皆可設定；未填時專任預設 16（0 也算有效值）。 */
export const normalizeStandardBasePeriods = (
  raw?: Partial<StandardBasePeriodsConfig> | null
): StandardBasePeriodsConfig => ({
  fulltime: asNonNegInt(raw?.fulltime, FULLTIME_BASE_PERIODS),
  homeroom: asNonNegInt(raw?.homeroom, HOMEROOM_BASE_PERIODS),
  head: asNonNegInt(raw?.head, HEAD_BASE_PERIODS),
  sectionChief: asNonNegInt(raw?.sectionChief, CHIEF_BASE_PERIODS),
  director: asNonNegInt(raw?.director, DIRECTOR_BASE_PERIODS),
});

export const TEACHER_TITLES: TeacherTitle[] = ['導師', '組長', '科主任', '主任', '專任教師'];

export const normalizeTeacherTitle = (title: string): TeacherTitle => {
  if (title === '教學組長') return '組長';
  if ((TEACHER_TITLES as string[]).includes(title)) return title as TeacherTitle;
  return '專任教師';
};

export const isAdminTeacherTitle = (title: string) => {
  const next = normalizeTeacherTitle(title);
  return next === '組長' || next === '科主任' || next === '主任';
};

/** 真正的實習／實作課；團體活動、普通教室學科不算 */
export const isInternshipCourse = (subjectName: string) => {
  const name = subjectName || '';
  if (isGroupActivity(name)) return false;
  return /實習|實作/.test(name);
};

export const isPracticalSession = (session: {
  isPractical?: boolean;
  subjectName?: string;
  venueName?: string;
}) => {
  if (isInternshipCourse(session.subjectName || '')) return true;
  const venue = session.venueName || '';
  if (/普通教室|原班/.test(venue)) return Boolean(session.isPractical);
  return Boolean(session.isPractical) || /工場|實習教室|實習室/.test(venue);
};

/**
 * 用實習課判斷這位老師屬於哪一科：
 * 教「電機一忠」的實習課 → 電機科老師。
 * 多科實習時取節數最多的科；沒有實習課則為共同科目。
 */
export const inferTeacherDepartmentFromPracticalRows = (
  teacherName: string,
  rows: Array<{ teacherName: string; className: string; isPractical: boolean }>
): DepartmentType => {
  const counts = new Map<DepartmentType, number>();
  rows.forEach((row) => {
    if (!row.isPractical) return;
    if (!teacherNameMatches(row.teacherName, teacherName)) return;
    const dept = departmentFromClassName(row.className);
    if (!dept) return;
    counts.set(dept, (counts.get(dept) || 0) + 1);
  });
  if (counts.size === 0) return '共同科目';
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-Hant'))[0][0];
};

export const inferTeacherDepartmentFromSessions = (
  teacher: Pick<Teacher, 'id' | 'name'>,
  sessions: CourseSession[]
): DepartmentType =>
  inferTeacherDepartmentFromPracticalRows(
    teacher.name,
    sessions
      .filter((s) => isInternshipCourse(s.subjectName) && (s.teacherId === teacher.id || teacherNameMatches(s.teacherName, teacher.name)))
      .map((s) => ({ teacherName: teacher.name, className: s.className, isPractical: true }))
  );

export const applyTeacherDepartmentsFromSessions = <T extends Pick<Teacher, 'id' | 'name' | 'department'>>(
  teachers: T[],
  sessions: CourseSession[]
): T[] => {
  if (!sessions.some((s) => isInternshipCourse(s.subjectName))) return teachers;
  return teachers.map((t) => {
    const department = inferTeacherDepartmentFromSessions(t, sessions);
    return department === t.department ? t : { ...t, department };
  });
};

const sessionTeacherKeys = (session: CourseSession) => {
  const names = String(session.teacherName || '')
    .split('/')
    .map((s) => s.trim())
    .filter((n) => n && n !== '未指派教師');
  return { names, teacherId: session.teacherId };
};

/** 星期三下午團體活動的老師 = 該班導師。若該班週三沒排，才改看其他下午團體活動。 */
export const buildHomeroomClassByTeacher = (sessions: CourseSession[]) => {
  const wedByClass = new Map<string, string[]>();
  const otherByClass = new Map<string, string[]>();

  sessions.forEach((s) => {
    if (!isGroupActivity(s.subjectName) || !isAfternoonPeriod(s.period)) return;
    const { names } = sessionTeacherKeys(s);
    if (names.length === 0) return;
    const target = s.dayOfWeek === 3 ? wedByClass : otherByClass;
    const prev = target.get(s.className) || [];
    names.forEach((n) => {
      if (!prev.includes(n)) prev.push(n);
    });
    target.set(s.className, prev);
  });

  const classToTeachers = new Map<string, string[]>();
  const allClasses = new Set([...wedByClass.keys(), ...otherByClass.keys()]);
  allClasses.forEach((className) => {
    classToTeachers.set(className, wedByClass.get(className) || otherByClass.get(className) || []);
  });

  const teacherToClasses = new Map<string, string[]>();
  classToTeachers.forEach((names, className) => {
    names.forEach((name) => {
      const list = teacherToClasses.get(name) || [];
      if (!list.includes(className)) list.push(className);
      teacherToClasses.set(name, list);
    });
  });
  return teacherToClasses;
};

export const teacherBasePeriods = (
  fulltimeStandard: number,
  dutyReductionPeriods = 0,
  homeroomStandard?: number
) => {
  if (homeroomStandard != null && homeroomStandard > 0) return homeroomStandard;
  return Math.max(0, fulltimeStandard - Math.max(0, dutyReductionPeriods));
};

const isLeftoverReduction = (value: number | undefined, leftovers: number[]) =>
  value == null || leftovers.includes(value);

/** 各職稱基本鐘點由系統設定。超鐘點＝正課＋減授−基本。 */
export const resolveTeacherBasePeriods = (
  teacher: Pick<Teacher, 'dutyReductionPeriods' | 'basePeriods' | 'homeroomClass' | 'title'>,
  fulltimeStandard: number,
  homeroomStandard = HOMEROOM_BASE_PERIODS,
  headStandard = HEAD_BASE_PERIODS,
  chiefStandard = CHIEF_BASE_PERIODS,
  directorStandard = DIRECTOR_BASE_PERIODS
) => {
  const title = normalizeTeacherTitle(teacher.title);
  if (title === '主任') {
    const dutyReductionPeriods = isLeftoverReduction(teacher.dutyReductionPeriods, [1, 4, 5, 6, 8])
      ? DIRECTOR_DEFAULT_DUTY_REDUCTION
      : Math.max(0, teacher.dutyReductionPeriods ?? DIRECTOR_DEFAULT_DUTY_REDUCTION);
    return { dutyReductionPeriods, basePeriods: directorStandard, title };
  }
  if (title === '科主任') {
    const dutyReductionPeriods = isLeftoverReduction(teacher.dutyReductionPeriods, [0, 1, 4, 5, 6])
      ? HEAD_DEFAULT_DUTY_REDUCTION
      : Math.max(0, teacher.dutyReductionPeriods ?? HEAD_DEFAULT_DUTY_REDUCTION);
    return { dutyReductionPeriods, basePeriods: headStandard, title };
  }
  if (title === '組長') {
    const dutyReductionPeriods = isLeftoverReduction(teacher.dutyReductionPeriods, [1, 4, 5, 6, 8])
      ? CHIEF_DEFAULT_DUTY_REDUCTION
      : Math.max(0, teacher.dutyReductionPeriods ?? CHIEF_DEFAULT_DUTY_REDUCTION);
    return { dutyReductionPeriods, basePeriods: chiefStandard, title };
  }
  if (teacher.homeroomClass || title === '導師') {
    const dutyReductionPeriods = isLeftoverReduction(teacher.dutyReductionPeriods, [0, 4, 5, 6])
      ? HOMEROOM_DEFAULT_DUTY_REDUCTION
      : Math.max(0, teacher.dutyReductionPeriods ?? HOMEROOM_DEFAULT_DUTY_REDUCTION);
    return { dutyReductionPeriods, basePeriods: homeroomStandard, title: teacher.homeroomClass ? ('導師' as TeacherTitle) : title };
  }
  const dutyReductionPeriods = resolveDutyReductionPeriods(fulltimeStandard, teacher);
  return {
    dutyReductionPeriods,
    basePeriods: fulltimeStandard,
    title,
  };
};

/** 專任任務減授：名冊填值；未填則 0。導師／科主任請走 resolveTeacherBasePeriods。 */
export const resolveDutyReductionPeriods = (
  fulltimeStandard: number,
  teacher: Pick<Teacher, 'dutyReductionPeriods' | 'basePeriods' | 'homeroomClass'>
) => {
  if (teacher.dutyReductionPeriods != null) return Math.max(0, teacher.dutyReductionPeriods);
  return Math.max(0, fulltimeStandard - (teacher.basePeriods ?? fulltimeStandard));
};

export const displayTeacherTitle = (teacher: Pick<Teacher, 'title' | 'homeroomClass'>) => {
  const title = normalizeTeacherTitle(teacher.title);
  if (isAdminTeacherTitle(title)) {
    return teacher.homeroomClass ? `${teacher.homeroomClass}導師／${title}` : title;
  }
  if (teacher.homeroomClass) return `${teacher.homeroomClass}導師`;
  return title;
};

export const applyTeacherHomeroomFromSessions = <
  T extends Pick<Teacher, 'id' | 'name' | 'title' | 'homeroomClass'>
>(
  teachers: T[],
  sessions: CourseSession[]
): T[] => {
  if (!sessions.some((s) => isGroupActivity(s.subjectName))) return teachers;
  const homeroomByTeacher = buildHomeroomClassByTeacher(sessions);

  return teachers.map((t) => {
    const classes =
      homeroomByTeacher.get(t.name.trim()) ||
      [...homeroomByTeacher.entries()].find(([name]) => teacherNameMatches(name, t.name))?.[1] ||
      [];
    const homeroomClass = classes.length ? classes.join('、') : undefined;
    const keepAdminTitle = isAdminTeacherTitle(t.title);

    if (homeroomClass) {
      if (keepAdminTitle) {
        return homeroomClass === t.homeroomClass ? t : { ...t, homeroomClass };
      }
      if (t.title === '導師' && t.homeroomClass === homeroomClass) return t;
      return { ...t, title: '導師' as T['title'], homeroomClass };
    }

    if (keepAdminTitle) {
      return t.homeroomClass ? { ...t, homeroomClass: undefined } : t;
    }
    if (t.title === '導師' || t.homeroomClass) {
      return { ...t, title: '專任教師' as T['title'], homeroomClass: undefined };
    }
    return t;
  });
};

export const enrichTeachersFromSessions = (
  teachers: Teacher[],
  sessions: CourseSession[],
  fulltimeStandard = FULLTIME_BASE_PERIODS,
  homeroomStandard = HOMEROOM_BASE_PERIODS,
  headStandard = HEAD_BASE_PERIODS,
  chiefStandard = CHIEF_BASE_PERIODS,
  directorStandard = DIRECTOR_BASE_PERIODS
) => {
  const next = applyTeacherHomeroomFromSessions(
    applyTeacherDepartmentsFromSessions(teachers, sessions),
    sessions
  );
  return next.map((t) => {
    const { dutyReductionPeriods, basePeriods, title } = resolveTeacherBasePeriods(
      t,
      fulltimeStandard,
      homeroomStandard,
      headStandard,
      chiefStandard,
      directorStandard
    );
    const weeklyActualPeriods = countWeeklyTeachingPeriods(sessions, t.id);
    if (
      t.title === title &&
      t.dutyReductionPeriods === dutyReductionPeriods &&
      t.basePeriods === basePeriods &&
      t.weeklyActualPeriods === weeklyActualPeriods
    ) {
      return t;
    }
    return { ...t, title, dutyReductionPeriods, basePeriods, weeklyActualPeriods };
  });
};
