import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { Lock, KeyRound, Eye, EyeOff, ShieldCheck, User, X, AlertCircle, Check } from 'lucide-react';
import { UserRole } from '../../types';
import { DEFAULT_ADMIN_PASSWORD } from '../../data/mockData';
import { verifyPassword } from '../../utils/passwordCrypto';
import { ModalShell } from './ModalShell';

export interface LoginTarget {
  type: 'teacher' | 'role' | 'teacher_action';
  teacherId?: string;
  targetRole?: UserRole;
  academicStaffId?: string;
  actionName?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

interface LoginAuthModalProps {
  isOpen: boolean;
  target: LoginTarget | null;
  onClose: () => void;
}

export const LoginAuthModal: React.FC<LoginAuthModalProps> = ({
  isOpen,
  target,
  onClose,
}) => {
  const {
    teachers,
    academicStaffList,
    currentAcademicStaffId,
    systemConfig,
    completeAuthenticatedLogin,
  } = useApp();

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [selectedStaffId, setSelectedStaffId] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);

  const auth = systemConfig.authConfig || {
    requirePassword: true,
    defaultTeacherPassword: '1234',
    adminPassword: DEFAULT_ADMIN_PASSWORD,
    academicPassword: '1234',
    accountingPassword: '1234',
  };

  const targetTeacher =
    (target?.type === 'teacher' || target?.type === 'teacher_action') && target.teacherId
      ? teachers.find((t) => t.id === target.teacherId)
      : null;

  const targetStaff = academicStaffList.find((s) => s.id === selectedStaffId) || null;

