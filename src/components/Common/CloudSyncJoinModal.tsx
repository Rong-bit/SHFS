import React, { useEffect, useState } from 'react';
import { Cloud, X, KeyRound, Check, Loader2, AlertCircle } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  DEFAULT_DATABASE_URL,
  loadCloudSyncSettings,
  probeCloudSync,
  resolveFirebaseWebConfig,
} from '../../utils/cloudSync';
import { DEFAULT_FIREBASE_WEB_CONFIG } from '../../utils/firebaseRtdbClient';
import { isSecureCryptoContext } from '../../utils/secureCrypto';
import { ModalShell } from './ModalShell';

interface CloudSyncJoinModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CloudSyncJoinModal: React.FC<CloudSyncJoinModalProps> = ({ isOpen, onClose }) => {
  const { cloudSyncSettings, cloudSyncStatus, cloudSyncMessage, updateCloudSyncSettings } = useApp();
  const [schoolKey, setSchoolKey] = useState(cloudSyncSettings.schoolKey || '');
  const initialWeb = resolveFirebaseWebConfig(cloudSyncSettings);
  const [apiKey, setApiKey] = useState(initialWeb.apiKey);
  // 有內建／本機金鑰時預設收合；規則收緊後若連線失敗再展開貼上即可
  const [showApiKey, setShowApiKey] = useState(false);
  const [msg, setMsg] = useState('');
  const [msgTone, setMsgTone] = useState<'ok' | 'warn' | 'err'>('ok');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSchoolKey(cloudSyncSettings.schoolKey || '');
      const web = resolveFirebaseWebConfig(cloudSyncSettings);
      setApiKey(web.apiKey);
      setShowApiKey(false);
      setMsg('');
      setMsgTone('ok');
    }
  }, [isOpen, cloudSyncSettings]);

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
    const stored = loadCloudSyncSettings();
    const web = resolveFirebaseWebConfig({
      ...stored,
      ...cloudSyncSettings,
      apiKey: apiKey.trim() || cloudSyncSettings.apiKey || stored.apiKey || DEFAULT_FIREBASE_WEB_CONFIG.apiKey,
      appId: cloudSyncSettings.appId || stored.appId || DEFAULT_FIREBASE_WEB_CONFIG.appId,
      appCheckSiteKey:
        cloudSyncSettings.appCheckSiteKey ||
        stored.appCheckSiteKey ||
        DEFAULT_FIREBASE_WEB_CONFIG.appCheckSiteKey,
    });
    const next = {
      enabled: true,
      databaseUrl: (cloudSyncSettings.databaseUrl || DEFAULT_DATABASE_URL).trim() || DEFAULT_DATABASE_URL,
      schoolKey: key,
      apiKey: web.apiKey,
      appId: web.appId,
      appCheckSiteKey: web.appCheckSiteKey,
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
      } else {
        const ok = window.confirm(
          '雲端已有學校資料。加入後這台電腦的課表、名冊與申請單會改成與雲端相同；本機尚未同步的變更可能遺失。\n\n確定要加入並採用雲端資料？'
        );
        if (!ok) {
          setMsgTone('warn');
          setMsg('已取消加入同步，本機資料未變更。');
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
        {!isSecureCryptoContext() && (
          <p className="text-[11px] text-amber-200/90 leading-relaxed rounded-xl border border-amber-500/40 bg-amber-950/40 px-3 py-2">
            目前以非安全網址開啟（常見於 <code className="font-mono">http://區網IP:3000</code>
            ）。系統已改用相容加密，可繼續輸入同步密碼。
          </p>
        )}

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

        <button
          type="button"
          onClick={() => setShowApiKey((v) => !v)}
          className="text-[11px] font-bold text-sky-300 hover:text-sky-200"
        >
          {showApiKey ? '收合' : '展開'}進階：Firebase Web API 金鑰
        </button>
        {showApiKey && (
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Web API 金鑰（管理員收緊規則後需要；與同步密碼不同）
            </label>
            <input
              type="text"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="向管理員索取 Web API Key（全校同一組）"
              autoComplete="off"
              spellCheck={false}
              className="w-full px-3 py-2.5 rounded-xl bg-slate-950 text-white border border-slate-700 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
            <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
              若應用已內建預設金鑰或本機曾存過，可留空。規則改為 auth != null 後若連線失敗，請向管理員索取同一組金鑰。
            </p>
          </div>
        )}

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
