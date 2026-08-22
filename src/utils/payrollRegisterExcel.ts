import * as XLSX from 'xlsx';
import type { CounselingPayrollPage } from './counselingPayrollRegister';
import type { OverloadPayrollPage } from './overloadPayrollRegister';
import type { SubstitutePayrollPage } from './substitutePayrollRegister';

type Aoa = (string | number)[][];

const blank = (): Aoa => [['']];

const pushSignatureBlock = (rows: Aoa) => {
  rows.push(['']);
  rows.push(['教學組長', '', '', '出納組', '', '', '會計室', '', '', '校長']);
  rows.push(['']);
  rows.push(['教務主任']);
};

function writeWorkbook(fileName: string, sheetName: string, aoa: Aoa) {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = aoa[0]?.map((_, i) => ({
    wch: i === aoa[0].length - 1 ? 48 : 12,
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, fileName);
}

export function exportOverloadPayrollExcel(
  title: string,
  monthRangeLabel: string,
  weekRound: number,
  pages: OverloadPayrollPage[],
  grandTotal: OverloadPayrollPage['subtotal'],
  fileName: string
) {
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
  const rows: Aoa = [];
  const totalPages = pages.length;

  pages.forEach((page, idx) => {
    if (idx > 0) rows.push(...blank(), ...blank());
    rows.push([title]);
    rows.push(headers);
    page.rows.forEach((r) => {
      rows.push([
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
    rows.push([
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
      rows.push([
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
      pushSignatureBlock(rows);
    }
  });

  writeWorkbook(fileName, '兼課印領清冊', rows);
}

export function exportSubstitutePayrollExcel(
  title: string,
  monthRangeLabel: string,
  pages: SubstitutePayrollPage[],
  grandTotal: SubstitutePayrollPage['subtotal'],
  grandTotalRateLabel: string,
  fileName: string
) {
  const headers = ['薪資編號', '教師姓名', '代課節數', '每節金額', '實發金額', `備註 ${monthRangeLabel}`];
  const rows: Aoa = [];
  const totalPages = pages.length;

  pages.forEach((page, idx) => {
    if (idx > 0) rows.push(...blank(), ...blank());
    rows.push([title]);
    rows.push(headers);
    page.rows.forEach((r) => {
      rows.push([
        r.salaryCode || '—',
        r.teacherName,
        r.substitutePeriods,
        r.ratePerPeriod,
        r.amount,
        r.remarks,
      ]);
    });
    rows.push([
      '小計',
      '',
      page.subtotal.substitutePeriods,
      page.subtotalRateLabel || '',
      page.subtotal.amount,
      `${page.pageIndex} of ${totalPages}`,
    ]);
    if (idx === pages.length - 1) {
      rows.push(['合計', '', grandTotal.substitutePeriods, grandTotalRateLabel || '', grandTotal.amount, '']);
      pushSignatureBlock(rows);
    }
  });

  writeWorkbook(fileName, '代課印領清冊', rows);
}

export function exportCounselingPayrollExcel(
  title: string,
  monthRangeLabel: string,
  weekRound: number,
  pages: CounselingPayrollPage[],
  grandTotal: CounselingPayrollPage['subtotal'],
  grandTotalRateLabel: string,
  fileName: string
) {
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
  const rows: Aoa = [];
  const totalPages = pages.length;

  pages.forEach((page, idx) => {
    if (idx > 0) rows.push(...blank(), ...blank());
    rows.push([title]);
    rows.push(headers);
    page.rows.forEach((r) => {
      rows.push([
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
    rows.push([
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
      rows.push([
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
      pushSignatureBlock(rows);
    }
  });

  writeWorkbook(fileName, '課輔印領清冊', rows);
}
