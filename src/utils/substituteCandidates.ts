import {
  CourseSession,
  DayOfWeek,
  ExamDay,
  NonTeachingDay,
  SubstituteRequest,
  Teacher,
} from '../types';
import { teacherWeeklyOverload, type HomeroomSlotConfig } from './schoolDepartments';
import { resolveLeaveDateEnd } from './leaveDates';
import { dateToIsoLocal, nonTeachingDateSet } from './holidays';

export interface SubstituteCandidate {
  teacher: Teacher;
  hasClash: boolean;
  /** 週課表該節有正課，但請假日皆為段考日而解除衝堂 */
  examClashWaived: boolean;
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
  // 雙方都無日期（舊案）：保守視為佔用
  if (!aStart && !bStart) return true;
  // 探測端無日期（永久移課／對調）：僅與「也無日期」的舊佔用衝突，不擋有請假區間的代課
  if (!aStart) return false;
  // 佔用端無日期：對有日期的探測保守擋下
  if (!bStart) return true;
  const aE = resolveLeaveDateEnd(aStart, aEnd) || aStart;
  const bE = resolveLeaveDateEnd(bStart, bEnd) || bStart;
  return aStart <= bE && bStart <= aE;
}

/**
 * 請假區間內所有符合該星期的日期皆為段考日（至少一天）時回傳 true；放假日略過不計。
 * 無請假起日（永久移課／舊案）一律 false。
 */
export function leaveFallsOnExamDays(
  dayOfWeek: DayOfWeek,
  leaveDateStart: string | undefined,
  leaveDateEnd: string | undefined,
  examDays: ExamDay[] | null | undefined,
  nonTeachingDays?: NonTeachingDay[] | null
): boolean {
  if (!leaveDateStart || !examDays || examDays.length === 0) return false;
  const examSet = new Set(examDays.map((d) => d.date).filter(Boolean));
  const holidaySet = nonTeachingDateSet(nonTeachingDays);
  const end = resolveLeaveDateEnd(leaveDateStart, leaveDateEnd) || leaveDateStart;
  const s = new Date(leaveDateStart.replace(/-/g, '/') + ' 12:00:00');
  const e = new Date(end.replace(/-/g, '/') + ' 12:00:00');
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) return false;
  let matched = 0;
  for (let cur = new Date(s); cur <= e; cur.setDate(cur.getDate() + 1)) {
    if (cur.getDay() !== dayOfWeek) continue;
    const iso = dateToIsoLocal(cur);
    if (examSet.has(iso)) {
      matched += 1;
      continue;
    }
    if (holidaySet.has(iso)) continue;
    return false;
  }
  return matched > 0;
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

/** 代課教師本週負荷：已派代／待簽核代課佔用的不重複（星期＋節次）數 */
export function countWeeklySubstituteOccupancySlots(
  requests: SubstituteRequest[],
  teacherId: string,
  options?: { excludeRequestIds?: string[] }
): number {
  const keys = new Set<string>();
  for (const o of collectSubstituteOccupancies(requests, options)) {
    if (o.teacherId !== teacherId) continue;
    keys.add(`${o.dayOfWeek}-${o.period}`);
  }
  return keys.size;
}

/** 兼課節數 + 代課佔用節數，供法定兼代課上限檢核 */
export function teacherWeeklyLoadTowardLimit(
  teacher: Pick<Teacher, 'id' | 'weeklyActualPeriods' | 'dutyReductionPeriods' | 'basePeriods'>,
  sessions: CourseSession[],
  requests: SubstituteRequest[],
  options?: { excludeRequestIds?: string[]; periodCfg?: HomeroomSlotConfig | null }
): number {
  return (
    teacherWeeklyOverload(teacher, sessions, options?.periodCfg) +
    countWeeklySubstituteOccupancySlots(requests, teacher.id, options)
  );
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
  periodCfg?: HomeroomSlotConfig | null;
  /** 已派代佔用（不傳則只看課表） */
  substituteOccupancies?: SubstituteOccupancy[];
  requests?: SubstituteRequest[];
  leaveDateStart?: string;
  leaveDateEnd?: string;
  /** 段考日：請假日皆落在段考日時，週課表正課不算衝堂 */
  examDays?: ExamDay[] | null;
  /** 放假日：段考判定時略過 */
  nonTeachingDays?: NonTeachingDay[] | null;
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

  const examWaiver = leaveFallsOnExamDays(
    targetDayOfWeek,
    params.leaveDateStart,
    params.leaveDateEnd,
    params.examDays,
    params.nonTeachingDays
  );

  return teachers
    .filter((t) => t.id !== excludeTeacherId)
    .map((t) => {
      const hasRegularClash = periods.some((p) =>
        sessions.some(
          (s) =>
            s.teacherId === t.id &&
            s.dayOfWeek === targetDayOfWeek &&
            s.period === p
        )
      );
      const hasOccupancyClash = periods.some((p) =>
        teacherHasSubstituteOccupancy(t.id, targetDayOfWeek, p, occupancies, probeLeave)
      );
      const examClashWaived = examWaiver && hasRegularClash && !hasOccupancyClash;
      const hasClash = hasOccupancyClash || (hasRegularClash && !examWaiver);
      const isSameSubject = subjects.some((subj) =>
        teacherTeachesSubject(t.id, subj, sessions)
      );
      const isSameDept =
        Boolean(sessionDepartment && t.department === sessionDepartment) ||
        Boolean(applicantDepartment && t.department === applicantDepartment);
      const weeklyOverload = teacherWeeklyLoadTowardLimit(
        t,
        sessions,
        params.requests || [],
        { periodCfg: params.periodCfg }
      );
      const isNearLimit = weeklyOverload >= maxWeeklyOverloadPeriods;

      // 權重刻意拉開：科目 ≫ 科別 ≫ 空堂 ≫ 負荷
      let score = 0;
      if (isSameSubject) score += 1000;
      if (isSameDept) score += 300;
      if (!hasClash) score += 100;
      if (examClashWaived) score -= 50;
      if (!isNearLimit) score += 20;
      score -= weeklyOverload;

      return {
        teacher: t,
        hasClash,
        examClashWaived,
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
