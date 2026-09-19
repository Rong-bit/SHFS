import { STORAGE_KEYS } from '../context/AppContext';
import { isPasswordHash } from './passwordCrypto';

export const BACKUP_APP_ID = 'SHFS';
export const BACKUP_VERSION = 2;

export interface SystemBackupFile {
  app: string;
  version: number;
  exportedAt: string;
  data: Record<string, string | null>;
}

/** 備份中若仍有明文密碼則剔除（雜湊可保留以便還原登入） */
function sanitizePasswordListJson(raw: string | null): string | null {
  if (!raw) return raw;
  try {
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return raw;
    const cleaned = list.map((t: Record<string, unknown>) => {
      if (!t || typeof t !== 'object') return t;
      const pw = t.password;
      if (typeof pw === 'string' && pw && !isPasswordHash(pw)) {
        const { password: _p, ...rest } = t;
        return rest;
      }
      return t;
    });
    return JSON.stringify(cleaned);
  } catch {
    return raw;
  }
}

function sanitizeTeachersJson(raw: string | null): string | null {
  return sanitizePasswordListJson(raw);
}

function sanitizeConfigJson(raw: string | null): string | null {
  if (!raw) return raw;
  try {
    const cfg = JSON.parse(raw);
    if (!cfg || typeof cfg !== 'object') return raw;
    const auth = cfg.authConfig;
    if (auth && typeof auth === 'object') {
      for (const key of [
        'defaultTeacherPassword',
        'adminPassword',
        'academicPassword',
        'accountingPassword',
      ]) {
        const v = auth[key];
        if (typeof v === 'string' && v && !isPasswordHash(v)) {
          auth[key] = '';
        }
      }
      cfg.authConfig = auth;
    }
    return JSON.stringify(cfg);
  } catch {
    return raw;
  }
}

export const exportSystemBackup = () => {
  const data: Record<string, string | null> = {};
  Object.values(STORAGE_KEYS).forEach((key) => {
    let value = localStorage.getItem(key);
    if (key === STORAGE_KEYS.TEACHERS) value = sanitizeTeachersJson(value);
    if (key === STORAGE_KEYS.STAFF_LIST) value = sanitizePasswordListJson(value);
    if (key === STORAGE_KEYS.CONFIG) value = sanitizeConfigJson(value);
    data[key] = value;
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
    let value = payload.data[key];
    if (key === STORAGE_KEYS.TEACHERS && typeof value === 'string') {
      value = sanitizeTeachersJson(value);
    }
    if (key === STORAGE_KEYS.STAFF_LIST && typeof value === 'string') {
      value = sanitizePasswordListJson(value);
    }
    if (key === STORAGE_KEYS.CONFIG && typeof value === 'string') {
      value = sanitizeConfigJson(value);
    }
    if (typeof value === 'string') {
      localStorage.setItem(key, value);
    } else if (value == null) {
      localStorage.removeItem(key);
    }
  });

  window.location.reload();
};