  useEffect(() => {
    if (isOpen) {
      setPassword('');
      setErrorMsg('');
      setIsSuccess(false);
      setIsVerifying(false);
      setShowPassword(false);
      let initialStaffId = '';
      if (target?.type === 'role' && target?.targetRole === 'accounting') {
        initialStaffId = academicStaffList.find((s) => s.group === 'accounting')?.id || '';
      } else {
        initialStaffId =
          target?.academicStaffId ||
          currentAcademicStaffId ||
          academicStaffList.find((s) => (s.group || 'academic') === 'academic')?.id ||
          '';
      }
      setSelectedStaffId(initialStaffId);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isOpen, target, academicStaffList, currentAcademicStaffId]);

  if (!isOpen || !target) return null;

  let targetTitle = '';
  let targetSubtitle = '';
  let targetBadge = '';
  let expectedPassword = '1234';
  /** 標籤右側短提示（如預設密碼為 1234） */
  let hint = '請輸入登入密碼';

  const FACTORY_DEFAULT_PLAIN = '1234';

  if (target.type === 'teacher_action' && targetTeacher) {
    targetTitle = targetTeacher.name;
    targetSubtitle = target.actionName ? `即將執行：${target.actionName}` : '調代課申請身分確認';
    targetBadge = '申請送件驗證';
    expectedPassword = targetTeacher.password || auth.defaultTeacherPassword || '1234';
    const custom = Boolean(targetTeacher.password);
    hint = custom
      ? `請輸入【${targetTeacher.name}】個人密碼`
      : `預設密碼為 ${FACTORY_DEFAULT_PLAIN}`;
  } else if (target.type === 'teacher' && targetTeacher) {
    targetTitle = targetTeacher.name;
    targetSubtitle = `${targetTeacher.department} · ${targetTeacher.title}`;
    targetBadge = '教師身分登入';
    expectedPassword = targetTeacher.password || auth.defaultTeacherPassword || '1234';
    const custom = Boolean(targetTeacher.password);
    hint = custom ? '已設定個人密碼' : `預設密碼為 ${FACTORY_DEFAULT_PLAIN}`;
  } else if (target.type === 'role') {
    switch (target.targetRole) {
      case 'academic':
        targetTitle = targetStaff ? targetStaff.name : '教務處教學組';
        targetSubtitle = targetStaff
          ? `${targetStaff.title} · ${targetStaff.responsibleScope}`
          : '請先選擇組長或組員身分';
        targetBadge = targetStaff?.title || '教學組行政權限';
        expectedPassword =
          targetStaff?.password || auth.academicPassword || '1234';
        hint = targetStaff?.password
          ? '已設定個人密碼'
          : `預設密碼為 ${FACTORY_DEFAULT_PLAIN}`;
        break;
      case 'accounting': {
        const accStaff = academicStaffList.find((s) => s.id === selectedStaffId && s.group === 'accounting');
        targetTitle = accStaff ? accStaff.name : '出納組';
        targetSubtitle = accStaff
          ? `${accStaff.title} · ${accStaff.responsibleScope}`
          : '請先選擇出納組組長或組員身分';
        targetBadge = accStaff?.title || '財務結算權限';
        expectedPassword = accStaff?.password || auth.accountingPassword || '1234';
        hint = accStaff?.password
          ? '已設定個人密碼'
          : `預設密碼為 ${FACTORY_DEFAULT_PLAIN}`;
        break;
      }
      case 'admin':
        targetTitle = '系統管理員';
        targetSubtitle = '標準與參數 · 場地／名冊維護 · 課表匯入';
        targetBadge = '最高管理權限';
        expectedPassword = auth.adminPassword || DEFAULT_ADMIN_PASSWORD;
        hint = '請輸入系統管理員密碼';
        break;
      case 'teacher':
      default:
        targetTitle = targetTeacher?.name || '教師端登入';
        targetSubtitle = '個人課表檢視 · 發起調代課與派代';
        targetBadge = '教師專區';
        expectedPassword = targetTeacher?.password || auth.defaultTeacherPassword || '1234';
        hint = `預設密碼為 ${FACTORY_DEFAULT_PLAIN}`;
        break;
    }
  }

  const handleVerify = async (inputPassToTest?: string) => {
    if (target.type === 'role' && target.targetRole === 'academic' && !selectedStaffId) {
      setErrorMsg('請先選擇教學組組長或組員身分');
      return;
    }
    if (target.type === 'role' && target.targetRole === 'accounting') {
      const hasAccStaff = academicStaffList.some((s) => s.id === selectedStaffId && s.group === 'accounting');
      if (!hasAccStaff) {
        setErrorMsg('請先選擇出納組組長或組員身分');
        return;
      }
    }

    const passToTest = inputPassToTest !== undefined ? inputPassToTest : password;
    setIsVerifying(true);
    setErrorMsg('');
    const ok = await verifyPassword(passToTest, expectedPassword);
    setIsVerifying(false);

    if (ok) {
      setIsSuccess(true);
      setTimeout(() => {
        if (target.type === 'teacher' && target.teacherId) {
          completeAuthenticatedLogin({ role: 'teacher', teacherId: target.teacherId });
        } else if (target.type === 'role' && target.targetRole) {
          const staffId =
            (target.targetRole === 'academic' || target.targetRole === 'accounting') && selectedStaffId
              ? selectedStaffId
              : target.academicStaffId;
          completeAuthenticatedLogin({
            role: target.targetRole,
            academicStaffId: staffId,
          });
        }

        if (target.onSuccess) {
          target.onSuccess();
        }
        onClose();
      }, 300);
    } else {
      if (target.type === 'role' && target.targetRole === 'academic') {
        setErrorMsg(
          '教學組「登入密碼」錯誤（不是學校同步密碼）。預設多為 1234；若管理員有改過，請向管理員詢問教學組登入密碼。組員名單也須由管理員在系統參數新增後才會出現。'
        );
      } else if (target.type === 'role' && target.targetRole === 'accounting') {
        setErrorMsg(
          '出納組「登入密碼」錯誤（不是學校同步密碼）。預設多為 1234；若有改過請向管理員確認。'
        );
      } else if (target.type === 'role' && target.targetRole === 'admin') {
        setErrorMsg('系統管理員密碼錯誤，請重新輸入。');
      } else {
        setErrorMsg('密碼錯誤，請重新輸入！');
      }
      inputRef.current?.select();
    }
  };

  return (
    <ModalShell
      zClassName="z-[80]"
      scroll="panel"
      panelClassName="bg-slate-900 rounded-3xl shadow-2xl max-w-lg w-full border border-slate-700 animate-in fade-in zoom-in-95 duration-150 text-left"
      maxHeightClassName="max-h-[min(92dvh,880px)]"
    >
        {/* Header */}
        <div className="bg-slate-800/80 px-6 py-4 flex items-center justify-between border-b border-slate-700/80">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-white text-sm">身分切換與密碼確認</span>
              <span className="block text-[11px] text-slate-400">Security Authentication</span>
            </div>
          </div>
          <button
            onClick={() => {
              if (target.onCancel) target.onCancel();
              onClose();
            }}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-700 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5">
          {/* Target Profile Card */}
          <div className="p-4 rounded-2xl bg-slate-800/60 border border-slate-700 flex items-center space-x-3.5">
            <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${targetStaff?.avatarBg || 'from-amber-500 to-amber-700'} flex items-center justify-center text-white font-bold text-lg shadow-md shrink-0`}>
              {target.type === 'role' && target.targetRole === 'admin'
                ? <ShieldCheck className="w-6 h-6" />
                : target.type === 'role' && target.targetRole === 'accounting'
                ? (academicStaffList.find((s) => s.id === selectedStaffId && s.group === 'accounting')?.name.slice(0, 1) || <ShieldCheck className="w-6 h-6" />)
                : targetTeacher
                ? targetTeacher.name.slice(0, 1)
                : targetStaff
                ? targetStaff.name.slice(0, 1)
                : <ShieldCheck className="w-6 h-6" />}
            </div>
            <div className="truncate flex-1">
              <div className="flex items-center space-x-2">
                <span className="font-bold text-white text-base truncate">{targetTitle}</span>
                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-semibold shrink-0">
                  {targetBadge}
                </span>
              </div>
              <p className="text-xs text-slate-400 truncate mt-0.5">{targetSubtitle}</p>
            </div>
          </div>

          {target.type === 'role' && (target.targetRole === 'academic' || target.targetRole === 'accounting') && (() => {
            const isAcademic = target.targetRole === 'academic';
            const groupMembers = academicStaffList.filter((s) => (s.group || 'academic') === (isAcademic ? 'academic' : 'accounting'));
            if (groupMembers.length === 0) return null;
            return (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-amber-400" />
                  請選擇{isAcademic ? '教學組' : '出納組'}登入身分（組長 / 組員）
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {groupMembers.map((staff) => {
                    const isSelected = staff.id === selectedStaffId;
                    return (
                      <button
                        key={staff.id}
                        type="button"
                        onClick={() => setSelectedStaffId(staff.id)}
                        className={`text-left p-3 rounded-xl border transition ${
                          isSelected
                            ? 'bg-amber-500/15 border-amber-400 ring-1 ring-amber-400/40'
                            : 'bg-slate-800/40 border-slate-700 hover:border-slate-500'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-white text-sm">{staff.name}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                            staff.title.includes('組長')
                              ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-400/30'
                              : 'bg-slate-700 text-slate-300 border border-slate-600'
                          }`}>
                            {staff.title}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">{staff.badge}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleVerify();
            }}
            className="space-y-4"
          >
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 shrink-0">
                  <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                  請輸入身分登入密碼：
                </span>
                {!(target.type === 'role' && target.targetRole === 'admin') && (
                  <span className="text-[11px] text-amber-300 font-bold font-mono tracking-wide text-right">
                    {hint}
                  </span>
                )}
              </label>

              <div className="relative">
                <input
                  ref={inputRef}
                  type={target.type === 'role' && target.targetRole === 'admin' ? 'password' : showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errorMsg) setErrorMsg('');
                  }}
                  placeholder="請輸入密碼..."
                  className={`w-full px-3.5 py-2.5 rounded-xl bg-slate-950 text-white placeholder:text-slate-600 border text-sm font-medium focus:outline-none focus:ring-2 transition pr-10 ${
                    errorMsg
                      ? 'border-rose-500 focus:ring-rose-500/50'
                      : isSuccess
                      ? 'border-emerald-500 focus:ring-emerald-500/50'
                      : 'border-slate-700 focus:ring-amber-500/50 focus:border-amber-500'
                  }`}
                />
                {!(target.type === 'role' && target.targetRole === 'admin') && (
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
                )}
              </div>

              {errorMsg && (
                <div className="mt-2 flex items-center space-x-1.5 text-rose-400 text-xs font-medium animate-in fade-in">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="pt-2 flex items-center justify-between gap-3">
              <span className="text-[11px] text-slate-500 max-w-[12rem] leading-snug">
                密碼以雜湊存放，不會上傳雲端
              </span>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => {
                    if (target.onCancel) target.onCancel();
                    onClose();
                  }}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition border border-slate-700"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isSuccess || isVerifying}
                  className={`px-5 py-2 rounded-xl text-xs font-bold transition shadow-md flex items-center space-x-1.5 ${
                    isSuccess
                      ? 'bg-emerald-600 text-white'
                      : 'bg-amber-500 hover:bg-amber-400 text-slate-950 active:scale-95'
                  }`}
                >
                  {isSuccess ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>驗證成功...</span>
                    </>
                  ) : (
                    <>
                      <Lock className="w-3.5 h-3.5" />
                      <span>{isVerifying ? '驗證中...' : '確認登入'}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* Footer Note */}
        <div className="bg-slate-950/60 px-6 py-2.5 border-t border-slate-800 text-[11px] text-slate-500 flex items-center justify-between">
          <span>🔒 密碼可於【系統管理員 ➔ 系統維運 ➔ 登入密碼】中自訂或開關</span>
        </div>
    </ModalShell>
  );
};
