import type ExcelJS from 'exceljs';
import type { CounselingPayrollPage } from './counselingPayrollRegister';
import type { OverloadPayrollPage } from './overloadPayrollRegister';
import { isBlankPayrollRow } from './overloadPayrollRegister';
import type { SubstitutePayrollPage } from './substitutePayrollRegister';

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

function styleDataCell(cell: ExcelJS.Cell, opts?: { bold?: boolean; align?: 'left' | 'center' | 'right' }) {
  cell.font = { bold: Boolean(opts?.bold), size: 11, name: '微軟正黑體' };
  cell.alignment = {
    horizontal: opts?.align || 'center',
    vertical: 'middle',
    wrapText: true,
  };
  cell.border = thinBorder;
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
    margins: {
      left: 0.2,
      right: 0.2,
      top: 0.25,
      bottom: 0.25,
      header: 0.1,
      footer: 0.1,
    },
  };
  // 開啟分頁預覽，方便看到小計後的換頁線
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
  _opts?: { remarkAlign?: 'left' | 'center' }
) {
  const row = ws.addRow(values);
  row.eachCell((cell) => {
    styleDataCell(cell, { align: 'center' });
  });
  return row.number;
}

function addTotalRow(ws: ExcelJS.Worksheet, values: CellValue[], mergeLabelCols = 2) {
  const row = ws.addRow(values);
  const r = row.number;
  if (mergeLabelCols > 1) {
    ws.mergeCells(r, 1, r, mergeLabelCols);
  }
  for (let c = 1; c <= values.length; c++) {
    styleTotalCell(ws.getCell(r, c));
  }
  return r;
}

function addSignatureBlock(ws: ExcelJS.Worksheet, colCount: number) {
  ws.addRow([]);
  ws.addRow([]);
  const sig = ws.addRow(['教學組長', '', '', '出納組', '', '', '會計室', '', '', '校長'].slice(0, colCount));
  sig.eachCell((cell) => {
    cell.font = { size: 11, name: '微軟正黑體' };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  ws.addRow([]);
  ws.addRow([]);
  const dean = ws.addRow(['教務主任']);
  dean.getCell(1).font = { size: 11, name: '微軟正黑體' };
  dean.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
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
  setupSheet(ws, colCount, [10, 10, 6.5, 8.6, 6.5, 6.5, 6.5, 10, 35]);

  const totalPages = pages.length;
  pages.forEach((page, idx) => {
    addTitleRow(ws, title, colCount);
    addHeaderRow(ws, headers);
    page.rows.forEach((r) => {
      if (isBlankPayrollRow(r.teacherId)) {
        addDataRow(ws, Array(colCount).fill(''));
        return;
      }
      addDataRow(ws, [
        r.salaryCode || '—',
        r.teacherName,
        r.weeklyConcurrent || '',
        r.baseMonthlyConcurrent,
        r.addConcurrent || '',
        r.subtractConcurrent || '',
        r.actualConcurrent,
        r.amount,
        r.remarks,
      ]);
    });
    const st = page.subtotal;
    const subtotalRow = addTotalRow(ws, [
      '小計',
      '',
      st.weeklyConcurrent,
      st.baseMonthlyConcurrent,
      st.addConcurrent || '',
      st.subtractConcurrent || '',
      st.actualConcurrent,
      st.amount,
      `${page.pageIndex} of ${totalPages}`,
    ]);
    if (idx === pages.length - 1) {
      addTotalRow(ws, [
        '合計',
        '',
        grandTotal.weeklyConcurrent,
        grandTotal.baseMonthlyConcurrent,
        grandTotal.addConcurrent || '',
        grandTotal.subtractConcurrent || '',
        grandTotal.actualConcurrent,
        grandTotal.amount,
        '',
      ]);
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
        addDataRow(ws, Array(colCount).fill(''));
        return;
      }
      addDataRow(ws, [
        r.salaryCode || '—',
        r.teacherName,
        r.substitutePeriods,
        r.ratePerPeriod,
        r.amount,
        r.remarks,
      ]);
    });
    const subtotalRow = addTotalRow(ws, [
      '小計',
      '',
      page.subtotal.substitutePeriods,
      page.subtotalRateLabel || '',
      page.subtotal.amount,
      `${page.pageIndex} of ${totalPages}`,
    ]);
    if (idx === pages.length - 1) {
      addTotalRow(ws, [
        '合計',
        '',
        grandTotal.substitutePeriods,
        grandTotalRateLabel || '',
        grandTotal.amount,
        '',
      ]);
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
        addDataRow(ws, Array(colCount).fill(''));
        return;
      }
      addDataRow(ws, [
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
      ]);
    });
    const subtotalRow = addTotalRow(ws, [
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
    ]);
    if (idx === pages.length - 1) {
      addTotalRow(ws, [
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
      ]);
      addSignatureBlock(ws, colCount);
    } else {
      addPageBreakAfterRow(ws, subtotalRow);
    }
  });

  await downloadWorkbook(wb, fileName);
}
