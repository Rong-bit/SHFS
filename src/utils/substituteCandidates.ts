import { CourseSession, DayOfWeek, SubstituteRequest, Teacher } from '../types';
import { teacherWeeklyOverload } from './schoolDepartments';
import { resolveLeaveDateEnd } from './leaveDates';

export interface SubstituteCandidate {
  teacher: Teacher;
  hasClash: boolean;
  isSameSubject: boolean;
  isSameDept: boolean;
  weeklyOverload: number;
  isNearLimit: boolean;
  score: number;
}

export type SubstituteOccupancy = {
  teacherId: string;
  dayOfWeek: DayOfWeek;
  period: number;
  leaveDateStart?: string;
  leaveDateEnd?: string;
};

function leaveRangesOverlap(
  aStart?: string,
  aEnd?: string,
  bStart?: string,
  bEnd?: string
): boolean {
  if (!aStart || !bStart) return true; // 缺日期舊案：保守視為佔用
  const aE = resolveLeaveDateEnd(aStart, aEnd) || aStart;
  const bE = resolveLeaveDateEnd(bStart, bEnd) || bStart;
  return aStart <= bE && bStart <= aE;
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
 * 已派代／待簽核代課佔用的時段（代課教師在該星期＋節次視為非空堂）
 * 含請假起迄，供「同槽但週次不重疊」時放行。
 */
export function collectSubstituteOccupancies(
  requests: SubstituteRequest[],
  options?: { excludeRequestIds?: string[] }
): SubstituteOccupancy[] {
  const exclude = new Set(options?.excludeRequestIds || []);
  const out: SubstituteOccupancy[] = [];
  for (const r of requests) {
    if (r.requestType !== 'substitute') continue;
    if (r.status !== 'approved' && r.status !== 'pending') continue;
    if (!r.substituteTeacherId) continue;
    if (exclude.has(r.id)) continue;
    out.push({
      teacherId: r.substituteTeacherId,
      dayOfWeek: r.originalSession.dayOfWeek,
      period: r.originalSession.period,
      leaveDateStart: r.leaveDateStart,
      leaveDateEnd: r.leaveDateEnd,
    });
  }
  return out;
}

export function teacherHasSubstituteOccupancy(
  teacherId: string,
  dayOfWeek: DayOfWeek,
  period: number,
  occupancies: SubstituteOccupancy[],
  probeLeave?: { leaveDateStart?: string; leaveDateEnd?: string }
): boolean {
  return occupancies.some((o) => {
    if (o.teacherId !== teacherId || o.dayOfWeek !== dayOfWeek || o.period !== period) {
      return false;
    }
    return leaveRangesOverlap(
      probeLeave?.leaveDateStart,
      probeLeave?.leaveDateEnd,
      o.leaveDateStart,
      o.leaveDateEnd
    );
  });
}

/**
 * 智慧派代排序：
 * 1. 相同科目優先
 * 2. 其次同科別
 * 3. 再以該時段沒課（空堂）優先——含已核准／待簽核代課佔用（請假區間重疊才算衝）
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
  /** 已派代佔用（不傳則只看課表） */
  substituteOccupancies?: SubstituteOccupancy[];
  requests?: SubstituteRequest[];
  leaveDateStart?: string;
  leaveDateEnd?: string;
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
  const occupancies =
    params.substituteOccupancies ||
    (params.requests ? collectSubstituteOccupancies(params.requests) : []);
  const probeLeave = {
    leaveDateStart: params.leaveDateStart,
    leaveDateEnd: params.leaveDateEnd,
  };

  return teachers
    .filter((t) => t.id !== excludeTeacherId)
    .map((t) => {
      const hasClash = periods.some(
        (p) =>
          sessions.some(
            (s) =>
              s.teacherId === t.id &&
              s.dayOfWeek === targetDayOfWeek &&
              s.period === p
          ) ||
          teacherHasSubstituteOccupancy(t.id, targetDayOfWeek, p, occupancies, probeLeave)
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
