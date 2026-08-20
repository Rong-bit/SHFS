import React, { useEffect, useState } from 'react';
import { Cloud, X, KeyRound, Check, Loader2, AlertCircle } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { DEFAULT_DATABASE_URL, testCloudSyncConnection } from '../../utils/cloudSync';
import { ModalShell } from './ModalShell';

interface CloudSyncJoinModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CloudSyncJoinModal: React.FC<CloudSyncJoinModalProps> = ({ isOpen, onClose }) => {
  const { cloudSyncSettings, cloudSyncStatus, cloudSyncMessage, updateCloudSyncSettings } = useApp();
  const [schoolKey, setSchoolKey] = useState(cloudSyncSettings.schoolKey || '');
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSchoolKey(cloudSyncSettings.schoolKey || '');
      setMsg('');
    }
  }, [isOpen, cloudSyncSettings.schoolKey]);

  if (!isOpen) return null;

  const handleJoin = async () => {
    const key = schoolKey.trim();
    if (key.length < 4) {
      setMsg('同步密碼至少 4 個字，請向教學組或系統管理員索取。');
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
      await testCloudSyncConnection(next);
      updateCloudSyncSettings(next);
      setMsg('已加入學校同步。這台電腦之後會自動看到同一份課表與申請單。');
      window.setTimeout(onClose, 700);
    } catch (err: any) {
      setMsg(err?.message || '加入失敗，請確認同步密碼是否與教學組相同。');
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
          教師、組長電腦都只要輸入<strong className="text-amber-300">學校同步密碼</strong>即可，不必進入系統管理員、也不用自己建立 Firebase。請向教學組索取與學校相同的那一組密碼。
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
            placeholder="請向教學組索取，例如 SFHS-CCVS-2026"
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
            {cloudSyncStatus === 'error' ? (
              <AlertCircle className="w-3.5 h-3.5 text-rose-400 mt-0.5" />
            ) : (
              <Check className="w-3.5 h-3.5 text-emerald-400 mt-0.5" />
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
