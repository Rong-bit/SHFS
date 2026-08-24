import type ExcelJS from 'exceljs';
import type { CounselingPayrollPage } from './counselingPayrollRegister';
import type { OverloadPayrollPage } from './overloadPayrollRegister';
import { isBlankPayrollRow } from './overloadPayrollRegister';
import type { SubstitutePayrollPage } from './substitutePayrollRegister';
import type { ActingHomeroomPayrollPage } from './actingHomeroomPayrollRegister';

type CellValue = string | number;

async function loadExcelJS(): Promise<typeof ExcelJS> {
  const mod = await import('exceljs');
  return (mod as { default?: typeof ExcelJS }).default ?? (mod as typeof ExcelJS);
}

const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FF334155' } },
  left: { style: 'thin', color: { argb: 'FF334155' } },
  bottom: { style: 'thin', color: { argb: 'FF334155' } },
  right: { style: 'thin', color: { argb: 'FF334155' } },
};

const centerAlign: Partial<ExcelJS.Alignment> = {
  horizontal: 'center',
  vertical: 'middle',
  wrapText: true,
};

function styleTitleCell(cell: ExcelJS.Cell) {
  cell.font = { bold: true, size: 14, name: '微軟正黑體' };
  cell.alignment = { ...centerAlign };
}

function styleHeaderCell(cell: ExcelJS.Cell) {
  cell.font = { bold: true, size: 11, name: '微軟正黑體' };
  cell.alignment = { ...centerAlign };
  cell.border = thinBorder;
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF1F5F9' },
  };
}

function styleDataCell(cell: ExcelJS.Cell, opts?: { bold?: boolean; align?: 'left' | 'center' | 'right'; numFmt?: string }) {
  cell.font = { bold: Boolean(opts?.bold), size: 11, name: '微軟正黑體' };
  cell.alignment = {
    horizontal: opts?.align || 'center',
    vertical: 'middle',
    wrapText: true,
  };
  cell.border = thinBorder;
  if (opts?.numFmt) cell.numFmt = opts.numFmt;
}

function styleTotalCell(cell: ExcelJS.Cell) {
  cell.font = { bold: true, size: 11, name: '微軟正黑體' };
  cell.alignment = { ...centerAlign };
  cell.border = thinBorder;
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE2E8F0' },
  };
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

function setupSheet(ws: ExcelJS.Worksheet, colCount: number, colWidths: number[]) {
  ws.pageSetup = {
    paperSize: 9, // A4
    orientation: 'portrait',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalCentered: true,
    showGridLines: false,
    margins: {
      left: 0.2,
      right: 0.2,
      top: 0.25,
      bottom: 0.25,
      header: 0.1,
      footer: 0.1,
    },
  };
  ws.views = [{ state: 'normal', showGridLines: false, style: 'pageBreakPreview' }];
  colWidths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });
  for (let c = 1; c <= colCount; c++) {
    if (!ws.getColumn(c).width) ws.getColumn(c).width = 12;
  }
}

/** 在指定列之後插入列印換頁（對齊畫面／瀏覽器列印：小計後換頁） */
function addPageBreakAfterRow(ws: ExcelJS.Worksheet, rowNumber: number) {
  ws.getRow(rowNumber).addPageBreak();
}

function addTitleRow(ws: ExcelJS.Worksheet, title: string, colCount: number): number {
  const row = ws.addRow([title]);
  const r = row.number;
  ws.mergeCells(r, 1, r, colCount);
  styleTitleCell(ws.getCell(r, 1));
  row.height = 28;
  return r;
}

function addHeaderRow(ws: ExcelJS.Worksheet, headers: string[]): number {
  const row = ws.addRow(headers);
  row.eachCell((cell) => styleHeaderCell(cell));
  row.height = 32;
  return row.number;
}

function addDataRow(
  ws: ExcelJS.Worksheet,
  values: CellValue[],
  opts?: { blank?: boolean; amountCol?: number }
) {
  const row = ws.addRow(values);
  row.height = opts?.blank ? 12 : 14;
  row.eachCell((cell, colNumber) => {
    const isAmount = opts?.amountCol === colNumber && typeof cell.value === 'number';
    styleDataCell(cell, {
      align: 'center',
      numFmt: isAmount ? '#,##0' : undefined,
    });
    if (isAmount) {
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: false };
    }
  });
  return row.number;
}

