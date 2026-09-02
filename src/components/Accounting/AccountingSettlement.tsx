import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { calendarYearForSettlementMonth, displayTeacherTitle, expectedRocAcademicYear, SCHOOL_DEPARTMENTS } from '../../utils/schoolDepartments';
import { formatPayrollMonthRangeLabel } from '../../utils/overloadPayrollRegister';
import { nonTeachingDateSet } from '../../utils/holidays';
import { countSalaryCodes } from '../../utils/salaryCodes';
import * as XLSX from 'xlsx';
import { 
  Calculator, 
  Download, 
  AlertTriangle, 
  CheckCircle2, 
  Coins, 
  FileSpreadsheet, 
  Building, 
  Info,
  Calendar,
  Filter,
  Printer,
} from 'lucide-react';
import { OverloadPayrollRegisterModal } from './OverloadPayrollRegisterModal';
import { SubstitutePayrollRegisterModal } from './SubstitutePayrollRegisterModal';
import { CounselingPayrollRegisterModal } from './CounselingPayrollRegisterModal';
import { ActingHomeroomPayrollRegisterModal } from './ActingHomeroomPayrollRegisterModal';

export const AccountingSettlement: React.FC = () => {
  const { systemConfig, calculateMonthlySettlement } = useApp();
  const calendarMonth = new Date().getMonth() + 1;
  const [selectedMonth, setSelectedMonth] = useState<number>(calendarMonth);
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [showPayrollRegister, setShowPayrollRegister] = useState(false);
  const [showSubstitutePayrollRegister, setShowSubstitutePayrollRegister] = useState(false);
  const [showCounselingPayrollRegister, setShowCounselingPayrollRegister] = useState(false);
  const [showActingHomeroomPayrollRegister, setShowActingHomeroomPayrollRegister] = useState(false);
  const settlementHolidaySet = nonTeachingDateSet(systemConfig.nonTeachingDays);
  const settlementYear = calendarYearForSettlementMonth(
    selectedMonth,
    new Date(),
    systemConfig.academicYear
  );
  const expectedAy = expectedRocAcademicYear();
  const academicYearStale =
    Number(systemConfig.academicYear) < expectedAy &&
    !Number.isNaN(Number(systemConfig.academicYear));

  const settlements = calculateMonthlySettlement(selectedMonth);

  const filteredSettlements = settlements.filter((s) => {
    if (departmentFilter === 'all') return true;
    return s.department === departmentFilter;
  });

  // Calculate totals
  const totalOverloadAmount = filteredSettlements.reduce((acc, curr) => acc + curr.monthlyOverloadAmount, 0);
  const totalCounselingAmount = filteredSettlements.reduce((acc, curr) => acc + curr.monthlyCounselingAmount, 0);
  const totalPublicSubAmount = filteredSettlements.reduce((acc, curr) => acc + curr.publicSubstituteAmount, 0);
  const totalPrivateSubAmount = filteredSettlements.reduce((acc, curr) => acc + curr.privateSubstituteEarnAmount, 0);
  const totalPrivateLeaveDeduction = filteredSettlements.reduce(
    (acc, curr) => acc + curr.privateLeaveDeductionAmount,
    0
  );
  const totalNetPayable = filteredSettlements.reduce((acc, curr) => acc + curr.netPayableAmount, 0);
  const warningCount = filteredSettlements.filter((s) => s.isOverLimit).length;
  const salaryCodeCount = countSalaryCodes(systemConfig);

  // Export to Excel (.xlsx) using SheetJS
  const handleExportExcel = () => {
    const workbook = XLSX.utils.book_new();

    // Prepare table rows for Excel
    const excelRows = filteredSettlements.map((s, index) => ({
      '序號': index + 1,
      '教師姓名': s.teacherName,
      '科別': s.department,
      '職務': displayTeacherTitle(s),
      '基本授課節數 (節/週)': s.basePeriods,
      '本學期排定節數不含團體活動 (節/週)': s.weeklyActualPeriods,
      '每週兼課（超鐘點）節數': s.weeklyOverloadPeriods,
      '每週第八節課輔節數': s.weeklyCounselingPeriods,
      [`月課輔費 (依該月實際日數×${systemConfig.nightHourlyRate}元)`]: s.monthlyCounselingAmount,
      [`月超鐘點費 (依該月週一至週五實際日數×${systemConfig.dayHourlyRate}元)`]: s.monthlyOverloadAmount,
      '公費代課節數': s.publicSubstitutePeriods,
      '公費代課金額': s.publicSubstituteAmount,
      '自費代課(受領)金額': s.privateSubstituteEarnAmount,
      '事病假代課(扣款)金額': s.privateLeaveDeductionAmount,
      '應領鐘點費總額 (元)': s.netPayableAmount,
      '每週兼代課估算 (節)': s.totalSubstituteWeeklyEstimated.toFixed(1),
      '兼代課9節上限檢核': s.isOverLimit ? '【警示】超過9節法定上限' : '符合法規',
    }));

    // Add summary row
    excelRows.push({
      '序號': '合計' as any,
      '教師姓名': `共 ${filteredSettlements.length} 位教師`,
      '科別': '',
      '職務': '',
      '基本授課節數 (節/週)': 0 as any,
      '本學期排定節數不含團體活動 (節/週)': 0 as any,
      '每週兼課（超鐘點）節數': 0 as any,
      '每週第八節課輔節數': 0 as any,
      [`月課輔費 (依該月實際日數×${systemConfig.nightHourlyRate}元)`]: totalCounselingAmount,
      [`月超鐘點費 (依該月週一至週五實際日數×${systemConfig.dayHourlyRate}元)`]: totalOverloadAmount,
      '公費代課節數': 0 as any,
      '公費代課金額': totalPublicSubAmount,
      '自費代課(受領)金額': totalPrivateSubAmount,
      '事病假代課(扣款)金額': totalPrivateLeaveDeduction,
      '應領鐘點費總額 (元)': totalNetPayable,
      '每週兼代課估算 (節)': '' as any,
      '兼代課9節上限檢核': warningCount > 0 ? `共 ${warningCount} 人超額警示` : '全數合規',
    });

    const worksheet = XLSX.utils.json_to_sheet(excelRows);

    // Auto-fit column widths
    const colWidths = [
      { wch: 6 }, // 序號
      { wch: 14 }, // 姓名
      { wch: 12 }, // 科別
      { wch: 10 }, // 職務
      { wch: 16 }, // 基本節數
      { wch: 16 }, // 排定節數
      { wch: 14 }, // 每週超鐘點
      { wch: 22 }, // 月超鐘點費
      { wch: 16 }, // 課輔節數
      { wch: 22 }, // 月課輔費
      { wch: 12 }, // 公費節數
      { wch: 12 }, // 公費金額
      { wch: 18 }, // 自費受領
      { wch: 18 }, // 事病假扣款
      { wch: 18 }, // 應發總額
      { wch: 16 }, // 兼代課估算
      { wch: 22 }, // 9節檢核
    ];
    worksheet['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(workbook, worksheet, `${selectedMonth}月份鐘點費結算清冊`);

    const fileName = `國立高職_${systemConfig.academicYear}學年第${systemConfig.semester}學期_${selectedMonth}月份_鐘點費主計結算清冊.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  return (
    <div className="space-y-6">
      
      {/* Top Banner & Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <Calculator className="w-6 h-6 text-emerald-600" />
            <h2 className="text-lg font-bold text-slate-900">
              出納組 · 每月教師超鐘點費與調代課鐘點費結算清冊
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            基準費率：日間部 <strong>{systemConfig.dayHourlyRate} 元/節</strong> ｜
            第八節課輔 <strong>{systemConfig.nightHourlyRate} 元/節</strong> ｜ 
            本月依 <strong>{formatPayrollMonthRangeLabel(selectedMonth, settlementYear, systemConfig.weeksInMonth ?? 4)}</strong>
            {academicYearStale && (
              <span className="block mt-1 text-amber-800">
                系統學年度仍為 {systemConfig.academicYear}（建議 {expectedAy}），結算西元年已自動以西曆校正；請至「標準與參數 → 學校與行事曆」更新學年度以免單號／報表標題混淆。
              </span>
            )}
            計，並已扣除系統設定之放假日 ｜ 
            兼代課法定上限 <strong>{systemConfig.maxWeeklyOverloadPeriods} 節/週</strong>
            <span className="block mt-1 text-slate-600">
              代課費規則（依薪資對照表）：公假／公差、婚假、娩假／陪產假、身心調適假，以及<strong>事假學年第 8 天起</strong>、<strong>病假連續 3 日起</strong>，由學校公費支應（代課清冊）；
              未達門檻之事病假<strong>不入清冊</strong>，請假人自行與代課教師約定。身心調適假超鐘點<strong>不扣</strong>兼課費。
            </span>
          </p>
        </div>

        {/* Action: Month Select & Excel Export */}
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-1.5 bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1 text-xs">
            <Calendar className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-slate-600 font-medium">結算月份：</span>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="bg-transparent font-bold text-slate-900 focus:outline-none"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => (
                <option key={m} value={m}>
                  {m} 月份{m === calendarMonth ? ' (現行月)' : ''}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => setShowCounselingPayrollRegister(true)}
            className="flex items-center space-x-1.5 px-4 py-2 bg-white hover:bg-slate-50 text-slate-800 font-bold text-xs rounded-lg border border-slate-300 shadow-sm transition active:scale-95"
          >
            <Printer className="w-4 h-4 text-indigo-600" />
            <span>課輔印領清冊</span>
          </button>

          <button
            type="button"
            onClick={() => setShowActingHomeroomPayrollRegister(true)}
            className="flex items-center space-x-1.5 px-4 py-2 bg-white hover:bg-slate-50 text-slate-800 font-bold text-xs rounded-lg border border-slate-300 shadow-sm transition active:scale-95"
          >
            <Printer className="w-4 h-4 text-violet-600" />
            <span>代導師印領清冊</span>
          </button>

          <button
            type="button"
            onClick={() => setShowSubstitutePayrollRegister(true)}
            className="flex items-center space-x-1.5 px-4 py-2 bg-white hover:bg-slate-50 text-slate-800 font-bold text-xs rounded-lg border border-slate-300 shadow-sm transition active:scale-95"
          >
            <Printer className="w-4 h-4 text-blue-600" />
            <span>代課印領清冊</span>
          </button>

          <button
            type="button"
            onClick={() => setShowPayrollRegister(true)}
            className="flex items-center space-x-1.5 px-4 py-2 bg-white hover:bg-slate-50 text-slate-800 font-bold text-xs rounded-lg border border-slate-300 shadow-sm transition active:scale-95"
          >
            <Printer className="w-4 h-4 text-slate-600" />
            <span>兼課印領清冊</span>
          </button>

          <button
            id="btn-export-accounting-excel"
            onClick={handleExportExcel}
            className="flex items-center space-x-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg shadow-sm transition active:scale-95"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>匯出主計清冊 (Excel)</span>
          </button>
        </div>
      </div>

      {salaryCodeCount === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-xs text-amber-900">
          印領清冊的「薪資編號」請由<strong>系統管理員 → 師資名冊</strong>匯入；匯入後會永久保存，課表重新匯入不會清除。
        </div>
      )}

      {/* 行事曆情境計費說明 */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs text-slate-700 leading-relaxed space-y-2">
        <div className="flex items-start gap-2">
          <Info className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <div className="space-y-2">
            <p className="font-bold text-slate-900">月結算法與三種行事曆情境</p>
            <p>
              超鐘點／課輔＝週課表模板 × 各「星期–節次」月計次數（扣整天放假；半日停課僅扣薪資職稱「外聘人員」；暫時移課會把原日課表加到補課日，含週六）。
              再依請假日按日扣減。教師端「自行移課」仍會永久改週模板，連假補課請改用「學校與行事曆」的暫時移課。
            </p>
            <ul className="list-disc pl-4 space-y-1.5 text-slate-600">
              <li>
                <strong className="text-slate-800">下午佈置考場無課：</strong>
                「標準與參數 → 學校與行事曆」→「半日／節次停課」勾選下午節次；鐘點結算仍依原課表計次，僅薪資職稱「外聘人員」不發該節次。派代／衝堂檢核仍會排除停課節次。
              </li>
              <li>
                <strong className="text-slate-800">連假平日改某日補上：</strong>
                原日列入放假日 +「暫時移課／補課」（原日→補課日）；勿用自行移課永久改模板。
              </li>
              <li>
                <strong className="text-slate-800">週六補平日上課：</strong>
                同上，補課日可選週六，系統會加計原平日課表。
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Total Overload Amount */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            全校月超鐘點費總額
          </div>
          <div className="text-2xl font-extrabold text-slate-900 mt-2">
            ${totalOverloadAmount.toLocaleString()}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            課表「兼課」節數依該月實際日數計費（不含第八節課輔）
          </p>
        </div>

        {/* Total Public Substitution */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-xs font-bold text-blue-600 uppercase tracking-wider flex items-center justify-between">
            <span>公費派代支出</span>
            <span className="text-[10px] bg-blue-100 text-blue-800 px-1.5 py-0.2 rounded font-bold">學校支出</span>
          </div>
          <div className="text-2xl font-extrabold text-blue-700 mt-2">
            ${totalPublicSubAmount.toLocaleString()}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            公假、婚假、娩假／陪產假、身心調適假，及事假第 8 天起、病假連續 3 日起
          </p>
        </div>

        {/* Out-of-register self pay (always zero under new rules) */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs opacity-80">
          <div className="text-xs font-bold text-amber-600 uppercase tracking-wider flex items-center justify-between">
            <span>教師自理代課</span>
            <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded font-bold">不入清冊</span>
          </div>
          <div className="text-2xl font-extrabold text-amber-700 mt-2">
            —
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            未達門檻之事病假由請假人自行與代課教師約定，系統不代扣代發
          </p>
        </div>

        {/* Legal Overload Limit Warning */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
            <span>兼代課9節法規預警</span>
            {warningCount > 0 ? (
              <AlertTriangle className="w-4 h-4 text-rose-500" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            )}
          </div>
          <div className={`text-2xl font-extrabold mt-2 ${warningCount > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
            {warningCount} 位教師
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            {warningCount > 0 ? '已達或超過每週9節兼代課上限' : '全校兼代課節數符合教育部法規'}
          </p>
        </div>

      </div>

      {/* Main Accounting Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        
        {/* Table Filter Subheader */}
        <div className="bg-slate-50 px-6 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <span className="text-xs font-bold text-slate-700">科別過濾：</span>
            <div className="flex flex-wrap gap-1 text-xs">
              {['all', ...SCHOOL_DEPARTMENTS].map((d) => (
                <button
                  key={d}
                  onClick={() => setDepartmentFilter(d)}
                  className={`px-2.5 py-1 rounded-md transition ${
                    departmentFilter === d
                      ? 'bg-slate-900 text-white font-bold'
                      : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200'
                  }`}
                >
                  {d === 'all' ? '全部科別' : d}
                </button>
              ))}
            </div>
          </div>

          <span className="text-xs text-slate-500 font-medium">
            目前顯示：{filteredSettlements.length} 筆結算明細
          </span>
        </div>

        {/* Data Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-700 font-bold divide-x divide-slate-200 border-b border-slate-200">
                <th className="p-3 text-center w-12">序</th>
                <th className="p-3">教師姓名</th>
                <th className="p-3">科別 / 職務</th>
                <th className="p-3 text-center">基本節數</th>
                <th className="p-3 text-center">每週排定（不含團體活動）</th>
                <th className="p-3 text-center">每週超額（兼課）</th>
                <th className="p-3 text-center">每週課輔（第8節）</th>
                <th className="p-3 text-right">月課輔費</th>
                <th className="p-3 text-right">月超鐘點費</th>
                <th className="p-3 text-center">公費代課</th>
                <th className="p-3 text-center">自費代課(領/扣)</th>
                <th className="p-3 text-right bg-amber-50/50 text-amber-950 font-extrabold">應發總額</th>
                <th className="p-3 text-center">兼代課上限檢核</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredSettlements.map((s, idx) => (
                <tr
                  key={s.teacherId}
                  className={`divide-x divide-slate-100 hover:bg-slate-50/80 transition ${
                    s.isOverLimit ? 'bg-rose-50/30' : ''
                  }`}
                >
                  <td className="p-3 text-center text-slate-400 font-mono">{idx + 1}</td>
                  
                  <td className="p-3 font-bold text-slate-900">
                    {s.teacherName}
                  </td>

                  <td className="p-3 text-slate-700">
                    <span className="font-semibold">{s.department}</span>
                    <span className="ml-1 text-slate-500 text-[11px]">({displayTeacherTitle(s)})</span>
                  </td>

                  <td className="p-3 text-center font-medium text-slate-600">
                    {s.basePeriods} 節
                  </td>

                  <td className="p-3 text-center font-bold text-slate-800">
                    {s.weeklyActualPeriods} 節
                  </td>

                  <td className="p-3 text-center font-bold">
                    {s.weeklyOverloadPeriods > 0 ? (
                      <span className="text-amber-600">+{s.weeklyOverloadPeriods} 節</span>
                    ) : (
                      <span className="text-slate-400">0</span>
                    )}
                  </td>

                  <td className="p-3 text-center font-bold">
                    {s.weeklyCounselingPeriods > 0 ? (
                      <span className="text-indigo-600">{s.weeklyCounselingPeriods} 節</span>
                    ) : (
                      <span className="text-slate-400">0</span>
                    )}
                  </td>

                  <td className="p-3 text-right font-mono font-bold text-indigo-800">
                    ${s.monthlyCounselingAmount.toLocaleString()}
                  </td>

                  <td className="p-3 text-right font-mono font-bold text-slate-900">
                    ${s.monthlyOverloadAmount.toLocaleString()}
                  </td>

                  <td className="p-3 text-center">
                    {s.publicSubstitutePeriods > 0 ? (
                      <span className="px-2 py-0.5 bg-blue-50 text-blue-700 font-bold rounded">
                        +{s.publicSubstitutePeriods}節 (${s.publicSubstituteAmount})
                      </span>
                    ) : (
                      <span className="text-slate-300">-</span>
                    )}
                  </td>

                  <td className="p-3 text-center font-mono">
                    <div className="space-y-0.5">
                      {s.privateSubstituteEarnPeriods > 0 && (
                        <div className="text-emerald-700 font-bold">
                          +領 ${s.privateSubstituteEarnAmount}
                        </div>
                      )}
                      {s.privateLeaveDeductionPeriods > 0 && (
                        <div className="text-rose-600 font-bold">
                          -扣 ${s.privateLeaveDeductionAmount}
                        </div>
                      )}
                      {s.privateSubstituteEarnPeriods === 0 && s.privateLeaveDeductionPeriods === 0 && (
                        <span className="text-slate-300">-</span>
                      )}
                    </div>
                  </td>

                  <td className="p-3 text-right font-mono font-extrabold text-sm text-slate-950 bg-amber-50/50">
                    ${s.netPayableAmount.toLocaleString()}
                  </td>

                  <td className="p-3 text-center">
                    {s.isOverLimit ? (
                      <span className="inline-flex items-center space-x-1 px-2 py-0.5 bg-rose-100 text-rose-700 border border-rose-300 rounded font-bold text-[11px]">
                        <AlertTriangle className="w-3 h-3" />
                        <span>超額預警 ({s.totalSubstituteWeeklyEstimated.toFixed(1)}節)</span>
                      </span>
                    ) : (
                      <span className="text-emerald-700 text-[11px] font-medium">
                        ✓ 合規 ({s.totalSubstituteWeeklyEstimated.toFixed(1)}節)
                      </span>
                    )}
                  </td>
                </tr>
              ))}

              {/* Summary Total Row */}
              <tr className="bg-slate-900 text-white font-bold divide-x divide-slate-800">
                <td colSpan={6} className="p-3 text-right">
                  總計結算金額 (共 {filteredSettlements.length} 位教師)
                </td>
                <td className="p-3 text-center text-indigo-300">—</td>
                <td className="p-3 text-right font-mono text-indigo-300">
                  ${totalCounselingAmount.toLocaleString()}
                </td>
                <td className="p-3 text-right font-mono text-amber-400">
                  ${totalOverloadAmount.toLocaleString()}
                </td>
                <td className="p-3 text-center text-blue-300">
                  ${totalPublicSubAmount.toLocaleString()}
                </td>
                <td className="p-3 text-center text-emerald-300">
                  <div className="space-y-0.5 text-[11px]">
                    <div>+領 ${totalPrivateSubAmount.toLocaleString()}</div>
                    <div className="text-rose-300">-扣 ${totalPrivateLeaveDeduction.toLocaleString()}</div>
                  </div>
                </td>
                <td className="p-3 text-right font-mono text-base text-amber-300 bg-slate-950">
                  ${totalNetPayable.toLocaleString()}
                </td>
                <td className="p-3 text-center text-xs">
                  {warningCount > 0 ? (
                    <span className="text-rose-400 font-bold">{warningCount} 人超額預警</span>
                  ) : (
                    <span className="text-emerald-400">全數合規</span>
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {showCounselingPayrollRegister && (
        <CounselingPayrollRegisterModal
          month={selectedMonth}
          settlements={filteredSettlements}
          onClose={() => setShowCounselingPayrollRegister(false)}
        />
      )}

      {showActingHomeroomPayrollRegister && (
        <ActingHomeroomPayrollRegisterModal
          month={selectedMonth}
          onClose={() => setShowActingHomeroomPayrollRegister(false)}
        />
      )}

      {showSubstitutePayrollRegister && (
        <SubstitutePayrollRegisterModal
          month={selectedMonth}
          settlements={filteredSettlements}
          onClose={() => setShowSubstitutePayrollRegister(false)}
        />
      )}

      {showPayrollRegister && (
        <OverloadPayrollRegisterModal
          month={selectedMonth}
          settlements={filteredSettlements}
          onClose={() => setShowPayrollRegister(false)}
        />
      )}

    </div>
  );
};
