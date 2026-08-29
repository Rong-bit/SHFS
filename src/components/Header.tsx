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
  Cloud,
  CloudOff,
  Loader2,
  KeyRound,
  Type,
} from 'lucide-react';
import { TeacherSearchCombobox } from './Common/TeacherSearchCombobox';
import { CloudSyncJoinModal } from './Common/CloudSyncJoinModal';
import { StaffChangePasswordModal } from './Common/StaffChangePasswordModal';
import {
  persistUiFontScale,
  readUiFontScale,
  UI_FONT_SCALE_OPTIONS,
  type UiFontScale,
} from '../utils/uiFontScale';

export const Header: React.FC = () => {
  const {
    currentRole,
    currentTeacherId,
    academicStaffList,
    currentAcademicStaffId,
    currentAcademicStaff,
    teachers,
    requests,
    systemConfig,
    requestRoleSwitchWithAuth,
    requestTeacherSwitchWithAuth,
    updateAcademicStaffPassword,
    cloudSyncStatus,
  } = useApp();

  const [isSyncJoinOpen, setIsSyncJoinOpen] = useState(false);
  const [isStaffPasswordOpen, setIsStaffPasswordOpen] = useState(false);
  const [uiFontScale, setUiFontScale] = useState<UiFontScale>(() => readUiFontScale());

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
      label: '出納組',
      icon: <Calculator className="w-4 h-4" />,
    },
    {
      key: 'admin',
      label: '系統管理員',
      icon: <Settings className="w-4 h-4" />,
    },
  ];

  return (
    <>
    <header className="sticky top-0 z-40 bg-slate-900 border-b border-slate-800 text-white shadow-md print:hidden">
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
                  {systemConfig.schoolName || '國立技術型高級中等學校'}
                </span>
                <span className="hidden md:inline-block px-2 py-0.5 text-xs font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-full">
                  {systemConfig.academicYear}學年度 第{systemConfig.semester}學期
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">
                高職調代課與課點費管理系統
              </p>
            </div>
          </div>

          {/* Right Actions: Sync */}
          <div className="flex items-center space-x-2 sm:space-x-3">
            <label
              className="flex items-center gap-1.5 text-[11px] sm:text-xs text-slate-300 shrink-0"
              title="僅本機畫面字級，不影響列印與 Excel"
            >
              <Type className="w-3.5 h-3.5 text-slate-400" />
              <span className="hidden sm:inline">字體</span>
              <select
                value={uiFontScale}
                onChange={(e) => {
                  const next = e.target.value as UiFontScale;
                  setUiFontScale(next);
                  persistUiFontScale(next);
                }}
                className="bg-slate-900 text-slate-100 font-medium px-1.5 py-1 rounded-md border border-slate-700 focus:outline-none focus:ring-1 focus:ring-amber-500 text-[11px] sm:text-xs"
              >
                {UI_FONT_SCALE_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            {cloudSyncStatus === 'off' ? (
              <button
                type="button"
                onClick={() => setIsSyncJoinOpen(true)}
                className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 text-[11px] sm:text-xs font-bold border border-sky-500/40 transition"
                title="教師電腦不必進系統管理員，輸入學校同步密碼即可"
              >
                <Cloud className="w-3.5 h-3.5" />
                <span>加入同步</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsSyncJoinOpen(true)}
                className={`flex items-center space-x-1 px-2 py-1.5 rounded-lg text-[11px] border ${
                  cloudSyncStatus === 'synced'
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                    : cloudSyncStatus === 'error'
                    ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                    : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                }`}
                title="點擊可重新輸入學校同步密碼"
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
              </button>
            )}

          </div>
        </div>

        <CloudSyncJoinModal isOpen={isSyncJoinOpen} onClose={() => setIsSyncJoinOpen(false)} />

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
                {academicStaffList
                  .filter((s) => (s.group || 'academic') === 'academic')
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.title})
                    </option>
                  ))}
              </select>
              <button
                type="button"
                onClick={() => setIsStaffPasswordOpen(true)}
                title="自行修改登入密碼"
                className="px-2 py-0.5 bg-slate-900 hover:bg-slate-700 text-amber-300 border border-slate-700 rounded text-[11px] font-medium flex items-center gap-1 transition"
              >
                <KeyRound className="w-3 h-3" />
                改密碼
              </button>
            </div>
          )}

          {currentRole === 'accounting' && (
            <div className="flex items-center space-x-2 bg-slate-800/80 px-2.5 py-1 rounded-md border border-slate-700 text-xs">
              <span className="text-slate-400 flex items-center gap-1">
                <Calculator className="w-3.5 h-3.5 text-amber-400" />
                出納組登入：
              </span>
              <select
                id="select-header-accounting-staff"
                value={currentAcademicStaffId}
                onChange={(e) => requestRoleSwitchWithAuth('accounting', e.target.value)}
                className="bg-slate-900 text-amber-300 font-medium px-2 py-0.5 rounded border border-slate-700 focus:outline-none focus:ring-1 focus:ring-amber-500 text-xs"
              >
                {academicStaffList
                  .filter((s) => s.group === 'accounting')
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.title})
                    </option>
                  ))}
              </select>
              <button
                type="button"
                onClick={() => setIsStaffPasswordOpen(true)}
                title="自行修改登入密碼"
                className="px-2 py-0.5 bg-slate-900 hover:bg-slate-700 text-amber-300 border border-slate-700 rounded text-[11px] font-medium flex items-center gap-1 transition"
              >
                <KeyRound className="w-3 h-3" />
                改密碼
              </button>
              <span className="hidden md:inline text-slate-500 pl-1.5 border-l border-slate-700">
                日間 {systemConfig.dayHourlyRate}元／課輔 {systemConfig.nightHourlyRate}元
              </span>
            </div>
          )}

          {currentRole === 'admin' && (
            <div className="text-xs text-slate-400 flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-indigo-400"></span>
              <span>標準與參數 · 場地維護 · 名冊維護 · 課表與同步 · 系統維護</span>
            </div>
          )}
        </div>
      </div>
    </header>

    {isStaffPasswordOpen &&
      currentAcademicStaff &&
      (currentRole === 'academic' || currentRole === 'accounting') && (
        <StaffChangePasswordModal
          staff={currentAcademicStaff}
          groupLabel={currentRole === 'accounting' ? '出納組' : '教學組'}
          onSave={(pw) => updateAcademicStaffPassword(currentAcademicStaff.id, pw)}
          onClose={() => setIsStaffPasswordOpen(false)}
        />
      )}
    </>
  );
};