function addTotalRow(ws: ExcelJS.Worksheet, values: CellValue[], mergeLabelCols = 2, amountCol?: number) {
  const row = ws.addRow(values);
  const r = row.number;
  row.height = 16;
  if (mergeLabelCols > 1) {
    ws.mergeCells(r, 1, r, mergeLabelCols);
  }
  for (let c = 1; c <= values.length; c++) {
    const cell = ws.getCell(r, c);
    styleTotalCell(cell);
    if (amountCol === c && typeof cell.value === 'number') {
      cell.numFmt = '#,##0';
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: false };
    }
  }
  return r;
}

/** 欄號（1-based）→ Excel 欄位字母 */
function colLetters(col: number): string {
  let n = col;
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function sheetColWidths(ws: ExcelJS.Worksheet, colCount: number): number[] {
  const n = Math.max(colCount, 1);
  return Array.from({ length: n }, (_, i) => {
    const w = Number(ws.getColumn(i + 1).width);
    return Number.isFinite(w) && w > 0 ? w : 10;
  });
}

function excelTextWidth(text: string): number {
  let w = 0;
  for (const ch of text) {
    w += (ch.codePointAt(0) || 0) > 0xff ? 2 : 1;
  }
  return w;
}

/**
 * 對齊瀏覽器列印簽核：四職稱中心約在 12.5%／37.5%／62.5%／87.5%。
 * 不依資料欄寬切分（6 欄備註過寬時會計室／校長會偏左）。
 * 全形空白撐位；略放大單位以補償 Excel 欄寬≠字寬造成的左擠。
 */
function buildPrintEqualLabels(labels: string[], totalColWidth: number): string {
  const raw = Math.max(64, Math.round(totalColWidth * 1.22));
  const lineUnits = raw % 2 === 0 ? raw : raw + 1;

  type Place = { start: number; text: string; tw: number };
  const paints: Place[] = [];
  labels.forEach((label, i) => {
    if (!label) return;
    const tw = excelTextWidth(label);
    const center = ((i + 0.5) / 4) * lineUnits;
    let start = Math.round(center - tw / 2);
    if (start % 2 === 1) start -= 1;
    start = Math.max(0, Math.min(start, Math.max(0, lineUnits - tw)));
    if (start % 2 === 1) start += 1;
    paints.push({ start, text: label, tw });
  });
  paints.sort((a, b) => a.start - b.start);
  for (let i = 1; i < paints.length; i++) {
    const minStart = paints[i - 1].start + paints[i - 1].tw + 2;
    if (paints[i].start < minStart) {
      let s = minStart;
      if (s % 2 === 1) s += 1;
      paints[i].start = Math.min(s, Math.max(0, lineUnits - paints[i].tw));
    }
  }

  let out = '';
  let u = 0;
  for (const p of paints) {
    while (u < p.start) {
      out += '　';
      u += 2;
    }
    out += p.text;
    u = p.start + p.tw;
  }
  while (u < lineUnits) {
    out += '　';
    u += 2;
  }
  // 降低 Excel／PDF 裁掉尾隨空白導致整列左移
  return `${out}\u200B`;
}

function addMergedLabelRow(
  ws: ExcelJS.Worksheet,
  colCount: number,
  value: string,
  height: number
) {
  const row = ws.addRow(Array(colCount).fill(null));
  row.height = height;
  ws.mergeCells(`${colLetters(1)}${row.number}:${colLetters(colCount)}${row.number}`);
  const cell = ws.getCell(row.number, 1);
  cell.value = value;
  cell.font = { size: 9, name: '微軟正黑體', color: { argb: 'FF334155' } };
  cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: false };
  return row;
}

/**
 * 末頁簽核：對齊列印 PDF 四等分位置；不畫底線。
 * 教務主任對齊教學組長（左四分位）。
 */
function addSignatureBlock(ws: ExcelJS.Worksheet, colCount: number) {
  const n = Math.max(colCount, 4);
  const widths = sheetColWidths(ws, n);
  const totalW = widths.reduce((a, b) => a + b, 0);
  const labels = ['教學組長', '出納組', '會計室', '校長'];

  const spacer = ws.addRow(Array(n).fill(null));
  spacer.height = 28;

  addMergedLabelRow(ws, n, buildPrintEqualLabels(labels, totalW), 16);

  // 教務主任上方列高 1cm
  const mid = ws.addRow(Array(n).fill(null));
  mid.height = 28.35;

  addMergedLabelRow(ws, n, buildPrintEqualLabels(['教務主任'], totalW), 16);
}

