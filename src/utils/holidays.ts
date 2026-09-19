import { NonTeachingDay } from '../types';

const OPEN_DATA_HOLIDAY_CDN =
  'https://cdn.jsdelivr.net/gh/imsyuan/taiwan-holidays/data';

/** 依學年度（民國年）推算涵蓋的西元年：例 115 → 2026、2027 */
export function westernYearsForAcademicYear(rocYear: number): number[] {
  if (!Number.isFinite(rocYear)) return [new Date().getFullYear()];
  return [rocYear + 1911, rocYear + 1912];
}

type OpenDataHolidayRow = {
  date?: string;
  isHoliday?: boolean;
  description?: string;
};

function parseCompactDateToIso(compact: string): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(compact);
  if (!m) return null;
  return formatIsoDate(Number(m[1]), Number(m[2]), Number(m[3]));
}

function isWeekdayIso(isoDate: string): boolean {
  const dt = new Date(isoDate.replace(/-/g, '/') + ' 12:00:00');
  if (Number.isNaN(dt.getTime())) return false;
  const js = dt.getDay();
  return js >= 1 && js <= 5;
}

/** 解析政府開放資料／社群 CDN 的 holidays.json */
export function parseOpenDataHolidays(rows: OpenDataHolidayRow[]): NonTeachingDay[] {
  const out: NonTeachingDay[] = [];
  for (const row of rows) {
    if (!row?.isHoliday || !row.date) continue;
    const iso = parseCompactDateToIso(row.date);
    if (!iso || !isWeekdayIso(iso)) continue;
    out.push({
      date: iso,
      label: (row.description || '放假').trim() || '放假',
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * 自人事行政總處開放資料（經 jsDelivr CDN）取得該年國定假日。
 * 僅回傳週一至週五；失敗時改試內建建議表。
 */
export async function fetchNationalHolidaysFromOpenData(
  year: number
): Promise<NonTeachingDay[]> {
  const url = `${OPEN_DATA_HOLIDAY_CDN}/${year}/holidays.json`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as OpenDataHolidayRow[];
    const parsed = parseOpenDataHolidays(data);
    if (parsed.length > 0) return parsed;
    throw new Error('empty');
  } catch {
    const fallback = suggestNationalHolidays(year);
    if (fallback.length > 0) return fallback;
    throw new Error(`${year} 年尚無公開行事曆資料，請手動新增或稍後再試`);
  }
}

/** 匯入一個學年度涵蓋的兩個西元年國定假日（去重） */
export async function fetchNationalHolidaysForAcademicYear(
  rocYear: number
): Promise<NonTeachingDay[]> {
  const years = westernYearsForAcademicYear(rocYear);
  const chunks = await Promise.all(
    years.map((y) => fetchNationalHolidaysFromOpenData(y).catch(() => [] as NonTeachingDay[]))
  );
  return mergeNonTeachingDays([], chunks.flat());
}

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

/** 合併放假日清單，保留既有日期與說明（僅新增缺少的日期） */
export function mergeNonTeachingDaysPreservingExisting(
  existing: NonTeachingDay[] | undefined,
  incoming: NonTeachingDay[]
): NonTeachingDay[] {
  const map = new Map<string, string>();
  for (const d of existing || []) {
    if (d?.date) map.set(d.date, d.label || '放假');
  }
  for (const d of incoming) {
    if (d?.date && !map.has(d.date)) {
      map.set(d.date, d.label || '放假');
    }
  }
  return Array.from(map.entries())
    .map(([date, label]) => ({ date, label }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function isoDateWesternYear(iso: string): number | null {
  const y = Number(iso.slice(0, 4));
  return Number.isFinite(y) ? y : null;
}

/** 僅保留指定學年度涵蓋的西元年放假日（例：115 → 2026、2027） */
export function pruneNonTeachingDaysToAcademicYear(
  days: NonTeachingDay[] | undefined,
  rocYear: number
): NonTeachingDay[] {
  const allowed = new Set(westernYearsForAcademicYear(rocYear));
  return (days || [])
    .filter((d) => {
      if (!d?.date) return false;
      const y = isoDateWesternYear(d.date);
      return y != null && allowed.has(y);
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** 統計被 prune 移除的筆數 */
export function countNonTeachingDaysOutsideAcademicYear(
  days: NonTeachingDay[] | undefined,
  rocYear: number
): number {
  const allowed = new Set(westernYearsForAcademicYear(rocYear));
  return (days || []).filter((d) => {
    if (!d?.date) return false;
    const y = isoDateWesternYear(d.date);
    return y == null || !allowed.has(y);
  }).length;
}
