import { CourseSession, DepartmentType, SystemConfig, Teacher, TeacherTitle } from '../types';
import {
  CalendarSettlementOptions,
  slotOccurrenceCountsInMonth,
} from './calendarSettlement';
import {
  isCounselingSlot as isCounselingSlotConfigured,
  isDaytimeSlot as isDaytimeSlotConfigured,
  resolvePeriodConfig,
} from './periodConfig';
import { eachDateInSettlementPeriod, resolveSettlementPeriod } from './settlementPeriod';

/** 建議科別／領域清單（高職示範；國中小可自填領域或班級語意） */
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
  '語文領域',
  '數學領域',
  '自然領域',
  '社會領域',
  '藝術領域',
  '健康與體育領域',
  '綜合活動領域',
  '科技領域',
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

export type GradeYear = 1 | 2 | 3 | 4 | 5 | 6;

/** 從班級名稱判斷年級：支援國小 1～6、國高中 1～3；亦辨識 701／112 等數字班碼首位 */
export const gradeYearFromClassName = (className: string): GradeYear | null => {
  const text = compactText(className);
  if (!text) return null;
  const map: Record<string, GradeYear> = {
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    '1': 1,
    '2': 2,
    '3': 3,
    '4': 4,
    '5': 5,
    '6': 6,
  };
  for (const [prefix] of CLASS_DEPT_PREFIXES) {
    if (!text.startsWith(prefix)) continue;
    const m = text.slice(prefix.length).match(/^[一二三四五六123456]/);
    if (m) return map[m[0]] ?? null;
  }
  // 國中常見班碼：701、802、810甲（7/8/9＝國一／二／三）；國小／高中：112、201（首位 1～6）
  const juniorNumeric = text.match(/^([789])\d{2}/);
  if (juniorNumeric) {
    const map789: Record<string, GradeYear> = { '7': 1, '8': 2, '9': 3 };
    return map789[juniorNumeric[1]] ?? null;
  }
  const numericClass = text.match(/^([1-6])\d{2}/);
  if (numericClass) return map[numericClass[1]] ?? null;
  const m = text.match(/[一二三四五六123456]/);
  if (!m) return null;
  return map[m[0]] ?? null;
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

/** 從課表實際出現的班級動態產生科別／領域篩選選項 */
export function departmentsFromSessions(sessions: CourseSession[]): DepartmentType[] {
  const set = new Set<string>();
  sessions.forEach((s) => {
    const fromClass = departmentFromClassName(s.className || '');
    if (fromClass) set.add(fromClass);
    const fromSubject = departmentFromLabel(s.subjectName || '');
    if (fromSubject) set.add(fromSubject);
  });
  const known = SCHOOL_DEPARTMENTS.filter((d) => set.has(d));
  const extras = [...set].filter((d) => !SCHOOL_DEPARTMENTS.includes(d)).sort();
  return [...known, ...extras];
}

export function gradeYearsFromSessions(sessions: CourseSession[]): GradeYear[] {
  const set = new Set<GradeYear>();
  sessions.forEach((s) => {
    const g = gradeYearFromClassName(s.className || '');
    if (g) set.add(g);
  });
  return ([1, 2, 3, 4, 5, 6] as GradeYear[]).filter((g) => set.has(g));
}

export function classNamesFromSessions(
  sessions: CourseSession[],
  options?: { department?: string | null; gradeYear?: GradeYear | null }
): string[] {
  const set = new Set<string>();
  sessions.forEach((s) => {
    const name = (s.className || '').trim();
    if (!name) return;
    if (options?.department) {
      const dept = departmentFromClassName(name) || departmentFromLabel(s.subjectName || '');
      if (dept !== options.department) return;
    }
    if (options?.gradeYear != null) {
      if (gradeYearFromClassName(name) !== options.gradeYear) return;
    }
    set.add(name);
  });
  return [...set].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
}

type PeriodCfg =
  | Pick<SystemConfig, 'maxPeriod' | 'counselingPeriods' | 'homeroomDayOfWeek' | 'homeroomPeriod'>
  | null
  | undefined;

const isDaytimeSlot = (s: CourseSession, cfg?: PeriodCfg) => isDaytimeSlotConfigured(s, cfg);
export const isCounselingSlot = (
  s: Pick<CourseSession, 'dayOfWeek' | 'period'>,
  cfg?: PeriodCfg
) => isCounselingSlotConfigured(s, cfg);

/** 比對課表姓名與名冊：忽略空白，以及結尾的「老師／教師／導師」。 */
const normalizeTeacherMatchName = (name: string) =>
  name.replace(/\s+/g, '').replace(/(老師|教師|導師)$/g, '');

const teacherNameParts = (value: string) =>
  value
    .split('/')
    .map((s) => normalizeTeacherMatchName(s))
    .filter(Boolean);

export const teacherNameMatches = (rowTeacherName: string, teacherName: string) => {
  const nameParts = teacherNameParts(teacherName);
  const rowParts = teacherNameParts(rowTeacherName);
  if (nameParts.length === 0 || rowParts.length === 0) return false;
  return nameParts.some((p) => rowParts.includes(p));
};

/** 班會／班級活動：用來判斷導師，並計入正課（法規：班級活動節數併入計算） */
export const isHomeroomActivity = (subjectName: string) => /班會|班級活動/.test(subjectName || '');

export const DEFAULT_HOMEROOM_DAY = 3;
export const DEFAULT_HOMEROOM_PERIOD = 7;

export type HomeroomSlotConfig = {
  homeroomDayOfWeek?: number;
  homeroomPeriod?: number;
};

/** 未設定時為星期三第 7 節 */
export const resolveHomeroomSlot = (config?: HomeroomSlotConfig | null) => {
  const day = Number(config?.homeroomDayOfWeek);
  const period = Number(config?.homeroomPeriod);
  return {
    dayOfWeek: day >= 1 && day <= 5 ? Math.round(day) : DEFAULT_HOMEROOM_DAY,
    period: period >= 1 && period <= 12 ? Math.round(period) : DEFAULT_HOMEROOM_PERIOD,
  };
};

/** 系統設定的班會格。未傳設定時為星期三第 7 節（課表匯入常把該節寫成團體活動） */
export const isWednesdayHomeroomPeriod = (
  dayOfWeek?: number,
  period?: number,
  config?: HomeroomSlotConfig | null
) => {
  const slot = resolveHomeroomSlot(config);
  return dayOfWeek === slot.dayOfWeek && period === slot.period;
};

/** 對開社團／團體活動（非班會）：不計入每週授課節數，通常 2 節 */
export const isExcludedGroupActivity = (
  subjectName: string,
  dayOfWeek?: number,
  period?: number,
  config?: HomeroomSlotConfig | null
) => {
  if (isWednesdayHomeroomPeriod(dayOfWeek, period, config)) return false;
  const name = subjectName || '';
  if (isHomeroomActivity(name) && !/社團/.test(name)) return false;
  return /團體活動|社團/.test(name);
};

/** 不計入每週正課／兼課（團體活動、社團） */
export const isExcludedFromTeachingPeriods = (
  subjectName: string,
  dayOfWeek?: number,
  period?: number,
  config?: HomeroomSlotConfig | null
) => isExcludedGroupActivity(subjectName, dayOfWeek, period, config);

/** 課表上的團體活動時間（含班會、社團）。判斷導師請用 isHomeroomTeacherSlot，不要把整段團體活動都算成導師。 */
export const isGroupActivity = (subjectName: string) =>
  isHomeroomActivity(subjectName) || /團體活動|社團/.test(subjectName || '');

/**
 * 這一格才是班會、才代表該班導師。
 * 預設星期三第 7 節；可在系統設定改星期與節次。
 * 課表常把同一下午多節都寫成「團體活動」，只有設定的那一節算導師。
 * 科目已寫明班會或班級活動時，任何節次都算。
 */
export const isHomeroomTeacherSlot = (
  session: Pick<CourseSession, 'subjectName' | 'dayOfWeek' | 'period'>,
  config?: HomeroomSlotConfig | null
) => {
  const name = session.subjectName || '';
  if (isHomeroomActivity(name) && !/社團/.test(name)) return true;
  return isWednesdayHomeroomPeriod(session.dayOfWeek, session.period, config) && isGroupActivity(name);
};

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

/** 舊版「任課已改成代課老師」的課堂（notes 含原任課）；新版 [請假派代] 僅標註、不排除月結模板 */
export const isSubstituteCoverSession = (s: Pick<CourseSession, 'notes' | 'teacherId'>) =>
  Boolean(s.notes && s.notes.includes('[代課]') && s.notes.includes('原任課'));

export const breakdownWeeklyOverloadPeriods = (
  sessions: CourseSession[],
  teacherId: string,
  periodCfg?: PeriodCfg
): WeeklyOverloadBreakdown => {
  const mine = sessions.filter((s) => s.teacherId === teacherId);
  // 代課覆蓋節次改由代課申請計費，不計入週兼課／超鐘點格數（與月結一致）
  const visible = mine.filter((s) => isDaytimeSlot(s, periodCfg) && !isSubstituteCoverSession(s));
  const counselingMine = mine.filter(
    (s) => isCounselingSlot(s, periodCfg) && !isSubstituteCoverSession(s)
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
    const teaching = list.filter(
      (s) => !isExcludedFromTeachingPeriods(s.subjectName, s.dayOfWeek, s.period, periodCfg)
    );
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

export const countWeeklyTeachingPeriods = (
  sessions: CourseSession[],
  teacherId: string,
  periodCfg?: PeriodCfg
) => breakdownWeeklyOverloadPeriods(sessions, teacherId, periodCfg).counted;

export const countWeeklyConcurrentPeriods = (
  sessions: CourseSession[],
  teacherId: string,
  periodCfg?: PeriodCfg
) => breakdownWeeklyOverloadPeriods(sessions, teacherId, periodCfg).concurrent;

export const countWeeklyCounselingPeriods = (
  sessions: CourseSession[],
  teacherId: string,
  periodCfg?: PeriodCfg
) => breakdownWeeklyOverloadPeriods(sessions, teacherId, periodCfg).counseling;

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

/** 該結算月各星期幾出現次數（連續 N 週區間；excludeDates 為 YYYY-MM-DD 放假日） */
export const weekdayOccurrencesInMonth = (
  year: number,
  month: number,
  excludeDates?: Iterable<string> | Set<string> | null,
  weeksInMonth = 4
) => {
  const exclude =
    excludeDates instanceof Set
      ? excludeDates
      : excludeDates
      ? new Set(excludeDates)
      : null;
  const period = resolveSettlementPeriod(month, year, weeksInMonth);
  const counts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  eachDateInSettlementPeriod(period, (iso, jsDay) => {
    if (exclude?.has(iso)) return;
    counts[jsDay] += 1;
  });
  return counts;
};

export const countMondaysInMonth = (
  year: number,
  month: number,
  excludeDates?: Iterable<string> | Set<string> | null,
  weeksInMonth = 4
) => weekdayOccurrencesInMonth(year, month, excludeDates, weeksInMonth)[1];

/** 結算週數：依系統設定每月固定 N 週（預設 4） */
export const averageWeekdayWeeks = (
  year: number,
  month: number,
  excludeDates?: Iterable<string> | Set<string> | null,
  weeksInMonth = 4
) => {
  const c = weekdayOccurrencesInMonth(year, month, excludeDates, weeksInMonth);
  return (c[1] + c[2] + c[3] + c[4] + c[5]) / 5;
};

/** 該月實際正課節數：每堂課 × 該星期幾在當月出現次數（放假日已從次數扣除） */
export const monthlyTeachingPeriods = (
  sessions: CourseSession[],
  teacherId: string,
  year: number,
  month: number,
  excludeDates?: Iterable<string> | Set<string> | null,
  periodCfg?: PeriodCfg
) => {
  const counts = weekdayOccurrencesInMonth(year, month, excludeDates);
  return sessions
    .filter(
      (s) =>
        s.teacherId === teacherId &&
        isDaytimeSlot(s, periodCfg) &&
        !isExcludedFromTeachingPeriods(s.subjectName, s.dayOfWeek, s.period, periodCfg)
    )
    .reduce((sum, s) => sum + (counts[s.dayOfWeek] || 0), 0);
};

/** 該月兼課節數：每個有兼課的時段 × 該「星期–節次」在當月應計次數（含暫時移課／半日停課；放假日由呼叫端決定是否扣除） */
export const monthlyConcurrentPeriods = (
  sessions: CourseSession[],
  teacherId: string,
  year: number,
  month: number,
  excludeDates?: Iterable<string> | Set<string> | null,
  calendar?: CalendarSettlementOptions,
  periodCfg?: PeriodCfg
) => {
  const holidaySet =
    calendar?.holidaySet ??
    (excludeDates instanceof Set
      ? excludeDates
      : excludeDates
      ? new Set(excludeDates)
      : new Set<string>());
  const maxPeriod =
    calendar?.maxPeriod ?? resolvePeriodConfig(periodCfg).maxPeriod;
  const slotCounts = slotOccurrenceCountsInMonth(year, month, {
    holidaySet,
    temporaryMoves: calendar?.temporaryMoves,
    partialStops: calendar?.partialStops,
    weeksInMonth: calendar?.weeksInMonth,
    maxPeriod,
  });
  const slots = new Set<string>();
  sessions.forEach((s) => {
    if (s.teacherId !== teacherId) return;
    if (!s.isConcurrent || isExcludedFromTeachingPeriods(s.subjectName, s.dayOfWeek, s.period, periodCfg))
      return;
    if (!isDaytimeSlot(s, periodCfg)) return;
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
  calendar?: CalendarSettlementOptions,
  periodCfg?: PeriodCfg
) => {
  const year = calendarYearForSettlementMonth(month, now, academicYear);
  const holidaySet =
    calendar?.holidaySet ??
    (excludeDates instanceof Set
      ? excludeDates
      : excludeDates
      ? new Set(excludeDates)
      : new Set<string>());
  const maxPeriod =
    calendar?.maxPeriod ?? resolvePeriodConfig(periodCfg).maxPeriod;
  const slotCounts = slotOccurrenceCountsInMonth(year, month, {
    holidaySet,
    temporaryMoves: calendar?.temporaryMoves,
    partialStops: calendar?.partialStops,
    weeksInMonth: calendar?.weeksInMonth,
    activeStartIso: calendar?.activeStartIso,
    activeEndIso: calendar?.activeEndIso,
    maxPeriod,
  });
  const slots = new Set<string>();
  sessions.forEach((s) => {
    if (s.teacherId !== teacherId || !isCounselingSlot(s, periodCfg) || isSubstituteCoverSession(s))
      return;
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
  calendar?: CalendarSettlementOptions,
  periodCfg?: PeriodCfg
) => {
  const year = calendarYearForSettlementMonth(month, now, academicYear);
  return monthlyConcurrentPeriods(
    sessions,
    teacher.id,
    year,
    month,
    excludeDates,
    calendar,
    periodCfg
  );
};

/** 折算週數：每月固定 N 週（系統參數 weeksInMonth，預設 4） */
export const settlementWeeksForMonth = (
  month: number,
  now = new Date(),
  excludeDates?: Iterable<string> | Set<string> | null,
  academicYear?: string | number,
  calendar?: CalendarSettlementOptions
) => calendar?.weeksInMonth ?? 4;

/** 每週超鐘點＝課表標示兼課的節數（有課表才計；不再用授課−基本估算） */
export const teacherWeeklyOverload = (
  teacher: Pick<Teacher, 'id' | 'weeklyActualPeriods' | 'dutyReductionPeriods' | 'basePeriods'>,
  sessions?: CourseSession[],
  periodCfg?: PeriodCfg
) => (sessions ? countWeeklyConcurrentPeriods(sessions, teacher.id, periodCfg) : 0);

/** 各職稱基本鐘點由系統設定；未填時專任預設 16。 */
export const HOMEROOM_DEFAULT_DUTY_REDUCTION = 1;
export const HOMEROOM_BASE_PERIODS = 12;
export const HEAD_DEFAULT_DUTY_REDUCTION = 2;
export const HEAD_BASE_PERIODS = 10;
export const CHIEF_DEFAULT_DUTY_REDUCTION = 0;
export const CHIEF_BASE_PERIODS = 8;
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

/** 真正的實習／實作課（含實務導向學習）；團體活動、普通教室學科不算 */
export const isInternshipCourse = (subjectName: string) => {
  const name = subjectName || '';
  if (isGroupActivity(name)) return false;
  return /實習|實作|實務導向/.test(name);
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

/** 班會老師 = 該班導師。看系統設定的班會格（預設星期三第 7 節），或科目已寫明班會／班級活動。 */
export const buildHomeroomClassByTeacher = (
  sessions: CourseSession[],
  config?: HomeroomSlotConfig | null
) => {
  const classToTeachers = new Map<string, string[]>();

  sessions.forEach((s) => {
    if (!isHomeroomTeacherSlot(s, config)) return;
    const { names } = sessionTeacherKeys(s);
    if (names.length === 0) return;
    const prev = classToTeachers.get(s.className) || [];
    names.forEach((n) => {
      if (!prev.includes(n)) prev.push(n);
    });
    classToTeachers.set(s.className, prev);
  });

  const teacherToClasses = new Map<string, string[]>();
  classToTeachers.forEach((names, className) => {
    names.forEach((name) => {
      const key = normalizeTeacherMatchName(name);
      if (!key) return;
      const list = teacherToClasses.get(key) || [];
      if (!list.includes(className)) list.push(className);
      teacherToClasses.set(key, list);
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

/** 各職稱基本鐘點由系統設定。超鐘點僅依課表「兼課」標記，不依正課−基本估算。 */
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

/** 覆蓋匯入時先清掉上一份課表推斷的導師班，再依新課表重算。行政職稱保留。 */
export const clearInferredHomeroom = <T extends Pick<Teacher, 'title' | 'homeroomClass'>>(teacher: T): T => {
  if (isAdminTeacherTitle(teacher.title)) {
    return teacher.homeroomClass ? { ...teacher, homeroomClass: undefined } : teacher;
  }
  if (teacher.title === '導師' || teacher.homeroomClass) {
    return { ...teacher, title: '專任教師' as T['title'], homeroomClass: undefined };
  }
  return teacher;
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
  sessions: CourseSession[],
  config?: HomeroomSlotConfig | null
): T[] => {
  if (!sessions.some((s) => isGroupActivity(s.subjectName))) return teachers;
  const homeroomByTeacher = buildHomeroomClassByTeacher(sessions, config);
  const claimedClasses = new Set<string>();
  homeroomByTeacher.forEach((classes) => classes.forEach((className) => claimedClasses.add(className)));

  return teachers.map((t) => {
    const classes =
      homeroomByTeacher.get(normalizeTeacherMatchName(t.name)) ||
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

    // 這個班的班會已經對到別人：清掉先前誤掛的導師班。
    // 班會完全對不到姓名時仍保留，避免列名不一致就誤降專任。
    if (!t.homeroomClass) return t;
    const kept = t.homeroomClass
      .split('、')
      .map((s) => s.trim())
      .filter((className) => className && !claimedClasses.has(className));
    if (kept.join('、') === t.homeroomClass) return t;
    if (keepAdminTitle) {
      return { ...t, homeroomClass: kept.length ? kept.join('、') : undefined };
    }
    if (!kept.length) {
      return { ...t, title: '專任教師' as T['title'], homeroomClass: undefined };
    }
    return { ...t, title: '導師' as T['title'], homeroomClass: kept.join('、') };
  });
};

export const enrichTeachersFromSessions = (
  teachers: Teacher[],
  sessions: CourseSession[],
  fulltimeStandard = FULLTIME_BASE_PERIODS,
  homeroomStandard = HOMEROOM_BASE_PERIODS,
  headStandard = HEAD_BASE_PERIODS,
  chiefStandard = CHIEF_BASE_PERIODS,
  directorStandard = DIRECTOR_BASE_PERIODS,
  homeroomSlot?: HomeroomSlotConfig | null
) => {
  const next = applyTeacherHomeroomFromSessions(
    applyTeacherDepartmentsFromSessions(teachers, sessions),
    sessions,
    homeroomSlot
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
    const weeklyActualPeriods = countWeeklyTeachingPeriods(sessions, t.id, homeroomSlot);
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
