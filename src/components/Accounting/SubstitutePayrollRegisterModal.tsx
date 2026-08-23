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
  isBlankPayrollRow,
  paginateSubstitutePayroll,
  type SubstitutePayrollTotals,
} from '../../utils/substitutePayrollRegister';
import { exportSubstitutePayrollExcel } from '../../utils/payrollRegisterExcel';
import { PayrollRegisterPrintStyles, CELL_CENTER } from './PayrollRegisterPrintStyles';
import { PayrollRegisterSignatureBlock } from './PayrollRegisterSignatureBlock';
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
    <td className="border border-slate-400 px-2 py-1.5" style={CELL_CENTER} colSpan={2}>
      {label}
    </td>
    <td className="border border-slate-400 px-2 py-1.5" style={CELL_CENTER}>{totals.substitutePeriods}</td>
    <td className="border border-slate-400 px-2 py-1.5 font-mono" style={CELL_CENTER}>
      {rateLabel || ''}
    </td>
    <td className="border border-slate-400 px-2 py-1.5 font-mono" style={CELL_CENTER}>
      {totals.amount.toLocaleString()}
    </td>
    <td className="border border-slate-400 px-2 py-1.5 text-[10px] text-slate-600" style={CELL_CENTER}>
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

  const handleExportExcel = async () => {
    if (pages.length === 0) return;
    await exportSubstitutePayrollExcel(
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
      panelClassName="bg-white rounded-xl shadow-2xl max-w-5xl w-full border border-slate-200 overflow-hidden my-2 max-h-[95vh] flex flex-col print:shadow-none print:rounded-none print:max-w-none print:w-full print:border-0 print:my-0 print:max-h-none print:overflow-visible print:h-auto"
      backdropClassName="bg-slate-900/70 backdrop-blur-xs"
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
        <PayrollRegisterPrintStyles />
        {pages.length === 0 ? (
          <div className="bg-white rounded-xl p-8 text-center text-slate-500 text-sm">
            本月無代課鐘點費資料。請確認已有核准且指定代課教師之請假派代單。
          </div>
        ) : (
          <>
            {pages.map((page, pageIdx) => (
              <React.Fragment key={page.pageIndex}>
                <div
                  className={`payroll-register-print-page bg-white mb-6 print:mb-0 shadow-sm border border-slate-200 print:border-0 print:shadow-none p-4 print:p-0 relative${
                    pageIdx < pages.length - 1 ? ' payroll-register-print-page--break-after' : ''
                  }${pageIdx === pages.length - 1 ? ' payroll-register-print-page--last' : ''}`}
                >
                  <div className="payroll-register-print-watermark pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.06] print:hidden">
                    <span className="text-6xl font-black text-slate-500">第 {page.pageIndex} 頁</span>
                  </div>

                  <h1 className="payroll-register-print-title text-center text-base font-bold tracking-wide mb-3 relative">
                    {title}
                  </h1>

                  <table className="payroll-register-print-table w-full border-collapse text-xs relative">
                    <colgroup>
                      <col className="w-[12%]" />
                      <col className="w-[12%]" />
                      <col className="w-[10%]" />
                      <col className="w-[10%]" />
                      <col className="w-[12%]" />
                      <col className="w-[44%]" />
                    </colgroup>
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="border border-slate-400 px-2 py-1.5" style={CELL_CENTER}>薪資編號</th>
                        <th className="border border-slate-400 px-2 py-1.5" style={CELL_CENTER}>教師姓名</th>
                        <th className="border border-slate-400 px-2 py-1.5" style={CELL_CENTER}>代課節數</th>
                        <th className="border border-slate-400 px-2 py-1.5" style={CELL_CENTER}>每節金額</th>
                        <th className="border border-slate-400 px-2 py-1.5" style={CELL_CENTER}>實發金額</th>
                        <th className="border border-slate-400 px-2 py-1.5 payroll-register-remarks-col" style={CELL_CENTER}>
                          備註
                          {pageIdx === 0 && (
                            <div className="font-normal text-[10px] mt-0.5 leading-tight">{monthRangeLabel}</div>
                          )}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {page.rows.map((row, rowIdx) => {
                        const blank = isBlankPayrollRow(row.teacherId);
                        return (
                          <tr
                            key={`${page.pageIndex}-${row.teacherId}-${rowIdx}`}
                            className={`hover:bg-slate-50/50 ${blank ? 'payroll-register-blank-row' : ''}`}
                          >
                            <td className="border border-slate-300 px-2 py-1 font-mono" style={CELL_CENTER}>
                              {blank ? '\u00a0' : row.salaryCode || '—'}
                            </td>
                            <td className="border border-slate-300 px-2 py-1 font-medium" style={CELL_CENTER}>
                              {blank ? '' : row.teacherName}
                            </td>
                            <td className="border border-slate-300 px-2 py-1 font-semibold" style={CELL_CENTER}>
                              {blank ? '' : row.substitutePeriods || ''}
                            </td>
                            <td className="border border-slate-300 px-2 py-1 font-mono" style={CELL_CENTER}>
                              {blank ? '' : row.ratePerPeriod.toLocaleString()}
                            </td>
                            <td className="border border-slate-300 px-2 py-1 font-mono" style={CELL_CENTER}>
                              {blank ? '' : row.amount.toLocaleString()}
                            </td>
                            <td
                              className="border border-slate-300 px-2 py-1 text-[10px] leading-snug payroll-register-remarks-col"
                              style={CELL_CENTER}
                            >
                              {blank ? '' : row.remarks}
                            </td>
                          </tr>
                        );
                      })}
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
                  {pageIdx === pages.length - 1 && (
                    <PayrollRegisterSignatureBlock className="relative" />
                  )}
                </div>
                {pageIdx < pages.length - 1 && (
                  <div className="payroll-register-page-break print:hidden" aria-hidden>
                    換頁（小計後）
                  </div>
                )}
              </React.Fragment>
            ))}
          </>
        )}
      </div>
    </ModalShell>
  );
};
