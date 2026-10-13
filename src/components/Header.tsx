import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  Shield,
  Landmark,
  ChevronDown,
  Building2,
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
import {
  academicOfficeMembers,
  isAcademicDeanStaff,
  resolveAcademicSubunit,
} from '../utils/academicOfficeStaff';

type OfficeMenuPos = { top: number; left: number; minWidth: number };

/** 處室下拉：用 fixed + portal，避免導覽列 overflow 把選單裁掉 */
const OfficeRoleMenu: React.FC<{
  open: boolean;
  anchorRef: React.RefObject<HTMLElement | null>;
  menuRef: React.RefObject<HTMLDivElement | null>;
  children: React.ReactNode;
}> = ({ open, anchorRef, menuRef, children }) => {
  const [pos, setPos] = useState<OfficeMenuPos | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const update = () => {
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setPos({
        top: r.bottom + 4,
        left: Math.max(8, r.left),
        minWidth: Math.max(r.width, 152),
      });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, anchorRef]);

  if (!open || !pos || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      className="rounded-lg border border-slate-600 bg-slate-900 text-white shadow-2xl py-1"
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        minWidth: pos.minWidth,
        zIndex: 9999,
      }}
    >
      {children}
    </div>,
    document.body
  );
};

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
  const [academicOfficeOpen, setAcademicOfficeOpen] = useState(false);
  const [generalAffairsOpen, setGeneralAffairsOpen] = useState(false);
  const academicOfficeBtnRef = useRef<HTMLButtonElement>(null);
  const generalAffairsBtnRef = useRef<HTMLButtonElement>(null);
  const academicMenuRef = useRef<HTMLDivElement>(null);
  const generalAffairsMenuRef = useRef<HTMLDivElement>(null);

  const pendingCount = requests.filter((r) => r.status === 'pending').length;

  useEffect(() => {
    if (!academicOfficeOpen && !generalAffairsOpen) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      const inAcademic =
        academicOfficeBtnRef.current?.contains(t) || academicMenuRef.current?.contains(t);
      const inGeneral =
        generalAffairsBtnRef.current?.contains(t) || generalAffairsMenuRef.current?.contains(t);
      if (academicOfficeOpen && !inAcademic) setAcademicOfficeOpen(false);
      if (generalAffairsOpen && !inGeneral) setGeneralAffairsOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [academicOfficeOpen, generalAffairsOpen]);

  // 學務處／校長／系統管理員（教師、教務處、總務處另以處室下拉呈現）
  const flatRoles: { key: UserRole; label: string; icon: React.ReactNode }[] = [
    {
      key: 'student_affairs',
      label: '學務處',
      icon: <Shield className="w-4 h-4" />,
    },
    {
      key: 'principal',
      label: '校長',
      icon: <Landmark className="w-4 h-4" />,
    },
    {
      key: 'admin',
      label: '系統管理員',
      icon: <Settings className="w-4 h-4" />,
    },
  ];

  const staffRoleGroup = (role: UserRole) =>
    role === 'academic'
      ? 'academic'
      : role === 'accounting'
        ? 'accounting'
        : role === 'student_affairs'
          ? 'student_affairs'
          : role === 'principal'
            ? 'principal'
            : null;

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
                  {systemConfig.schoolName || '高雄市立中正高工'}
                </span>
                <span className="hidden md:inline-block px-2 py-0.5 text-xs font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-full">
                  {systemConfig.academicYear}學年度 第{systemConfig.semester}學期
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">
                教務系統
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
        <div className="flex flex-wrap items-center justify-between border-t border-slate-800/80 py-2 gap-2 overflow-visible">
          {/* Role Navigation Pills（勿加 overflow-x，否則會裁掉處室下拉選單） */}
          <div className="flex flex-wrap items-center gap-1 sm:gap-2">
            {/* 教師端 */}
            <button
              id="nav-role-teacher"
              onClick={() => requestRoleSwitchWithAuth('teacher')}
              className={`flex items-center space-x-2 px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all ${
                currentRole === 'teacher'
                  ? 'bg-amber-500 text-slate-950 font-semibold shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/90'
              }`}
            >
              <User className="w-4 h-4" />
              <span>教師端</span>
            </button>

            {/* 教務處 → 教務主任（上層）／教學組 */}
            <button
              type="button"
              ref={academicOfficeBtnRef}
              id="nav-role-academic-office"
              aria-haspopup="menu"
              aria-expanded={academicOfficeOpen}
              onClick={() => {
                setAcademicOfficeOpen((o) => !o);
                setGeneralAffairsOpen(false);
              }}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all ${
                currentRole === 'academic'
                  ? 'bg-amber-500 text-slate-950 font-semibold shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/90'
              }`}
            >
              <ClipboardCheck className="w-4 h-4" />
              <span>教務處</span>
              {pendingCount > 0 && (
                <span className="ml-0.5 px-1.5 py-0.2 bg-rose-500 text-white text-[10px] font-bold rounded-full animate-bounce">
                  {pendingCount}
                </span>
              )}
              <ChevronDown
                className={`w-3.5 h-3.5 transition ${academicOfficeOpen ? 'rotate-180' : ''}`}
              />
            </button>
            <OfficeRoleMenu
              open={academicOfficeOpen}
              anchorRef={academicOfficeBtnRef}
              menuRef={academicMenuRef}
            >
              {(() => {
                const deanMembers = academicOfficeMembers(academicStaffList, 'dean');
                const teachingMembers = academicOfficeMembers(academicStaffList, 'teaching');
                const onDean =
                  currentRole === 'academic' && isAcademicDeanStaff(currentAcademicStaff || { title: '' });
                const onTeaching = currentRole === 'academic' && !onDean;
                return (
                  <>
                    <button
                      type="button"
                      role="menuitem"
                      id="nav-role-academic-dean"
                      onClick={() => {
                        setAcademicOfficeOpen(false);
                        requestRoleSwitchWithAuth('academic', deanMembers[0]?.id);
                      }}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs sm:text-sm font-medium transition ${
                        onDean
                          ? 'bg-amber-500/20 text-amber-300'
                          : 'text-slate-200 hover:bg-slate-800'
                      }`}
                    >
                      <Landmark className="w-3.5 h-3.5" />
                      教務主任
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      id="nav-role-academic"
                      onClick={() => {
                        setAcademicOfficeOpen(false);
                        requestRoleSwitchWithAuth('academic', teachingMembers[0]?.id);
                      }}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs sm:text-sm font-medium transition ${
                        onTeaching
                          ? 'bg-amber-500/20 text-amber-300'
                          : 'text-slate-200 hover:bg-slate-800'
                      }`}
                    >
                      <ClipboardCheck className="w-3.5 h-3.5" />
                      教學組
                      {pendingCount > 0 && (
                        <span className="ml-auto px-1.5 py-0.2 bg-rose-500 text-white text-[10px] font-bold rounded-full">
                          {pendingCount}
                        </span>
                      )}
                    </button>
                  </>
                );
              })()}
            </OfficeRoleMenu>

            {/* 總務處 → 出納組 */}
            <button
              type="button"
              ref={generalAffairsBtnRef}
              id="nav-role-general-affairs"
              aria-haspopup="menu"
              aria-expanded={generalAffairsOpen}
              onClick={() => {
                setGeneralAffairsOpen((o) => !o);
                setAcademicOfficeOpen(false);
              }}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all ${
                currentRole === 'accounting'
                  ? 'bg-amber-500 text-slate-950 font-semibold shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/90'
              }`}
            >
              <Building2 className="w-4 h-4" />
              <span>總務處</span>
              <ChevronDown
                className={`w-3.5 h-3.5 transition ${generalAffairsOpen ? 'rotate-180' : ''}`}
              />
            </button>
            <OfficeRoleMenu
              open={generalAffairsOpen}
              anchorRef={generalAffairsBtnRef}
              menuRef={generalAffairsMenuRef}
            >
              <button
                type="button"
                role="menuitem"
                id="nav-role-accounting"
                onClick={() => {
                  setGeneralAffairsOpen(false);
                  requestRoleSwitchWithAuth('accounting');
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs sm:text-sm font-medium transition ${
                  currentRole === 'accounting'
                    ? 'bg-amber-500/20 text-amber-300'
                    : 'text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Calculator className="w-3.5 h-3.5" />
                出納組
              </button>
            </OfficeRoleMenu>

            {flatRoles.map((r) => {
              const isActive = currentRole === r.key;
              return (
                <button
                  key={r.key}
                  id={`nav-role-${r.key}`}
                  onClick={() => requestRoleSwitchWithAuth(r.key)}
                  className={`flex items-center space-x-2 px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-amber-500 text-slate-950 font-semibold shadow-sm'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/90'
                  }`}
                >
                  {r.icon}
                  <span>{r.label}</span>
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

          {/* Info & Identity selector for staff roles */}
          {(currentRole === 'academic' ||
            currentRole === 'accounting' ||
            currentRole === 'student_affairs' ||
            currentRole === 'principal') &&
            (() => {
              const group = staffRoleGroup(currentRole);
              const academicSub =
                currentRole === 'academic'
                  ? resolveAcademicSubunit(currentAcademicStaff)
                  : null;
              const label =
                currentRole === 'academic'
                  ? academicSub === 'dean'
                    ? '教務處・教務主任登入'
                    : '教務處・教學組登入'
                  : currentRole === 'accounting'
                    ? '總務處・出納組登入'
                    : currentRole === 'student_affairs'
                      ? '學務處登入'
                      : '校長室登入';
              const members =
                currentRole === 'academic' && academicSub
                  ? academicOfficeMembers(academicStaffList, academicSub)
                  : academicStaffList.filter((s) => (s.group || 'academic') === group);
              return (
                <div className="flex items-center space-x-2 bg-slate-800/80 px-2.5 py-1 rounded-md border border-slate-700 text-xs">
                  <span className="text-slate-400 flex items-center gap-1">
                    {currentRole === 'accounting' ? (
                      <Calculator className="w-3.5 h-3.5 text-amber-400" />
                    ) : currentRole === 'student_affairs' ? (
                      <Shield className="w-3.5 h-3.5 text-amber-400" />
                    ) : currentRole === 'principal' ? (
                      <Landmark className="w-3.5 h-3.5 text-amber-400" />
                    ) : (
                      <ClipboardCheck className="w-3.5 h-3.5 text-amber-400" />
                    )}
                    {label}：
                  </span>
                  <select
                    id={`select-header-${currentRole}-staff`}
                    value={currentAcademicStaffId}
                    onChange={(e) => requestRoleSwitchWithAuth(currentRole, e.target.value)}
                    className="bg-slate-900 text-amber-300 font-medium px-2 py-0.5 rounded border border-slate-700 focus:outline-none focus:ring-1 focus:ring-amber-500 text-xs"
                  >
                    {members.map((s) => (
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
                  {currentRole === 'accounting' && (
                    <span className="hidden md:inline text-slate-500 pl-1.5 border-l border-slate-700">
                      日間 {systemConfig.dayHourlyRate}元／課輔 {systemConfig.nightHourlyRate}元
                    </span>
                  )}
                </div>
              );
            })()}

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
      (currentRole === 'academic' ||
        currentRole === 'accounting' ||
        currentRole === 'student_affairs' ||
        currentRole === 'principal') && (
        <StaffChangePasswordModal
          staff={currentAcademicStaff}
          groupLabel={
            currentRole === 'accounting'
              ? '總務處（出納組）'
              : currentRole === 'student_affairs'
                ? '學務處'
                : currentRole === 'principal'
                  ? '校長室'
                  : resolveAcademicSubunit(currentAcademicStaff) === 'dean'
                    ? '教務處（教務主任）'
                    : '教務處（教學組）'
          }
          onSave={(pw) => updateAcademicStaffPassword(currentAcademicStaff.id, pw)}
          onClose={() => setIsStaffPasswordOpen(false)}
        />
      )}
    </>
  );
};
