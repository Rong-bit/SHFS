import { SubstituteRequest } from '../types';

export type ParsedRequestNumber = {
  academicYear: string;
  semester: number;
  seq: number;
  /** 舊版 VOC-學年-月-序 格式保留月份，供結算推估 */
  legacyMonth?: number;
};

/** 由曆月推估學期：上學期 8–1 月、下學期 2–7 月 */
export function semesterFromCalendarMonth(month: number): number {
  return month >= 2 && month <= 7 ? 2 : 1;
}

/** 僅接受 1／2；若誤存成月份等無效值則依參考月份推估學期 */
export function normalizeSemesterValue(
  semester: string | number | undefined,
  referenceMonth?: number
): 1 | 2 {
  const sem = Number(semester);
  if (sem === 1 || sem === 2) return sem;
  return semesterFromCalendarMonth(referenceMonth ?? new Date().getMonth() + 1);
}

export function normalizeSystemConfigSemester(
  semester: string | undefined,
  currentMonth: number
): '1' | '2' {
  return String(normalizeSemesterValue(semester, currentMonth)) as '1' | '2';
}

/** 解析單號；新格式 {學年度}-{學期}-{流水號}，例 115-1-001；仍相容 VOC 與舊版月分格式 */
export function parseRequestSeq(requestNumber: string): ParsedRequestNumber | null {
  const modern = requestNumber.match(/^(\d+)-([12])-(\d+)$/);
  if (modern) {
    return {
      academicYear: modern[1],
      semester: Number(modern[2]),
      seq: Number(modern[3]),
    };
  }

  const legacy = requestNumber.match(/^VOC-(\d+)-(\d+)-(\d+)$/i);
  if (legacy) {
    const legacyMonth = Number(legacy[2]);
    return {
      academicYear: legacy[1],
      semester: semesterFromCalendarMonth(legacyMonth),
      seq: Number(legacy[3]),
      legacyMonth,
    };
  }

  // 舊版無前綴：115-8-113（學年-月份-流水號）
  const bareMonth = requestNumber.match(/^(\d+)-((?:[3-9]|1[0-2]))-(\d+)$/);
  if (bareMonth) {
    const legacyMonth = Number(bareMonth[2]);
    return {
      academicYear: bareMonth[1],
      semester: semesterFromCalendarMonth(legacyMonth),
      seq: Number(bareMonth[3]),
      legacyMonth,
    };
  }

  return null;
}

/** 將舊版月分單號轉為 學年度-學期-三位流水號 */
export function migrateRequestNumber(requestNumber: string): string {
  const parsed = parseRequestSeq(requestNumber);
  if (!parsed) return requestNumber;
  return formatRequestNumber(parsed.academicYear, parsed.semester, parsed.seq);
}

/** 同「學年＋學期」既有單號的下一流水號（最大序 + 1；無則 1） */
export function nextRequestSequence(
  existing: Pick<SubstituteRequest, 'requestNumber'>[],
  academicYear: string | number,
  semester: string | number,
  referenceMonth?: number
): number {
  const year = String(academicYear);
  const sem = normalizeSemesterValue(semester, referenceMonth);
  let max = 0;
  for (const r of existing) {
    const parsed = parseRequestSeq(r.requestNumber);
    if (!parsed) continue;
    if (parsed.academicYear !== year || parsed.semester !== sem) continue;
    if (parsed.seq > max) max = parsed.seq;
  }
  return max + 1;
}

/** 假單編號：{學年度}-{學期}-{流水號}，例 115-1-001 */
export function formatRequestNumber(
  academicYear: string | number,
  semester: string | number,
  seq: number,
  referenceMonth?: number
): string {
  const sem = normalizeSemesterValue(semester, referenceMonth);
  return `${academicYear}-${sem}-${String(seq).padStart(3, '0')}`;
}
