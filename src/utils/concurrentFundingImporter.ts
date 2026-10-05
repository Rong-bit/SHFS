import * as XLSX from 'xlsx';
import { sanitizeConcurrentFunding, type ConcurrentFundingConfig } from './concurrentFunding';

/** 課表算出的每週節數（姓名 → 兼課／課輔），用於比對匯入檔 */
export type ScheduleWeeklyByName = Record<string, { concurrent: number; counseling: number }>;

export const DEFAULT_CONCURRENT_FUND_COLUMNS = [
  '本土語',
  '課諮師',
  '特教',
  '高三多元',
  '全英',
  '半導體',
  '大高雄',
];

export type ConcurrentFundingImportResult = Required<ConcurrentFundingConfig> & {
  /** 檔案內有效列數（有姓名者） */
  imported: number;
  /** 至少一個外部經費 > 0 的教師數 */
  fundedTeachers: number;
  matchedInRoster: number;
  unmatched: string[];
  warnings: string[];
};

const normalizeHeader = (h: unknown) => String(h ?? '').replace(/\s/g, '');

const NAME_KEYS = ['教師姓名', '姓名', '名字'];
const CONCURRENT_KEYS = ['兼課'];
const COUNSELING_KEYS = ['輔導課', '課輔', '輔導'];
const IGNORED_KEYS = [
  '薪資編號',
  '薪資代號',
  '職稱',
  '職務',
  '職別',
  '科別',
  '備註',
  '序號',
  '編號',
];
/** 只在欄名完全相同時略過，避免誤刪「學校特色課程」這類經費欄 */
const IGNORED_EXACT = ['合計', '總計', '小計', '學校', '學校經費'];
/** 表頭可能不在第一列（上方有標題列），往下找含「姓名」的列 */
const HEADER_SEARCH_ROWS = 10;

const matches = (header: string, keys: string[]) => keys.some((k) => header.includes(k));

const toNumber = (v: unknown): number | null => {
  if (v === '' || v === null || v === undefined) return null;
  const text = String(v)
    .trim()
    .replace(/[０-９．]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
};

/**
 * 解析兼課經費來源檔：需含「姓名」；「兼課時數」「輔導課時數」僅供比對；
 * 其餘欄位（本土語、全英…）皆視為外部經費，欄名即經費名稱，值為每週節數。
 */
export function parseConcurrentFundingWorkbook(
  workbook: XLSX.WorkBook,
  scheduleWeekly: ScheduleWeeklyByName = {}
): ConcurrentFundingImportResult {
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
  const headerRow = rows
    .slice(0, HEADER_SEARCH_ROWS)
    .findIndex((row) => (row || []).some((c) => matches(normalizeHeader(c), NAME_KEYS)));
  if (headerRow < 0) throw new Error('找不到必要欄位：請確認檔案含「姓名」欄');
  if (rows.length <= headerRow + 1) {
    throw new Error('檔案沒有資料列：表頭下方需有教師資料');
  }

  const headers = (rows[headerRow] || []).map(normalizeHeader);
  const nameCol = headers.findIndex((h) => matches(h, NAME_KEYS));
  const concurrentCol = headers.findIndex((h, i) => i !== nameCol && matches(h, CONCURRENT_KEYS));
  const counselingCol = headers.findIndex(
    (h, i) => i !== nameCol && i !== concurrentCol && matches(h, COUNSELING_KEYS)
  );
  const fundCols = headers
    .map((h, i) => ({ name: h, index: i }))
    .filter(
      ({ name, index }) =>
        name &&
        index !== nameCol &&
        index !== concurrentCol &&
        index !== counselingCol &&
        !matches(name, IGNORED_KEYS) &&
        !IGNORED_EXACT.includes(name)
    );
  if (fundCols.length === 0) {
    throw new Error('找不到經費欄位：請在姓名、兼課時數、輔導課時數之後加上經費欄（如全英、本土語）');
  }
  const duplicateFunds = fundCols
    .map((c) => c.name)
    .filter((name, i, all) => all.indexOf(name) !== i);
  if (duplicateFunds.length > 0) {
    throw new Error(`經費欄位名稱重複：${[...new Set(duplicateFunds)].join('、')}，請合併或改名後再匯入`);
  }

  const byName: Record<string, Record<string, number>> = {};
  const seen = new Set<string>();
  const warnings: string[] = [];
  const unmatched: string[] = [];
  const hasRoster = Object.keys(scheduleWeekly).length > 0;

  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    const name = String(row[nameCol] ?? '').trim();
    if (!name || /^(合計|總計|小計)$/.test(name.replace(/\s/g, ''))) continue;
    if (seen.has(name)) warnings.push(`${name}：檔案中重複出現，以最後一列為準`);
    seen.add(name);

    const funds: Record<string, number> = {};
    for (const col of fundCols) {
      const raw = row[col.index];
      const n = toNumber(raw);
      if (n === null) {
        if (String(raw ?? '').trim()) warnings.push(`${name}：「${col.name}」不是數字，已略過`);
        continue;
      }
      if (n < 0) {
        warnings.push(`${name}：「${col.name}」為負數，已略過`);
        continue;
      }
      if (n > 0) funds[col.name] = n;
    }
    if (Object.keys(funds).length > 0) byName[name] = funds;
    else delete byName[name];

    const fundTotal = Object.values(funds).reduce((s, n) => s + n, 0);
    const fileConcurrent = concurrentCol >= 0 ? toNumber(row[concurrentCol]) : null;
    const fileCounseling = counselingCol >= 0 ? toNumber(row[counselingCol]) : null;
    if (fileConcurrent !== null && fundTotal > fileConcurrent) {
      warnings.push(`${name}：外部經費合計 ${fundTotal} 節，超過檔案兼課時數 ${fileConcurrent} 節`);
    }

    const schedule = scheduleWeekly[name];
    if (!schedule) {
      if (hasRoster) unmatched.push(name);
      continue;
    }
    if (fileConcurrent !== null && fileConcurrent !== schedule.concurrent) {
      warnings.push(
        `${name}：檔案兼課時數 ${fileConcurrent} 節，課表標示兼課 ${schedule.concurrent} 節（以課表為準）`
      );
    }
    if (fileCounseling !== null && fileCounseling !== schedule.counseling) {
      warnings.push(
        `${name}：檔案輔導課時數 ${fileCounseling} 節，課表課輔 ${schedule.counseling} 節（以課表為準）`
      );
    }
    if (fundTotal > schedule.concurrent) {
      warnings.push(
        `${name}：外部經費合計 ${fundTotal} 節，超過課表兼課 ${schedule.concurrent} 節，月結時會壓低外部經費`
      );
    }
  }

  const clean = sanitizeConcurrentFunding({
    concurrentFundingSources: fundCols.map((c) => c.name),
    concurrentFundingByName: byName,
  });
  const fundedNames = Object.keys(clean.concurrentFundingByName);

  return {
    ...clean,
    imported: seen.size,
    fundedTeachers: fundedNames.length,
    matchedInRoster: hasRoster
      ? [...seen].filter((n) => scheduleWeekly[n]).length
      : seen.size,
    unmatched,
    warnings,
  };
}

