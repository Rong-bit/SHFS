import React, { useState, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import {
  parseScheduleFile,
  generateTemplateExcel,
  exportScheduleToExcel,
  ImportParseResult,
  ParsedImportRow,
} from '../../utils/scheduleImporter';
import {
  Upload,
  FileSpreadsheet,
  Download,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Layers,
  Building2,
  User,
  Users,
  RefreshCw,
  Info,
  X,
  Sparkles,
  ArrowRight,
  FileText,
  HelpCircle,
  Terminal,
  Copy,
  Check,
  Filter,
  CheckCircle,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { ModalShell } from '../Common/ModalShell';

interface ScheduleImportModalProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export const ScheduleImportModal: React.FC<ScheduleImportModalProps> = ({
  isOpen: propIsOpen,
  onClose: propOnClose,
}) => {
  const {
    isImportModalOpen,
    setIsImportModalOpen,
    teachers,
    venues,
    sessions,
    systemConfig,
    importSchedule,
  } = useApp();

  const isOpen = propIsOpen !== undefined ? propIsOpen : isImportModalOpen;
  const handleClose = () => {
    if (propOnClose) propOnClose();
    setIsImportModalOpen(false);
    resetState();
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  // State
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [parseResult, setParseResult] = useState<ImportParseResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importMode, setImportMode] = useState<'overwrite' | 'append'>('overwrite');
  const [clearRequestsOnOverwrite, setClearRequestsOnOverwrite] = useState(true);
  const [isSuccess, setIsSuccess] = useState(false);
  const [successReport, setSuccessReport] = useState<{
    added: number;
    updated: number;
    teachers: number;
    venues: number;
  } | null>(null);

  // Filter in preview
  const [previewFilter, setPreviewFilter] = useState<'all' | 'practical' | 'warnings' | 'errors'>('all');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [copiedConsoleReport, setCopiedConsoleReport] = useState(false);
  const [isConsoleExpanded, setIsConsoleExpanded] = useState(true);
  const [consoleTab, setConsoleTab] = useState<'all' | 'errors' | 'warnings'>('all');

  const resetState = () => {
    setFile(null);
    setIsLoading(false);
    setParseResult(null);
    setParseError(null);
    setIsSuccess(false);
    setSuccessReport(null);
    setSearchKeyword('');
    setCopiedConsoleReport(false);
  };

  const handleCopyErrorReport = () => {
    if (!parseResult) return;
    const lines: string[] = [];
    lines.push(`=== 高職課表匯入檢核診斷報告 ===`);
    lines.push(`檔案名稱: ${file ? file.name : '示範課表資料'}`);
    lines.push(`總筆數: ${parseResult.totalCount} | 成功解析: ${parseResult.validRows.length} | 異常需修正: ${parseResult.invalidRows.length}`);
    lines.push(`實習連堂/工場課: ${parseResult.practicalCoursesCount} 節 | 新教師: ${parseResult.newTeachersDetected.length} 位`);
    lines.push('');

    if (parseResult.invalidRows.length > 0) {
      lines.push(`--- 【異常錯誤清單 (需於本機 Excel 修正)】 ---`);
      parseResult.invalidRows.forEach((row, i) => {
        lines.push(`[第 ${row.rowNumber} 列] 班級: ${row.className || '未填'} | 科目: ${row.subjectName || '未填'} | 教師: ${row.teacherName || '未填'}`);
        row.errors.forEach((err) => {
          lines.push(`  ❌ 錯誤: ${err}`);
        });
        if (row.warnings.length > 0) {
          row.warnings.forEach((w) => lines.push(`  ⚠️ 提示: ${w}`));
        }
      });
      lines.push('');
    }

    if (parseResult.clashesInFile.length > 0) {
      lines.push(`--- 【時間衝突與衝堂提示】 ---`);
      parseResult.clashesInFile.forEach((c) => lines.push(`  ⚠️ 衝堂: ${c}`));
      lines.push('');
    }

    lines.push(`產生時間: ${new Date().toLocaleString()}`);

    navigator.clipboard.writeText(lines.join('\n'));
    setCopiedConsoleReport(true);
    setTimeout(() => setCopiedConsoleReport(false), 3000);
  };

  if (!isOpen) return null;

  // Handle File Selection
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    processFile(selected);
  };

  const processFile = async (selectedFile: File) => {
    setFile(selectedFile);
    setIsLoading(true);
    setParseError(null);
    setIsSuccess(false);

    try {
      const result = await parseScheduleFile(selectedFile, teachers, venues);
      setParseResult(result);
    } catch (err: any) {
      setParseError(err.message || '檔案解析失敗，請確認是否為有效之 Excel (.xlsx/.xls) 或 CSV 檔案');
      setParseResult(null);
    } finally {
      setIsLoading(false);
    }
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) {
      processFile(dropped);
    }
  };

  // Load Built-in Demo Data (Simulate Excel Import for fast testing)
  const handleLoadDemoDataset = () => {
    setIsLoading(true);
    setTimeout(() => {
      const demoRows: ParsedImportRow[] = [
        {
          rowNumber: 2,
          dayOfWeek: 1,
          period: 1,
          className: '電機二甲',
          subjectName: '電工機械實習 (分組A)',
          teacherName: '林建宏',
          department: '電機科',
          venueName: '電機實習工場 A (室內配線)',
          isPractical: true,
          notes: '室內配線實作',
          errors: [],
          warnings: [],
        },
        {
          rowNumber: 3,
          dayOfWeek: 1,
          period: 2,
          className: '電機二甲',
          subjectName: '電工機械實習 (分組A)',
          teacherName: '林建宏',
          department: '電機科',
          venueName: '電機實習工場 A (室內配線)',
          isPractical: true,
          notes: '室內配線實作',
          errors: [],
          warnings: [],
        },
        {
          rowNumber: 4,
          dayOfWeek: 1,
          period: 3,
          className: '電機二甲',
          subjectName: '可程式控制PLC實習',
          teacherName: '黃俊傑',
          department: '電機科',
          venueName: '電機實習工場 B (工業配電/PLC)',
          isPractical: true,
          notes: 'PLC控制迴路',
          errors: [],
          warnings: [],
        },
        {
          rowNumber: 5,
          dayOfWeek: 1,
          period: 4,
          className: '電機二甲',
          subjectName: '可程式控制PLC實習',
          teacherName: '黃俊傑',
          department: '電機科',
          venueName: '電機實習工場 B (工業配電/PLC)',
          isPractical: true,
          notes: 'PLC控制迴路',
          errors: [],
          warnings: [],
        },
        {
          rowNumber: 6,
          dayOfWeek: 1,
          period: 5,
          className: '資訊三乙',
          subjectName: '物聯網整合應用實習',
          teacherName: '張志強',
          department: '資訊科',
          venueName: '物聯網軟體實驗室 (電腦教室一)',
          isPractical: true,
          notes: 'ESP32感測器應用',
          errors: [],
          warnings: [],
        },
        {
          rowNumber: 7,
          dayOfWeek: 1,
          period: 6,
          className: '資訊三乙',
          subjectName: '微處理機與單晶片',
          teacherName: '張志強',
          department: '資訊科',
          venueName: '微處理機與單晶片實習室',
          isPractical: true,
          notes: 'ARM Cortex 專題',
          errors: [],
          warnings: [],
        },
        {
          rowNumber: 10,
          dayOfWeek: 2,
          period: 3,
          className: '機械三甲',
          subjectName: 'CNC車銑複合加工實習',
          teacherName: '陳冠宇',
          department: '機械科',
          venueName: 'CNC 精密車銑複合工場',
          isPractical: true,
          notes: 'CNC數值控制操作',
          errors: [],
          warnings: [],
        },
        {
          rowNumber: 11,
          dayOfWeek: 2,
          period: 4,
          className: '機械三甲',
          subjectName: 'CNC車銑複合加工實習',
          teacherName: '陳冠宇',
          department: '機械科',
          venueName: 'CNC 精密車銑複合工場',
          isPractical: true,
          notes: 'CNC數值控制操作',
          errors: [],
          warnings: [],
        },
        {
          rowNumber: 14,
          dayOfWeek: 3,
          period: 5,
          className: '電機二甲',
          subjectName: '國文 (高職部定必修)',
          teacherName: '劉玉華',
          department: '共同科目',
          venueName: '電機二甲 原班普通教室',
          isPractical: false,
          notes: '一般部定學科',
          errors: [],
          warnings: [],
        },
        {
          rowNumber: 15,
          dayOfWeek: 3,
          period: 6,
          className: '電機二甲',
          subjectName: '實用英文 II',
          teacherName: '李雅筑',
          department: '共同科目',
          venueName: '電機二甲 原班普通教室',
          isPractical: false,
          notes: '技術型高中英語聽力',
          errors: [],
          warnings: [],
        },
      ];

      setParseResult({
        validRows: demoRows,
        invalidRows: [],
        totalCount: demoRows.length,
        newTeachersDetected: ['趙怡婷'],
        newVenuesDetected: [],
        practicalCoursesCount: 12,
        classesDetected: ['電機二甲', '資訊三乙', '餐飲一甲', '機械三甲', '廣設二甲'],
        clashesInFile: [],
      });
      setIsLoading(false);
    }, 400);
  };

  // Perform Final Import Execution
  const handleExecuteImport = () => {
    if (!parseResult || parseResult.validRows.length === 0) return;

    const res = importSchedule({
      validRows: parseResult.validRows,
      mode: importMode,
      newTeacherNames: parseResult.newTeachersDetected,
      newVenueNames: parseResult.newVenuesDetected,
      clearRequests: importMode === 'overwrite' ? clearRequestsOnOverwrite : false,
    });

    if (res.success) {
      setSuccessReport({
        added: res.addedCount,
        updated: res.updatedCount,
        teachers: res.newTeachersCount,
        venues: res.newVenuesCount,
      });
      setIsSuccess(true);
      
      // Trigger celebrate confetti
      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
        });
      } catch (e) {
        // ignore
      }
    }
  };

  // Filter preview rows
  const getFilteredRows = () => {
    if (!parseResult) return [];
    let list = [...parseResult.validRows, ...parseResult.invalidRows];

    if (previewFilter === 'practical') {
      list = list.filter((r) => r.isPractical);
    } else if (previewFilter === 'warnings') {
      list = list.filter((r) => r.warnings.length > 0);
    } else if (previewFilter === 'errors') {
      list = list.filter((r) => r.errors.length > 0);
    }

    if (searchKeyword.trim()) {
      const kw = searchKeyword.toLowerCase();
      list = list.filter(
        (r) =>
          r.className.toLowerCase().includes(kw) ||
          r.subjectName.toLowerCase().includes(kw) ||
          r.teacherName.toLowerCase().includes(kw) ||
          r.venueName.toLowerCase().includes(kw)
      );
    }

    return list;
  };

  const filteredPreviewRows = getFilteredRows();

  return (
    <ModalShell
      scroll="body"
      panelClassName="bg-white w-full max-w-5xl rounded-2xl shadow-2xl border border-slate-200"
      backdropClassName="bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-200"
    >
        
        {/* Modal Top Header */}
        <div className="shrink-0 bg-slate-900 text-white px-6 py-4 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-black shadow-md">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center space-x-2">
                <span>全校現有課表匯入與管理精靈</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-900/80 text-indigo-200 border border-indigo-700">
                  高職標準排課相容
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                支援匯入 Excel (.xlsx / .xls) 或 CSV 課表，自動檢核教師、實習工場與班級衝堂
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => exportScheduleToExcel(sessions, teachers, systemConfig.academicYear, systemConfig.semester, systemConfig.schoolName)}
              className="hidden sm:flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 transition"
              title="匯出目前已排定的全校課表為 Excel"
            >
              <Download className="w-3.5 h-3.5 text-amber-400" />
              <span>匯出目前課表 Excel</span>
            </button>

            <button
              onClick={handleClose}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 min-h-0 space-y-6">

          {/* Success Screen */}
          {isSuccess && successReport ? (
            <div className="py-8 text-center space-y-5">
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-sm">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-900">
                  🎉 全校課表已順利匯入並即時生效！
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  所有教師授課節數、每週超鐘點、實習工場排程及調代課檢核基底已全數自動更新。
                </p>
              </div>

              <div className="max-w-md mx-auto grid grid-cols-2 gap-3 text-left">
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                  <div className="text-xs text-slate-500 font-medium">新匯入/更新課堂</div>
                  <div className="text-xl font-black text-indigo-700 mt-0.5">
                    {successReport.added + successReport.updated} 節
                  </div>
                </div>
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                  <div className="text-xs text-slate-500 font-medium">自動建置新進師資</div>
                  <div className="text-xl font-black text-amber-600 mt-0.5">
                    {successReport.teachers} 位
                  </div>
                </div>
              </div>

              <div className="pt-4 flex justify-center space-x-3">
                <button
                  onClick={handleClose}
                  className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-bold rounded-xl shadow transition"
                >
                  關閉精靈並查看最新總課表
                </button>
                <button
                  onClick={() => {
                    resetState();
                  }}
                  className="px-4 py-2.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs sm:text-sm font-semibold rounded-xl transition"
                >
                  繼續匯入其他檔案
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Step 1: Download Template or Upload File */}
              {!parseResult && (
                <div className="space-y-6">
                  
                  {/* Template & Helper Bar */}
                  <div className="bg-amber-50/80 border border-amber-200/90 rounded-2xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-start space-x-3">
                      <div className="p-2 bg-amber-500 text-slate-950 rounded-xl font-bold mt-0.5">
                        <Download className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-amber-950">
                          首次使用？請先下載「高職課表匯入範本 Excel」
                        </h4>
                        <p className="text-xs text-amber-800/90 mt-0.5 leading-relaxed">
                          範本含「場地清單」工作表，可對照複製工場名稱。匯入後也可在課表格子直接下拉改選工場。
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => generateTemplateExcel(venues)}
                        className="flex items-center space-x-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-xs transition active:scale-95"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>下載 Excel 課表範本 (.xlsx)</span>
                      </button>
                    </div>
                  </div>

                  {/* Drag and Drop Zone */}
                  <div
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-slate-300 hover:border-indigo-500 bg-slate-50/70 hover:bg-indigo-50/30 transition rounded-2xl p-8 sm:p-12 text-center cursor-pointer group space-y-3"
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={handleFileChange}
                      className="hidden"
                    />

                    <div className="w-16 h-16 bg-white rounded-2xl border border-slate-200 shadow-sm flex items-center justify-center mx-auto text-indigo-600 group-hover:scale-110 group-hover:border-indigo-300 transition duration-200">
                      <Upload className="w-8 h-8" />
                    </div>

                    <div>
                      <p className="text-sm font-bold text-slate-900">
                        點擊選擇課表檔案 或 直接將 Excel/CSV 拖曳至此處
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        支援 Microsoft Excel (.xlsx, .xls) 及標準逗號分隔檔案 (.csv)
                      </p>
                    </div>

                    <div className="inline-flex items-center space-x-2 text-[11px] bg-slate-200/80 px-3 py-1 rounded-full text-slate-700 font-mono">
                      <span>欄位順序可自由排列：星期 · 節次 · 班級 · 科目 · 授課教師 · 實習工場</span>
                    </div>
                  </div>

                  {/* Quick Demo Dataset Button */}
                  <div className="bg-slate-100/90 rounded-xl p-3.5 border border-slate-200 flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-2 text-slate-700">
                      <Sparkles className="w-4 h-4 text-indigo-600" />
                      <span className="font-semibold">沒有現成檔案？可一鍵載入「示範高職新學期課表資料」體驗完整流程</span>
                    </div>
                    <button
                      onClick={handleLoadDemoDataset}
                      disabled={isLoading}
                      className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg transition shadow-xs text-xs flex items-center space-x-1"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>載入示範課表資料</span>
                    </button>
                  </div>

                  {/* Parse Error Box */}
                  {parseError && (
                    <div className="bg-rose-50 border border-rose-200 p-4 rounded-xl text-rose-800 text-xs flex items-start space-x-2.5">
                      <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-bold text-rose-900">匯入解析失敗</div>
                        <div>{parseError}</div>
                      </div>
                    </div>
                  )}

                  {/* Format Specifications Guide */}
                  <div className="border-t border-slate-200 pt-5 space-y-2">
                    <h5 className="text-xs font-bold text-slate-800 flex items-center space-x-1.5">
                      <Info className="w-3.5 h-3.5 text-slate-500" />
                      <span>課表欄位相容對照表 (自動彈性辨識)</span>
                    </h5>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 text-xs text-slate-600">
                      <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                        <span className="font-bold text-slate-900">📅 星期：</span>
                        <span className="text-slate-500">週一~週五、星期一~五 或 1~5</span>
                      </div>
                      <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                        <span className="font-bold text-slate-900">⏰ 節次：</span>
                        <span className="text-slate-500">第1節~第8節 或 1~8</span>
                      </div>
                      <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                        <span className="font-bold text-slate-900">🎓 班級：</span>
                        <span className="text-slate-500">電機二甲、資訊三乙、餐飲一甲等</span>
                      </div>
                      <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                        <span className="font-bold text-slate-900">📖 科目：</span>
                        <span className="text-slate-500">電工機械實習、數位邏輯、西餐烹調等</span>
                      </div>
                      <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                        <span className="font-bold text-slate-900">👨‍🏫 授課教師：</span>
                        <span className="text-slate-500">若為新進教師系統自動建立教師檔</span>
                      </div>
                      <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                        <span className="font-bold text-slate-900">🏢 實習工場：</span>
                        <span className="text-slate-500">
                          有填→依名稱；實習課未填→xx科實習工場；學科未填→班級原班教室
                        </span>
                      </div>
                    </div>
                  </div>

                </div>
              )}

              {/* Step 2: Parsed Result & Verification Preview */}
              {parseResult && (
                <div className="space-y-5">
                  
                  {/* File Information & Re-upload Bar */}
                  <div className="bg-slate-100 p-3.5 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center space-x-2">
                      <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                      <span className="font-bold text-slate-900">
                        {file ? file.name : '示範課表資料集'}
                      </span>
                      <span className="text-slate-500">
                        (共解析 {parseResult.totalCount} 列資料)
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        setParseResult(null);
                        setFile(null);
                      }}
                      className="text-xs text-indigo-600 hover:text-indigo-800 font-bold flex items-center space-x-1"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>重新選擇檔案</span>
                    </button>
                  </div>

                  {/* Summary Metric Stats */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-indigo-50/70 border border-indigo-200 p-3.5 rounded-xl">
                      <div className="text-xs text-indigo-800 font-semibold flex items-center space-x-1">
                        <Layers className="w-3.5 h-3.5 text-indigo-600" />
                        <span>有效課堂數</span>
                      </div>
                      <div className="text-2xl font-black text-indigo-950 mt-1">
                        {parseResult.validRows.length}{' '}
                        <span className="text-xs font-normal text-indigo-700">節</span>
                      </div>
                    </div>

                    <div className="bg-amber-50/70 border border-amber-200 p-3.5 rounded-xl">
                      <div className="text-xs text-amber-800 font-semibold flex items-center space-x-1">
                        <Building2 className="w-3.5 h-3.5 text-amber-600" />
                        <span>實習與實作課</span>
                      </div>
                      <div className="text-2xl font-black text-amber-950 mt-1">
                        {parseResult.practicalCoursesCount}{' '}
                        <span className="text-xs font-normal text-amber-700">節</span>
                      </div>
                    </div>

                    <div className="bg-emerald-50/70 border border-emerald-200 p-3.5 rounded-xl">
                      <div className="text-xs text-emerald-800 font-semibold flex items-center space-x-1">
                        <Users className="w-3.5 h-3.5 text-emerald-600" />
                        <span>涵蓋班級數</span>
                      </div>
                      <div className="text-2xl font-black text-emerald-950 mt-1">
                        {parseResult.classesDetected.length}{' '}
                        <span className="text-xs font-normal text-emerald-700">班</span>
                      </div>
                    </div>

                    <div className="bg-slate-100 border border-slate-200 p-3.5 rounded-xl">
                      <div className="text-xs text-slate-700 font-semibold flex items-center space-x-1">
                        <User className="w-3.5 h-3.5 text-slate-600" />
                        <span>新教師註冊</span>
                      </div>
                      <div className="text-2xl font-black text-slate-900 mt-1">
                        {parseResult.newTeachersDetected.length}{' '}
                        <span className="text-xs font-normal text-slate-600">位</span>
                      </div>
                    </div>
                  </div>

                  {/* Clash / Conflict Warnings */}
                  {parseResult.clashesInFile.length > 0 && (
                    <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-xs space-y-2">
                      <div className="font-bold text-rose-900 flex items-center space-x-1.5">
                        <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                        <span>注意：檔案內發現 {parseResult.clashesInFile.length} 處時間衝突/衝堂</span>
                      </div>
                      <ul className="list-disc list-inside space-y-1 text-rose-800 font-medium pl-1">
                        {parseResult.clashesInFile.map((msg, i) => (
                          <li key={i}>{msg}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* New Teachers/Venues Notice */}
                  {parseResult.newTeachersDetected.length > 0 && (
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-3.5 text-xs text-blue-900 flex items-start space-x-2">
                      <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold">自動建檔提醒：</span>
                        系統將為新教師（
                        {parseResult.newTeachersDetected.map((n) => `「${n}」`).join('、')}
                        ）自動建立師資基本資料（預設專任教師 16 節標準）。
                      </div>
                    </div>
                  )}

                  {/* Detailed Error & Validation Log Console */}
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-md text-slate-100 text-xs">
                    {/* Console Header Bar */}
                    <div className="bg-slate-950/80 px-4 py-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center space-x-2.5">
                        <div className="p-1.5 bg-slate-800 rounded-lg text-emerald-400">
                          <Terminal className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="font-mono font-bold text-slate-200 flex items-center space-x-2">
                            <span>資料檢核與格式診斷主控台</span>
                            {parseResult.invalidRows.length > 0 ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                                發現 {parseResult.invalidRows.length} 筆異常需修正
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center space-x-1">
                                <CheckCircle className="w-3 h-3" />
                                <span>100% 格式檢核通過</span>
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            即時反饋各列欄位對齊、缺失值與高職實習連堂防呆檢核結果
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2">
                        <button
                          onClick={handleCopyErrorReport}
                          className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-lg text-xs font-semibold border border-slate-700 transition"
                          title="複製整份檢核報告至剪貼簿"
                        >
                          {copiedConsoleReport ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span className="text-emerald-400 font-bold">已複製診斷報告</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5 text-slate-400" />
                              <span>複製錯誤診斷清單</span>
                            </>
                          )}
                        </button>

                        <button
                          onClick={() => setIsConsoleExpanded(!isConsoleExpanded)}
                          className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 rounded-lg transition"
                          title={isConsoleExpanded ? '收合主控台' : '展開主控台'}
                        >
                          {isConsoleExpanded ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Console Body */}
                    {isConsoleExpanded && (
                      <div className="p-4 space-y-3 font-mono">
                        {/* Sub Filter Tabs inside Console */}
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
                          <div className="flex items-center space-x-1">
                            <button
                              onClick={() => setConsoleTab('all')}
                              className={`px-2.5 py-1 rounded text-[11px] font-medium transition ${
                                consoleTab === 'all'
                                  ? 'bg-slate-700 text-white font-bold'
                                  : 'text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              全部日誌 ({parseResult.invalidRows.length + (parseResult.clashesInFile.length > 0 ? 1 : 0) + (parseResult.validRows.some(r => r.warnings.length > 0) ? 1 : 0)})
                            </button>
                            {parseResult.invalidRows.length > 0 && (
                              <button
                                onClick={() => setConsoleTab('errors')}
                                className={`px-2.5 py-1 rounded text-[11px] font-medium transition ${
                                  consoleTab === 'errors'
                                    ? 'bg-rose-900/60 text-rose-200 font-bold border border-rose-700'
                                    : 'text-rose-400 hover:text-rose-200'
                                }`}
                              >
                                ❌ 格式異常 ({parseResult.invalidRows.length})
                              </button>
                            )}
                            <button
                              onClick={() => setConsoleTab('warnings')}
                              className={`px-2.5 py-1 rounded text-[11px] font-medium transition ${
                                consoleTab === 'warnings'
                                  ? 'bg-amber-900/60 text-amber-200 font-bold border border-amber-700'
                                  : 'text-amber-400 hover:text-amber-200'
                              }`}
                            >
                              ⚠️ 系統提示/自動排入
                            </button>
                          </div>

                          <div className="text-[11px] text-slate-400">
                            共解析 {parseResult.totalCount} 筆 | 有效 {parseResult.validRows.length} 堂課
                          </div>
                        </div>

                        {/* Error Items List */}
                        <div className="max-h-56 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                          {/* If Invalid Rows Exist */}
                          {parseResult.invalidRows.length > 0 && (consoleTab === 'all' || consoleTab === 'errors') && (
                            <div className="space-y-2">
                              {parseResult.invalidRows.map((row, idx) => (
                                <div
                                  key={idx}
                                  className="bg-rose-950/40 border border-rose-800/80 rounded-xl p-3 text-xs space-y-1.5 transition hover:bg-rose-950/60"
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-1 text-[11px]">
                                    <div className="flex items-center space-x-2">
                                      <span className="px-2 py-0.5 bg-rose-800 text-rose-100 rounded font-bold">
                                        Excel / CSV 第 {row.rowNumber} 列
                                      </span>
                                      <span className="text-slate-300 font-semibold">
                                        班級: <span className="text-white font-bold">{row.className || '(未填寫)'}</span>
                                      </span>
                                      <span className="text-slate-400">·</span>
                                      <span className="text-slate-300">
                                        科目: <span className="text-white font-bold">{row.subjectName || '(未填寫)'}</span>
                                      </span>
                                    </div>
                                    <span className="text-rose-400 text-[10px]">
                                      授課教師: {row.teacherName || '未指定'}
                                    </span>
                                  </div>

                                  {/* Error Reasons */}
                                  <div className="space-y-1 pl-1">
                                    {row.errors.map((err, errIdx) => (
                                      <div key={errIdx} className="text-rose-300 flex items-start space-x-1.5 font-medium">
                                        <span className="text-rose-400 font-bold shrink-0">❌ 錯誤原因:</span>
                                        <span>{err}</span>
                                      </div>
                                    ))}
                                  </div>

                                  {/* Actionable Solution Box */}
                                  <div className="bg-slate-900/90 border border-rose-900/50 rounded-lg px-2.5 py-1.5 text-[11px] text-amber-200/90 flex items-start space-x-1.5">
                                    <span className="text-amber-400 font-bold shrink-0">💡 建議修正:</span>
                                    <span>
                                      請打開您本機的 Excel 檔案，至第 {row.rowNumber} 列確認「班級」、「科目名稱」與「時間/星期節次」欄位是否填寫完整，存檔後重新上傳即可。
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Clash Warnings */}
                          {parseResult.clashesInFile.length > 0 && (consoleTab === 'all' || consoleTab === 'warnings') && (
                            <div className="bg-amber-950/40 border border-amber-800/80 rounded-xl p-3 text-xs space-y-1.5">
                              <div className="text-amber-300 font-bold flex items-center space-x-1.5">
                                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                                <span>衝堂/時間衝突診斷：</span>
                              </div>
                              <ul className="list-disc list-inside space-y-1 text-amber-200/90 text-[11px] pl-1">
                                {parseResult.clashesInFile.map((msg, i) => (
                                  <li key={i}>{msg}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* Success State */}
                          {parseResult.invalidRows.length === 0 && parseResult.clashesInFile.length === 0 && (
                            <div className="bg-emerald-950/30 border border-emerald-800/60 rounded-xl p-3.5 text-xs text-emerald-200 space-y-1">
                              <div className="font-bold flex items-center space-x-1.5 text-emerald-300">
                                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                <span>[SUCCESS] 全數資料格式診斷合格</span>
                              </div>
                              <p className="text-[11px] text-emerald-300/80 pl-5 leading-relaxed">
                                共 {parseResult.validRows.length} 堂課通過驗證。包含 {parseResult.practicalCoursesCount} 節高職專業實習連堂已完成工場配對。未發現任何格式缺失或教師衝堂，可直接點擊「確認匯入」寫入系統。
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Preview Table Header & Filters */}
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-xl text-xs font-semibold">
                        <button
                          onClick={() => setPreviewFilter('all')}
                          className={`px-3 py-1 rounded-lg transition ${
                            previewFilter === 'all'
                              ? 'bg-white text-slate-900 shadow-xs font-bold'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          全部 ({parseResult.validRows.length + parseResult.invalidRows.length})
                        </button>
                        <button
                          onClick={() => setPreviewFilter('practical')}
                          className={`px-3 py-1 rounded-lg transition ${
                            previewFilter === 'practical'
                              ? 'bg-white text-slate-900 shadow-xs font-bold'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          實習工場課 ({parseResult.practicalCoursesCount})
                        </button>
                        {parseResult.invalidRows.length > 0 && (
                          <button
                            onClick={() => setPreviewFilter('errors')}
                            className={`px-3 py-1 rounded-lg transition ${
                              previewFilter === 'errors'
                                ? 'bg-rose-500 text-white shadow-xs font-bold'
                                : 'text-rose-600 hover:text-rose-900'
                            }`}
                          >
                            格式異常 ({parseResult.invalidRows.length})
                          </button>
                        )}
                      </div>

                      <input
                        type="text"
                        placeholder="搜尋班級、科目、教師、工場..."
                        value={searchKeyword}
                        onChange={(e) => setSearchKeyword(e.target.value)}
                        className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 w-64"
                      />
                    </div>

                    {/* Table View */}
                    <div className="border border-slate-200 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0 border-b border-slate-200">
                          <tr>
                            <th className="p-2.5 text-center w-12">列號</th>
                            <th className="p-2.5 text-center w-16">時間</th>
                            <th className="p-2.5 w-20">班級</th>
                            <th className="p-2.5">科目名稱</th>
                            <th className="p-2.5 w-20">授課教師</th>
                            <th className="p-2.5">實習工場 / 教室</th>
                            <th className="p-2.5 text-center w-16">屬性</th>
                            <th className="p-2.5">狀態</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {filteredPreviewRows.map((row, idx) => {
                            const dayNames = ['', '週一', '週二', '週三', '週四', '週五'];
                            const isError = row.errors.length > 0;
                            const hasWarning = row.warnings.length > 0;

                            return (
                              <tr
                                key={idx}
                                className={`hover:bg-slate-50 transition ${
                                  isError ? 'bg-rose-50/50' : hasWarning ? 'bg-amber-50/40' : ''
                                }`}
                              >
                                <td className="p-2.5 text-center font-mono text-slate-400">
                                  {row.rowNumber}
                                </td>
                                <td className="p-2.5 text-center font-semibold text-slate-800">
                                  {dayNames[row.dayOfWeek]} 第{row.period}節
                                </td>
                                <td className="p-2.5 font-bold text-slate-900">{row.className}</td>
                                <td className="p-2.5 font-medium text-slate-800">
                                  {row.subjectName}
                                  {row.notes && (
                                    <span className="text-[10px] text-slate-400 block">
                                      {row.notes}
                                    </span>
                                  )}
                                </td>
                                <td className="p-2.5 font-semibold text-indigo-700">
                                  {row.teacherName}
                                </td>
                                <td className="p-2.5 text-slate-600 max-w-[220px] truncate" title={row.venueName}>
                                  {row.venueName || '—'}
                                </td>
                                <td className="p-2.5 text-center">
                                  <div className="flex flex-col items-center gap-0.5">
                                    {row.isConcurrent && (
                                      <span className="px-1.5 py-0.5 bg-violet-600 text-white rounded font-bold text-[10px]">
                                        兼課
                                      </span>
                                    )}
                                    {row.isPractical ? (
                                      <span className="px-1.5 py-0.5 bg-amber-500 text-white rounded font-bold text-[10px]">
                                        實習
                                      </span>
                                    ) : (
                                      <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded font-medium text-[10px]">
                                        學科
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="p-2.5">
                                  {isError ? (
                                    <span className="text-rose-600 font-bold text-[11px] flex items-center gap-1">
                                      <XCircle className="w-3.5 h-3.5" />
                                      {row.errors[0]}
                                    </span>
                                  ) : row.warnings.some((w) => w.includes('衝突') || w.includes('衝堂')) ? (
                                    <span className="text-amber-700 font-medium text-[11px] flex items-center gap-1" title={row.warnings.join(' | ')}>
                                      <AlertTriangle className="w-3.5 h-3.5" />
                                      排課重疊提示
                                    </span>
                                  ) : row.warnings.some((w) => w.includes('自動註冊') || w.includes('自動排入')) ? (
                                    <span className="text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 font-medium text-[11px] flex items-center gap-1">
                                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                      自動建檔
                                    </span>
                                  ) : (
                                    <span className="text-emerald-600 font-semibold text-[11px] flex items-center gap-1">
                                      <CheckCircle2 className="w-3.5 h-3.5" />
                                      驗證通過
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Step 3: Choose Import Mode & Confirm Action */}
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                    <div className="font-bold text-xs text-slate-900">
                      選擇匯入覆蓋模式：
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <label
                        className={`p-3 rounded-xl border cursor-pointer flex items-start space-x-2.5 transition ${
                          importMode === 'overwrite'
                            ? 'bg-indigo-50/80 border-indigo-400 ring-1 ring-indigo-400'
                            : 'bg-white border-slate-200 hover:bg-slate-100/60'
                        }`}
                      >
                        <input
                          type="radio"
                          name="importMode"
                          value="overwrite"
                          checked={importMode === 'overwrite'}
                          onChange={() => setImportMode('overwrite')}
                          className="mt-0.5 text-indigo-600"
                        />
                        <div>
                          <div className="font-bold text-slate-900">
                            🔁 完全覆蓋全校現有課表 (推薦新學期排課)
                          </div>
                          <p className="text-slate-500 text-[11px] mt-0.5">
                            清除舊有課堂，完全套用此份最新課表，並重新統計全體教師基本與超鐘點節數。
                            工場／教室清冊仍保留，僅追加課表中新出現的名稱。
                          </p>
                          {importMode === 'overwrite' && (
                            <label className="mt-2 flex items-start gap-2 text-[11px] text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-2 py-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                className="mt-0.5"
                                checked={clearRequestsOnOverwrite}
                                onChange={(e) => setClearRequestsOnOverwrite(e.target.checked)}
                              />
                              <span>
                                同時清除全部調代課申請（含已核准）。新學期建議勾選；若僅更新課表請取消勾選以保留單據。
                              </span>
                            </label>
                          )}
                        </div>
                      </label>

                      <label
                        className={`p-3 rounded-xl border cursor-pointer flex items-start space-x-2.5 transition ${
                          importMode === 'append'
                            ? 'bg-indigo-50/80 border-indigo-400 ring-1 ring-indigo-400'
                            : 'bg-white border-slate-200 hover:bg-slate-100/60'
                        }`}
                      >
                        <input
                          type="radio"
                          name="importMode"
                          value="append"
                          checked={importMode === 'append'}
                          onChange={() => setImportMode('append')}
                          className="mt-0.5 text-indigo-600"
                        />
                        <div>
                          <div className="font-bold text-slate-900">
                            ➕ 增量合併 (僅更新對應班級與時段)
                          </div>
                          <p className="text-slate-500 text-[11px] mt-0.5">
                            保留未在檔案中的現有課堂，僅追加或更新檔案中指定的班級時段課表。
                          </p>
                        </div>
                      </label>
                    </div>
                  </div>

                  {/* Actions Footer */}
                  <div className="pt-2 flex items-center justify-between">
                    <button
                      onClick={() => setParseResult(null)}
                      className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl transition"
                    >
                      返回重新上傳
                    </button>

                    <button
                      onClick={handleExecuteImport}
                      disabled={parseResult.validRows.length === 0}
                      className="flex items-center space-x-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs sm:text-sm rounded-xl shadow-md hover:shadow transition active:scale-95 disabled:opacity-50"
                    >
                      <span>確定匯入 {parseResult.validRows.length} 節課堂</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>

                </div>
              )}
            </>
          )}

        </div>

    </ModalShell>
  );
};
