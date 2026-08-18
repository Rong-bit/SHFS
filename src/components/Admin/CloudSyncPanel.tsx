import React, { useState } from 'react';
import { Cloud, CloudOff, Check, AlertCircle, Loader2, KeyRound, Link as LinkIcon } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { CloudSyncSettings, testCloudSyncConnection } from '../../utils/cloudSync';

export const CloudSyncPanel: React.FC = () => {
  const {
    cloudSyncSettings,
    cloudSyncStatus,
    cloudSyncMessage,
    lastCloudSyncAt,
    updateCloudSyncSettings,
  } = useApp();

  const [form, setForm] = useState<CloudSyncSettings>(cloudSyncSettings);
  const [testMsg, setTestMsg] = useState('');
  const [testing, setTesting] = useState(false);

  const statusLabel =
    cloudSyncStatus === 'synced'
      ? '已連線，A / B 電腦會共用課表'
      : cloudSyncStatus === 'connecting'
      ? '連線中'
      : cloudSyncStatus === 'error'
      ? '同步失敗'
      : '尚未啟用';

  const handleSave = () => {
    updateCloudSyncSettings({
      enabled: form.enabled,
      databaseUrl: form.databaseUrl.trim(),
      schoolKey: form.schoolKey.trim(),
    });
    setTestMsg('設定已儲存');
  };

  const handleTest = async () => {
    setTesting(true);
    setTestMsg('');
    try {
      updateCloudSyncSettings({
        enabled: form.enabled,
        databaseUrl: form.databaseUrl.trim(),
        schoolKey: form.schoolKey.trim(),
      });
      const msg = await testCloudSyncConnection({
        enabled: true,
        databaseUrl: form.databaseUrl.trim(),
        schoolKey: form.schoolKey.trim(),
      });
      setTestMsg(msg);
    } catch (err: any) {
      setTestMsg(err?.message || '測試失敗');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Cloud className="w-5 h-5 text-sky-600" />
              跨電腦即時同步（A 匯入，B 可以看到）
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-2xl">
              啟用後，課表、教師、教學組名冊、密碼與申請單會寫入學校共用雲端。A 電腦匯入課表後，B 電腦約數秒內會自動更新。登入身分仍是各電腦自己選。
            </p>
          </div>
          <span
            className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
              cloudSyncStatus === 'synced'
                ? 'bg-emerald-100 text-emerald-800'
                : cloudSyncStatus === 'error'
                ? 'bg-rose-100 text-rose-800'
                : cloudSyncStatus === 'connecting'
                ? 'bg-amber-100 text-amber-800'
                : 'bg-slate-100 text-slate-600'
            }`}
          >
            {statusLabel}
          </span>
        </div>
        {cloudSyncMessage && (
          <p className="text-xs text-slate-600 mt-3">{cloudSyncMessage}</p>
        )}
        {lastCloudSyncAt && (
          <p className="text-[11px] text-slate-400 mt-1">
            最近同步：{new Date(lastCloudSyncAt).toLocaleString('zh-TW')}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <h4 className="font-bold text-sm text-slate-900">同步設定（兩台電腦填一模一樣）</h4>

          <label className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
            <span className="text-xs font-bold text-slate-800">啟用跨電腦同步</span>
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
              className="w-4 h-4 accent-amber-500"
            />
          </label>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1">
              <LinkIcon className="w-3.5 h-3.5 text-sky-500" />
              Firebase Realtime Database 網址
            </label>
            <input
              type="url"
              value={form.databaseUrl}
              onChange={(e) => setForm({ ...form, databaseUrl: e.target.value })}
              placeholder="https://你的專案-default-rtdb.asia-southeast1.firebasedatabase.app"
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1">
              <KeyRound className="w-3.5 h-3.5 text-amber-500" />
              學校同步密碼（至少 4 字，A、B 電腦相同）
            </label>
            <input
              type="text"
              value={form.schoolKey}
              onChange={(e) => setForm({ ...form, schoolKey: e.target.value })}
              placeholder="例如：SHFS-本校-2026"
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              資料會加密後才上傳。沒有這組密碼，其他人即使找到資料庫也讀不懂。
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-bold"
            >
              儲存並啟用
            </button>
            <button
              type="button"
              onClick={handleTest}
              disabled={testing}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-1"
            >
              {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              測試連線
            </button>
          </div>
          {testMsg && (
            <div className="flex items-start gap-1.5 text-xs text-slate-700">
              {cloudSyncStatus === 'error' ? (
                <AlertCircle className="w-3.5 h-3.5 text-rose-500 mt-0.5" />
              ) : (
                <Check className="w-3.5 h-3.5 text-emerald-600 mt-0.5" />
              )}
              <span>{testMsg}</span>
            </div>
          )}
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3 text-xs text-slate-600">
          <h4 className="font-bold text-sm text-slate-900">第一次設定（約 5 分鐘，免費）</h4>
          <ol className="list-decimal pl-4 space-y-2 leading-relaxed">
            <li>
              用 Google 帳號開啟{' '}
              <a
                href="https://console.firebase.google.com/"
                target="_blank"
                rel="noreferrer"
                className="text-indigo-600 font-bold underline"
              >
                Firebase Console
              </a>
              ，建立專案（不必開 Analytics）。
            </li>
            <li>左側「Build」➔「Realtime Database」➔ 建立資料庫，地區選新加坡或台灣最近的。</li>
            <li>
              規則改成：
              <pre className="mt-1 p-2 bg-slate-900 text-amber-200 rounded-lg overflow-x-auto text-[11px]">{`{
  "rules": {
    "shfs": {
      ".read": true,
      ".write": true
    }
  }
}`}</pre>
            </li>
            <li>複製資料庫網址（結尾通常是 <code>.firebasedatabase.app</code> 或 <code>.firebaseio.com</code>）。</li>
            <li>A、B 兩台電腦都貼上同一網址、同一學校同步密碼，並勾選啟用。</li>
          </ol>
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900">
            啟用後請在 A 再匯入一次課表（或任意改一個設定），B 電腦保持網頁開著或重新整理即可看到。
          </div>
          <div className="flex items-center gap-1.5 text-slate-500">
            <CloudOff className="w-3.5 h-3.5" />
            未啟用時仍可使用「匯出／匯入整份備份」手動搬資料。
          </div>
        </div>
      </div>
    </div>
  );
};
