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
 * 列印版簽核：四等分欄位合併 + 底框（真線段、段間空欄），避免字元底線被字型縮短左擠。
 * 欄數 < 7 時無法留 3 個空隙，改以全形「＿」字元並加大密度以撐滿表寬。
 */
function signatureQuarterRanges(colCount: number): Array<{ start: number; end: number }> | null {
  const n = Math.max(colCount, 1);
  // 6 欄：盡量空出 2 個空隙（末兩段會相鄰，仍優於全連線）
  if (n === 6) {
    return [
      { start: 1, end: 1 },
      { start: 3, end: 3 },
      { start: 5, end: 5 },
      { start: 6, end: 6 },
    ];
  }
  if (n < 7) return null; // 4 段 + 3 空欄
  const usable = n - 3;
  const base = Math.floor(usable / 4);
  let rem = usable % 4;
  const sizes = Array.from({ length: 4 }, () => {
    const s = base + (rem > 0 ? 1 : 0);
    if (rem > 0) rem -= 1;
    return Math.max(1, s);
  });
  const ranges: Array<{ start: number; end: number }> = [];
  let c = 1;
  for (let i = 0; i < 4; i++) {
    const startCol = c;
    const endCol = c + sizes[i] - 1;
    if (endCol > n) return null;
    ranges.push({ start: startCol, end: endCol });
    c = endCol + 2; // 跳過 1 欄空隙
  }
  ranges[3].end = n;
  for (let i = 1; i < 4; i++) {
    if (ranges[i].start <= ranges[i - 1].end + 1) {
      ranges[i].start = ranges[i - 1].end + 2;
      if (ranges[i].start > ranges[i].end) return null;
    }
  }
  return ranges;
}

function applyQuarterCells(
  ws: ExcelJS.Worksheet,
  rowNumber: number,
  ranges: Array<{ start: number; end: number }>,
  values: Array<string | null>,
  opts: { bottomBorder?: boolean; center?: boolean; size?: number } = {}
) {
  ranges.forEach(({ start, end }, i) => {
    if (end > start) {
      ws.mergeCells(`${colLetters(start)}${rowNumber}:${colLetters(end)}${rowNumber}`);
    }
    const cell = ws.getCell(rowNumber, start);
    if (values[i]) {
      cell.value = values[i];
      cell.font = { size: opts.size ?? 9, name: '微軟正黑體', color: { argb: 'FF334155' } };
    }
    if (opts.center) {
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: false };
    }
    if (opts.bottomBorder) {
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FF94A3B8' } },
      };
    }
  });
}

/** 欄數不足時：全形低線＿（比 ─ 更接近全形寬），四段＋空隙 */
function buildFallbackUnderline(totalColWidth: number, segmentIndexes: number[]): string {
  // Excel 欄寬單位 ≠ 字元寬；略放大密度避免左擠（8.pdf 實測約短 19%）
  const lineUnits = Math.max(72, Math.round(totalColWidth * 1.22));
  const gap = Math.max(2, Math.round(lineUnits * 0.012));
  const seg = Math.max(10, Math.floor((lineUnits - 3 * gap) / 4));
  const segments: Array<{ start: number; end: number }> = [];
  let x = 0;
  for (let i = 0; i < 4; i++) {
    segments.push({ start: x, end: x + seg });
    x += seg + gap;
  }
  let out = '';
  let u = 0;
  const target = segments[3].end;
  const paint = new Set(segmentIndexes);
  for (let i = 0; i < 4; i++) {
    const { start, end } = segments[i];
    while (u < start) {
      out += '　';
      u += 2;
    }
    if (paint.has(i)) {
      const chars = Math.max(5, Math.floor((end - start) / 2));
      out += '＿'.repeat(chars);
      u = start + chars * 2;
    }
  }
  while (u < target) {
    out += '　';
    u += 2;
  }
  return out;
}

