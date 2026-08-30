/** 連續用起迄；有缺口列「第2、3、5、7節」 */
export function formatPeriodsLabel(periods: number[]): string {
  const uniq = [...new Set(periods.filter((p) => Number.isFinite(p)))].sort((a, b) => a - b);
  if (uniq.length === 0) return '';
  if (uniq.length === 1) return `第${uniq[0]}節`;
  const contiguous = uniq[uniq.length - 1] - uniq[0] + 1 === uniq.length;
  if (contiguous) return `第${uniq[0]}節～第${uniq[uniq.length - 1]}節`;
  return `第${uniq.join('、')}節`;
}

/** 連續段合併：如 [3,4,7] →「第3～4、7節」 */
export function formatPeriodsCompact(periods: number[]): string {
  const uniq = [...new Set(periods.filter((p) => Number.isFinite(p)))].sort((a, b) => a - b);
  if (uniq.length === 0) return '';
  const runs: Array<[number, number]> = [];
  let start = uniq[0];
  let end = uniq[0];
  for (let i = 1; i < uniq.length; i += 1) {
    if (uniq[i] === end + 1) {
      end = uniq[i];
    } else {
      runs.push([start, end]);
      start = uniq[i];
      end = uniq[i];
    }
  }
  runs.push([start, end]);
  const body = runs
    .map(([a, b]) => (a === b ? String(a) : `${a}～${b}`))
    .join('、');
  return `第${body}節`;
}

const DEFAULT_DAY_NAMES = ['', '週一', '週二', '週三', '週四', '週五', '週六', '週日'];

/** 例：週一 第3～4、7節；週二 第1～7節 · 共 10 節 */
export function formatDayPeriodSummary(
  sessions: Array<{ dayOfWeek: number; period: number }>,
  dayNames: string[] = DEFAULT_DAY_NAMES
): string {
  const byDay = new Map<number, number[]>();
  for (const s of sessions) {
    if (!Number.isFinite(s.dayOfWeek) || !Number.isFinite(s.period)) continue;
    const list = byDay.get(s.dayOfWeek) || [];
    list.push(s.period);
    byDay.set(s.dayOfWeek, list);
  }
  const days = [...byDay.keys()].sort((a, b) => a - b);
  if (days.length === 0) return '';
  const parts = days.map((d) => {
    const label = dayNames[d] || `星期${d}`;
    return `${label} ${formatPeriodsCompact(byDay.get(d) || [])}`;
  });
  const total = sessions.length;
  return `${parts.join('；')} · 共 ${total} 節`;
}
