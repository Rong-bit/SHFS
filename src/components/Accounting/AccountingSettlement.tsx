import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { displayTeacherTitle, SCHOOL_DEPARTMENTS } from '../../utils/schoolDepartments';
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
  Filter
} from 'lucide-react';

export const AccountingSettlement: React.FC = () => {
  const { systemConfig, calculateMonthlySettlement } = useApp();
  const [selectedMonth, setSelectedMonth] = useState<number>(systemConfig.currentMonth);
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');

  const settlements = calculateMonthlySettlement(selectedMonth);

  const filteredSettlements = settlements.filter((s) => {
    if (departmentFilter === 'all') return true;
    return s.department === departmentFilter;
  });

  // Calculate totals
  const totalOverloadAmount = filteredSettlements.reduce((acc, curr) => acc + curr.monthlyOverloadAmount, 0);
  const totalPublicSubAmount = filteredSettlements.reduce((acc, curr) => acc + curr.publicSubstituteAmount, 0);
  const totalPrivateSubAmount = filteredSettlements.reduce((acc, curr) => acc + curr.privateSubstituteEarnAmount, 0);
  const totalNetPayable = filteredSettlements.reduce((acc, curr) => acc + curr.netPayableAmount, 0);
  const warningCount = filteredSettlements.filter((s) => s.isOverLimit).length;

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
      '每週超鐘點節數': s.weeklyOverloadPeriods,
      [`月超鐘點費 (${systemConfig.weeksInMonth}週×${systemConfig.dayHourlyRate}元)`]: s.monthlyOverloadAmount,
      '公費代課節數': s.publicSubstitutePeriods,
      '公費代課金額': s.publicSubstituteAmount,
      '自費代課(受領)金額': s.privateSubstituteEarnAmount,
      '事病假代課(扣款)金額': s.privateLeaveDeductionAmount,
      '應領課點費總額 (元)': s.netPayableAmount,
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
      '每週超鐘點節數': 0 as any,
      [`月超鐘點費 (${systemConfig.weeksInMonth}週×${systemConfig.dayHourlyRate}元)`]: totalOverloadAmount,
      '公費代課節數': 0 as any,
      '公費代課金額': totalPublicSubAmount,
      '自費代課(受領)金額': totalPrivateSubAmount,
      '事病假代課(扣款)金額': 0 as any,
      '應領課點費總額 (元)': totalNetPayable,
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
      { wch: 12 }, // 公費節數
      { wch: 12 }, // 公費金額
      { wch: 18 }, // 自費受領
      { wch: 18 }, // 事病假扣款
      { wch: 18 }, // 應發總額
      { wch: 16 }, // 兼代課估算
      { wch: 22 }, // 9節檢核
    ];
    worksheet['!cols'] = colWidths;

    XLSX.utils.book_append_sheet(workbook, worksheet, `${selectedMonth}月份課點費結算清冊`);

    const fileName = `國立高職_${systemConfig.academicYear}學年第${systemConfig.semester}學期_${selectedMonth}月份_鐘點課點費主計結算清冊.xlsx`;
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
              主計出納處 · 每月教師超鐘點費與調代課鐘點費結算清冊
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            基準費率：日間部 <strong>{systemConfig.dayHourlyRate} 元/節</strong> ｜ 
            全月以 <strong>{systemConfig.weeksInMonth} 週</strong> 計 ｜ 
            兼代課法定上限 <strong>{systemConfig.maxWeeklyOverloadPeriods} 節/週</strong>
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
              <option value={9}>9 月份 (開學月)</option>
              <option value={10}>10 月份 (現行月)</option>
              <option value={11}>11 月份 (期中)</option>
              <option value={12}>12 月份</option>
              <option value={1}>1 月份 (期末)</option>
            </select>
          </div>

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
            專任、導師、主任基本節數超額合計
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
            公假、公差、競賽指導公費派代
          </p>
        </div>

        {/* Total Private Substitution */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-xs font-bold text-amber-600 uppercase tracking-wider flex items-center justify-between">
            <span>自費代課轉發款</span>
            <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded font-bold">代扣代發</span>
          </div>
          <div className="text-2xl font-extrabold text-amber-700 mt-2">
            ${totalPrivateSubAmount.toLocaleString()}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            由事病假教師自費扣除轉發
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
                <th className="p-3 text-center">每週超額</th>
                <th className="p-3 text-right">月超鐘點費 (4週)</th>
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
                <td className="p-3 text-right font-mono text-amber-400">
                  ${totalOverloadAmount.toLocaleString()}
                </td>
                <td className="p-3 text-center text-blue-300">
                  ${totalPublicSubAmount.toLocaleString()}
                </td>
                <td className="p-3 text-center text-emerald-300">
                  ${totalPrivateSubAmount.toLocaleString()}
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

    </div>
  );
};
