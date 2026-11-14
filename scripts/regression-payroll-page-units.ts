/**
 * 印領清冊：備註動態列高單位分頁。
 * 短備註每頁最多 PAYROLL_ROWS_PER_PAGE 人；畫面／列印不補空白列；
 * Excel 以 padPayrollPageRowsForExcel 補滿至頁底。
 * 執行：npx tsx scripts/regression-payroll-page-units.ts
 */
import assert from 'node:assert/strict';
import {
  estimatePayrollExcelRowHeightPt,
  estimatePayrollRowUnits,
  isBlankPayrollRow,
  padPayrollPageRowsForExcel,
  paginatePayrollByUnits,
  PAYROLL_EXCEL_MAX_ROW_HEIGHT_PT,
  PAYROLL_EXCEL_PT_PER_LINE,
  PAYROLL_EXCEL_WRAP_WIDTH_FACTOR,
  PAYROLL_MAX_ROW_UNITS,
  PAYROLL_REMARKS_COL_WIDTH,
  PAYROLL_REMARKS_WRAP_WIDTH_FACTOR,
  PAYROLL_ROWS_LAST_PAGE,
  PAYROLL_ROWS_PER_PAGE,
  payrollRemarkTextWidth,
} from '../src/utils/overloadPayrollRegister';

type Row = { teacherId: string; remarks: string };

const colWidth = PAYROLL_REMARKS_COL_WIDTH.overload;

function makeRow(i: number, remarks: string): Row {
  return { teacherId: `t${i}`, remarks };
}

function blank(i: number): Row {
  return { teacherId: `__blank-${i}`, remarks: '' };
}

function pageRealUnits(rows: Row[]): number {
  return rows
    .filter((r) => !isBlankPayrollRow(r.teacherId))
    .reduce((sum, r) => sum + estimatePayrollRowUnits(r.remarks, colWidth), 0);
}

function realPeople(rows: Row[]): number {
  return rows.filter((r) => !isBlankPayrollRow(r.teacherId)).length;
}

