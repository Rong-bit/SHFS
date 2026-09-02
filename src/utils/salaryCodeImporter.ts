import * as XLSX from 'xlsx';
import type { Teacher } from '../types';

export type SalaryCodeImportResult = {
  /** 以教師姓名為 key（課表匯入後仍有效） */
  codesByName: Record<string, string>;
  /** 薪資匯入職稱（姓名 → 職稱） */
  titlesByName: Record<string, string>;
  /** 檔案內有效列數 */
  imported: number;
  /** 檔案內含職稱欄的筆數 */
  titlesImported: number;
  /** 目前師資名冊中可對到的筆數 */
  matchedInRoster: number;
  /** 檔案有、名冊尚無的姓名（仍會保存，待課表匯入後自動對上） */
  unmatched: string[];
};

const normalizeHeader = (h: string) => String(h || '').replace(/\s/g, '');

const findColumn = (headers: string[], keys: string[]) => {
  const idx = headers.findIndex((h) => keys.some((k) => normalizeHeader(h).includes(k)));
  return idx >= 0 ? idx : -1;
};

/** 解析 Excel / CSV：欄位需含「姓名」與「薪資編號」；可選「職稱」 */
export function parseSalaryCodeWorkbook(
  workbook: XLSX.WorkBook,
  teachers: Teacher[] = []
): SalaryCodeImportResult {
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1, defval: '' });
  if (rows.length < 2) {
    return {
      codesByName: {},
      titlesByName: {},
      imported: 0,
      titlesImported: 0,
      matchedInRoster: 0,
      unmatched: [],
    };
  }

  const headers = (rows[0] || []).map((c) => String(c));
  const nameCol = findColumn(headers, ['教師姓名', '姓名', '名字']);
  const codeCol = findColumn(headers, ['薪資編號', '編號', '薪資代號']);
  const titleCol = findColumn(headers, ['職稱', '職務', '職別']);
  if (nameCol < 0 || codeCol < 0) {
    throw new Error('找不到必要欄位：請確認檔案含「姓名」與「薪資編號」欄');
  }

  const rosterNames = new Set(teachers.map((t) => t.name.trim()));
  const codesByName: Record<string, string> = {};
  const titlesByName: Record<string, string> = {};
  const unmatched: string[] = [];
  let titlesImported = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const name = String(row[nameCol] || '').trim();
    const code = String(row[codeCol] || '').trim();
    if (!name || !code) continue;
    codesByName[name] = code;
    if (titleCol >= 0) {
      const title = String(row[titleCol] || '').trim();
      if (title) {
        titlesByName[name] = title;
        titlesImported += 1;
      }
    }
    if (teachers.length > 0 && !rosterNames.has(name)) {
      unmatched.push(name);
    }
  }

  const imported = Object.keys(codesByName).length;
  const matchedInRoster =
    teachers.length === 0
      ? imported
      : Object.keys(codesByName).filter((n) => rosterNames.has(n)).length;

  return { codesByName, titlesByName, imported, titlesImported, matchedInRoster, unmatched };
}

export async function readSalaryCodeFile(file: File): Promise<XLSX.WorkBook> {
  const buffer = await file.arrayBuffer();
  return XLSX.read(buffer, { type: 'array' });
}

export function downloadSalaryCodeTemplate() {
  const rows = [
    ['薪資編號', '姓名', '職稱'],
    ['010120', '王小明', '專任教師'],
    ['X07390', '李小華', '外聘人員'],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 12 }, { wch: 14 }, { wch: 14 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '薪資編號');
  XLSX.writeFile(wb, '薪資編號匯入範本.xlsx');
}

export function exportSalaryCodesToExcel(
  codesByName: Record<string, string>,
  titlesByName: Record<string, string> | undefined = {},
  fileName = '薪資編號對照表.xlsx'
) {
  const names = [
    ...new Set([...Object.keys(codesByName), ...Object.keys(titlesByName || {})]),
  ].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
  const rows = [
    ['薪資編號', '姓名', '職稱'],
    ...names.map((name) => [
      codesByName[name] || '',
      name,
      titlesByName?.[name] || '',
    ]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 12 }, { wch: 14 }, { wch: 14 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '薪資編號');
  XLSX.writeFile(wb, fileName);
}
