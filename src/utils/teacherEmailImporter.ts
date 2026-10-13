import * as XLSX from 'xlsx';
import type { Teacher } from '../types';
import { normalizeSchoolEmail } from './schoolEmail';
import { teacherNameMatches } from './schoolDepartments';

export type TeacherEmailImportParseResult = {
  /** 姓名 → 信箱（已正規化；空白列略過） */
  emailsByName: Record<string, string>;
  /** 檔案內有效列數（有姓名且有信箱） */
  imported: number;
  /** 信箱格式無效而略過的姓名 */
  invalid: string[];
};

export type TeacherEmailApplyResult = {
  teachers: Teacher[];
  /** 成功寫入名冊的筆數 */
  updated: number;
  /** 檔案有、名冊對不到的姓名 */
  unmatched: string[];
  /** 名冊可對到的筆數 */
  matchedInRoster: number;
};

const normalizeHeader = (h: string) => String(h || '').replace(/\s/g, '');

const findColumn = (headers: string[], keys: string[]) => {
  const idx = headers.findIndex((h) => keys.some((k) => normalizeHeader(h).includes(k)));
  return idx >= 0 ? idx : -1;
};

const looksLikeEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

/** 解析 Excel / CSV：必要欄為「姓名」與「信箱／email／電子郵件」 */
export function parseTeacherEmailWorkbook(workbook: XLSX.WorkBook): TeacherEmailImportParseResult {
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1, defval: '' });
  if (rows.length < 2) {
    return { emailsByName: {}, imported: 0, invalid: [] };
  }

  const headers = (rows[0] || []).map((c) => String(c));
  const nameCol = findColumn(headers, ['教師姓名', '姓名', '名字']);
  const emailCol = findColumn(headers, ['電子郵件', '電子信箱', '公務信箱', '信箱', 'email', 'Email', 'E-mail']);
  if (nameCol < 0 || emailCol < 0) {
    throw new Error('找不到必要欄位：請確認檔案含「姓名」與「信箱」（或 email／電子郵件）欄');
  }

  const emailsByName: Record<string, string> = {};
  const invalid: string[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const name = String(row[nameCol] || '').trim();
    const rawEmail = String(row[emailCol] || '').trim();
    if (!name || !rawEmail) continue;
    if (!looksLikeEmail(rawEmail)) {
      invalid.push(name);
      continue;
    }
    const email = normalizeSchoolEmail(rawEmail);
    if (!email) {
      invalid.push(name);
      continue;
    }
    emailsByName[name] = email;
  }

  return {
    emailsByName,
    imported: Object.keys(emailsByName).length,
    invalid,
  };
}

export async function readTeacherEmailFile(file: File): Promise<XLSX.WorkBook> {
  const buffer = await file.arrayBuffer();
  return XLSX.read(buffer, { type: 'array' });
}

/** 依姓名寫入師資名冊信箱（精確相符優先，其次模糊比對老師／教師／導師後綴） */
export function applyTeacherEmails(
  teachers: Teacher[],
  emailsByName: Record<string, string>
): TeacherEmailApplyResult {
  const entries = Object.entries(emailsByName);
  const usedKeys = new Set<string>();
  let updated = 0;

  const next = teachers.map((t) => {
    const exact = entries.find(([name]) => name === t.name.trim());
    const fuzzy =
      exact ||
      entries.find(([name]) => teacherNameMatches(name, t.name) || teacherNameMatches(t.name, name));
    if (!fuzzy) return t;
    const [key, email] = fuzzy;
    usedKeys.add(key);
    if ((t.email || '').trim() === email) return t;
    updated += 1;
    return { ...t, email };
  });

  const unmatched = entries.map(([name]) => name).filter((name) => !usedKeys.has(name));

  return {
    teachers: next,
    updated,
    unmatched,
    matchedInRoster: usedKeys.size,
  };
}

export function downloadTeacherEmailTemplate() {
  const rows = [
    ['姓名', '信箱'],
    ['王小明', 'wang@mail2.ccvs.kh.edu.tw'],
    ['李小華', 'lee@mail2.ccvs.kh.edu.tw'],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 14 }, { wch: 36 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '師資信箱');
  XLSX.writeFile(wb, '師資信箱匯入範本.xlsx');
}

export function exportTeacherEmailsToExcel(
  teachers: Teacher[],
  fileName = '師資信箱對照表.xlsx'
) {
  const rows = [
    ['姓名', '信箱'],
    ...[...teachers]
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'))
      .map((t) => [t.name, t.email || '']),
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 14 }, { wch: 36 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '師資信箱');
  XLSX.writeFile(wb, fileName);
}
