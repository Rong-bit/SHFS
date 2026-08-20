import React, { useState } from 'react';
import { Check, KeyRound, X } from 'lucide-react';
import { AcademicStaff } from '../../types';
import { ModalShell } from './ModalShell';

interface StaffChangePasswordModalProps {
  staff: AcademicStaff;
  groupLabel: '教學組' | '出納組';
  onSave: (newPassword: string) => void;
  onClose: () => void;
}

/** 教學組／出納組組員自行設定個人登入密碼 */
export const StaffChangePasswordModal: React.FC<StaffChangePasswordModalProps> = ({
  staff,
  groupLabel,
  onSave,
  onClose,
}) => {
  const [newPassword, setNewPassword] = useState('');
  const [notice, setNotice] = useState('');
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    const next = newPassword.trim();
    if (next && next.length < 4) {
      setNotice('新密碼至少 4 個字。');
      setSaved(false);
      return;
    }
    onSave(next);
    setSaved(true);
    setNotice(
      next
        ? '密碼已更新。下次登入請使用新個人密碼。'
        : `已改回${groupLabel}預設密碼（未改過時通常為 1234）。`
    );
    setTimeout(() => onClose(), 1200);
  };

  return (
    <ModalShell
      zClassName="z-[80]"
      scroll="panel"
      panelClassName="bg-slate-900 rounded-3xl shadow-2xl max-w-md w-full border border-slate-700 animate-in fade-in zoom-in-95 duration-150 text-left"
    >
      <div className="bg-slate-800 px-6 py-4 flex items-center justify-between border-b border-slate-700">
        <div className="flex items-center space-x-2">
          <KeyRound className="w-4 h-4 text-amber-400" />
          <span className="font-bold text-white text-sm">
            設定【{staff.name}】{groupLabel}個人登入密碼
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-700 transition"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-6 space-y-4">
        <p className="text-xs text-slate-400 leading-relaxed">
          設定後僅此身分使用個人密碼；其他組員不受影響。留空並儲存可改回{groupLabel}
          共用預設密碼。密碼以雜湊保存，不會上傳雲端。
        </p>

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5">新登入密碼</label>
          <input
            type="text"
            value={newPassword}
            onChange={(e) => {
              setNewPassword(e.target.value);
              setNotice('');
              setSaved(false);
            }}
            placeholder="至少 4 字；留空＝改回組別預設"
            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 text-white border border-slate-700 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-sm font-medium focus:outline-none"
          />
          {staff.password ? (
            <p className="mt-1.5 text-[11px] text-indigo-300">目前已設定個人密碼</p>
          ) : (
            <p className="mt-1.5 text-[11px] text-slate-500">目前使用{groupLabel}預設密碼</p>
          )}
        </div>

        {notice && (
          <div
            className={`p-3 rounded-xl text-xs flex items-center space-x-2 border ${
              saved
                ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
                : 'bg-rose-950/40 border-rose-800 text-rose-300'
            }`}
          >
            {saved && <Check className="w-4 h-4 text-emerald-400 shrink-0" />}
            <span>{notice}</span>
          </div>
        )}

        <div className="flex items-center justify-end space-x-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl border border-slate-700 transition"
          >
            關閉
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-xl shadow transition"
          >
            儲存密碼
          </button>
        </div>
      </div>
    </ModalShell>
  );
};
