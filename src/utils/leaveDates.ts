import { DayOfWeek, SubstituteRequest } from '../types';

/** YYYY-MM-DD → 週一=1 … 週五=5；週末回傳 null */
export function dateToDayOfWeek(isoDate: string): DayOfWeek | null {
  const d = new Date(isoDate.replace(/-/g, '/') + ' 12:00:00');
  if (Number.isNaN(d.getTime())) return null;
  const js = d.getDay(); // 0=日 … 6=六
  if (js < 1 || js > 5) return null;
  return js as DayOfWeek;
}

export function resolveLeaveDateEnd(start?: string, end?: string): string | undefined {
  if (!start) return undefined;
  if (!end || end < start) return start;
  return end;
}

/** 區間內與指定星期相符的天數（含起迄） */
export function countMatchingWeekdays(
  start: string,
  end: string,
  dayOfWeek: DayOfWeek
): number {
  const s = new Date(start.replace(/-/g, '/') + ' 12:00:00');
  const e = new Date(end.replace(/-/g, '/') + ' 12:00:00');
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) return 0;

  let count = 0;
  for (let cur = new Date(s); cur <= e; cur.setDate(cur.getDate() + 1)) {
    if (cur.getDay() === dayOfWeek) count += 1;
  }
  return count;
}

/**
 * 請假起迄區間內會出現的平日星期（1–5）。
 * 僅填開始日、或結束日無效時，回傳開始日的星期。
 */
export function weekdaysInDateRange(start?: string, end?: string): DayOfWeek[] {
  if (!start) return [];
  const resolvedEnd = resolveLeaveDateEnd(start, end) || start;
  const s = new Date(start.replace(/-/g, '/') + ' 12:00:00');
  const e = new Date(resolvedEnd.replace(/-/g, '/') + ' 12:00:00');
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) {
    const one = dateToDayOfWeek(start);
    return one == null ? [] : [one];
  }

  const found = new Set<DayOfWeek>();
  for (let cur = new Date(s); cur <= e; cur.setDate(cur.getDate() + 1)) {
    const js = cur.getDay();
    if (js >= 1 && js <= 5) found.add(js as DayOfWeek);
  }
  return Array.from(found).sort((a, b) => a - b);
}

export function formatWeekdayList(days: DayOfWeek[], dayNames: string[]): string {
  if (days.length === 0) return '';
  return days.map((d) => dayNames[d] || `週${d}`).join('、');
}

function formatSlashDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${y}/${m}/${d}`;
}

/** 畫面顯示用：單日或起迄；缺資料則註明未填 */
export function formatLeaveDateLabel(
  start?: string,
  end?: string,
  emptyLabel = '（未填請假日期）'
): string {
  if (!start) return emptyLabel;
  const resolvedEnd = resolveLeaveDateEnd(start, end) || start;
  if (resolvedEnd === start) return formatSlashDate(start);
  const [, em, ed] = resolvedEnd.split('-');
  return `${formatSlashDate(start)}～${em}/${ed}`;
}

/** 請假派代結算節數：無日期舊案算 1；有日期則算區間內相符星期數 */
export function countLeaveSubstitutePeriods(request: Pick<
  SubstituteRequest,
  'leaveDateStart' | 'leaveDateEnd' | 'originalSession'
>): number {
  if (!request.leaveDateStart) return 1;
  const end = resolveLeaveDateEnd(request.leaveDateStart, request.leaveDateEnd) || request.leaveDateStart;
  const n = countMatchingWeekdays(
    request.leaveDateStart,
    end,
    request.originalSession.dayOfWeek
  );
  return Math.max(1, n);
}
