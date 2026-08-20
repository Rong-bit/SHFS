import { AcademicStaff, CourseSession, SubstituteRequest, SystemConfig, Teacher, WorkshopVenue } from '../types';

export const CLOUD_SYNC_STORAGE_KEY = 'voc_cloud_sync_v1';
export const CLOUD_SYNC_UPDATED_AT_KEY = 'voc_cloud_sync_updated_at';
export const DEFAULT_DATABASE_URL =
  'https://linetalk-3d25e-default-rtdb.asia-southeast1.firebasedatabase.app';

export interface CloudSyncSettings {
  enabled: boolean;
  databaseUrl: string;
  schoolKey: string;
}

export interface SharedSchoolData {
  updatedAt: number;
  teachers: Teacher[];
  venues: WorkshopVenue[];
  sessions: CourseSession[];
  requests: SubstituteRequest[];
  systemConfig: SystemConfig;
  academicStaffList: AcademicStaff[];
}

interface EncryptedEnvelope {
  v: 1;
  iv: string;
  ct: string;
  updatedAt: number;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const loadCloudSyncSettings = (): CloudSyncSettings => {
  try {
    const raw = localStorage.getItem(CLOUD_SYNC_STORAGE_KEY);
    if (!raw) return { enabled: false, databaseUrl: DEFAULT_DATABASE_URL, schoolKey: '' };
    const parsed = JSON.parse(raw);
    return {
      enabled: Boolean(parsed.enabled),
      databaseUrl: String(parsed.databaseUrl || DEFAULT_DATABASE_URL).trim() || DEFAULT_DATABASE_URL,
      schoolKey: String(parsed.schoolKey || '').trim(),
    };
  } catch {
    return { enabled: false, databaseUrl: DEFAULT_DATABASE_URL, schoolKey: '' };
  }
};

export const saveCloudSyncSettings = (settings: CloudSyncSettings) => {
  localStorage.setItem(CLOUD_SYNC_STORAGE_KEY, JSON.stringify(settings));
};

export const isCloudSyncReady = (settings: CloudSyncSettings) =>
  Boolean(settings.enabled && settings.databaseUrl && settings.schoolKey.length >= 4);

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
};

const base64ToBytes = (value: string) => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

const deriveAesKey = async (schoolKey: string) => {
  const material = await crypto.subtle.importKey('raw', encoder.encode(schoolKey), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode('SHFS-cloud-sync-v1'),
      iterations: 100000,
      hash: 'SHA-256',
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
};

const pathIdForSchool = async (schoolKey: string) => {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(`shfs:${schoolKey}`));
  return Array.from(new Uint8Array(digest))
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

const normalizeDatabaseUrl = (url: string) => url.trim().replace(/\/+$/, '');

const buildEndpoint = async (settings: CloudSyncSettings) => {
  const base = normalizeDatabaseUrl(settings.databaseUrl);
  const id = await pathIdForSchool(settings.schoolKey);
  return `${base}/shfs/${id}.json`;
};

/** 上傳前剝除登入密文：教師／組員密碼與角色密碼不進雲端 */
export const stripSecretsFromSharedData = (data: SharedSchoolData): SharedSchoolData => {
  const auth = data.systemConfig?.authConfig;
  return {
    ...data,
    teachers: (data.teachers || []).map((t) => {
      const { password: _pw, ...rest } = t;
      return rest;
    }),
    academicStaffList: (data.academicStaffList || []).map((s) => {
      const { password: _pw, ...rest } = s;
      return rest;
    }),
    systemConfig: {
      ...data.systemConfig,
      authConfig: auth
        ? {
            requirePassword: auth.requirePassword !== false,
            defaultTeacherPassword: '',
            adminPassword: '',
            academicPassword: '',
            accountingPassword: '',
          }
        : undefined,
    },
  };
};

/**
 * 拉取後併回本機密文，避免雲端空密碼覆寫本機設定。
 * requirePassword 仍採雲端（全校政策可同步）。
 */
export const mergeLocalSecretsIntoRemote = (
  remote: SharedSchoolData,
  localTeachers: Teacher[],
  localAuth?: SystemConfig['authConfig'],
  localStaff?: AcademicStaff[]
): SharedSchoolData => {
  const localPwd = new Map(
    localTeachers.filter((t) => t.password).map((t) => [t.id, t.password as string])
  );
  const localStaffPwd = new Map(
    (localStaff || []).filter((s) => s.password).map((s) => [s.id, s.password as string])
  );
  const remoteAuth = remote.systemConfig?.authConfig;
  return {
    ...remote,
    teachers: (remote.teachers || []).map((t) => ({
      ...t,
      password: localPwd.get(t.id) || t.password,
    })),
    academicStaffList: (remote.academicStaffList || []).map((s) => ({
      ...s,
      password: localStaffPwd.get(s.id) || s.password,
    })),
    systemConfig: {
      ...remote.systemConfig,
      authConfig: {
        requirePassword: remoteAuth?.requirePassword ?? localAuth?.requirePassword ?? true,
        defaultTeacherPassword:
          localAuth?.defaultTeacherPassword ||
          remoteAuth?.defaultTeacherPassword ||
          '1234',
        adminPassword: localAuth?.adminPassword || remoteAuth?.adminPassword || '',
        academicPassword:
          localAuth?.academicPassword || remoteAuth?.academicPassword || '1234',
        accountingPassword:
          localAuth?.accountingPassword || remoteAuth?.accountingPassword || '1234',
      },
    },
  };
};

const encryptPayload = async (schoolKey: string, data: SharedSchoolData): Promise<EncryptedEnvelope> => {
  const key = await deriveAesKey(schoolKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipherBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(JSON.stringify(data))
  );
  return {
    v: 1,
    iv: bytesToBase64(iv),
    ct: bytesToBase64(new Uint8Array(cipherBuf)),
    updatedAt: data.updatedAt,
  };
};

const decryptPayload = async (schoolKey: string, envelope: EncryptedEnvelope): Promise<SharedSchoolData> => {
  const key = await deriveAesKey(schoolKey);
  const plainBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(envelope.iv) },
    key,
    base64ToBytes(envelope.ct)
  );
  return JSON.parse(decoder.decode(plainBuf)) as SharedSchoolData;
};

