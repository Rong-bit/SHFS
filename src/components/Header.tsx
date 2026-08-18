import React, { useState } from 'react';
import { 
  UserRole 
} from '../types';
import { useApp } from '../context/AppContext';
import { 
  GraduationCap, 
  User, 
  ClipboardCheck, 
  Calculator, 
  Settings, 
  Sparkles, 
  RotateCcw,
  BookOpen,
  AlertCircle,
  AlertTriangle,
  X,
  Cloud,
  CloudOff,
  Loader2
} from 'lucide-react';
import { TeacherSearchCombobox } from './Common/TeacherSearchCombobox';
import { BackupTransferButtons } from './Common/BackupTransferButtons';

export const Header: React.FC = () => {
  const {
    currentRole,
    currentTeacherId,
    academicStaffList,
    currentAcademicStaffId,
    teachers,
    requests,
    systemConfig,
    setIsAiAdvisorOpen,
    resetToMockData,
    requestRoleSwitchWithAuth,
    requestTeacherSwitchWithAuth,
    cloudSyncStatus,
  } = useApp();

  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);

  const pendingCount = requests.filter((r) => r.status === 'pending').length;

  const roles: { key: UserRole; label: string; icon: React.ReactNode; badge?: number }[] = [
    {
      key: 'teacher',
      label: '教師端',
      icon: <User className="w-4 h-4" />,
    },
    {
      key: 'academic',
      label: '教務處教學組',
      icon: <ClipboardCheck className="w-4 h-4" />,
      badge: pendingCount > 0 ? pendingCount : undefined,
    },
    {
      key: 'accounting',
      label: '主計出納處',
      icon: <Calculator className="w-4 h-4" />,
    },
    {
      key: 'admin',
      label: '系統管理員',
      icon: <Settings className="w-4 h-4" />,
    },
  ];

  return (
    <header className="sticky top-0 z-40 bg-slate-900 border-b border-slate-800 text-white shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          {/* Logo & School Name */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-tr from-amber-500 via-amber-600 to-indigo-600 flex items-center justify-center shadow-inner">
              <GraduationCap className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-base tracking-wide text-slate-100">
                  國立高職調代課與課點費管理系統
                </span>
                <span className="hidden md:inline-block px-2 py-0.5 text-xs font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-full">
                  {systemConfig.academicYear}學年度 第{systemConfig.semester}學期
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">
                技術型高中實習工場排課、差假派代與鐘點費智慧結算平台
              </p>
            </div>
          </div>

          {/* Right Actions: AI Advisor & Reset */}
          <div className="flex items-center space-x-2 sm:space-x-3">
            {cloudSyncStatus !== 'off' && (
              <span
                className={`hidden md:flex items-center space-x-1 px-2 py-1.5 rounded-lg text-[11px] border ${
                  cloudSyncStatus === 'synced'
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                    : cloudSyncStatus === 'error'
                    ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                    : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                }`}
                title="跨電腦同步狀態（於系統管理員 ➔ 跨電腦同步 設定）"
              >
                {cloudSyncStatus === 'synced' ? (
                  <Cloud className="w-3.5 h-3.5" />
                ) : cloudSyncStatus === 'error' ? (
                  <CloudOff className="w-3.5 h-3.5" />
                ) : (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                )}
                <span>
                  {cloudSyncStatus === 'synced' ? '已跨電腦同步' : cloudSyncStatus === 'error' ? '同步失敗' : '同步中'}
                </span>
              </span>
            )}

            {/* AI Advisor Button */}
            <button
              id="btn-open-ai-advisor"
              onClick={() => setIsAiAdvisorOpen(true)}
              className="relative group flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs sm:text-sm font-semibold shadow-sm transition-all duration-150 hover:shadow-indigo-500/25 active:scale-95"
            >
              <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
              <span>✨ AI 顧問</span>
              <span className="hidden lg:inline text-[11px] font-normal opacity-90">
                (法規與智慧排課)
              </span>
            </button>

            <BackupTransferButtons variant="header" />

            {/* Reset Mock Data */}
            <button
              id="btn-reset-demo-data"
              onClick={() => setIsResetConfirmOpen(true)}
              title="重設為預設高職示範課表與申請單"
              className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs border border-slate-700 transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">重設資料</span>
            </button>
          </div>
        </div>

        {/* In-App Reset Confirmation Dialog Modal */}
        {isResetConfirmOpen && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-slate-900 rounded-2xl shadow-2xl max-w-md w-full border border-slate-700 overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-left">
              <div className="bg-slate-800 text-white p-4 flex items-center justify-between border-b border-slate-700">
                <div className="flex items-center space-x-2">
                  <AlertTriangle className="w-5 h-5 text-amber-400" />
                  <span className="font-bold text-sm">確認重設示範資料庫</span>
                </div>
                <button
                  onClick={() => setIsResetConfirmOpen(false)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-700 transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-6 space-y-3">
                <p className="text-slate-200 text-sm font-medium leading-relaxed">
                  確定要重設所有測試資料回初始示範狀態嗎？
                </p>
                <div className="p-3 bg-amber-950/50 rounded-xl border border-amber-800/80 text-xs text-amber-300">
                  ⚠️ 這將清空您目前輸入的自訂課表、審核單據與自訂名冊，並恢復至系統預設高職示範課表。
                </div>
              </div>
              <div className="p-4 bg-slate-800/60 border-t border-slate-800 flex items-center justify-end space-x-2.5">
                <button
                  type="button"
                  onClick={() => setIsResetConfirmOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition border border-slate-700"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => {
                    resetToMockData();
                    setIsResetConfirmOpen(false);
                  }}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-bold transition shadow-xs flex items-center space-x-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>確認重設</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Sub-header Navigation / Role Switcher */}
        <div className="flex flex-wrap items-center justify-between border-t border-slate-800/80 py-2 gap-2">
          {/* Role Navigation Pills */}
          <div className="flex items-center space-x-1 sm:space-x-2 overflow-x-auto scrollbar-none">
            {roles.map((r) => {
              const isActive = currentRole === r.key;
              return (
                <button
                  key={r.key}
                  id={`nav-role-${r.key}`}
                  onClick={() => {
                    if (r.key === 'teacher') {
                      requestRoleSwitchWithAuth('teacher');
                    } else {
                      requestRoleSwitchWithAuth(r.key);
                    }
                  }}
                  className={`flex items-center space-x-2 px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-amber-500 text-slate-950 font-semibold shadow-sm'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/90'
                  }`}
                >
                  {r.icon}
                  <span>{r.label}</span>
                  {r.badge !== undefined && (
                    <span className="ml-1.5 px-1.5 py-0.2 bg-rose-500 text-white text-[10px] font-bold rounded-full animate-bounce">
                      {r.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Teacher identity: searchable login switcher */}
          {currentRole === 'teacher' && (
            <div className="flex items-center space-x-2 bg-slate-800/80 px-2.5 py-1 rounded-md border border-slate-700 text-xs">
              <span className="text-slate-400 flex items-center gap-1 shrink-0">
                <User className="w-3.5 h-3.5 text-amber-400" />
                當前登入身分：
              </span>
              <TeacherSearchCombobox
                teachers={teachers}
                currentTeacherId={currentTeacherId}
                onSelectTeacher={(tId) => requestTeacherSwitchWithAuth(tId)}
                placeholder="輸入姓名或科別搜尋..."
              />
            </div>
          )}

          {/* Info & Identity selector for Academic role */}
          {currentRole === 'academic' && (
            <div className="flex items-center space-x-2 bg-slate-800/80 px-2.5 py-1 rounded-md border border-slate-700 text-xs">
              <span className="text-slate-400 flex items-center gap-1">
                <ClipboardCheck className="w-3.5 h-3.5 text-amber-400" />
                教學組經辦登入：
              </span>
              <select
                id="select-header-academic-staff"
                value={currentAcademicStaffId}
                onChange={(e) => requestRoleSwitchWithAuth('academic', e.target.value)}
                className="bg-slate-900 text-amber-300 font-medium px-2 py-0.5 rounded border border-slate-700 focus:outline-none focus:ring-1 focus:ring-amber-500 text-xs"
              >
                {academicStaffList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.title})
                  </option>
                ))}
              </select>
            </div>
          )}

          {currentRole === 'accounting' && (
            <div className="text-xs text-slate-400 flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400"></span>
              <span>主計出納結算：標準費率 {systemConfig.dayHourlyRate}元/節 · 超額9節預警 · Excel 匯出</span>
            </div>
          )}

          {currentRole === 'admin' && (
            <div className="text-xs text-slate-400 flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-indigo-400"></span>
              <span>系統參數設定：授課節數標準 · 鐘點費率 · 實習工場維護</span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
