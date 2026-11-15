/**
 * Excel 兼課清冊分頁須依 Excel 列高獨立打包，且每頁資料總高 ≤ 預算，
 * 避免小計被擠到下一列印頁（奇數頁不見小計）。
 * 執行：npx tsx scripts/regression-excel-payroll-pages.ts
 */
import assert from 'node:assert/strict';
import {
  estimatePayrollExcelRowHeightPt,
  packPayrollIndicesByHeights,
  paginateOverloadPayrollForExcel,
  PAYROLL_EXCEL_PAGE_DATA_PT,
  PAYROLL_EXCEL_PT_PER_LINE,
  PAYROLL_REMARKS_COL_WIDTH,
  type OverloadPayrollRow,
} from '../src/utils/overloadPayrollRegister';

const col = PAYROLL_REMARKS_COL_WIDTH.overload;

function makeRow(i: number, remarks: string): OverloadPayrollRow {
  return {
    teacherId: `t${i}`,
    salaryCode: String(100000 + i),
    teacherName: `教師${i}`,
    weeklyConcurrent: 1,
    baseMonthlyConcurrent: 4,
    addConcurrent: 0,
    subtractConcurrent: 0,
    actualConcurrent: 4,
    amount: 2020,
    remarks,
  };
}

function run() {
  assert.ok(PAYROLL_EXCEL_PAGE_DATA_PT <= 680, 'Excel 資料區預算不可過大');
  assert.ok(PAYROLL_EXCEL_PAGE_DATA_PT >= 500, 'Excel 資料區預算不可過小');

  const mid =
    '11/2代林怡君公假兼課1節(第1節)；11/3代林怡君公假兼課1節(第3節)；11/4代林怡君公假兼課1節(第5節)；11/5代林怡君公假兼課1節(第7節)';
  const rows = Array.from({ length: 90 }, (_, i) =>
    makeRow(i, i % 4 === 0 ? mid : i % 2 === 0 ? '短' : '')
  );

  const { pages, grandTotal } = paginateOverloadPayrollForExcel(rows);
  assert.ok(pages.length >= 2, '應分多頁');
  assert.equal(grandTotal.actualConcurrent, rows.reduce((s, r) => s + r.actualConcurrent, 0));

  for (const page of pages) {
    const used = page.rows.reduce(
      (s, r) => s + estimatePayrollExcelRowHeightPt(r.remarks, col),
      0
    );
    assert.ok(
      used <= PAYROLL_EXCEL_PAGE_DATA_PT + 1e-9,
      `第 ${page.pageIndex} 頁資料高 ${used}pt 應 ≤ ${PAYROLL_EXCEL_PAGE_DATA_PT}`
    );
    assert.ok(page.rows.length > 0, '每頁應有資料列');
    assert.ok(page.subtotal.actualConcurrent > 0 || page.rows.every((r) => r.actualConcurrent === 0));
  }

  // 短列：每頁人數應接近預算／每列 pt，且明顯少於舊版「沿用瀏覽器實測頁」可能塞的 55+
  const shortRows = Array.from({ length: 120 }, (_, i) => makeRow(i, '短'));
  const shortPack = paginateOverloadPayrollForExcel(shortRows);
  const maxShort = Math.floor(PAYROLL_EXCEL_PAGE_DATA_PT / PAYROLL_EXCEL_PT_PER_LINE);
  assert.ok(
    shortPack.pages[0].rows.length <= maxShort,
    `短列第一頁 ${shortPack.pages[0].rows.length} 應 ≤ ${maxShort}`
  );
  assert.ok(
    shortPack.pages[0].rows.length >= maxShort - 2,
    '短列應盡量填滿 Excel 資料區預算'
  );

  // pack 邊界：剛好等於容量仍同頁；超出才換頁
  assert.deepEqual(packPayrollIndicesByHeights([300, 320], 620), [[0, 1]]);
  assert.deepEqual(packPayrollIndicesByHeights([300, 321], 620), [[0], [1]]);

  console.log('regression-excel-payroll-pages: ok');
}

run();