export const pullSharedSchoolData = async (
  settings: CloudSyncSettings
): Promise<SharedSchoolData | null> => {
  if (!isCloudSyncReady(settings)) return null;
  const endpoint = await buildEndpoint(settings);
  const res = await fetch(endpoint);
  if (!res.ok) {
    throw new Error(`同步讀取失敗（HTTP ${res.status}）。請確認資料庫網址與規則。`);
  }
  const json = await res.json();
  if (!json) return null;
  if (json.v === 1 && json.ct && json.iv) {
    return decryptPayload(settings.schoolKey, json as EncryptedEnvelope);
  }
  throw new Error('雲端資料格式不符，或同步密碼不正確。');
};

export type PushSharedResult = 'ok' | 'conflict';

/**
 * 寫入雲端。若 ifMatchUpdatedAt 有值且遠端較新，不覆寫並回傳 conflict。
 * 成功後才視為寫入完成（呼叫端應在 ok 後再更新本機時間戳）。
 */
export const pushSharedSchoolData = async (
  settings: CloudSyncSettings,
  data: SharedSchoolData,
  options?: { ifMatchUpdatedAt?: number }
): Promise<PushSharedResult> => {
  if (!isCloudSyncReady(settings)) return 'ok';

  if (options?.ifMatchUpdatedAt != null) {
    const remote = await pullSharedSchoolData(settings);
    if (remote && remote.updatedAt > options.ifMatchUpdatedAt) {
      return 'conflict';
    }
  }

  const endpoint = await buildEndpoint(settings);
  const safe = stripSecretsFromSharedData(data);
  const envelope = await encryptPayload(settings.schoolKey, safe);
  const res = await fetch(endpoint, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(envelope),
  });
  if (!res.ok) {
    throw new Error(`同步寫入失敗（HTTP ${res.status}）。請確認 Realtime Database 規則允許寫入。`);
  }
  return 'ok';
};

export const testCloudSyncConnection = async (settings: CloudSyncSettings): Promise<string> => {
  const probe = await probeCloudSync(settings);
  return probe.message;
};

export type CloudSyncProbeResult = {
  ok: true;
  hasRemoteData: boolean;
  message: string;
};

/**
 * 探測同步連線。
 * 注意：同步密碼會決定雲端路徑，密碼差一個字就連到另一個空位置（看起來像「無法同步」）。
 */
export const probeCloudSync = async (settings: CloudSyncSettings): Promise<CloudSyncProbeResult> => {
  if (!settings.databaseUrl.trim()) throw new Error('請先填寫 Firebase 資料庫網址');
  const key = settings.schoolKey.trim();
  if (key.length < 4) throw new Error('同步密碼至少 4 個字');

  const endpoint = await buildEndpoint({ ...settings, schoolKey: key, enabled: true });
  const res = await fetch(endpoint);
  if (!res.ok) throw new Error(`連線失敗（HTTP ${res.status}）。請確認網路或資料庫網址。`);

  const json = await res.json();
  if (!json) {
    return {
      ok: true,
      hasRemoteData: false,
      message:
        '連線成功，但此密碼對應的雲端尚無資料。若其他電腦已在同步，代表密碼可能不一致（大小寫、符號、空白都要相同）；若這是全校第一台啟用，可繼續。',
    };
  }

  if (json.v === 1 && json.ct && json.iv) {
    try {
      await decryptPayload(key, json as EncryptedEnvelope);
    } catch {
      throw new Error(
        '同步密碼無法解密雲端資料。請確認是「學校同步密碼」，不是教學組／管理員登入密碼。'
      );
    }
    return {
      ok: true,
      hasRemoteData: true,
      message: '連線成功，已讀到學校雲端資料，可以加入同步。',
    };
  }

  throw new Error('雲端資料格式不符。');
};
