/**
 * 印領清冊：備註動態列高單位分頁。
 * 短備註每頁最多 PAYROLL_ROWS_PER_PAGE 人；畫面／列印／Excel 皆不補空白資料列。
 * 列印小計須緊接資料列；分頁列高須把「備註換行」折算成矮於短列的單位。
 * 執行：npx tsx scripts/regression-payroll-page-units.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  estimatePayrollExcelRowHeightPt,
  estimatePayrollRemarkLines,
  estimatePayrollRowUnits,
  isBlankPayrollRow,
  packPayrollIndicesByHeights,
  padPayrollPageRowsForExcel,
  paginatePayrollByUnits,
  PAYROLL_EXCEL_MAX_ROW_HEIGHT_PT,
  PAYROLL_EXCEL_PT_PER_LINE,
  PAYROLL_EXCEL_WRAP_WIDTH_FACTOR,
  PAYROLL_EXTRA_REMARK_LINE_TO_ROW_UNIT,
  PAYROLL_MAX_ROW_UNITS,
  PAYROLL_PRINT_HEIGHT_FUDGE,
  PAYROLL_PRINT_PAGE_SAFETY_MM,
  PAYROLL_REMARKS_COL_WIDTH,
  PAYROLL_REMARKS_WRAP_WIDTH_FACTOR,
  PAYROLL_ROWS_LAST_PAGE,
  PAYROLL_ROWS_PER_PAGE,
  payrollRemarkTextWidth,
  slicePayrollRowsByIndexGroups,
} from '../src/utils/overloadPayrollRegister';

const printStylesPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../src/components/Accounting/PayrollRegisterPrintStyles.tsx'
);

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

function expectedRowUnitsFromLines(lines: number, maxUnits = PAYROLL_MAX_ROW_UNITS): number {
  const raw = lines <= 1 ? 1 : 1 + (lines - 1) * PAYROLL_EXTRA_REMARK_LINE_TO_ROW_UNIT;
  const capped = Number.isFinite(maxUnits)
    ? Math.min(Math.max(1, raw), Math.max(1, maxUnits))
    : Math.max(1, raw);
  return Math.round(capped * 10) / 10;
}

function run() {
  assert.ok(
    PAYROLL_EXTRA_REMARK_LINE_TO_ROW_UNIT >= 0.7 &&
      PAYROLL_EXTRA_REMARK_LINE_TO_ROW_UNIT < 1,
    '後續備註行折算應接近實測 2.6–2.9/3.5mm（約 0.75）'
  );
  assert.ok(
    PAYROLL_REMARKS_WRAP_WIDTH_FACTOR >= 1.3,
    '分頁換行係數應接近列印實際可容字寬'
  );
  assert.ok(
    PAYROLL_ROWS_PER_PAGE >= 58 && PAYROLL_ROWS_PER_PAGE <= 68,
    `單位容量應介於填滿與不溢出之間（實際 ${PAYROLL_ROWS_PER_PAGE}）`
  );
  assert.ok(
    PAYROLL_PRINT_PAGE_SAFETY_MM >= 5 && PAYROLL_PRINT_PAGE_SAFETY_MM <= 8,
    `列印安全距宜 5–8mm：過大頁底空白、過小小計易溢頁（實際 ${PAYROLL_PRINT_PAGE_SAFETY_MM}）`
  );
  assert.ok(
    PAYROLL_PRINT_HEIGHT_FUDGE >= 1.03 && PAYROLL_PRINT_HEIGHT_FUDGE <= 1.08,
    `實測列高放大宜 1.03–1.08（實際 ${PAYROLL_PRINT_HEIGHT_FUDGE}）`
  );

  // 短備註：中間頁每頁容量人；畫面列不補空白
  const shortRows = Array.from({ length: PAYROLL_ROWS_PER_PAGE * 2 }, (_, i) => makeRow(i, '短'));
  const shortSlices = paginatePayrollByUnits(shortRows, (r) => r.remarks, blank, colWidth);
  assert.equal(shortSlices.length, 2, '兩倍容量短備註應分兩頁');
  assert.equal(realPeople(shortSlices[0].paddedRows), PAYROLL_ROWS_PER_PAGE);
  assert.equal(pageRealUnits(shortSlices[0].rows), PAYROLL_ROWS_PER_PAGE);
  assert.equal(shortSlices[0].paddedRows.length, PAYROLL_ROWS_PER_PAGE, '畫面列不補空白');
  assert.equal(realPeople(shortSlices[1].paddedRows), PAYROLL_ROWS_PER_PAGE);

  // 末頁容量：畫面不補空白
  const lastPageRows = Array.from({ length: PAYROLL_ROWS_LAST_PAGE }, (_, i) => makeRow(i, '短'));
  const lastSlices = paginatePayrollByUnits(lastPageRows, (r) => r.remarks, blank, colWidth);
  assert.equal(lastSlices.length, 1);
  assert.equal(lastSlices[0].paddedRows.length, PAYROLL_ROWS_LAST_PAGE);

  const few = Array.from({ length: 5 }, (_, i) => makeRow(i, '短'));
  const fewSlices = paginatePayrollByUnits(few, (r) => r.remarks, blank, colWidth);
  assert.equal(fewSlices[0].paddedRows.length, 5);
  // 輔助函式仍可依單位補列；實際 Excel 匯出已不再補空白資料列
  const fewExcel = padPayrollPageRowsForExcel(fewSlices[0].rows, blank, colWidth, true);
  assert.equal(fewExcel.length, PAYROLL_ROWS_LAST_PAGE, '單位補列輔助應可補至末頁容量');
  assert.ok(fewExcel.some((r) => isBlankPayrollRow(r.teacherId)));

  // 長備註：列高單位 < 換行行數（後續行較矮）
  const longRemark = '全'.repeat(colWidth + 1);
  const longLines = estimatePayrollRemarkLines(longRemark, colWidth);
  const longUnits = estimatePayrollRowUnits(longRemark, colWidth);
  const expectedLongLines = Math.max(
    1,
    Math.ceil(payrollRemarkTextWidth(longRemark) / (colWidth * PAYROLL_REMARKS_WRAP_WIDTH_FACTOR))
  );
  assert.equal(longLines, expectedLongLines, `長備註行數應為 ${expectedLongLines}`);
  assert.equal(longUnits, expectedRowUnitsFromLines(longLines), '長備註列高單位應依 0.6 折算');
  assert.ok(longUnits > 1, `長備註列高應 >1（實際 ${longUnits}）`);
  assert.ok(longUnits < longLines, `列高單位 ${longUnits} 應 < 行數 ${longLines}`);

  // Excel 列高依行數（可與分頁單位不同）
  const excelLines = estimatePayrollRemarkLines(
    longRemark,
    colWidth,
    PAYROLL_EXCEL_WRAP_WIDTH_FACTOR
  );
  assert.ok(excelLines >= 1, `Excel 行數應 ≥ 1（實際 ${excelLines}）`);
  const sampleRemark =
    '11/2代林怡君公假兼課1節(第1節)；11/3代林怡君公假兼課1節(第3節)；11/4代林怡君公假兼課1節(第5節)；11/5代林怡君公假兼課1節(第7節)';
  const sampleLines = estimatePayrollRemarkLines(
    sampleRemark,
    colWidth,
    PAYROLL_EXCEL_WRAP_WIDTH_FACTOR
  );
  const samplePt = estimatePayrollExcelRowHeightPt(sampleRemark, colWidth);
  const expectedSamplePt = Math.round((sampleLines + (sampleLines > 1 ? 0.5 : 0)) * PAYROLL_EXCEL_PT_PER_LINE);
  assert.equal(samplePt, expectedSamplePt, '多行備註列高應含半行緩衝');
  assert.ok(samplePt >= PAYROLL_EXCEL_PT_PER_LINE * 2, `四段備註列高應夠顯示（實際 ${samplePt}）`);
  assert.ok(samplePt <= PAYROLL_EXCEL_PT_PER_LINE * 7, `四段備註列高不宜過度虛高（實際 ${samplePt}）`);
  const longRows = Array.from({ length: PAYROLL_ROWS_PER_PAGE + 5 }, (_, i) =>
    makeRow(i, longRemark)
  );
  const longSlices = paginatePayrollByUnits(longRows, (r) => r.remarks, blank, colWidth);
  assert.ok(longSlices.length >= 2, '長備註應拆成多頁');
  for (const slice of longSlices) {
    const used = pageRealUnits(slice.rows);
    assert.ok(used <= PAYROLL_ROWS_PER_PAGE + 1e-9, `頁單位 ${used} 應 ≤ ${PAYROLL_ROWS_PER_PAGE}`);
    assert.ok(realPeople(slice.paddedRows) < PAYROLL_ROWS_PER_PAGE, '長備註頁人數應少於容量');
    assert.equal(slice.paddedRows.length, slice.rows.length, '畫面列不補空白');
  }

  // 極端備註：分頁單位封頂；空間不足時單獨成頁
  const extreme = '極'.repeat(Math.ceil((colWidth * (PAYROLL_MAX_ROW_UNITS + 20)) / 2));
  const capped = estimatePayrollRowUnits(extreme, colWidth);
  assert.equal(capped, PAYROLL_MAX_ROW_UNITS, '分頁極端備註應封頂 PAYROLL_MAX_ROW_UNITS');
  assert.ok(
    PAYROLL_MAX_ROW_UNITS < PAYROLL_ROWS_PER_PAGE,
    '單列上限須小於每頁容量，避免長備註獨佔整頁造成下方空白'
  );

  // Excel 列高不套分頁上限（僅受 409pt 限制），長備註應明顯高於短備註
  const excelShort = estimatePayrollExcelRowHeightPt('短', colWidth);
  const excelLong = estimatePayrollExcelRowHeightPt(extreme, colWidth);
  assert.ok(excelLong > excelShort * 5, `Excel 長備註列高應明顯較高（${excelLong} vs ${excelShort}）`);
  assert.ok(excelLong <= PAYROLL_EXCEL_MAX_ROW_HEIGHT_PT);
  const uncappedUnits = estimatePayrollRowUnits(extreme, colWidth, Number.POSITIVE_INFINITY);
  assert.ok(uncappedUnits > PAYROLL_MAX_ROW_UNITS, '不封頂單位應超過分頁上限');

  const fillers = Array.from({ length: Math.ceil(PAYROLL_ROWS_PER_PAGE - capped) + 1 }, (_, i) =>
    makeRow(100 + i, '短')
  );
  const aloneForced = [...fillers, makeRow(999, extreme)];
  const aloneSlices = paginatePayrollByUnits(aloneForced, (r) => r.remarks, blank, colWidth);
  assert.ok(aloneSlices.length >= 2, '空間不足時極端備註應換頁');
  const last = aloneSlices[aloneSlices.length - 1];
  assert.equal(realPeople(last.paddedRows), 1, '極端備註應單獨成頁');
  assert.equal(last.rows[0].teacherId, 't999');
  assert.equal(estimatePayrollRowUnits(last.rows[0].remarks, colWidth), PAYROLL_MAX_ROW_UNITS);

  // 列印樣式：不可再用固定 A4 頁高＋footer margin-top:auto 把小計貼底（中間會空白）
  const printCss = readFileSync(printStylesPath, 'utf8');
  assert.equal(/height:\s*287mm/.test(printCss), false, '列印頁不可固定 height:287mm');
  assert.equal(/min-height:\s*287mm/.test(printCss), false, '列印頁不可 min-height:287mm');
  assert.equal(
    /\.payroll-register-print-page-footer\s*\{[^}]*margin-top:\s*auto/s.test(printCss),
    false,
    '小計 footer 不可 margin-top:auto（會造成中間空白）'
  );

  // 密度：多數短／中備註＋少數長備註時，第一頁應明顯填滿，避免半頁空白
  const denseRemark =
    '11/3代XXX公假兼課1節(第2節)；11/4代XXX公假兼課1節(第3節)；11/5代XXX公假兼課2節(第1、2節)；11/6代XXX公假兼課1節(第4節)；11/7代XXX公假兼課1節(第5節)；11/10代XXX公假兼課1節(第2節)；11/11代XXX公假兼課1節(第3節)；11/12代XXX公假兼課1節(第1節)；11/13代XXX公假兼課1節(第4節)；11/14代XXX公假兼課1節(第5節)';
  const denseRows = Array.from({ length: 80 }, (_, i) => {
    if (i % 12 === 2) return makeRow(i, denseRemark);
    if (i % 5 === 0) return makeRow(i, sampleRemark);
    if (i % 3 === 0) return makeRow(i, '11/3公假兼課1節(第1節)');
    return makeRow(i, i % 2 === 0 ? '' : '短');
  });
  const denseSlices = paginatePayrollByUnits(denseRows, (r) => r.remarks, blank, colWidth);
  assert.ok(
    realPeople(denseSlices[0].rows) >= 32,
    `混合備註第一頁應 ≥32 人（實際 ${realPeople(denseSlices[0].rows)}），且不可塞爆溢頁`
  );
  assert.ok(
    pageRealUnits(denseSlices[0].rows) <= PAYROLL_ROWS_PER_PAGE + 1e-9,
    '混合備註第一頁單位不可超容量'
  );
  // 實高分頁：等高短列應貼滿容量
  const shortHeights = Array.from({ length: 100 }, () => 10);
  const heightPages = packPayrollIndicesByHeights(shortHeights, 72);
  assert.equal(heightPages[0].length, 7, '容量 72、列高 10 → 第一頁 7 列');
  assert.equal(heightPages[0][0], 0);
  const tallThenShort = [50, 50, 10, 10, 10];
  const mixedHeight = packPayrollIndicesByHeights(tallThenShort, 60);
  assert.deepEqual(mixedHeight[0], [0], '單列接近整頁時單獨成頁');
  // 50+10=60 可同頁；其餘短列換頁
  assert.deepEqual(mixedHeight[1], [1, 2]);
  assert.deepEqual(mixedHeight[2], [3, 4]);
  const sliced = slicePayrollRowsByIndexGroups(
    tallThenShort.map((h, i) => makeRow(i, `h${h}`)),
    mixedHeight
  );
  assert.equal(sliced.length, 3);
  assert.equal(sliced[1].rows.length, 2);

  console.log('regression-payroll-page-units: ok');
}

run();