export async function readConcurrentFundingFile(file: File): Promise<XLSX.WorkBook> {
  const buffer = await file.arrayBuffer();
  return XLSX.read(buffer, { type: 'array' });
}

const writeSheet = (rows: (string | number)[][], fileName: string) => {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = rows[0].map((_, i) => ({ wch: i === 0 ? 12 : 10 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '兼課經費來源');
  XLSX.writeFile(wb, fileName);
};

export function downloadConcurrentFundingTemplate() {
  const header = ['姓名', '兼課時數', '輔導課時數', ...DEFAULT_CONCURRENT_FUND_COLUMNS];
  const example = ['王小明', 11, 2, ...DEFAULT_CONCURRENT_FUND_COLUMNS.map((f) => (f === '全英' ? 4 : ''))];
  writeSheet([header, example], '兼課經費來源匯入範本.xlsx');
}

/** 匯出目前設定；兼課／輔導課時數取自課表，可直接修改後重新匯入 */
export function exportConcurrentFundingToExcel(
  config: ConcurrentFundingConfig,
  scheduleWeekly: ScheduleWeeklyByName,
  fileName = '兼課經費來源.xlsx'
) {
  const { concurrentFundingSources, concurrentFundingByName } = sanitizeConcurrentFunding(config);
  const sources = concurrentFundingSources.length
    ? concurrentFundingSources
    : DEFAULT_CONCURRENT_FUND_COLUMNS;
  const names = [
    ...new Set([
      ...Object.keys(concurrentFundingByName),
      ...Object.entries(scheduleWeekly)
        .filter(([, w]) => w.concurrent > 0)
        .map(([n]) => n),
    ]),
  ].sort((a, b) => a.localeCompare(b, 'zh-Hant'));

  const rows: (string | number)[][] = [
    ['姓名', '兼課時數', '輔導課時數', ...sources],
    ...names.map((name) => [
      name,
      scheduleWeekly[name]?.concurrent ?? '',
      scheduleWeekly[name]?.counseling ?? '',
      ...sources.map((s) => concurrentFundingByName[name]?.[s] ?? ''),
    ]),
  ];
  writeSheet(rows, fileName);
}