export async function exportOverloadPayrollExcel(
  title: string,
  monthRangeLabel: string,
  weekRound: number,
  pages: OverloadPayrollPage[],
  grandTotal: OverloadPayrollPage['subtotal'],
  fileName: string
) {
  const ExcelJS = await loadExcelJS();
  const headers = [
    '薪資編號',
    '教師姓名',
    '每週兼課',
    `(${weekRound}週)兼課小計`,
    '應加兼課',
    '應減兼課',
    '實得兼課',
    '實發金額',
    `備註 ${monthRangeLabel}`,
  ];
  const colCount = headers.length;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('兼課印領清冊');
  setupSheet(ws, colCount, [10, 10, 6.5, 8.6, 6.5, 6.5, 6.5, 12, 35]);

  const totalPages = pages.length;
  pages.forEach((page, idx) => {
    addTitleRow(ws, title, colCount);
    addHeaderRow(ws, headers);
    page.rows.forEach((r) => {
      if (isBlankPayrollRow(r.teacherId)) {
        addDataRow(ws, Array(colCount).fill(''), { blank: true });
        return;
      }
      addDataRow(
        ws,
        [
          r.salaryCode || '—',
          r.teacherName,
          r.weeklyConcurrent || '',
          r.baseMonthlyConcurrent,
          r.addConcurrent || '',
          r.subtractConcurrent || '',
          r.actualConcurrent,
          r.amount,
          r.remarks,
        ],
        { amountCol: 8 }
      );
    });
    const st = page.subtotal;
    const subtotalRow = addTotalRow(
      ws,
      [
        '小計',
        '',
        st.weeklyConcurrent,
        st.baseMonthlyConcurrent,
        st.addConcurrent || '',
        st.subtractConcurrent || '',
        st.actualConcurrent,
        st.amount,
        `${page.pageIndex} of ${totalPages}`,
      ],
      2,
      8
    );
    if (idx === pages.length - 1) {
      addTotalRow(
        ws,
        [
          '合計',
          '',
          grandTotal.weeklyConcurrent,
          grandTotal.baseMonthlyConcurrent,
          grandTotal.addConcurrent || '',
          grandTotal.subtractConcurrent || '',
          grandTotal.actualConcurrent,
          grandTotal.amount,
          '',
        ],
        2,
        8
      );
      addSignatureBlock(ws, colCount);
    } else {
      addPageBreakAfterRow(ws, subtotalRow);
    }
  });

  await downloadWorkbook(wb, fileName);
}

export async function exportSubstitutePayrollExcel(
  title: string,
  monthRangeLabel: string,
  pages: SubstitutePayrollPage[],
  grandTotal: SubstitutePayrollPage['subtotal'],
  grandTotalRateLabel: string,
  fileName: string
) {
  const ExcelJS = await loadExcelJS();
  const headers = ['薪資編號', '教師姓名', '代課節數', '每節金額', '實發金額', `備註 ${monthRangeLabel}`];
  const colCount = headers.length;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('代課印領清冊');
  setupSheet(ws, colCount, [12, 12, 10, 10, 12, 58]);

  const totalPages = pages.length;
  pages.forEach((page, idx) => {
    addTitleRow(ws, title, colCount);
    addHeaderRow(ws, headers);
    page.rows.forEach((r) => {
      if (isBlankPayrollRow(r.teacherId)) {
        addDataRow(ws, Array(colCount).fill(''), { blank: true });
        return;
      }
      addDataRow(
        ws,
        [r.salaryCode || '—', r.teacherName, r.substitutePeriods, r.ratePerPeriod, r.amount, r.remarks],
        { amountCol: 5 }
      );
    });
    const subtotalRow = addTotalRow(
      ws,
      [
        '小計',
        '',
        page.subtotal.substitutePeriods,
        page.subtotalRateLabel || '',
        page.subtotal.amount,
        `${page.pageIndex} of ${totalPages}`,
      ],
      2,
      5
    );
    if (idx === pages.length - 1) {
      addTotalRow(
        ws,
        ['合計', '', grandTotal.substitutePeriods, grandTotalRateLabel || '', grandTotal.amount, ''],
        2,
        5
      );
      addSignatureBlock(ws, colCount);
    } else {
      addPageBreakAfterRow(ws, subtotalRow);
    }
  });

  await downloadWorkbook(wb, fileName);
}

