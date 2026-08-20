import { SubstituteRequest } from '../types';

/** 從單號解析流水號；格式 VOC-{學年}-{月}-{序} */
export function parseRequestSeq(requestNumber: string): {
  academicYear: string;
  month: number;
  seq: number;
} | null {
  const m = requestNumber.match(/^VOC-(\d+)-(\d+)-(\d+)$/i);
  if (!m) return null;
  return {
    academicYear: m[1],
    month: Number(m[2]),
    seq: Number(m[3]),
  };
}

/** 同「學年＋月」既有單號的下一流水號（最大序 + 1；無則 1） */
export function nextRequestSequence(
  existing: Pick<SubstituteRequest, 'requestNumber'>[],
  academicYear: string | number,
  month: number
): number {
  const year = String(academicYear);
  let max = 0;
  for (const r of existing) {
    const parsed = parseRequestSeq(r.requestNumber);
    if (!parsed) continue;
    if (parsed.academicYear !== year || parsed.month !== month) continue;
    if (parsed.seq > max) max = parsed.seq;
  }
  return max + 1;
}

export function formatRequestNumber(
  academicYear: string | number,
  month: number,
  seq: number
): string {
  return `VOC-${academicYear}-${month}-${String(seq).padStart(3, '0')}`;
}
