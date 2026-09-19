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

/** 例：週一 第3～4、7節；週二 第1～7節 */
export function formatDayPeriodSummary(
  sessions: Array<{ dayOfWeek: number; period: number }>,
  dayNames: string[] = DEFAULT_DAY_NAMES,
  options?: { withTotal?: boolean }
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
  const body = parts.join('；');
  if (options?.withTotal === false) return body;
  return `${body} · 共 ${sessions.length} 節`;
}

export type AffectedSessionSlice = {
  className?: string;
  subjectName?: string;
  venueName?: string;
  dayOfWeek: number;
  period: number;
  practical?: boolean;
};

/** 依班級＋科目分行，避免節次與場地對不上 */
export function groupAffectedSessionLines(
  sessions: AffectedSessionSlice[],
  dayNames: string[] = DEFAULT_DAY_NAMES
): Array<{ title: string; schedule: string; venue: string; practical: boolean; count: number }> {
  const groups = new Map<string, AffectedSessionSlice[]>();
  const order: string[] = [];
  for (const s of sessions) {
    const key = `${s.className || ''}｜${s.subjectName || ''}`;
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(s);
  }
  return order.map((key) => {
    const items = groups.get(key) || [];
    const first = items[0];
    const venues = [...new Set(items.map((s) => s.venueName).filter(Boolean))] as string[];
    return {
      title: `${first?.className || '（未填班級）'}《${first?.subjectName || '（未填科目）'}》`,
      schedule: formatDayPeriodSummary(items, dayNames, { withTotal: false }),
      venue: venues.join('、'),
      practical: items.some((s) => s.practical),
      count: items.length,
    };
  });
}
