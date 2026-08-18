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

export const pushSharedSchoolData = async (
  settings: CloudSyncSettings,
  data: SharedSchoolData
): Promise<void> => {
  if (!isCloudSyncReady(settings)) return;
  const endpoint = await buildEndpoint(settings);
  const envelope = await encryptPayload(settings.schoolKey, data);
  const res = await fetch(endpoint, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(envelope),
  });
  if (!res.ok) {
    throw new Error(`同步寫入失敗（HTTP ${res.status}）。請確認 Realtime Database 規則允許寫入。`);
  }
};

export const testCloudSyncConnection = async (settings: CloudSyncSettings): Promise<string> => {
  if (!settings.databaseUrl.trim()) throw new Error('請先填寫 Firebase 資料庫網址');
  if (settings.schoolKey.trim().length < 4) throw new Error('同步密碼至少 4 個字');
  const endpoint = await buildEndpoint({ ...settings, enabled: true });
  const res = await fetch(endpoint);
  if (!res.ok) throw new Error(`連線失敗（HTTP ${res.status}）`);
  return '連線成功，可以啟用跨電腦同步';
};
