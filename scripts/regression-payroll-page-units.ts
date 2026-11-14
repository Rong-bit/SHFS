/**
 * 印領清冊：備註動態列高單位分頁。
 * 短備註每頁 44 人；長備註人數變少但單位 ≤44；極端備註單人成頁且單位封頂。
 * 執行：npx tsx scripts/regression-payroll-page-units.ts
 */
import assert from 'node:assert/strict';
import {
  estimatePayrollRowUnits,
  isBlankPayrollRow,
  paginatePayrollByUnits,
  PAYROLL_MAX_ROW_UNITS,
  PAYROLL_REMARKS_COL_WIDTH,
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
  // 短備註：中間頁每頁 44 人／44 單位；88 人 → 兩頁各 44
  const shortRows = Array.from({ length: 88 }, (_, i) => makeRow(i, '短'));
  const shortSlices = paginatePayrollByUnits(shortRows, (r) => r.remarks, blank, colWidth);
  assert.equal(shortSlices.length, 2, '88 短備註應分兩頁');
  assert.equal(realPeople(shortSlices[0].paddedRows), PAYROLL_ROWS_PER_PAGE);
  assert.equal(pageRealUnits(shortSlices[0].rows), PAYROLL_ROWS_PER_PAGE);
  assert.equal(realPeople(shortSlices[1].paddedRows), PAYROLL_ROWS_PER_PAGE);
  assert.equal(shortSlices[1].paddedRows.length, PAYROLL_ROWS_PER_PAGE);

  // 恰好末頁容量：單頁並補空白至 lastPageUnits
  const fortyOne = Array.from({ length: PAYROLL_ROWS_LAST_PAGE }, (_, i) => makeRow(i, '短'));
  const fortyOneSlices = paginatePayrollByUnits(fortyOne, (r) => r.remarks, blank, colWidth);
  assert.equal(fortyOneSlices.length, 1);
  assert.equal(fortyOneSlices[0].paddedRows.length, PAYROLL_ROWS_LAST_PAGE);

  // 長備註：每人多單位 → 一頁人數 < 44，真實列單位總和 ≤ 44
  // CJK 寬度 2：超過一欄寬度的字數 → 至少 2 單位
  const longRemark = '全'.repeat(colWidth + 1);
  const longUnits = estimatePayrollRowUnits(longRemark, colWidth);
  const expectedLongUnits = Math.min(
    PAYROLL_MAX_ROW_UNITS,
    Math.max(1, Math.ceil(payrollRemarkTextWidth(longRemark) / colWidth))
  );
  assert.equal(longUnits, expectedLongUnits, `長備註單位應為 ${expectedLongUnits}`);
  assert.ok(longUnits > 1, `長備註應 >1 單位（實際 ${longUnits}）`);
  const longRows = Array.from({ length: 30 }, (_, i) => makeRow(i, longRemark));
  const longSlices = paginatePayrollByUnits(longRows, (r) => r.remarks, blank, colWidth);
  assert.ok(longSlices.length >= 2, '長備註應拆成多頁');
  for (const slice of longSlices) {
    const used = pageRealUnits(slice.rows);
    assert.ok(used <= PAYROLL_ROWS_PER_PAGE, `頁單位 ${used} 應 ≤ ${PAYROLL_ROWS_PER_PAGE}`);
    assert.ok(realPeople(slice.paddedRows) < PAYROLL_ROWS_PER_PAGE, '長備註頁人數應少於 44');
  }

  // 極端備註：單位封頂；空間不足時單獨成頁
  const extreme = '極'.repeat(Math.ceil((colWidth * (PAYROLL_MAX_ROW_UNITS + 5)) / 2));
  const capped = estimatePayrollRowUnits(extreme, colWidth);
  assert.equal(capped, PAYROLL_MAX_ROW_UNITS, '極端備註應封頂 PAYROLL_MAX_ROW_UNITS');

  // 多一短列使剩餘 < capped → 極端列換頁且該頁僅一人
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
