import type { PartialNonTeachingDay, SystemConfig, Teacher } from '../types';

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

/**
 * 半日／節次停課鐘點：薪資編號 X／x 開頭者不發（例：X07390）；其餘教師仍依原課表月計次。
 * 派代／衝堂檢核仍一律套用停課設定，請勿用此函式。
 */
export function isPartialStopPayrollExcludedTeacher(
  teacher: Pick<Teacher, 'id' | 'name'>,
  config: Pick<SystemConfig, 'teacherSalaryCodesByName' | 'teacherSalaryCodes'>
): boolean {
  const code = resolveTeacherSalaryCode(teacher, config).trim();
  return /^x/i.test(code);
}

/** 鐘點結算用：非 x 開頭者回傳空陣列（不停課扣節）；x 開頭者回傳完整停課設定 */
export function partialStopsForPayroll(
  allStops: PartialNonTeachingDay[] | null | undefined,
  teacher: Pick<Teacher, 'id' | 'name'> | undefined,
  config: Pick<SystemConfig, 'teacherSalaryCodesByName' | 'teacherSalaryCodes'>
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
