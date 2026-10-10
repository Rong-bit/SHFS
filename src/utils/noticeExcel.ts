import type ExcelJS from 'exceljs';
import type { CourseSession, SubstituteRequest } from '../types';
import {
  buildNoticeDocument,
  formatNoticeHoursDisplay,
  formatNoticeIssueRocDate,
  formatNoticeWeekdayLabel,
  listPrintableNoticeAnchors,
  resolveNoticeIssueDate,
  type NoticeDocument,
} from './noticeDocument';

/** 通知單清冊欄位（一列＝一節課程） */
export const NOTICE_ROSTER_HEADERS = [
  '序',
  '種類',
  '假單編號',
  '請假者',
  '代課者',
  '開立日期',
  '請假日期',
  '星期',
  '節次',
  '班級',
  '科目',
  '鐘點',
] as const;

/** Excel 欄寬（字元）；請假日期 13.22 ≈ 93 像素，其餘欄位不變 */
const COL_WIDTHS = [6, 10, 16, 12, 12, 12, 13.22, 8, 8, 14, 22, 10];

/** 同一假單編號同色；相鄰編號深淺交替 */
const ROSTER_FILL_LIGHT = 'FFF8FAFC'; // slate-50
const ROSTER_FILL_DEEP = 'FFE2E8F0'; // slate-200

/** 依假單編號分組，回傳每列底色（ARGB）；同號同色、換號交替 */
export function rosterRowFillByRequestNumber(requestNumbers: string[]): string[] {
  const fills: string[] = [];
  let prev = '';
  let useDeep = false;
  for (const num of requestNumbers) {
    const key = num || '';
    if (key !== prev) {
      if (prev !== '') useDeep = !useDeep;
      prev = key;
    }
    fills.push(useDeep ? ROSTER_FILL_DEEP : ROSTER_FILL_LIGHT);
  }
  return fills;
}

export type NoticeRosterRow = {
  seq: number;
  kind: string;
  requestNumber: string;
  applicant: string;
  substitute: string;
  issueDate: string;
  leaveDate: string;
  weekday: string;
  /** 節次以數字寫入 Excel；無節次時為空字串 */
  period: number | '';
  className: string;
  subjectName: string;
  hours: string;
};

/** 清冊節次：可解析為數字則輸出 number，否則留空 */
export function toNoticeRosterPeriod(period: string | number | undefined | null): number | '' {
  if (period === '' || period === null || period === undefined) return '';
  const n = typeof period === 'number' ? period : Number(String(period).trim());
  return Number.isFinite(n) ? n : '';
}

async function loadExcelJS(): Promise<typeof ExcelJS> {
  const mod = await import('exceljs');
  return (mod as { default?: typeof ExcelJS }).default ?? (mod as typeof ExcelJS);
}

const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FF000000' } },
  left: { style: 'thin', color: { argb: 'FF000000' } },
  bottom: { style: 'thin', color: { argb: 'FF000000' } },
  right: { style: 'thin', color: { argb: 'FF000000' } },
};

function stripTeacherTitle(name?: string): string {
  return (name || '')
    .replace(/\s+/g, '')
    .replace(/(科主任|主任|組長|導師|老師)$/g, '');
}

/** 種類：代課／調課／對調 */
export function noticeKindLabel(doc: NoticeDocument): string {
  const t = doc.liveRequest.requestType;
  if (t === 'substitute') return '代課';
  if (t === 'reschedule') return '調課';
  if (t === 'swap') return '對調';
  return doc.title.replace('通知單', '') || '其他';
}

/** 代課者：代課＝代理人；對調＝對調對象；調課＝申請人（自行移課） */
export function noticeCounterpartName(doc: NoticeDocument): string {
  const r = doc.liveRequest;
  if (r.requestType === 'substitute') return stripTeacherTitle(r.substituteTeacherName);
  if (r.requestType === 'swap') return stripTeacherTitle(r.swapTargetTeacherName);
  if (r.requestType === 'reschedule') return stripTeacherTitle(r.applicantTeacherName);
  return stripTeacherTitle(doc.addressee);
}

/** 將通知單展開為清冊列（一節一列） */
export function buildNoticeRosterRows(docs: NoticeDocument[]): NoticeRosterRow[] {
  const rows: NoticeRosterRow[] = [];
  let seq = 0;
  for (const doc of docs) {
    const kind = noticeKindLabel(doc);
    const requestNumber = doc.requestNumberLabel;
    const applicant = stripTeacherTitle(doc.liveRequest.applicantTeacherName);
    const substitute = noticeCounterpartName(doc);
    const issueDate = formatNoticeIssueRocDate(
      resolveNoticeIssueDate(doc.liveRequest, doc.printGroup)
    );
    const courseRows = doc.displayRows.length ? doc.displayRows : [];
    if (courseRows.length === 0) {
      seq += 1;
      rows.push({
        seq,
        kind,
        requestNumber,
        applicant,
        substitute,
        issueDate,
        leaveDate: '',
        weekday: '',
        period: '' as const,
        className: '',
        subjectName: '',
        hours: '',
      });
      continue;
    }
    for (const row of courseRows) {
      seq += 1;
      rows.push({
        seq,
        kind,
        requestNumber,
        applicant,
        substitute,
        issueDate,
        leaveDate: row.date,
        weekday: formatNoticeWeekdayLabel(row.weekday),
        period: toNoticeRosterPeriod(row.period),
        className: row.className,
        subjectName: row.subjectName,
        hours: formatNoticeHoursDisplay(row.hours),
      });
    }
  }
  return rows;
}

