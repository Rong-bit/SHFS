import { NonTeachingDay } from '../types';

/** YYYY-MM-DD */
export function formatIsoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function dateToIsoLocal(d: Date): string {
  return formatIsoDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

export function nonTeachingDateSet(
  days?: NonTeachingDay[] | string[] | null
): Set<string> {
  if (!days || days.length === 0) return new Set();
  const out = new Set<string>();
  for (const item of days) {
    const date = typeof item === 'string' ? item : item.date;
    if (date) out.add(date);
  }
  return out;
}

export function isNonTeachingDate(
  isoDate: string,
  exclude: Set<string> | Iterable<string> | NonTeachingDay[] | null | undefined
): boolean {
  if (!isoDate) return false;
  const set =
    exclude instanceof Set
      ? exclude
      : Array.isArray(exclude)
      ? nonTeachingDateSet(exclude)
      : exclude
      ? new Set(exclude)
      : new Set<string>();
  return set.has(isoDate);
}

/** 合併放假日清單（同日期以新 label 覆蓋） */
export function mergeNonTeachingDays(
  existing: NonTeachingDay[] | undefined,
  incoming: NonTeachingDay[]
): NonTeachingDay[] {
  const map = new Map<string, string>();
  for (const d of existing || []) {
    if (d?.date) map.set(d.date, d.label || '放假');
  }
  for (const d of incoming) {
    if (d?.date) map.set(d.date, d.label || map.get(d.date) || '放假');
  }
  return Array.from(map.entries())
    .map(([date, label]) => ({ date, label }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * 建議國定／常見放假日（含補假常見落點；農曆年節等請依當年度人事行政總處公告再調整）。
 * 僅回傳週一至週五；週末不列入（系統本就不計週末）。
 */
export function suggestNationalHolidays(year: number): NonTeachingDay[] {
  const candidates: NonTeachingDay[] = [
    { date: formatIsoDate(year, 1, 1), label: '元旦' },
    { date: formatIsoDate(year, 2, 28), label: '和平紀念日' },
    { date: formatIsoDate(year, 4, 4), label: '兒童節' },
    { date: formatIsoDate(year, 4, 5), label: '清明節' },
    { date: formatIsoDate(year, 5, 1), label: '勞動節' },
    { date: formatIsoDate(year, 10, 10), label: '國慶日' },
  ];

  // 已知西元年之農曆／補假建議（可手動刪改）
  const lunarHints: Record<number, NonTeachingDay[]> = {
    2025: [
      { date: '2025-01-27', label: '小年夜（彈性放假）' },
      { date: '2025-01-28', label: '農曆除夕' },
      { date: '2025-01-29', label: '春節' },
      { date: '2025-01-30', label: '春節' },
      { date: '2025-01-31', label: '春節' },
      { date: '2025-04-03', label: '兒童節連假補假' },
      { date: '2025-04-04', label: '兒童節' },
      { date: '2025-05-30', label: '端午節' },
      { date: '2025-10-06', label: '中秋節' },
    ],
    2026: [
      { date: '2026-02-14', label: '農曆除夕前（彈性放假）' },
      { date: '2026-02-16', label: '農曆除夕' },
      { date: '2026-02-17', label: '春節' },
      { date: '2026-02-18', label: '春節' },
      { date: '2026-02-19', label: '春節' },
      { date: '2026-02-20', label: '春節' },
      { date: '2026-02-27', label: '和平紀念日連假補假' },
      { date: '2026-04-03', label: '兒童節連假' },
      { date: '2026-04-06', label: '清明連假補假' },
      { date: '2026-06-19', label: '端午節' },
      { date: '2026-09-25', label: '中秋節' },
      { date: '2026-10-09', label: '國慶連假補假' },
    ],
  };

  const all = [...candidates, ...(lunarHints[year] || [])];
  return all
    .filter((d) => {
      const dt = new Date(d.date.replace(/-/g, '/') + ' 12:00:00');
      if (Number.isNaN(dt.getTime())) return false;
      const js = dt.getDay();
      return js >= 1 && js <= 5;
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}
