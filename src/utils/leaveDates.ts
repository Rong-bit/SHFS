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
