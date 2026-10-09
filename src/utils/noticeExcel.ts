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

const NOTICE_HEADERS = ['日期', '星期', '節次', '班級', '科目', '鐘點'] as const;
const COL_WIDTHS = [16, 10, 10, 16, 28, 12];

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

function font(size: number, bold = false): Partial<ExcelJS.Font> {
  return { name: '標楷體', size, bold };
}

function writeNoticeSheet(ws: ExcelJS.Worksheet, doc: NoticeDocument) {
  ws.pageSetup = {
    paperSize: 9,
    orientation: 'portrait',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.6, right: 0.6, top: 0.6, bottom: 0.6, header: 0.2, footer: 0.2 },
  };
  ws.columns = COL_WIDTHS.map((width) => ({ width }));

  const issueDate = formatNoticeIssueRocDate(resolveNoticeIssueDate(doc.liveRequest, doc.printGroup));
  const applicant = (doc.liveRequest.applicantTeacherName || '').trim();

  ws.mergeCells('A1:F1');
  const titleCell = ws.getCell('A1');
  titleCell.value = doc.title;
  titleCell.font = font(18, true);
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  titleCell.border = { bottom: { style: 'thin', color: { argb: 'FF000000' } } };
  ws.getRow(1).height = 28;

  ws.mergeCells('A2:F2');
  const numberCell = ws.getCell('A2');
  numberCell.value = `假單編號：${doc.requestNumberLabel}`;
  numberCell.font = font(12);
  numberCell.alignment = { horizontal: 'right', vertical: 'middle' };
  ws.getRow(2).height = 20;

  ws.mergeCells('A3:F3');
  const addresseeCell = ws.getCell('A3');
  addresseeCell.value = `${doc.addressee}：`;
  addresseeCell.font = font(14);
  addresseeCell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };

  ws.mergeCells('A4:F4');
  const greetingCell = ws.getCell('A4');
  greetingCell.value = `　　${doc.greeting}`;
  greetingCell.font = font(14);
  greetingCell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
  ws.getRow(4).height = 22;

  ws.mergeCells('A5:D5');
  const closingCell = ws.getCell('A5');
  closingCell.value = '並請學生記載於教學日誌內。謝謝。';
  closingCell.font = font(14);
  closingCell.alignment = { horizontal: 'left', vertical: 'middle' };
  ws.mergeCells('E5:F5');
  const officeCell = ws.getCell('E5');
  officeCell.value = '教務處　啟';
  officeCell.font = font(14);
  officeCell.alignment = { horizontal: 'right', vertical: 'middle' };

  const headerRowIndex = 7;
  NOTICE_HEADERS.forEach((label, index) => {
    const cell = ws.getCell(headerRowIndex, index + 1);
    cell.value = label;
    cell.font = font(12, true);
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = thinBorder;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
  });
  ws.getRow(headerRowIndex).height = 22;

  const rows = doc.displayRows.length ? doc.displayRows : [];
  rows.forEach((row, offset) => {
    const values = [
      row.date,
      formatNoticeWeekdayLabel(row.weekday),
      row.period,
      row.className,
      row.subjectName,
      formatNoticeHoursDisplay(row.hours),
    ];
    values.forEach((value, index) => {
      const cell = ws.getCell(headerRowIndex + 1 + offset, index + 1);
      cell.value = value;
      cell.font = font(12);
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = thinBorder;
    });
    ws.getRow(headerRowIndex + 1 + offset).height = 20;
  });

  const afterTable = headerRowIndex + Math.max(rows.length, 1) + 2;
  ws.mergeCells(afterTable, 1, afterTable, 6);
  const dateCell = ws.getCell(afterTable, 1);
  dateCell.value = issueDate;
  dateCell.font = font(14);
  dateCell.alignment = { horizontal: 'right', vertical: 'middle' };

  const signStart = afterTable + 2;
  ws.mergeCells(signStart, 1, signStart, 2);
  ws.mergeCells(signStart, 3, signStart, 4);
  ws.mergeCells(signStart, 5, signStart, 6);
  const sign1 = ['承辦人：', '人事室：', '校長：'];
  sign1.forEach((label, index) => {
    const cell = ws.getCell(signStart, index * 2 + 1);
    cell.value = label;
    cell.font = font(14);
    cell.alignment = { horizontal: 'left', vertical: 'middle' };
  });
  ws.getRow(signStart).height = 22;

  ws.mergeCells(signStart + 1, 1, signStart + 1, 6);
  const chief = ws.getCell(signStart + 1, 1);
  chief.value = '教學組長：';
  chief.font = font(14);
  ws.getRow(signStart + 1).height = 22;

  ws.mergeCells(signStart + 2, 1, signStart + 2, 6);
  const director = ws.getCell(signStart + 2, 1);
  director.value = '教務主任：';
  director.font = font(14);
  ws.getRow(signStart + 2).height = 22;

  ws.headerFooter.oddFooter = applicant ? `&C${applicant}` : '';
}

