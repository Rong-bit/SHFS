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
  Factory,
  X,
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
  officeMembers,
  officeNavActive,
  resolveStaffSubunit,
  roleForSubunit,
  subunitLoginLabel,
  type StaffSubunit,
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
  type OfficeMenuKey = 'academic' | 'internship' | 'general' | 'student_affairs';
  const [openOfficeMenu, setOpenOfficeMenu] = useState<OfficeMenuKey | null>(null);
  const [mobileRoleOpen, setMobileRoleOpen] = useState(false);
  const academicOfficeBtnRef = useRef<HTMLButtonElement>(null);
  const internshipOfficeBtnRef = useRef<HTMLButtonElement>(null);
  const generalAffairsBtnRef = useRef<HTMLButtonElement>(null);
  const studentAffairsBtnRef = useRef<HTMLButtonElement>(null);
  const academicMenuRef = useRef<HTMLDivElement>(null);
  const internshipMenuRef = useRef<HTMLDivElement>(null);
  const generalAffairsMenuRef = useRef<HTMLDivElement>(null);
  const studentAffairsMenuRef = useRef<HTMLDivElement>(null);

  const pendingCount = requests.filter((r) => r.status === 'pending').length;
  const currentSubunit = resolveStaffSubunit(currentAcademicStaff, currentRole);
  const mobileStaffSub: StaffSubunit | null =
    currentRole === 'academic' ||
    currentRole === 'accounting' ||
    currentRole === 'student_affairs' ||
    currentRole === 'principal'
      ? currentSubunit ||
        (currentRole === 'accounting'
          ? 'cashier'
          : currentRole === 'principal'
            ? 'principal'
            : currentRole === 'student_affairs'
              ? 'student_section'
              : 'teaching')
      : null;
  const mobileStaffMembers = mobileStaffSub
    ? officeMembers(academicStaffList, mobileStaffSub)
    : [];
  const mobileTeacherName =
    (teachers.find((t) => t.id === currentTeacherId) || teachers[0])?.name || '';
  const mobileStaffName =
    currentAcademicStaff?.name ||
    academicStaffList.find((s) => s.id === currentAcademicStaffId)?.name ||
    '';

  useEffect(() => {
    if (!openOfficeMenu) return;
    const pairs: Record<
      OfficeMenuKey,
      { btn: React.RefObject<HTMLButtonElement | null>; menu: React.RefObject<HTMLDivElement | null> }
    > = {
      academic: { btn: academicOfficeBtnRef, menu: academicMenuRef },
      internship: { btn: internshipOfficeBtnRef, menu: internshipMenuRef },
      general: { btn: generalAffairsBtnRef, menu: generalAffairsMenuRef },
      student_affairs: { btn: studentAffairsBtnRef, menu: studentAffairsMenuRef },
    };
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      const pair = pairs[openOfficeMenu];
      if (!pair.btn.current?.contains(t) && !pair.menu.current?.contains(t)) {
        setOpenOfficeMenu(null);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [openOfficeMenu]);

  useEffect(() => {
    if (!mobileRoleOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onResize = () => {
      if (window.innerWidth >= 768) setMobileRoleOpen(false);
    };
    window.addEventListener('resize', onResize);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('resize', onResize);
    };
  }, [mobileRoleOpen]);

  const switchSubunit = (subunit: StaffSubunit) => {
    setOpenOfficeMenu(null);
    const members = officeMembers(academicStaffList, subunit);
    const preferred =
      currentSubunit === subunit && members.some((m) => m.id === currentAcademicStaffId)
        ? currentAcademicStaffId
        : members[0]?.id;
    requestRoleSwitchWithAuth(roleForSubunit(subunit), preferred, {
      staffSubunit: subunit,
    });
  };

  const menuItemClass = (active: boolean) =>
    `w-full flex items-center gap-2 px-3 py-2 text-left text-xs sm:text-sm font-medium transition ${
      active ? 'bg-amber-500/20 text-amber-300' : 'text-slate-200 hover:bg-slate-800'
    }`;

  const officeBtnClass = (active: boolean) =>
    `flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all ${
      active
        ? 'bg-amber-500 text-slate-950 font-semibold shadow-sm'
        : 'text-slate-300 hover:text-white hover:bg-slate-800/90'
    }`;

  const mobileRoleBase =
    currentRole === 'teacher'
      ? '教師端'
      : currentRole === 'admin'
        ? '系統管理員'
        : currentRole === 'principal'
          ? '校長'
          : currentSubunit
            ? subunitLoginLabel(currentSubunit)
            : '選擇身分';
  const mobileRoleName =
    currentRole === 'teacher' ? mobileTeacherName : currentRole === 'admin' ? '' : mobileStaffName;
  const mobileRoleLabel = mobileRoleName ? `${mobileRoleBase} · ${mobileRoleName}` : mobileRoleBase;

  const pickMobileRole = (role: UserRole) => {
    setMobileRoleOpen(false);
    if (role === 'principal') {
      requestRoleSwitchWithAuth(role, undefined, { staffSubunit: 'principal' });
      return;
    }
    requestRoleSwitchWithAuth(role);
  };

  const pickMobileSubunit = (subunit: StaffSubunit) => {
    setMobileRoleOpen(false);
    switchSubunit(subunit);
  };

  const mobileSheetItem = (active: boolean) =>
    `w-full min-h-12 px-3 rounded-xl flex items-center gap-2 text-left text-base font-bold touch-manipulation ${
      active ? 'bg-amber-400 text-slate-950' : 'bg-slate-800 text-slate-100 active:bg-slate-700'
    }`;

  return (
    <>
    <header className="sticky top-0 z-40 bg-slate-900 border-b border-slate-800 text-white shadow-md print:hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14 md:h-16 gap-2 min-w-0">
          
          {/* Logo & School Name */}
          <div className="flex items-center gap-2 md:space-x-3 min-w-0">
            <div className="w-9 h-9 md:w-10 md:h-10 shrink-0 rounded-lg bg-gradient-to-tr from-amber-500 via-amber-600 to-indigo-600 flex items-center justify-center shadow-inner">
              <GraduationCap className="w-5 h-5 md:w-6 md:h-6 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center space-x-2 min-w-0">
                <span className="font-bold text-sm md:text-base tracking-wide text-slate-100 truncate">
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
              className="flex items-center gap-1.5 text-[11px] sm:text-xs text-slate-300 shrink-0 min-h-11"
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
                className="bg-slate-900 text-slate-100 font-medium px-1.5 py-1 rounded-md border border-slate-700 focus:outline-none focus:ring-1 focus:ring-amber-500 text-[11px] sm:text-xs min-h-11 sm:min-h-0"
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
                className="flex items-center justify-center gap-1 min-h-11 min-w-11 px-2.5 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 text-[11px] sm:text-xs font-bold border border-sky-500/40 transition touch-manipulation"
                aria-label="加入同步"
                title="教師電腦不必進系統管理員，輸入學校同步密碼即可"
              >
                <Cloud className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">加入同步</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsSyncJoinOpen(true)}
                aria-label={
                  cloudSyncStatus === 'synced'
                    ? '已跨電腦同步'
                    : cloudSyncStatus === 'error'
                      ? '同步失敗'
                      : '同步中'
                }
                className={`flex items-center justify-center gap-1 min-h-11 min-w-11 px-2 py-1.5 rounded-lg text-[11px] border touch-manipulation ${
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
                <span className="hidden sm:inline">
                  {cloudSyncStatus === 'synced' ? '已跨電腦同步' : cloudSyncStatus === 'error' ? '同步失敗' : '同步中'}
                </span>
              </button>
            )}

          </div>
        </div>

        <CloudSyncJoinModal isOpen={isSyncJoinOpen} onClose={() => setIsSyncJoinOpen(false)} />

        {/* Sub-header Navigation / Role Switcher */}
        <div className="hidden md:flex flex-wrap items-center justify-between border-t border-slate-800/80 py-2 gap-2 overflow-visible">
          {/* Role Navigation Pills（勿加 overflow-x，否則會裁掉處室下拉選單） */}
          <div className="flex flex-wrap items-center gap-1 sm:gap-2">
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

            {/* 教務處 → 教務主任／教學組 */}
            <button
              type="button"
              ref={academicOfficeBtnRef}
              id="nav-role-academic-office"
              aria-haspopup="menu"
              aria-expanded={openOfficeMenu === 'academic'}
              onClick={() =>
                setOpenOfficeMenu((m) => (m === 'academic' ? null : 'academic'))
              }
              className={officeBtnClass(officeNavActive('academic', currentRole, currentAcademicStaff))}
            >
              <ClipboardCheck className="w-4 h-4" />
              <span>教務處</span>
              {pendingCount > 0 && (
                <span className="ml-0.5 px-1.5 py-0.2 bg-rose-500 text-white text-[10px] font-bold rounded-full animate-bounce">
                  {pendingCount}
                </span>
              )}
              <ChevronDown
                className={`w-3.5 h-3.5 transition ${openOfficeMenu === 'academic' ? 'rotate-180' : ''}`}
              />
            </button>
            <OfficeRoleMenu
              open={openOfficeMenu === 'academic'}
              anchorRef={academicOfficeBtnRef}
              menuRef={academicMenuRef}
            >
              <button
                type="button"
                role="menuitem"
                id="nav-role-academic-dean"
                onClick={() => switchSubunit('academic_dean')}
                className={menuItemClass(currentSubunit === 'academic_dean')}
              >
                <Landmark className="w-3.5 h-3.5" />
                教務主任
              </button>
              <button
                type="button"
                role="menuitem"
                id="nav-role-academic"
                onClick={() => switchSubunit('teaching')}
                className={menuItemClass(currentSubunit === 'teaching')}
              >
                <ClipboardCheck className="w-3.5 h-3.5" />
                教學組
                {pendingCount > 0 && (
                  <span className="ml-auto px-1.5 py-0.2 bg-rose-500 text-white text-[10px] font-bold rounded-full">
                    {pendingCount}
                  </span>
                )}
              </button>
            </OfficeRoleMenu>

            {/* 實習處 → 實習主任／實習組 */}
            <button
              type="button"
              ref={internshipOfficeBtnRef}
              id="nav-role-internship-office"
              aria-haspopup="menu"
              aria-expanded={openOfficeMenu === 'internship'}
              onClick={() =>
                setOpenOfficeMenu((m) => (m === 'internship' ? null : 'internship'))
              }
              className={officeBtnClass(officeNavActive('internship', currentRole, currentAcademicStaff))}
            >
              <Factory className="w-4 h-4" />
              <span>實習處</span>
              <ChevronDown
                className={`w-3.5 h-3.5 transition ${openOfficeMenu === 'internship' ? 'rotate-180' : ''}`}
              />
            </button>
            <OfficeRoleMenu
              open={openOfficeMenu === 'internship'}
              anchorRef={internshipOfficeBtnRef}
              menuRef={internshipMenuRef}
            >
              <button
                type="button"
                role="menuitem"
                id="nav-role-internship-dean"
                onClick={() => switchSubunit('internship_dean')}
                className={menuItemClass(currentSubunit === 'internship_dean')}
              >
                <Landmark className="w-3.5 h-3.5" />
                實習主任
              </button>
              <button
                type="button"
                role="menuitem"
                id="nav-role-internship-section"
                onClick={() => switchSubunit('internship_section')}
                className={menuItemClass(currentSubunit === 'internship_section')}
              >
                <Factory className="w-3.5 h-3.5" />
                實習組
              </button>
            </OfficeRoleMenu>

            {/* 總務處 → 總務主任／出納組 */}
            <button
              type="button"
              ref={generalAffairsBtnRef}
              id="nav-role-general-affairs"
              aria-haspopup="menu"
              aria-expanded={openOfficeMenu === 'general'}
              onClick={() => setOpenOfficeMenu((m) => (m === 'general' ? null : 'general'))}
              className={officeBtnClass(officeNavActive('general', currentRole, currentAcademicStaff))}
            >
              <Building2 className="w-4 h-4" />
              <span>總務處</span>
              <ChevronDown
                className={`w-3.5 h-3.5 transition ${openOfficeMenu === 'general' ? 'rotate-180' : ''}`}
              />
            </button>
            <OfficeRoleMenu
              open={openOfficeMenu === 'general'}
              anchorRef={generalAffairsBtnRef}
              menuRef={generalAffairsMenuRef}
            >
              <button
                type="button"
                role="menuitem"
                id="nav-role-general-dean"
                onClick={() => switchSubunit('general_dean')}
                className={menuItemClass(currentSubunit === 'general_dean')}
              >
                <Landmark className="w-3.5 h-3.5" />
                總務主任
              </button>
              <button
                type="button"
                role="menuitem"
                id="nav-role-accounting"
                onClick={() => switchSubunit('cashier')}
                className={menuItemClass(currentSubunit === 'cashier')}
              >
                <Calculator className="w-3.5 h-3.5" />
                出納組
              </button>
            </OfficeRoleMenu>

            {/* 學務處 → 學務主任／生輔組 */}
            <button
              type="button"
              ref={studentAffairsBtnRef}
              id="nav-role-student-affairs-office"
              aria-haspopup="menu"
              aria-expanded={openOfficeMenu === 'student_affairs'}
              onClick={() =>
                setOpenOfficeMenu((m) => (m === 'student_affairs' ? null : 'student_affairs'))
              }
              className={officeBtnClass(
                officeNavActive('student_affairs', currentRole, currentAcademicStaff)
              )}
            >
              <Shield className="w-4 h-4" />
              <span>學務處</span>
              <ChevronDown
                className={`w-3.5 h-3.5 transition ${
                  openOfficeMenu === 'student_affairs' ? 'rotate-180' : ''
                }`}
              />
            </button>
            <OfficeRoleMenu
              open={openOfficeMenu === 'student_affairs'}
              anchorRef={studentAffairsBtnRef}
              menuRef={studentAffairsMenuRef}
            >
              <button
                type="button"
                role="menuitem"
                id="nav-role-student-dean"
                onClick={() => switchSubunit('student_dean')}
                className={menuItemClass(currentSubunit === 'student_dean')}
              >
                <Landmark className="w-3.5 h-3.5" />
                學務主任
              </button>
              <button
                type="button"
                role="menuitem"
                id="nav-role-student-section"
                onClick={() => switchSubunit('student_section')}
                className={menuItemClass(currentSubunit === 'student_section')}
              >
                <Shield className="w-3.5 h-3.5" />
                生輔組
              </button>
            </OfficeRoleMenu>

            <button
              id="nav-role-principal"
              onClick={() =>
                requestRoleSwitchWithAuth('principal', undefined, {
                  staffSubunit: 'principal',
                })
              }
              className={`flex items-center space-x-2 px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all ${
                currentRole === 'principal'
                  ? 'bg-amber-500 text-slate-950 font-semibold shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/90'
              }`}
            >
              <Landmark className="w-4 h-4" />
              <span>校長</span>
            </button>
            <button
              id="nav-role-admin"
              onClick={() => requestRoleSwitchWithAuth('admin')}
              className={`flex items-center space-x-2 px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all ${
                currentRole === 'admin'
                  ? 'bg-amber-500 text-slate-950 font-semibold shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/90'
              }`}
            >
              <Settings className="w-4 h-4" />
              <span>系統管理員</span>
            </button>
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
              const sub =
                currentSubunit ||
                (currentRole === 'accounting'
                  ? 'cashier'
                  : currentRole === 'principal'
                    ? 'principal'
                    : currentRole === 'student_affairs'
                      ? 'student_section'
                      : 'teaching');
              const label = `${subunitLoginLabel(sub)}登入`;
              const members = officeMembers(academicStaffList, sub);
              return (
                <div className="flex items-center space-x-2 bg-slate-800/80 px-2.5 py-1 rounded-md border border-slate-700 text-xs">
                  <span className="text-slate-400 flex items-center gap-1">
                    {sub === 'cashier' || sub === 'general_dean' ? (
                      <Building2 className="w-3.5 h-3.5 text-amber-400" />
                    ) : sub === 'student_dean' || sub === 'student_section' ? (
                      <Shield className="w-3.5 h-3.5 text-amber-400" />
                    ) : sub === 'internship_dean' || sub === 'internship_section' ? (
                      <Factory className="w-3.5 h-3.5 text-amber-400" />
                    ) : sub === 'principal' ? (
                      <Landmark className="w-3.5 h-3.5 text-amber-400" />
                    ) : (
                      <ClipboardCheck className="w-3.5 h-3.5 text-amber-400" />
                    )}
                    {label}：
                  </span>
                  <select
                    id={`select-header-${currentRole}-staff`}
                    value={
                      members.some((m) => m.id === currentAcademicStaffId)
                        ? currentAcademicStaffId
                        : members[0]?.id || ''
                    }
                    onChange={(e) =>
                      requestRoleSwitchWithAuth(currentRole, e.target.value, {
                        staffSubunit: sub,
                      })
                    }
                    className="bg-slate-900 text-amber-300 font-medium px-2 py-0.5 rounded border border-slate-700 focus:outline-none focus:ring-1 focus:ring-amber-500 text-xs"
                  >
                    {members.length === 0 ? (
                      <option value="">（名冊尚無此身分）</option>
                    ) : (
                      members.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.title})
                        </option>
                      ))
                    )}
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

        <div className="md:hidden border-t border-slate-800/80 py-1.5">
          <button
            type="button"
            onClick={() => setMobileRoleOpen(true)}
            className="w-full min-h-11 px-3 rounded-xl bg-slate-800 border border-slate-700 flex items-center gap-2 text-left touch-manipulation"
            aria-haspopup="dialog"
            aria-expanded={mobileRoleOpen}
          >
            <span className="text-[11px] text-slate-400 shrink-0">目前身分</span>
            <span className="flex-1 min-w-0 text-sm font-bold text-amber-300 truncate">
              {mobileRoleLabel}
            </span>
            <span className="text-xs font-bold text-white shrink-0">切換</span>
            <ChevronDown className="w-4 h-4 text-slate-300 shrink-0" />
          </button>
        </div>
      </div>
    </header>

    {mobileRoleOpen && (
      <div className="md:hidden fixed inset-0 z-[60] flex flex-col justify-end">
        <button
          type="button"
          aria-label="關閉身分選單"
          className="absolute inset-0 bg-slate-950/70"
          onClick={() => setMobileRoleOpen(false)}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-label="切換身分"
          className="relative max-h-[min(86dvh,640px)] overflow-y-auto overscroll-contain rounded-t-3xl bg-slate-900 text-white border-t border-slate-700 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl"
        >
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-600" />
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-extrabold">切換身分</h2>
            <button
              type="button"
              onClick={() => setMobileRoleOpen(false)}
              className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-xl text-slate-300 hover:bg-slate-800"
              aria-label="關閉"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {(currentRole === 'teacher' || mobileStaffSub) && (
            <div className="mb-3 rounded-xl border border-slate-700 bg-slate-800/80 px-2.5 py-2 space-y-2">
              {currentRole === 'teacher' ? (
                <>
                  <p className="text-[11px] text-slate-400 flex items-center gap-1">
                    <User className="w-3.5 h-3.5 text-amber-400" />
                    登入教師
                  </p>
                  <TeacherSearchCombobox
                    teachers={teachers}
                    currentTeacherId={currentTeacherId}
                    onSelectTeacher={(tId) => {
                      setMobileRoleOpen(false);
                      requestTeacherSwitchWithAuth(tId);
                    }}
                    placeholder="輸入姓名或科別搜尋..."
                    fullWidth
                    comfortable
                    listInFlow
                  />
                </>
              ) : (
                mobileStaffSub && (
                  <>
                    <p className="text-[11px] text-slate-400">{subunitLoginLabel(mobileStaffSub)}</p>
                    <select
                      id={`select-header-mobile-${currentRole}-staff`}
                      value={
                        mobileStaffMembers.some((m) => m.id === currentAcademicStaffId)
                          ? currentAcademicStaffId
                          : mobileStaffMembers[0]?.id || ''
                      }
                      onChange={(e) => {
                        setMobileRoleOpen(false);
                        requestRoleSwitchWithAuth(currentRole, e.target.value, {
                          staffSubunit: mobileStaffSub,
                        });
                      }}
                      className="w-full min-h-11 bg-slate-900 text-amber-300 font-bold px-3 py-2 rounded-lg border border-slate-700 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    >
                      {mobileStaffMembers.length === 0 ? (
                        <option value="">（名冊尚無此身分）</option>
                      ) : (
                        mobileStaffMembers.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} ({s.title})
                          </option>
                        ))
                      )}
                    </select>
                    <button
                      type="button"
                      onClick={() => {
                        setMobileRoleOpen(false);
                        setIsStaffPasswordOpen(true);
                      }}
                      className="w-full min-h-11 rounded-lg bg-slate-900 hover:bg-slate-700 text-amber-300 border border-slate-700 text-sm font-bold flex items-center justify-center gap-1.5 touch-manipulation"
                    >
                      <KeyRound className="w-4 h-4" />
                      修改登入密碼
                    </button>
                  </>
                )
              )}
            </div>
          )}

          <div className="space-y-4">
            <button
              type="button"
              onClick={() => pickMobileRole('teacher')}
              className={mobileSheetItem(currentRole === 'teacher')}
            >
              <User className="w-5 h-5 shrink-0" />
              教師端
            </button>

            {(
              [
                {
                  title: '教務處',
                  items: [
                    { subunit: 'academic_dean' as const, label: '教務主任', icon: Landmark },
                    {
                      subunit: 'teaching' as const,
                      label: '教學組',
                      icon: ClipboardCheck,
                      badge: pendingCount,
                    },
                  ],
                },
                {
                  title: '實習處',
                  items: [
                    { subunit: 'internship_dean' as const, label: '實習主任', icon: Landmark },
                    { subunit: 'internship_section' as const, label: '實習組', icon: Factory },
                  ],
                },
                {
                  title: '總務處',
                  items: [
                    { subunit: 'general_dean' as const, label: '總務主任', icon: Landmark },
                    { subunit: 'cashier' as const, label: '出納組', icon: Calculator },
                  ],
                },
                {
                  title: '學務處',
                  items: [
                    { subunit: 'student_dean' as const, label: '學務主任', icon: Landmark },
                    { subunit: 'student_section' as const, label: '生輔組', icon: Shield },
                  ],
                },
              ] as const
            ).map((office) => (
              <section key={office.title} className="space-y-2">
                <p className="text-xs font-bold text-slate-400 px-1">{office.title}</p>
                {office.items.map((item) => {
                  const Icon = item.icon;
                  const badge = 'badge' in item ? item.badge : 0;
                  return (
                    <button
                      key={item.subunit}
                      type="button"
                      onClick={() => pickMobileSubunit(item.subunit)}
                      className={mobileSheetItem(
                        currentRole === roleForSubunit(item.subunit) &&
                          currentSubunit === item.subunit
                      )}
                    >
                      <Icon className="w-5 h-5 shrink-0" />
                      <span className="flex-1">{item.label}</span>
                      {badge > 0 && (
                        <span className="px-2 py-0.5 rounded-full bg-rose-500 text-white text-xs font-bold">
                          {badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </section>
            ))}

            <button
              type="button"
              onClick={() => pickMobileRole('principal')}
              className={mobileSheetItem(currentRole === 'principal')}
            >
              <Landmark className="w-5 h-5 shrink-0" />
              校長
            </button>
            <button
              type="button"
              onClick={() => pickMobileRole('admin')}
              className={mobileSheetItem(currentRole === 'admin')}
            >
              <Settings className="w-5 h-5 shrink-0" />
              系統管理員
            </button>
          </div>
        </div>
      </div>
    )}

    {isStaffPasswordOpen &&
      currentAcademicStaff &&
      (currentRole === 'academic' ||
        currentRole === 'accounting' ||
        currentRole === 'student_affairs' ||
        currentRole === 'principal') && (
        <StaffChangePasswordModal
          staff={currentAcademicStaff}
          groupLabel={
            currentSubunit
              ? (() => {
                  const label = subunitLoginLabel(currentSubunit);
                  if (!label.includes('・')) return label;
                  const [office, unit] = label.split('・');
                  return `${office}（${unit}）`;
                })()
              : '行政'
          }
          onSave={(pw) => updateAcademicStaffPassword(currentAcademicStaff.id, pw)}
          onClose={() => setIsStaffPasswordOpen(false)}
        />
      )}
    </>
  );
};
