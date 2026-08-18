import { STORAGE_KEYS } from '../context/AppContext';

export const BACKUP_APP_ID = 'SHFS';
export const BACKUP_VERSION = 1;

export interface SystemBackupFile {
  app: string;
  version: number;
  exportedAt: string;
  data: Record<string, string | null>;
}

export const exportSystemBackup = () => {
  const data: Record<string, string | null> = {};
  Object.values(STORAGE_KEYS).forEach((key) => {
    data[key] = localStorage.getItem(key);
  });

  const payload: SystemBackupFile = {
    app: BACKUP_APP_ID,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().slice(0, 10);
  const link = document.createElement('a');
  link.href = url;
  link.download = `SHFS整份備份_${stamp}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const importSystemBackup = async (file: File): Promise<void> => {
  const text = await file.text();
  let payload: SystemBackupFile;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error('備份檔不是有效的 JSON，請確認是否為本系統匯出的檔案。');
  }

  if (!payload || payload.app !== BACKUP_APP_ID || !payload.data || typeof payload.data !== 'object') {
    throw new Error('這不是本系統的整份備份檔。');
  }

  Object.values(STORAGE_KEYS).forEach((key) => {
    const value = payload.data[key];
    if (typeof value === 'string') {
      localStorage.setItem(key, value);
    } else if (value == null) {
      localStorage.removeItem(key);
    }
  });

  window.location.reload();
};