export async function exportCounselingPayrollExcel(
  title: string,
  monthRangeLabel: string,
  weekRound: number,
  pages: CounselingPayrollPage[],
  grandTotal: CounselingPayrollPage['subtotal'],
  grandTotalRateLabel: string,
  fileName: string
) {
  const ExcelJS = await loadExcelJS();
  const headers = [
    '薪資編號',
    '教師姓名',
    '每週上課時數',
    `(${weekRound}週)上課小計`,
    '增加節數',
    '減少節數',
    '實上節數',
    '每節金額',
    '實發金額',
    `備註 ${monthRangeLabel}`,
  ];
  const colCount = headers.length;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('課輔印領清冊');
  setupSheet(ws, colCount, [12, 12, 12, 12, 10, 10, 10, 10, 12, 52]);

  const totalPages = pages.length;
  pages.forEach((page, idx) => {
    addTitleRow(ws, title, colCount);
    addHeaderRow(ws, headers);
    page.rows.forEach((r) => {
      if (isBlankPayrollRow(r.teacherId)) {
        addDataRow(ws, Array(colCount).fill(''), { blank: true });
        return;
      }
      addDataRow(
        ws,
        [
          r.salaryCode || '—',
          r.teacherName,
          r.weeklyHours || '',
          r.baseMonthlyHours,
          r.addPeriods || '',
          r.subtractPeriods || '',
          r.actualPeriods,
          r.ratePerPeriod,
          r.amount,
          r.remarks,
        ],
        { amountCol: 9 }
      );
    });
    const subtotalRow = addTotalRow(
      ws,
      [
        '小計',
        '',
        page.subtotal.weeklyHours,
        page.subtotal.baseMonthlyHours,
        page.subtotal.addPeriods || '',
        page.subtotal.subtractPeriods || '',
        page.subtotal.actualPeriods,
        page.subtotalRateLabel || '',
        page.subtotal.amount,
        `${page.pageIndex} of ${totalPages}`,
      ],
      2,
      9
    );
    if (idx === pages.length - 1) {
      addTotalRow(
        ws,
        [
          '合計',
          '',
          grandTotal.weeklyHours,
          grandTotal.baseMonthlyHours,
          grandTotal.addPeriods || '',
          grandTotal.subtractPeriods || '',
          grandTotal.actualPeriods,
          grandTotalRateLabel || '',
          grandTotal.amount,
          '',
        ],
        2,
        9
      );
      addSignatureBlock(ws, colCount);
    } else {
      addPageBreakAfterRow(ws, subtotalRow);
    }
  });

  await downloadWorkbook(wb, fileName);
}

export async function exportActingHomeroomPayrollExcel(
  title: string,
  monthRangeLabel: string,
  pages: ActingHomeroomPayrollPage[],
  grandTotal: ActingHomeroomPayrollPage['subtotal'],
  grandTotalRateLabel: string,
  fileName: string
) {
  const ExcelJS = await loadExcelJS();
  const headers = [
    '薪資編號',
    '教師姓名',
    '代課天數',
    '每天金額',
    '實發金額',
    `備註 ${monthRangeLabel}`,
  ];
  const colCount = headers.length;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('代導師印領清冊');
  setupSheet(ws, colCount, [12, 12, 10, 10, 12, 58]);

  const totalPages = pages.length;
  pages.forEach((page, idx) => {
    addTitleRow(ws, title, colCount);
    addHeaderRow(ws, headers);
    page.rows.forEach((r) => {
      if (isBlankPayrollRow(r.teacherId)) {
        addDataRow(ws, Array(colCount).fill(''), { blank: true });
        return;
      }
      addDataRow(
        ws,
        [r.salaryCode || '—', r.teacherName, r.actingDays, r.dailyRate, r.amount, r.remarks],
        { amountCol: 5 }
      );
    });
    const subtotalRow = addTotalRow(
      ws,
      [
        '小計',
        '',
        page.subtotal.actingDays,
        page.subtotalRateLabel || '',
        page.subtotal.amount,
        `${page.pageIndex} of ${totalPages}`,
      ],
      2,
      5
    );
    if (idx === pages.length - 1) {
      addTotalRow(
        ws,
        ['合計', '', grandTotal.actingDays, grandTotalRateLabel || '', grandTotal.amount, ''],
        2,
        5
      );
      addSignatureBlock(ws, colCount);
    } else {
      addPageBreakAfterRow(ws, subtotalRow);
    }
  });

  await downloadWorkbook(wb, fileName);
}
