import React from 'react';
import { useApp } from '../../context/AppContext';
import { ModalShell } from '../Common/ModalShell';
import { Printer, X, FileSpreadsheet } from 'lucide-react';
import {
  calendarYearForSettlementMonth,
  settlementWeeksForMonth,
} from '../../utils/schoolDepartments';
import { nonTeachingDateSet } from '../../utils/holidays';
import {
  buildSubstitutePayrollRows,
  formatPayrollMonthRangeLabel,
  formatRocYear,
  paginateSubstitutePayroll,
  type SubstitutePayrollTotals,
} from '../../utils/substitutePayrollRegister';
import { exportSubstitutePayrollExcel } from '../../utils/payrollRegisterExcel';
import { PayrollRegisterPrintStyles } from './PayrollRegisterPrintStyles';
import type { MonthlyTeacherSettlement } from '../../types';

interface SubstitutePayrollRegisterModalProps {
  month: number;
  settlements: MonthlyTeacherSettlement[];
  onClose: () => void;
}

const TotalsCells: React.FC<{
  totals: SubstitutePayrollTotals;
  rateLabel: string;
  label: string;
  pageLabel?: string;
}> = ({ totals, rateLabel, label, pageLabel }) => (
  <tr className="font-bold bg-slate-100 border-t-2 border-slate-400">
    <td className="border border-slate-400 px-2 py-1.5 text-center" colSpan={2}>
      {label}
    </td>
    <td className="border border-slate-400 px-2 py-1.5 text-center">{totals.substitutePeriods}</td>
    <td className="border border-slate-400 px-2 py-1.5 text-center font-mono">
      {rateLabel || ''}
    </td>
    <td className="border border-slate-400 px-2 py-1.5 text-right font-mono">
      {totals.amount.toLocaleString()}
    </td>
    <td className="border border-slate-400 px-2 py-1.5 text-right text-[10px] text-slate-600">
      {pageLabel || ''}
    </td>
  </tr>
);

