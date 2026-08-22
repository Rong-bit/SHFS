import * as XLSX from 'xlsx';
import type { Teacher } from '../types';

export type SalaryCodeImportResult = {
  /** 以教師姓名為 key（課表匯入後仍有效） */
  codesByName: Record<string, string>;
  /** 檔案內有效列數 */
  imported: number;
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

/** 解析 Excel / CSV：欄位需含「教師姓名／姓名」與「薪資編號／編號」 */
export function parseSalaryCodeWorkbook(
  workbook: XLSX.WorkBook,
  teachers: Teacher[] = []
): SalaryCodeImportResult {
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1, defval: '' });
  if (rows.length < 2) {
    return { codesByName: {}, imported: 0, matchedInRoster: 0, unmatched: [] };
  }

  const headers = (rows[0] || []).map((c) => String(c));
  const nameCol = findColumn(headers, ['教師姓名', '姓名', '名字']);
  const codeCol = findColumn(headers, ['薪資編號', '編號', '薪資代號']);
  if (nameCol < 0 || codeCol < 0) {
    throw new Error('找不到必要欄位：請確認檔案含「教師姓名」與「薪資編號」欄');
  }

  const rosterNames = new Set(teachers.map((t) => t.name.trim()));
  const codesByName: Record<string, string> = {};
  const unmatched: string[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const name = String(row[nameCol] || '').trim();
    const code = String(row[codeCol] || '').trim();
    if (!name || !code) continue;
    codesByName[name] = code;
    if (teachers.length > 0 && !rosterNames.has(name)) {
      unmatched.push(name);
    }
  }

  const imported = Object.keys(codesByName).length;
  const matchedInRoster =
    teachers.length === 0
      ? imported
      : Object.keys(codesByName).filter((n) => rosterNames.has(n)).length;

  return { codesByName, imported, matchedInRoster, unmatched };
}

export async function readSalaryCodeFile(file: File): Promise<XLSX.WorkBook> {
  const buffer = await file.arrayBuffer();
  return XLSX.read(buffer, { type: 'array' });
}

export function downloadSalaryCodeTemplate() {
  const rows = [
    ['教師姓名', '薪資編號'],
    ['王小明', '010120'],
    ['李小華', '010290'],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 14 }, { wch: 12 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '薪資編號');
  XLSX.writeFile(wb, '薪資編號匯入範本.xlsx');
}

export function exportSalaryCodesToExcel(
  codesByName: Record<string, string>,
  fileName = '薪資編號對照表.xlsx'
) {
  const rows = [['教師姓名', '薪資編號'], ...Object.entries(codesByName).sort(([a], [b]) => a.localeCompare(b, 'zh-Hant'))];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 14 }, { wch: 12 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '薪資編號');
  XLSX.writeFile(wb, fileName);
}
