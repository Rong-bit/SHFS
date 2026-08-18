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
      .filter((s) => s.isPractical && (s.teacherId === teacher.id || teacherNameMatches(s.teacherName, teacher.name)))
      .map((s) => ({ teacherName: teacher.name, className: s.className, isPractical: true }))
  );

export const applyTeacherDepartmentsFromSessions = <T extends Pick<Teacher, 'id' | 'name' | 'department'>>(
  teachers: T[],
  sessions: CourseSession[]
): T[] => {
  if (!sessions.some((s) => s.isPractical)) return teachers;
  return teachers.map((t) => {
    const department = inferTeacherDepartmentFromSessions(t, sessions);
    return department === t.department ? t : { ...t, department };
  });
};
