import React, { useState } from 'react';
import { Cloud, CloudOff, Check, AlertCircle, Loader2, KeyRound, Link as LinkIcon } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { CloudSyncSettings, DEFAULT_DATABASE_URL, testCloudSyncConnection } from '../../utils/cloudSync';

export const CloudSyncPanel: React.FC = () => {
  const {
    cloudSyncSettings,
    cloudSyncStatus,
    cloudSyncMessage,
    lastCloudSyncAt,
    updateCloudSyncSettings,
    pullCloudOverwriteLocal,
    forcePushLocalToCloud,
  } = useApp();

  const [form, setForm] = useState<CloudSyncSettings>(cloudSyncSettings);
  const [testMsg, setTestMsg] = useState('');
  const [testing, setTesting] = useState(false);
  const [resolving, setResolving] = useState(false);

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
              啟用後，課表、教師名冊、教學組名冊與申請單會寫入學校共用雲端。登入密碼（教師／行政）只留在各電腦本機，不會上傳。教師電腦不必進本頁：右上角「加入同步」輸入學校同步密碼即可。
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
        {cloudSyncMessage.includes('暫停自動覆寫') && (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={resolving}
              onClick={async () => {
                if (
                  !window.confirm(
                    '將以雲端資料覆蓋本機（本機尚未推送的變更會消失）。確定採用對方資料？'
                  )
                ) {
                  return;
                }
                setResolving(true);
                try {
                  await pullCloudOverwriteLocal();
                } finally {
                  setResolving(false);
                }
              }}
              className="px-3 py-2 rounded-xl text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-50"
            >
              拉取遠端（採用對方）
            </button>
            <button
              type="button"
              disabled={resolving}
              onClick={async () => {
                if (
                  !window.confirm(
                    '將以本機資料強制覆寫雲端（其他電腦未同步變更可能被蓋掉）。確定推送本機？'
                  )
                ) {
                  return;
                }
                setResolving(true);
                try {
                  await forcePushLocalToCloud();
                } finally {
                  setResolving(false);
                }
              }}
              className="px-3 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white disabled:opacity-50"
            >
              強制推送本機
            </button>
          </div>
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
              placeholder={DEFAULT_DATABASE_URL}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1">
              <KeyRound className="w-3.5 h-3.5 text-amber-500" />
              學校同步密碼（至少 4 字；全校各電腦必須完全相同）
            </label>
            <input
              type="text"
              value={form.schoolKey}
              onChange={(e) => setForm({ ...form, schoolKey: e.target.value })}
              placeholder="例如：SHFS-本校-2026"
              autoComplete="off"
              spellCheck={false}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              這不是教學組登入密碼。密碼差一個字會連到另一個空的雲端位置，看起來像「無法同步」。請把同一組密碼完整提供給助理與教師。
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
            <li>
              管理員在本頁填網址與學校同步密碼並啟用。老師電腦只要在右上角按「加入同步」、輸入同一組學校同步密碼即可，不必登入系統管理員。
            </li>
          </ol>
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900">
            啟用後請在 A 再匯入一次課表（或任意改一個設定），B 電腦保持網頁開著或重新整理即可看到。
          </div>
          <div className="flex items-center gap-1.5 text-slate-500">
            <CloudOff className="w-3.5 h-3.5" />
            未啟用時，可到系統管理員頁使用「匯出／匯入整份備份」手動搬資料。
          </div>
        </div>
      </div>
    </div>
  );
};
