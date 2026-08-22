import type { SystemConfig, Teacher } from '../types';

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