function writeRosterSheet(
  ws: ExcelJS.Worksheet,
  schoolName: string,
  docs: NoticeDocument[],
  rosterRows: NoticeRosterRow[]
) {
  ws.pageSetup = {
    paperSize: 9,
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
  };
  ws.columns = COL_WIDTHS.map((width) => ({ width }));

  const colCount = NOTICE_ROSTER_HEADERS.length;
  ws.mergeCells(1, 1, 1, colCount);
  const title = ws.getCell(1, 1);
  title.value = `${schoolName || '學校'}　調代課通知單清冊`;
  title.font = { name: '微軟正黑體', size: 16, bold: true };
  title.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 28;

  ws.mergeCells(2, 1, 2, colCount);
  const note = ws.getCell(2, 1);
  note.value = `共 ${docs.length} 張通知單、${rosterRows.length} 列課程（已核准之代課、調課、同班對調；僅代導師不列入）。一列一節；課程內容含人工儲存的通知單表格。`;
  note.font = { name: '微軟正黑體', size: 11 };
  note.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
  ws.getRow(2).height = 22;

  NOTICE_ROSTER_HEADERS.forEach((label, index) => {
    const cell = ws.getCell(4, index + 1);
    cell.value = label;
    cell.font = { name: '微軟正黑體', size: 11, bold: true };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = thinBorder;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  });
  ws.getRow(4).height = 22;

  const rowFills = rosterRowFillByRequestNumber(rosterRows.map((r) => r.requestNumber));
  rosterRows.forEach((row, index) => {
    const values: Array<string | number> = [
      row.seq,
      row.kind,
      row.requestNumber,
      row.applicant,
      row.substitute,
      row.issueDate,
      row.leaveDate,
      row.weekday,
      row.period,
      row.className,
      row.subjectName,
      row.hours,
    ];
    const fillArgb = rowFills[index];
    values.forEach((value, col) => {
      const cell = ws.getCell(5 + index, col + 1);
      cell.value = value;
      cell.font = { name: '微軟正黑體', size: 11 };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = thinBorder;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillArgb } };
    });
    ws.getRow(5 + index).height = 20;
  });
}

async function downloadWorkbook(workbook: ExcelJS.Workbook, fileName: string) {
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

export function noticeExcelFileName(schoolName: string, doc?: NoticeDocument): string {
  const school = (schoolName || '學校').replace(/[\\/:*?"<>|]/g, '');
  if (!doc) return `${school}_調代課通知單清冊.xlsx`;
  const applicant = stripTeacherTitle(doc.liveRequest.applicantTeacherName) || '教師';
  const counterpart = noticeCounterpartName(doc);
  const number = doc.liveRequest.requestNumber || doc.requestNumberLabel;
  const kind = noticeKindLabel(doc);
  const stem = counterpart
    ? `${applicant}${kind}清冊_${number}_${counterpart}`
    : `${applicant}${kind}清冊_${number}`;
  return `${stem.replace(/[\\/:*?"<>|]/g, '')}.xlsx`;
}

/** 匯出通知單清冊（單一工作表，不含逐張通知單） */
export async function buildNoticeWorkbook(
  docs: NoticeDocument[],
  schoolName: string,
  _options?: { includeIndex?: boolean }
): Promise<ExcelJS.Workbook> {
  const ExcelJS = await loadExcelJS();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = schoolName || '調代課、鐘點費與巡堂管理系統';
  const rosterRows = buildNoticeRosterRows(docs);
  const ws = workbook.addWorksheet('通知單清冊', {
    views: [{ state: 'frozen', ySplit: 4 }],
  });
  writeRosterSheet(ws, schoolName, docs, rosterRows);
  return workbook;
}

export async function exportNoticeDocumentsToExcel(
  docs: NoticeDocument[],
  schoolName: string,
  fileName: string,
  options?: { includeIndex?: boolean }
): Promise<void> {
  if (docs.length === 0) return;
  const workbook = await buildNoticeWorkbook(docs, schoolName, options);
  await downloadWorkbook(workbook, fileName);
}

export async function exportNoticesToExcel(params: {
  requests: SubstituteRequest[];
  sessions: CourseSession[];
  schoolName: string;
  /** 只匯出與此範圍有關的通知單；省略則匯出全部可列印通知單 */
  scope?: SubstituteRequest[];
  fileName?: string;
}): Promise<number> {
  const anchors = listPrintableNoticeAnchors(params.requests, params.scope);
  const docs = anchors.map((anchor) =>
    buildNoticeDocument(anchor, params.requests, params.sessions)
  );
  if (docs.length === 0) return 0;
  const fileName = params.fileName || noticeExcelFileName(params.schoolName);
  await exportNoticeDocumentsToExcel(docs, params.schoolName, fileName);
  return docs.length;
}

export async function exportSingleNoticeToExcel(params: {
  request: SubstituteRequest;
  requests: SubstituteRequest[];
  sessions: CourseSession[];
  schoolName: string;
}): Promise<void> {
  const doc = buildNoticeDocument(params.request, params.requests, params.sessions);
  await exportNoticeDocumentsToExcel(
    [doc],
    params.schoolName,
    noticeExcelFileName(params.schoolName, doc)
  );
}
