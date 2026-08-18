import React, { useRef, useState } from 'react';
import { Download, Upload, AlertTriangle, X } from 'lucide-react';
import { exportSystemBackup, importSystemBackup } from '../../utils/dataBackup';

interface BackupTransferButtonsProps {
  variant?: 'header' | 'light';
}

export const BackupTransferButtons: React.FC<BackupTransferButtonsProps> = ({
  variant = 'light',
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const isHeader = variant === 'header';
  const btnClass = isHeader
    ? 'flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs border border-slate-700 transition'
    : 'flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-xs font-semibold shadow-xs transition';

  const handleFileChosen = (file?: File) => {
    if (!file) return;
    setPendingFile(file);
    setErrorMsg('');
    setIsConfirmOpen(true);
  };

  const handleConfirmImport = async () => {
    if (!pendingFile) return;
    try {
      await importSystemBackup(pendingFile);
    } catch (err: any) {
      setErrorMsg(err?.message || '匯入失敗，請重新選擇備份檔。');
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={exportSystemBackup}
        className={btnClass}
        title="匯出課表、申請單與設定，拿到其他電腦匯入"
      >
        <Download className={`w-3.5 h-3.5 ${isHeader ? '' : 'text-amber-500'}`} />
        <span className={isHeader ? 'hidden sm:inline' : ''}>匯出整份備份</span>
      </button>

      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className={btnClass}
        title="匯入其他電腦匯出的整份備份"
      >
        <Upload className={`w-3.5 h-3.5 ${isHeader ? '' : 'text-indigo-500'}`} />
        <span className={isHeader ? 'hidden sm:inline' : ''}>匯入整份備份</span>
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => {
          handleFileChosen(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      {isConfirmOpen && (
        <div className="fixed inset-0 z-[90] overflow-y-auto bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 rounded-2xl shadow-2xl max-w-md w-full border border-slate-700 overflow-hidden text-left">
            <div className="bg-slate-800 text-white p-4 flex items-center justify-between border-b border-slate-700">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
                <span className="font-bold text-sm">確認匯入整份備份</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsConfirmOpen(false);
                  setPendingFile(null);
                  setErrorMsg('');
                }}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-700 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-3">
              <p className="text-slate-200 text-sm font-medium leading-relaxed">
                將匯入「{pendingFile?.name}」，覆蓋這台電腦目前的課表、教師、申請單與設定。
              </p>
              <div className="p-3 bg-amber-950/50 rounded-xl border border-amber-800/80 text-xs text-amber-300">
                用於把 A 電腦的資料帶到 B 電腦。匯入後網頁會自動重新整理。
              </div>
              {errorMsg && (
                <div className="text-xs text-rose-400 font-medium">{errorMsg}</div>
              )}
            </div>
            <div className="p-4 bg-slate-800/60 border-t border-slate-800 flex items-center justify-end space-x-2.5">
              <button
                type="button"
                onClick={() => {
                  setIsConfirmOpen(false);
                  setPendingFile(null);
                  setErrorMsg('');
                }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition border border-slate-700"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleConfirmImport}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-bold transition"
              >
                確認匯入並重新整理
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