function buildFallbackLabels(totalColWidth: number, labels: string[]): string {
  const lineUnits = Math.max(72, Math.round(totalColWidth * 1.22));
  const gap = Math.max(2, Math.round(lineUnits * 0.012));
  const seg = Math.max(10, Math.floor((lineUnits - 3 * gap) / 4));
  let out = '';
  let u = 0;
  let x = 0;
  for (let i = 0; i < 4; i++) {
    const start = x;
    const end = x + seg;
    const center = (start + end) / 2;
    const label = labels[i] || '';
    const lw = excelTextWidth(label);
    let ls = label ? Math.round(center - lw / 2) : start;
    ls = Math.max(start, Math.min(ls, end - lw));
    while (u < ls) {
      out += '　';
      u += 2;
    }
    if (label) {
      out += label;
      u = ls + lw;
    }
    x = end + gap;
  }
  const target = x - gap;
  while (u < target) {
    out += '　';
    u += 2;
  }
  // 末端加不可裁切標記，降低 Excel 去掉尾隨空白導致左擠
  return out + '\u200B';
}

function addMergedTextRow(
  ws: ExcelJS.Worksheet,
  colCount: number,
  value: string,
  opts: { height?: number; size?: number; color?: string } = {}
) {
  const row = ws.addRow(Array(colCount).fill(null));
  row.height = opts.height ?? 16;
  ws.mergeCells(`${colLetters(1)}${row.number}:${colLetters(colCount)}${row.number}`);
  const cell = ws.getCell(row.number, 1);
  cell.value = value;
  cell.font = {
    size: opts.size ?? 9,
    name: '微軟正黑體',
    color: opts.color ? { argb: opts.color } : { argb: 'FF334155' },
  };
  cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: false };
  return row;
}

/**
 * 末頁簽核：對齊列印版（2.pdf）
 * 優先：四段合併儲存格底框（段間空欄）+ 職稱置中
 */
function addSignatureBlock(ws: ExcelJS.Worksheet, colCount: number) {
  const n = Math.max(colCount, 4);
  const labels = ['教學組長', '出納組', '會計室', '校長'];
  const ranges = signatureQuarterRanges(n);

  const spacer = ws.addRow(Array(n).fill(null));
  spacer.height = 22;

  if (ranges) {
    const lineRow = ws.addRow(Array(n).fill(null));
    lineRow.height = 14;
    applyQuarterCells(ws, lineRow.number, ranges, [null, null, null, null], {
      bottomBorder: true,
    });

    const sigRow = ws.addRow(Array(n).fill(null));
    sigRow.height = 16;
    applyQuarterCells(ws, sigRow.number, ranges, labels, { center: true, size: 9 });

    const mid = ws.addRow(Array(n).fill(null));
    mid.height = 14;
    const deanSpacer = ws.addRow(Array(n).fill(null));
    deanSpacer.height = 18;

    const deanLine = ws.addRow(Array(n).fill(null));
    deanLine.height = 14;
    applyQuarterCells(ws, deanLine.number, [ranges[0]], [null], { bottomBorder: true });

    const dean = ws.addRow(Array(n).fill(null));
    dean.height = 16;
    applyQuarterCells(ws, dean.number, [ranges[0]], ['教務主任'], { center: true, size: 9 });
    return;
  }

  // 6 欄表：字元後備
  const widths = sheetColWidths(ws, n);
  const totalW = widths.reduce((a, b) => a + b, 0);
  addMergedTextRow(ws, n, buildFallbackUnderline(totalW, [0, 1, 2, 3]), {
    height: 12,
    size: 9,
    color: 'FF94A3B8',
  });
  addMergedTextRow(ws, n, buildFallbackLabels(totalW, labels), {
    height: 16,
    size: 9,
    color: 'FF334155',
  });
  const mid = ws.addRow(Array(n).fill(null));
  mid.height = 14;
  const deanSpacer = ws.addRow(Array(n).fill(null));
  deanSpacer.height = 18;
  addMergedTextRow(ws, n, buildFallbackUnderline(totalW, [0]), {
    height: 12,
    size: 9,
    color: 'FF94A3B8',
  });
  addMergedTextRow(ws, n, buildFallbackLabels(totalW, ['教務主任', '', '', '']), {
    height: 16,
    size: 9,
    color: 'FF334155',
  });
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
  setupSheet(ws, colCount, [12, 12, 8, 10, 8, 8, 8, 14, 22]);

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
  setupSheet(ws, colCount, [14, 14, 12, 12, 14, 38]);

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
  setupSheet(ws, colCount, [12, 12, 12, 12, 11, 11, 11, 11, 14, 36]);

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
  setupSheet(ws, colCount, [14, 14, 12, 12, 14, 38]);

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
