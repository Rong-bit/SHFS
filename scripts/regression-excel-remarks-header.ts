/**
 * Excel 備註表頭應對齊列印／PDF：第一行「備註」粗體 11pt，第二行日期區間非粗體 9pt。
 * 執行：npx tsx scripts/regression-excel-remarks-header.ts
 */
import assert from 'node:assert/strict';
import { buildPayrollRemarksHeaderRichText } from '../src/utils/payrollRegisterExcel';

function run() {
  const label = '115年11月1日 ~ 115年11月28日 共(4週)';
  const value = buildPayrollRemarksHeaderRichText(label);
  assert.ok(value && typeof value === 'object' && 'richText' in value, '應為 richText');
  const parts = (value as { richText: Array<{ text: string; font?: { bold?: boolean; size?: number } }> })
    .richText;
  assert.equal(parts.length, 2);
  assert.equal(parts[0].text, '備註\n');
  assert.equal(parts[0].font?.bold, true);
  assert.equal(parts[0].font?.size, 11);
  assert.equal(parts[1].text, label);
  assert.equal(parts[1].font?.bold, false);
  assert.equal(parts[1].font?.size, 9);
  console.log('regression-excel-remarks-header: ok');
}

run();
