import React, { useEffect, useState } from 'react';
import { Cloud, X, KeyRound, Check, Loader2, AlertCircle } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { DEFAULT_DATABASE_URL, probeCloudSync } from '../../utils/cloudSync';
import { ModalShell } from './ModalShell';

interface CloudSyncJoinModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CloudSyncJoinModal: React.FC<CloudSyncJoinModalProps> = ({ isOpen, onClose }) => {
  const { cloudSyncSettings, cloudSyncStatus, cloudSyncMessage, updateCloudSyncSettings } = useApp();
  const [schoolKey, setSchoolKey] = useState(cloudSyncSettings.schoolKey || '');
  const [msg, setMsg] = useState('');
  const [msgTone, setMsgTone] = useState<'ok' | 'warn' | 'err'>('ok');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSchoolKey(cloudSyncSettings.schoolKey || '');
      setMsg('');
      setMsgTone('ok');
    }
  }, [isOpen, cloudSyncSettings.schoolKey]);

  if (!isOpen) return null;

  const handleJoin = async () => {
    const key = schoolKey.trim();
    if (key.length < 4) {
      setMsgTone('err');
      setMsg('同步密碼至少 4 個字，請向教學組或系統管理員索取「學校同步密碼」。');
      return;
    }
    setSaving(true);
    setMsg('');
    const next = {
      enabled: true,
      databaseUrl: (cloudSyncSettings.databaseUrl || DEFAULT_DATABASE_URL).trim() || DEFAULT_DATABASE_URL,
      schoolKey: key,
    };
    try {
      const probe = await probeCloudSync(next);
      if (!probe.hasRemoteData) {
        const ok = window.confirm(
          '此密碼對應的雲端目前沒有資料。\n\n若其他電腦（管理員）已經在同步，通常是密碼打錯或不完全相同（大小寫、符號、空白都要一樣）。\n\n請再向管理員確認「學校同步密碼」——不是教學組登入密碼。\n\n若確定這是全校第一台啟用同步的電腦，按「確定」繼續；否則按「取消」回去改密碼。'
        );
        if (!ok) {
          setMsgTone('warn');
          setMsg('已取消。請向管理員核對學校同步密碼後再加入。');
          return;
        }
      }
      updateCloudSyncSettings(next);
      setMsgTone('ok');
      setMsg(
        probe.hasRemoteData
          ? '已加入學校同步。這台電腦之後會自動看到同一份課表與申請單。'
          : '已啟用同步（雲端原先無資料）。若之後仍看不到其他電腦的課表，請改填正確的學校同步密碼。'
      );
      window.setTimeout(onClose, 900);
    } catch (err: any) {
      setMsgTone('err');
      setMsg(err?.message || '加入失敗，請確認同步密碼是否與管理員相同。');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      zClassName="z-[90]"
      scroll="panel"
      panelClassName="bg-slate-900 rounded-2xl shadow-2xl max-w-md w-full border border-slate-700 text-left"
    >
      <div className="bg-slate-800 px-5 py-4 flex items-center justify-between border-b border-slate-700">
        <div className="flex items-center space-x-2">
          <Cloud className="w-5 h-5 text-sky-400" />
          <span className="font-bold text-sm text-white">加入學校跨電腦同步</span>
        </div>
        <button type="button" onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-700">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-5 space-y-4">
        <p className="text-xs text-slate-300 leading-relaxed">
          請輸入管理員在「課表與同步 → 跨電腦同步」設定的<strong className="text-amber-300">學校同步密碼</strong>
          （與教學組／管理員<strong className="text-rose-300">登入密碼不同</strong>）。密碼必須完全相同（含大小寫與符號），差一個字就連不到同一份資料。
        </p>

        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1">
            <KeyRound className="w-3.5 h-3.5 text-amber-400" />
            學校同步密碼
          </label>
          <input
            type="text"
            value={schoolKey}
            onChange={(e) => setSchoolKey(e.target.value)}
            placeholder="請向管理員索取，須與設定完全一致"
            autoComplete="off"
            spellCheck={false}
            className="w-full px-3 py-2.5 rounded-xl bg-slate-950 text-white border border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleJoin();
            }}
          />
        </div>

        {cloudSyncStatus === 'synced' && (
          <p className="text-[11px] text-emerald-300">目前這台電腦已在同步中。</p>
        )}
        {(msg || cloudSyncMessage) && (
          <div className="flex items-start gap-1.5 text-xs text-slate-200">
            {msgTone === 'err' || cloudSyncStatus === 'error' ? (
              <AlertCircle className="w-3.5 h-3.5 text-rose-400 mt-0.5 shrink-0" />
            ) : (
              <Check className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />
            )}
            <span>{msg || cloudSyncMessage}</span>
          </div>
        )}
      </div>

      <div className="px-5 py-4 bg-slate-800/60 border-t border-slate-800 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold border border-slate-700"
        >
          取消
        </button>
        <button
          type="button"
          onClick={handleJoin}
          disabled={saving}
          className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-bold flex items-center gap-1.5"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Cloud className="w-3.5 h-3.5" />}
          加入同步
        </button>
      </div>
    </ModalShell>
  );
};
