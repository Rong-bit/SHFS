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
} from 'lucide-react';
import confetti from 'canvas-confetti';

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

  const resetState = () => {
    setFile(null);
    setIsLoading(false);
    setParseResult(null);
    setParseError(null);
    setIsSuccess(false);
    setSuccessReport(null);
    setSearchKeyword('');
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
          rowNumber: 8,
          dayOfWeek: 2,
          period: 1,
          className: '餐飲一甲',
          subjectName: '西點烘焙實作',
          teacherName: '王美玲',
          department: '餐飲管理科',
          venueName: '烘焙與西點專業教室',
          isPractical: true,
          notes: '丙級烘焙考照實習',
          errors: [],
          warnings: [],
        },
        {
          rowNumber: 9,
          dayOfWeek: 2,
          period: 2,
          className: '餐飲一甲',
          subjectName: '西點烘焙實作',
          teacherName: '王美玲',
          department: '餐飲管理科',
          venueName: '烘焙與西點專業教室',
          isPractical: true,
          notes: '丙級烘焙考照實習',
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
          rowNumber: 12,
          dayOfWeek: 3,
          period: 1,
          className: '廣設二甲',
          subjectName: '數位多媒體向量設計',
          teacherName: '趙怡婷',
          department: '廣告設計科',
          venueName: '視覺多媒體設計教室 (Mac 工坊)',
          isPractical: true,
          notes: 'Illustrator 向量繪圖',
          errors: [],
          warnings: ['教師「趙怡婷」為新進教師，系統將自動建置師資檔案'],
        },
        {
          rowNumber: 13,
          dayOfWeek: 3,
          period: 2,
          className: '廣設二甲',
          subjectName: '數位多媒體向量設計',
          teacherName: '趙怡婷',
          department: '廣告設計科',
          venueName: '視覺多媒體設計教室 (Mac 工坊)',
          isPractical: true,
          notes: 'Illustrator 向量繪圖',
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-5xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Modal Top Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between border-b border-slate-800">
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
              onClick={() => exportScheduleToExcel(sessions, teachers, systemConfig.academicYear, systemConfig.semester)}
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
        <div className="p-6 overflow-y-auto flex-1 space-y-6">

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
                          範本已預先內建高職技術群科欄位（包含實習工場、專業科別、實習課註記與防呆規則）。您填妥後即可直接上傳。
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <button
                        onClick={generateTemplateExcel}
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
                        <span className="text-slate-500">電機工場、烘焙教室、CNC工場等</span>
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
                                <td className="p-2.5 text-slate-600 truncate max-w-[160px]">
                                  {row.venueName}
                                </td>
                                <td className="p-2.5 text-center">
                                  {row.isPractical ? (
                                    <span className="px-1.5 py-0.5 bg-amber-500 text-white rounded font-bold text-[10px]">
                                      實習
                                    </span>
                                  ) : (
                                    <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded font-medium text-[10px]">
                                      學科
                                    </span>
                                  )}
                                </td>
                                <td className="p-2.5">
                                  {isError ? (
                                    <span className="text-rose-600 font-bold text-[11px] flex items-center gap-1">
                                      <XCircle className="w-3.5 h-3.5" />
                                      {row.errors[0]}
                                    </span>
                                  ) : hasWarning ? (
                                    <span className="text-amber-700 font-medium text-[11px] flex items-center gap-1">
                                      <AlertTriangle className="w-3.5 h-3.5" />
                                      自動建檔
                                    </span>
                                  ) : (
                                    <span className="text-emerald-600 font-semibold text-[11px] flex items-center gap-1">
                                      <CheckCircle2 className="w-3.5 h-3.5" />
                                      正常
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
                          </p>
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

      </div>
    </div>
  );
};
