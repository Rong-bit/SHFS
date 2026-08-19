import { CourseSession, DepartmentType, Teacher, TeacherTitle } from '../types';

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

/** 課表上的「團體活動時間」：含班會、團體活動；用來判斷導師，但不計入超鐘點正課 */
export const isGroupActivity = (subjectName: string) => /團體活動|班會/.test(subjectName || '');

const isAfternoonPeriod = (period: number) => period >= 5;

export type WeeklyOverloadBreakdown = {
  scheduleTotal: number;
  regularTeaching: number;
  groupActivityExcluded: number;
  concurrent: number;
  counted: number;
  sessionRows: number;
  hiddenRows: number;
};

const isVisibleWeeklySlot = (s: CourseSession) =>
  s.dayOfWeek >= 1 && s.dayOfWeek <= 5 && s.period >= 1 && s.period <= 8;

export const breakdownWeeklyOverloadPeriods = (
  sessions: CourseSession[],
  teacherId: string
): WeeklyOverloadBreakdown => {
  const mine = sessions.filter((s) => s.teacherId === teacherId);
  const visible = mine.filter(isVisibleWeeklySlot);
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
  slotMap.forEach((list) => {
    const teaching = list.filter((s) => !isGroupActivity(s.subjectName));
    if (teaching.length === 0) {
      groupActivityExcluded += 1;
      return;
    }
    counted += 1;
    if (teaching.some((s) => s.isConcurrent)) concurrent += 1;
  });

  return {
    scheduleTotal: slotMap.size,
    regularTeaching: counted,
    groupActivityExcluded,
    concurrent,
    counted,
    sessionRows: visible.length,
    hiddenRows: mine.length - visible.length,
  };
};

export const countWeeklyTeachingPeriods = (sessions: CourseSession[], teacherId: string) =>
  breakdownWeeklyOverloadPeriods(sessions, teacherId).counted;

export const countWeeklyConcurrentPeriods = (sessions: CourseSession[], teacherId: string) =>
  breakdownWeeklyOverloadPeriods(sessions, teacherId).concurrent;

/** 結算月份對應的西元年（跨年時：目前月份之後超過半年視為去年） */
export const calendarYearForSettlementMonth = (month: number, now = new Date()) => {
  const year = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  if (month > currentMonth && month - currentMonth > 6) return year - 1;
  if (month < currentMonth && currentMonth - month > 6) return year + 1;
  return year;
};

/** 該月各星期幾出現次數（JS：0 日、1 一 … 6 六） */
export const weekdayOccurrencesInMonth = (year: number, month: number) => {
  const lastDay = new Date(year, month, 0).getDate();
  const counts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  for (let day = 1; day <= lastDay; day += 1) {
    const jsDay = new Date(year, month - 1, day).getDay();
    counts[jsDay] += 1;
  }
  return counts;
};

export const countMondaysInMonth = (year: number, month: number) =>
  weekdayOccurrencesInMonth(year, month)[1];

/** 週一至週五平均出現次數，用來折算每週基本鐘點／任務減授 */
export const averageWeekdayWeeks = (year: number, month: number) => {
  const c = weekdayOccurrencesInMonth(year, month);
  return (c[1] + c[2] + c[3] + c[4] + c[5]) / 5;
};

export const settlementWeeksForMonth = (month: number, now = new Date()) => {
  const year = calendarYearForSettlementMonth(month, now);
  return averageWeekdayWeeks(year, month);
};

/** 該月實際正課節數：每堂課 × 該星期幾在當月出現次數 */
export const monthlyTeachingPeriods = (
  sessions: CourseSession[],
  teacherId: string,
  year: number,
  month: number
) => {
  const counts = weekdayOccurrencesInMonth(year, month);
  return sessions
    .filter((s) => s.teacherId === teacherId && !isGroupActivity(s.subjectName))
    .reduce((sum, s) => sum + (counts[s.dayOfWeek] || 0), 0);
};

/** 該月兼課節數：每個有兼課的時段 × 該星期幾在當月出現次數 */
export const monthlyConcurrentPeriods = (
  sessions: CourseSession[],
  teacherId: string,
  year: number,
  month: number
) => {
  const counts = weekdayOccurrencesInMonth(year, month);
  const slots = new Set<string>();
  sessions.forEach((s) => {
    if (s.teacherId !== teacherId) return;
    if (!s.isConcurrent || isGroupActivity(s.subjectName)) return;
    if (!isVisibleWeeklySlot(s)) return;
    slots.add(`${s.dayOfWeek}-${s.period}`);
  });
  let total = 0;
  slots.forEach((key) => {
    const day = Number(key.split('-')[0]);
    total += counts[day] || 0;
  });
  return total;
};

export const monthlyOverloadPeriods = (
  sessions: CourseSession[],
  teacher: Pick<Teacher, 'id'>,
  month: number,
  now = new Date()
) => {
  const year = calendarYearForSettlementMonth(month, now);
  return monthlyConcurrentPeriods(sessions, teacher.id, year, month);
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