export const SubstitutePayrollRegisterModal: React.FC<SubstitutePayrollRegisterModalProps> = ({
  month,
  settlements,
  onClose,
}) => {
  const { systemConfig, requests } = useApp();
  const holidaySet = nonTeachingDateSet(systemConfig.nonTeachingDays);
  const calendarOpts = {
    holidaySet,
    temporaryMoves: systemConfig.temporaryScheduleMoves || [],
    partialStops: systemConfig.partialNonTeachingDays || [],
  };
  const settlementYear = calendarYearForSettlementMonth(
    month,
    new Date(),
    systemConfig.academicYear
  );
  const weeks = settlementWeeksForMonth(
    month,
    new Date(),
    holidaySet,
    systemConfig.academicYear,
    calendarOpts
  );
  const monthRangeLabel = formatPayrollMonthRangeLabel(month, settlementYear, weeks);
  const rocYear = formatRocYear(settlementYear);

  const rows = buildSubstitutePayrollRows(
    settlements,
    systemConfig,
    requests,
    month,
    settlementYear
  );
  const { pages, grandTotal, grandTotalRateLabel } = paginateSubstitutePayroll(rows);
  const totalPages = Math.max(pages.length, 1);

  const title = `${systemConfig.schoolName}日校${rocYear}年${month}月份代課鐘點費印領清冊`;

  const handlePrint = () => window.print();

  const handleExportExcel = () => {
    if (pages.length === 0) return;
    exportSubstitutePayrollExcel(
      title,
      monthRangeLabel,
      pages,
      grandTotal,
      grandTotalRateLabel,
      `${systemConfig.schoolName}_${rocYear}年${month}月_代課鐘點費印領清冊.xlsx`
    );
  };

  return (
    <ModalShell
      scroll="none"
      panelClassName="bg-white rounded-xl shadow-2xl max-w-5xl w-full border border-slate-200 overflow-hidden my-2 max-h-[95vh] flex flex-col print:shadow-none print:rounded-none print:max-w-none print:w-full print:border-0 print:my-0"
      backdropClassName="bg-slate-900/70 backdrop-blur-xs print:hidden"
    >
      <div className="print:hidden bg-slate-800 text-white px-5 py-3.5 flex items-center justify-between shrink-0">
        <span className="font-semibold text-sm">代課鐘點費印領清冊（每頁小計 · 末頁合計 · 可列印／匯出 Excel）</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportExcel}
            disabled={pages.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-lg text-xs font-bold"
          >
            <FileSpreadsheet className="w-4 h-4" />
            匯出 Excel
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-900 rounded-lg text-xs font-bold"
          >
            <Printer className="w-4 h-4" />
            列印
          </button>
          <button type="button" onClick={onClose} className="p-1.5 hover:bg-slate-700 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="payroll-register-print-root overflow-y-auto flex-1 p-4 print:p-0 print:overflow-visible bg-slate-100 print:bg-white">
        {pages.length === 0 ? (
          <div className="bg-white rounded-xl p-8 text-center text-slate-500 text-sm">
            本月無代課鐘點費資料。請確認已有核准且指定代課教師之請假派代單。
          </div>
        ) : (
          pages.map((page, pageIdx) => (
            <div
              key={page.pageIndex}
              className="payroll-register-print-page bg-white mb-6 print:mb-0 shadow-sm border border-slate-200 print:border-0 print:shadow-none p-4 print:p-0 relative"
            >
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.06] print:opacity-[0.08]">
                <span className="text-6xl font-black text-slate-500">第 {page.pageIndex} 頁</span>
              </div>

              <h1 className="payroll-register-print-title text-center text-base font-bold tracking-wide mb-3 relative">
                {title}
              </h1>

              <table className="payroll-register-print-table w-full border-collapse text-xs relative">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="border border-slate-400 px-2 py-1.5 w-[80px]">薪資編號</th>
                    <th className="border border-slate-400 px-2 py-1.5 w-[88px]">教師姓名</th>
                    <th className="border border-slate-400 px-2 py-1.5 w-[72px]">代課節數</th>
                    <th className="border border-slate-400 px-2 py-1.5 w-[72px]">每節金額</th>
                    <th className="border border-slate-400 px-2 py-1.5 w-[80px]">實發金額</th>
                    <th className="border border-slate-400 px-2 py-1.5 min-w-[200px]">
                      備註
                      {pageIdx === 0 && (
                        <div className="font-normal text-[10px] mt-0.5 leading-tight">{monthRangeLabel}</div>
                      )}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {page.rows.map((row) => (
                    <tr key={row.teacherId} className="hover:bg-slate-50/50">
                      <td className="border border-slate-300 px-2 py-1 font-mono text-center">
                        {row.salaryCode || '—'}
                      </td>
                      <td className="border border-slate-300 px-2 py-1 text-center font-medium">
                        {row.teacherName}
                      </td>
                      <td className="border border-slate-300 px-2 py-1 text-center font-semibold">
                        {row.substitutePeriods}
                      </td>
                      <td className="border border-slate-300 px-2 py-1 text-center font-mono">
                        {row.ratePerPeriod.toLocaleString()}
                      </td>
                      <td className="border border-slate-300 px-2 py-1 text-right font-mono">
                        {row.amount.toLocaleString()}
                      </td>
                      <td className="border border-slate-300 px-2 py-1 text-[10px] leading-snug align-top">
                        {row.remarks}
                      </td>
                    </tr>
                  ))}
                  <TotalsCells
                    totals={page.subtotal}
                    rateLabel={page.subtotalRateLabel}
                    label="小計"
                    pageLabel={`${page.pageIndex} of ${totalPages}`}
                  />
                  {pageIdx === pages.length - 1 && (
                    <TotalsCells
                      totals={grandTotal}
                      rateLabel={grandTotalRateLabel}
                      label="合計"
                    />
                  )}
                </tbody>
              </table>

              <div className="payroll-register-print-signature mt-8 print:mt-8 grid grid-cols-4 gap-4 text-xs text-center text-slate-700 relative">
                <div>
                  <div className="border-t border-slate-400 pt-1 mt-10">教學組長</div>
                </div>
                <div>
                  <div className="border-t border-slate-400 pt-1 mt-10">出納組</div>
                </div>
                <div>
                  <div className="border-t border-slate-400 pt-1 mt-10">會計室</div>
                </div>
                <div>
                  <div className="border-t border-slate-400 pt-1 mt-10">校長</div>
                </div>
              </div>
              <div className="mt-4 text-xs text-slate-600 print:mt-6 relative">
                <span className="inline-block border-t border-slate-400 pt-1 pr-16">教務主任</span>
              </div>
            </div>
          ))
        )}
      </div>

      <PayrollRegisterPrintStyles />
    </ModalShell>
  );
};
