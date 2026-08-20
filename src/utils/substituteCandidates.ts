import { CourseSession, DayOfWeek, Teacher } from '../types';
import { teacherWeeklyOverload } from './schoolDepartments';

export interface SubstituteCandidate {
  teacher: Teacher;
  hasClash: boolean;
  isSameSubject: boolean;
  isSameDept: boolean;
  weeklyOverload: number;
  isNearLimit: boolean;
  score: number;
}

/** 科目名稱正規化：略過「補強-」等前綴以便比對 */
export function normalizeSubjectName(name: string): string {
  return name
    .replace(/^補強[-－\s]*/u, '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

export function teacherTeachesSubject(
  teacherId: string,
  subjectName: string,
  sessions: CourseSession[]
): boolean {
  const target = normalizeSubjectName(subjectName);
  if (!target) return false;

  if (
    sessions.some(
      (s) => s.teacherId === teacherId && normalizeSubjectName(s.subjectName) === target
    )
  ) {
    return true;
  }

  return false;
}

/**
 * 智慧派代排序：
 * 1. 相同科目優先
 * 2. 其次同科別
 * 3. 再以該時段沒課（空堂）優先
 * 連續節次時：任一節有課即視為衝堂；任教科目與任一目標科目相符即視為同科目
 */
export function rankSubstituteCandidates(params: {
  teachers: Teacher[];
  sessions: CourseSession[];
  excludeTeacherId: string;
  targetDayOfWeek: DayOfWeek;
  targetPeriod: number | number[];
  subjectName: string | string[];
  sessionDepartment?: string;
  applicantDepartment?: string;
  maxWeeklyOverloadPeriods: number;
}): SubstituteCandidate[] {
  const {
    teachers,
    sessions,
    excludeTeacherId,
    targetDayOfWeek,
    targetPeriod,
    subjectName,
    sessionDepartment,
    applicantDepartment,
    maxWeeklyOverloadPeriods,
  } = params;

  const periods = Array.isArray(targetPeriod) ? targetPeriod : [targetPeriod];
  const subjects = Array.isArray(subjectName) ? subjectName : [subjectName];

  return teachers
    .filter((t) => t.id !== excludeTeacherId)
    .map((t) => {
      const hasClash = periods.some((p) =>
        sessions.some(
          (s) =>
            s.teacherId === t.id &&
            s.dayOfWeek === targetDayOfWeek &&
            s.period === p
        )
      );
      const isSameSubject = subjects.some((subj) =>
        teacherTeachesSubject(t.id, subj, sessions)
      );
      const isSameDept =
        Boolean(sessionDepartment && t.department === sessionDepartment) ||
        Boolean(applicantDepartment && t.department === applicantDepartment);
      const weeklyOverload = teacherWeeklyOverload(t, sessions);
      const isNearLimit = weeklyOverload >= maxWeeklyOverloadPeriods;

      // 權重刻意拉開：科目 ≫ 科別 ≫ 空堂 ≫ 負荷
      let score = 0;
      if (isSameSubject) score += 1000;
      if (isSameDept) score += 300;
      if (!hasClash) score += 100;
      if (!isNearLimit) score += 20;
      score -= weeklyOverload;

      return {
        teacher: t,
        hasClash,
        isSameSubject,
        isSameDept,
        weeklyOverload,
        isNearLimit,
        score,
      };
    })
    .sort((a, b) => {
      if (a.isSameSubject !== b.isSameSubject) return a.isSameSubject ? -1 : 1;
      if (a.isSameDept !== b.isSameDept) return a.isSameDept ? -1 : 1;
      if (a.hasClash !== b.hasClash) return a.hasClash ? 1 : -1;
      return b.score - a.score;
    });
}
