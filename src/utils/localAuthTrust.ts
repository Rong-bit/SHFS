/** 本機記住已驗證身分（僅存身分 key 與時間，不存密碼） */
const STORAGE_KEY = 'voc_auth_trust_v1';
/** 30 天內曾成功登入則視為本機已信任 */
const TRUST_TTL_MS = 30 * 24 * 60 * 60 * 1000;

type TrustStore = Record<string, number>;

function readStore(): TrustStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as TrustStore;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(store: TrustStore) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

function pruneStore(store: TrustStore, now = Date.now()): TrustStore {
  const next: TrustStore = {};
  for (const [key, verifiedAt] of Object.entries(store)) {
    if (now - verifiedAt <= TRUST_TTL_MS) next[key] = verifiedAt;
  }
  return next;
}

export function roleAuthTrustKey(role: string, staffId?: string): string {
  if (role === 'admin') return 'role:admin';
  if (role === 'academic' || role === 'accounting') {
    return `role:${role}:${staffId || ''}`;
  }
  return `role:${role}`;
}

export function teacherAuthTrustKey(teacherId: string): string {
  return `teacher:${teacherId}`;
}

export function isLocalAuthTrusted(key: string): boolean {
  if (!key) return false;
  const store = pruneStore(readStore());
  writeStore(store);
  const verifiedAt = store[key];
  return verifiedAt != null && Date.now() - verifiedAt <= TRUST_TTL_MS;
}

export function markLocalAuthTrusted(key: string) {
  if (!key) return;
  const store = pruneStore(readStore());
  store[key] = Date.now();
  writeStore(store);
}

export function clearLocalAuthTrust() {
  localStorage.removeItem(STORAGE_KEY);
}
