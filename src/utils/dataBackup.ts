import { STORAGE_KEYS } from '../context/AppContext';
import { clearLocalAuthTrust } from './localAuthTrust';
import { isPasswordHash } from './passwordCrypto';
import { PATROL_PENDING_KEY, PATROL_RECORDS_KEY } from './patrolSync';

/** 不在 STORAGE_KEYS 的本機資料；還原時舊備份沒有這些欄位就保留現有資料 */
const EXTRA_BACKUP_KEYS = [PATROL_RECORDS_KEY];

export const BACKUP_APP_ID = 'SHFS';
export const BACKUP_VERSION = 2;
/** 匯入後若已啟用雲端同步，暫停自動覆寫，請使用者選擇推送或拉取 */
export const POST_BACKUP_IMPORT_FLAG = 'voc_post_backup_import_v1';

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

function assertBackupValue(key: string, value: unknown): asserts value is string | null | undefined {
  if (value === undefined || value === null || typeof value === 'string') return;
  throw new Error(`備份欄位「${key}」格式無效，已中止匯入以免資料不一致。`);
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
  EXTRA_BACKUP_KEYS.forEach((key) => {
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

  if (
    payload.version != null &&
    (typeof payload.version !== 'number' ||
      !Number.isFinite(payload.version) ||
      payload.version > BACKUP_VERSION)
  ) {
    throw new Error(`不支援的備份版本（${String(payload.version)}），請使用較新的系統匯入。`);
  }

  // 先消毒並驗證，全部通過後再寫入，避免半套用
  const mainWrites: { key: string; value: string | null }[] = [];
  for (const key of Object.values(STORAGE_KEYS)) {
    const raw = payload.data[key] as unknown;
    assertBackupValue(key, raw);
    let value: string | null = raw ?? null;
    if (key === STORAGE_KEYS.TEACHERS && typeof value === 'string') {
      value = sanitizeTeachersJson(value);
    }
    if (key === STORAGE_KEYS.STAFF_LIST && typeof value === 'string') {
      value = sanitizePasswordListJson(value);
    }
    if (key === STORAGE_KEYS.CONFIG && typeof value === 'string') {
      value = sanitizeConfigJson(value);
    }
    mainWrites.push({ key, value });
  }

  const extraWrites: { key: string; value: string | null }[] = [];
  for (const key of EXTRA_BACKUP_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(payload.data, key)) continue;
    const raw = payload.data[key] as unknown;
    assertBackupValue(key, raw);
    // 缺欄位已 skip；明確 null → 清除；字串 → 還原
    extraWrites.push({ key, value: raw ?? null });
  }

  for (const { key, value } of mainWrites) {
    if (typeof value === 'string') localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  }
  for (const { key, value } of extraWrites) {
    if (typeof value === 'string') localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  }

  // 待上傳佇列屬本機操作狀態，不可跨機延續，否則可能誤刪／復活雲端巡堂紀錄
  localStorage.removeItem(PATROL_PENDING_KEY);
  // 匯入後密碼可能已變更，清除本機「已驗證」信任以免略過密碼門檻
  clearLocalAuthTrust();
  // 若已啟用雲端同步：暫停自動覆寫，請使用者選擇強制推送或拉取遠端
  // （同步密碼不進備份，故保留 voc_cloud_sync_v1；時間戳保留供衝突比對）
  localStorage.setItem(POST_BACKUP_IMPORT_FLAG, '1');

  window.location.reload();
};