function uniqueSheetName(raw: string, used: Set<string>): string {
  const cleaned = raw.replace(/[\\/?*[\]:]/g, '_').trim() || '通知單';
  const base = cleaned.slice(0, 31);
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  for (let n = 2; n < 1000; n += 1) {
    const suffix = `_${n}`;
    const next = `${base.slice(0, 31 - suffix.length)}${suffix}`;
    if (!used.has(next)) {
      used.add(next);
      return next;
    }
  }
  const fallback = `通知單_${used.size + 1}`.slice(0, 31);
  used.add(fallback);
  return fallback;
}

function writeIndexSheet(
  ws: ExcelJS.Worksheet,
  schoolName: string,
  docs: NoticeDocument[],
  sheetNames: string[]
) {
  ws.pageSetup = {
    paperSize: 9,
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
  };
  const headers = ['序', '種類', '假單編號', '受文者', '申請教師', '開立日期', '課程列數', '工作表'];
  const widths = [6, 14, 22, 16, 16, 14, 12, 28];
  ws.columns = widths.map((width) => ({ width }));

  ws.mergeCells(1, 1, 1, headers.length);
  const title = ws.getCell(1, 1);
  title.value = `${schoolName || '學校'}　調代課通知單`;
  title.font = { name: '微軟正黑體', size: 16, bold: true };
  title.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 28;

  ws.mergeCells(2, 1, 2, headers.length);
  const note = ws.getCell(2, 1);
  note.value = `共 ${docs.length} 張（已核准之代課、調課、同班對調；僅代導師不列入）。各張內容與列印通知單相同，含人工儲存的課程表格。`;
  note.font = { name: '微軟正黑體', size: 11 };
  note.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
  ws.getRow(2).height = 22;

  headers.forEach((label, index) => {
    const cell = ws.getCell(4, index + 1);
    cell.value = label;
    cell.font = { name: '微軟正黑體', size: 11, bold: true };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = thinBorder;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  });

  docs.forEach((doc, index) => {
    const issueDate = formatNoticeIssueRocDate(resolveNoticeIssueDate(doc.liveRequest, doc.printGroup));
    const values: Array<string | number> = [
      index + 1,
      doc.title,
      doc.requestNumberLabel,
      doc.addressee,
      doc.liveRequest.applicantTeacherName || '',
      issueDate,
      doc.displayRows.length,
      sheetNames[index],
    ];
    values.forEach((value, col) => {
      const cell = ws.getCell(5 + index, col + 1);
      cell.value = value;
      cell.font = { name: '微軟正黑體', size: 11 };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = thinBorder;
    });
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
  if (!doc) return `${school}_調代課通知單.xlsx`;
  const applicant = (doc.liveRequest.applicantTeacherName || '').trim() || '教師';
  const counterpart = (
    doc.liveRequest.requestType === 'swap'
      ? doc.liveRequest.swapTargetTeacherName
      : doc.liveRequest.substituteTeacherName
  )?.trim();
  const number = doc.liveRequest.requestNumber || doc.requestNumberLabel;
  const stem = counterpart
    ? `${applicant}${doc.title}_${number}_${counterpart}`
    : `${applicant}${doc.title}_${number}`;
  return `${stem.replace(/[\\/:*?"<>|]/g, '')}.xlsx`;
}

export async function buildNoticeWorkbook(
  docs: NoticeDocument[],
  schoolName: string,
  options?: { includeIndex?: boolean }
): Promise<ExcelJS.Workbook> {
  const ExcelJS = await loadExcelJS();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = schoolName || '調代課與鐘點費管理系統';
  const includeIndex = options?.includeIndex ?? docs.length > 1;
  const used = new Set<string>(includeIndex ? ['目錄'] : []);
  const sheetNames = docs.map((doc, index) => {
    const kind = doc.title.replace('通知單', '');
    const who = doc.addressee.replace(/老師$/, '');
    return uniqueSheetName(`${index + 1}_${kind}_${doc.requestNumberLabel}_${who}`, used);
  });

  if (includeIndex) {
    const index = workbook.addWorksheet('目錄', {
      views: [{ state: 'frozen', ySplit: 4 }],
    });
    writeIndexSheet(index, schoolName, docs, sheetNames);
  }

  docs.forEach((doc, index) => {
    const ws = workbook.addWorksheet(sheetNames[index]);
    writeNoticeSheet(ws, doc);
  });

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
  await exportNoticeDocumentsToExcel(docs, params.schoolName, fileName, {
    includeIndex: true,
  });
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
    noticeExcelFileName(params.schoolName, doc),
    { includeIndex: false }
  );
}
