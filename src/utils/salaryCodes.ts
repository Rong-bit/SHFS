import type { PartialNonTeachingDay, SystemConfig, Teacher } from '../types';

export type PayrollTeacherLookupConfig = Pick<
  SystemConfig,
  'teacherSalaryCodesByName' | 'teacherSalaryCodes' | 'teacherPayrollTitlesByName'
>;

/** 半日停課不發鐘點的薪資職稱（匯入檔「職稱」欄） */
export const PARTIAL_STOP_EXCLUDED_PAYROLL_TITLE = '外聘人員';

/** 依姓名解析薪資編號（課表匯入後仍有效；相容舊版 teacherId 對照） */
export function resolveTeacherSalaryCode(
  teacher: Pick<Teacher, 'id' | 'name'>,
  config: Pick<SystemConfig, 'teacherSalaryCodesByName' | 'teacherSalaryCodes'>
): string {
  const name = teacher.name.trim();
  const byName = config.teacherSalaryCodesByName?.[name];
  if (byName) return byName;
  const legacy = config.teacherSalaryCodes?.[teacher.id];
  return legacy || '';
}

/** 依姓名解析薪資匯入職稱（與師資名冊職稱下拉分開） */
export function resolveTeacherPayrollTitle(
  teacher: Pick<Teacher, 'id' | 'name'>,
  config: Pick<SystemConfig, 'teacherPayrollTitlesByName'>
): string {
  const name = teacher.name.trim();
  return config.teacherPayrollTitlesByName?.[name]?.trim() || '';
}

export function normalizePayrollTitle(title: string): string {
  return title.trim().replace(/\s/g, '');
}

/**
 * 半日／節次停課鐘點：薪資職稱為「外聘人員」者不發；其餘教師仍依原課表月計次。
 * 派代／衝堂檢核仍一律套用停課設定，請勿用此函式。
 */
export function isPartialStopPayrollExcludedTeacher(
  teacher: Pick<Teacher, 'id' | 'name'>,
  config: PayrollTeacherLookupConfig
): boolean {
  const title = resolveTeacherPayrollTitle(teacher, config);
  return normalizePayrollTitle(title) === PARTIAL_STOP_EXCLUDED_PAYROLL_TITLE;
}

/** 鐘點結算用：非外聘人員回傳空陣列（不停課扣節）；外聘人員回傳完整停課設定 */
export function partialStopsForPayroll(
  allStops: PartialNonTeachingDay[] | null | undefined,
  teacher: Pick<Teacher, 'id' | 'name'> | undefined,
  config: PayrollTeacherLookupConfig
): PartialNonTeachingDay[] {
  if (!allStops?.length) return [];
  if (!teacher) return allStops;
  if (isPartialStopPayrollExcludedTeacher(teacher, config)) return allStops;
  return [];
}

export function mergeSalaryCodesByName(
  existing: Record<string, string> | undefined,
  imported: Record<string, string>
): Record<string, string> {
  const next = { ...(existing || {}) };
  Object.entries(imported).forEach(([name, code]) => {
    const n = name.trim();
    const c = String(code || '').trim();
    if (n && c) next[n] = c;
  });
  return next;
}

export function mergePayrollTitlesByName(
  existing: Record<string, string> | undefined,
  imported: Record<string, string>
): Record<string, string> {
  const next = { ...(existing || {}) };
  Object.entries(imported).forEach(([name, title]) => {
    const n = name.trim();
    const t = String(title || '').trim();
    if (n && t) next[n] = t;
  });
  return next;
}

export function setTeacherSalaryCodeByName(
  existing: Record<string, string> | undefined,
  teacherName: string,
  code: string
): Record<string, string> {
  const name = teacherName.trim();
  const next = { ...(existing || {}) };
  const c = code.trim();
  if (!name) return next;
  if (!c) {
    delete next[name];
    return next;
  }
  next[name] = c;
  return next;
}

export function setTeacherPayrollTitleByName(
  existing: Record<string, string> | undefined,
  teacherName: string,
  title: string
): Record<string, string> {
  const name = teacherName.trim();
  const next = { ...(existing || {}) };
  const t = title.trim();
  if (!name) return next;
  if (!t) {
    delete next[name];
    return next;
  }
  next[name] = t;
  return next;
}

export function removeTeacherSalaryCodeByName(
  existing: Record<string, string> | undefined,
  teacherName: string
): Record<string, string> {
  const name = teacherName.trim();
  const next = { ...(existing || {}) };
  delete next[name];
  return next;
}

export function countSalaryCodes(
  config: Pick<SystemConfig, 'teacherSalaryCodesByName' | 'teacherSalaryCodes'>
): number {
  const byName = Object.keys(config.teacherSalaryCodesByName || {}).length;
  if (byName > 0) return byName;
  return Object.keys(config.teacherSalaryCodes || {}).length;
}

/** 將舊版 id 對照併入姓名對照（需現有師資名冊） */
export function migrateSalaryCodesToName(
  teachers: Teacher[],
  config: Pick<SystemConfig, 'teacherSalaryCodesByName' | 'teacherSalaryCodes'>
): Record<string, string> {
  const next = { ...(config.teacherSalaryCodesByName || {}) };
  const legacy = config.teacherSalaryCodes || {};
  teachers.forEach((t) => {
    const code = legacy[t.id];
    if (code && !next[t.name.trim()]) {
      next[t.name.trim()] = code;
    }
  });
  return next;
}
