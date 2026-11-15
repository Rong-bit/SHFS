/**
 * Excel 兼課／代課清冊簽核職稱：四等分後再往左二字元；教務主任對齊教學組長。
 * 執行：npx tsx scripts/regression-excel-signature-labels.ts
 */
import assert from 'node:assert/strict';
import {
  buildPrintEqualLabels,
  SIGNATURE_LABEL_LEFT_SHIFT_UNITS,
} from '../src/utils/payrollRegisterExcel';

function leadingFullWidthSpaces(s: string): number {
  let n = 0;
  for (const ch of s) {
    if (ch === '　') n += 1;
    else break;
  }
  return n;
}

function run() {
  assert.equal(SIGNATURE_LABEL_LEFT_SHIFT_UNITS, 4, '二字元＝全形寬度單位 4');

  const totalW = 10 + 10 + 6.5 + 8.6 + 6.5 + 6.5 + 6.5 + 12 + 35;
  const four = buildPrintEqualLabels(['教學組長', '出納組', '會計室', '校長'], totalW);
  const dean = buildPrintEqualLabels(['教務主任'], totalW);

  assert.match(four, /教學組長/);
  assert.match(four, /出納組/);
  assert.match(four, /會計室/);
  assert.match(four, /校長/);
  assert.match(dean, /教務主任/);

  // 往左二字元：教學組長／教務主任前置全形空白應比無偏移少 2 個（4 單位）
  const fourLead = leadingFullWidthSpaces(four);
  const deanLead = leadingFullWidthSpaces(dean);
  assert.equal(fourLead, deanLead, '教務主任應與教學組長左緣對齊');
  assert.ok(fourLead >= 0, '左移後仍應有合法前導空白（可為 0）');

  // 相對「中心對齊再減二字元」：第一欄中心約 12.5%，「教學組長」寬 8，
  // start ≈ round(0.125*lineUnits - 4) - 4，且對齊偶數 → 前導空白約為 start/2
  const raw = Math.max(64, Math.round(totalW * 1.22));
  const lineUnits = raw % 2 === 0 ? raw : raw + 1;
  const center = 0.125 * lineUnits;
  let expectedStart = Math.round(center - 8 / 2) - SIGNATURE_LABEL_LEFT_SHIFT_UNITS;
  if (expectedStart % 2 === 1) expectedStart -= 1;
  expectedStart = Math.max(0, expectedStart);
  assert.equal(fourLead, expectedStart / 2, `教學組長前導空白應為 ${expectedStart / 2}`);

  console.log('regression-excel-signature-labels: ok');
}

run();