function run() {
  // 短備註：中間頁每頁容量人；畫面列不補空白
  const shortRows = Array.from({ length: PAYROLL_ROWS_PER_PAGE * 2 }, (_, i) => makeRow(i, '短'));
  const shortSlices = paginatePayrollByUnits(shortRows, (r) => r.remarks, blank, colWidth);
  assert.equal(shortSlices.length, 2, '兩倍容量短備註應分兩頁');
  assert.equal(realPeople(shortSlices[0].paddedRows), PAYROLL_ROWS_PER_PAGE);
  assert.equal(pageRealUnits(shortSlices[0].rows), PAYROLL_ROWS_PER_PAGE);
  assert.equal(shortSlices[0].paddedRows.length, PAYROLL_ROWS_PER_PAGE, '畫面列不補空白');
  assert.equal(realPeople(shortSlices[1].paddedRows), PAYROLL_ROWS_PER_PAGE);

  // 末頁容量：畫面不補空白；Excel 另補至 lastPageUnits
  const lastPageRows = Array.from({ length: PAYROLL_ROWS_LAST_PAGE }, (_, i) => makeRow(i, '短'));
  const lastSlices = paginatePayrollByUnits(lastPageRows, (r) => r.remarks, blank, colWidth);
  assert.equal(lastSlices.length, 1);
  assert.equal(lastSlices[0].paddedRows.length, PAYROLL_ROWS_LAST_PAGE);

  const few = Array.from({ length: 5 }, (_, i) => makeRow(i, '短'));
  const fewSlices = paginatePayrollByUnits(few, (r) => r.remarks, blank, colWidth);
  assert.equal(fewSlices[0].paddedRows.length, 5);
  const fewExcel = padPayrollPageRowsForExcel(fewSlices[0].rows, blank, colWidth, true);
  assert.equal(fewExcel.length, PAYROLL_ROWS_LAST_PAGE, 'Excel 不滿頁應補空白列');
  assert.ok(fewExcel.some((r) => isBlankPayrollRow(r.teacherId)));

  // 長備註：每人多單位 → 一頁人數 < 容量，真實列單位總和 ≤ 容量
  const longRemark = '全'.repeat(colWidth + 1);
  const longUnits = estimatePayrollRowUnits(longRemark, colWidth);
  const expectedLongUnits = Math.min(
    PAYROLL_MAX_ROW_UNITS,
    Math.max(
      1,
      Math.ceil(payrollRemarkTextWidth(longRemark) / (colWidth * PAYROLL_REMARKS_WRAP_WIDTH_FACTOR))
    )
  );
  assert.equal(longUnits, expectedLongUnits, `長備註單位應為 ${expectedLongUnits}`);
  assert.ok(longUnits > 1, `長備註應 >1 單位（實際 ${longUnits}）`);

  // Excel 換行係數 ≥ 分頁係數 → 估出行數 ≤ 分頁（再另加 1 行緩衝於列高）
  const excelLines = estimatePayrollRowUnits(
    longRemark,
    colWidth,
    Number.POSITIVE_INFINITY,
    PAYROLL_EXCEL_WRAP_WIDTH_FACTOR
  );
  assert.ok(excelLines <= longUnits, `Excel 行數 ${excelLines} 應 ≤ 分頁 ${longUnits}`);
  const sampleRemark =
    '11/2代林怡君公假兼課1節(第1節)；11/3代林怡君公假兼課1節(第3節)；11/4代林怡君公假兼課1節(第5節)；11/5代林怡君公假兼課1節(第7節)';
  const samplePt = estimatePayrollExcelRowHeightPt(sampleRemark, colWidth);
  assert.ok(samplePt >= PAYROLL_EXCEL_PT_PER_LINE * 3, `四段備註列高應夠顯示（實際 ${samplePt}）`);
  assert.ok(samplePt <= PAYROLL_EXCEL_PT_PER_LINE * 8, `四段備註列高不宜過度虛高（實際 ${samplePt}）`);
  const longRows = Array.from({ length: 30 }, (_, i) => makeRow(i, longRemark));
  const longSlices = paginatePayrollByUnits(longRows, (r) => r.remarks, blank, colWidth);
  assert.ok(longSlices.length >= 2, '長備註應拆成多頁');
  for (const slice of longSlices) {
    const used = pageRealUnits(slice.rows);
    assert.ok(used <= PAYROLL_ROWS_PER_PAGE, `頁單位 ${used} 應 ≤ ${PAYROLL_ROWS_PER_PAGE}`);
    assert.ok(realPeople(slice.paddedRows) < PAYROLL_ROWS_PER_PAGE, '長備註頁人數應少於容量');
    assert.equal(slice.paddedRows.length, slice.rows.length, '畫面列不補空白');
  }

  // 極端備註：分頁單位封頂為一頁容量；空間不足時單獨成頁
  const extreme = '極'.repeat(Math.ceil((colWidth * (PAYROLL_MAX_ROW_UNITS + 5)) / 2));
  const capped = estimatePayrollRowUnits(extreme, colWidth);
  assert.equal(capped, PAYROLL_MAX_ROW_UNITS, '分頁極端備註應封頂 PAYROLL_MAX_ROW_UNITS');

  // Excel 列高不套分頁上限（僅受 409pt 限制），長備註應明顯高於短備註
  const excelShort = estimatePayrollExcelRowHeightPt('短', colWidth);
  const excelLong = estimatePayrollExcelRowHeightPt(extreme, colWidth);
  assert.ok(excelLong > excelShort * 5, `Excel 長備註列高應明顯較高（${excelLong} vs ${excelShort}）`);
  assert.ok(excelLong <= PAYROLL_EXCEL_MAX_ROW_HEIGHT_PT);
  const uncappedUnits = estimatePayrollRowUnits(extreme, colWidth, Number.POSITIVE_INFINITY);
  assert.ok(uncappedUnits > PAYROLL_MAX_ROW_UNITS, '不封頂單位應超過分頁上限');

  const fillers = Array.from({ length: PAYROLL_ROWS_PER_PAGE - capped + 1 }, (_, i) =>
    makeRow(100 + i, '短')
  );
  const aloneForced = [...fillers, makeRow(999, extreme)];
  const aloneSlices = paginatePayrollByUnits(aloneForced, (r) => r.remarks, blank, colWidth);
  assert.ok(aloneSlices.length >= 2, '空間不足時極端備註應換頁');
  const last = aloneSlices[aloneSlices.length - 1];
  assert.equal(realPeople(last.paddedRows), 1, '極端備註應單獨成頁');
  assert.equal(last.rows[0].teacherId, 't999');
  assert.equal(estimatePayrollRowUnits(last.rows[0].remarks, colWidth), PAYROLL_MAX_ROW_UNITS);

  console.log('regression-payroll-page-units: ok');
}

run();
