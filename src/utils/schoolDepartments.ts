import { CourseSession, DepartmentType, Teacher } from '../types';

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
  '餐飲管理科',
  '廣告設計科',
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
  ['餐飲', '餐飲管理科'],
  ['廣告', '廣告設計科'],
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

const isGroupActivity = (subjectName: string) => /團體活動/.test(subjectName || '');

/** 真正的實習／實作課；團體活動、普通教室學科不算 */
export const isInternshipCourse = (subjectName: string) => {
  const name = subjectName || '';
  if (isGroupActivity(name)) return false;
  return /實習|實作/.test(name);
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

const isAfternoonPeriod = (period: number) => period >= 5;

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

export const teacherBasePeriods = (fulltimeStandard: number, dutyReductionPeriods = 0) =>
  Math.max(0, fulltimeStandard - Math.max(0, dutyReductionPeriods));

/** 任務減授：已填寫則用填值；舊資料沒填時，由既有基本節數反推，避免導師一律被重設成 16。 */
export const resolveDutyReductionPeriods = (
  fulltimeStandard: number,
  teacher: Pick<Teacher, 'dutyReductionPeriods' | 'basePeriods'>
) => {
  if (teacher.dutyReductionPeriods != null) return Math.max(0, teacher.dutyReductionPeriods);
  return Math.max(0, fulltimeStandard - (teacher.basePeriods ?? fulltimeStandard));
};

export const displayTeacherTitle = (teacher: Pick<Teacher, 'title' | 'homeroomClass'>) => {
  if (teacher.homeroomClass) return `${teacher.homeroomClass}導師`;
  return teacher.title;
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
    const keepAdminTitle = t.title === '科主任' || t.title === '教學組長';

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
  fulltimeStandard = 16
) => {
  const next = applyTeacherHomeroomFromSessions(
    applyTeacherDepartmentsFromSessions(teachers, sessions),
    sessions
  );
  return next.map((t) => {
    const dutyReductionPeriods = resolveDutyReductionPeriods(fulltimeStandard, t);
    const basePeriods = teacherBasePeriods(fulltimeStandard, dutyReductionPeriods);
    if (t.dutyReductionPeriods === dutyReductionPeriods && t.basePeriods === basePeriods) return t;
    return { ...t, dutyReductionPeriods, basePeriods };
  });
};
