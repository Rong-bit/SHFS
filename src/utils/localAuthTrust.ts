/** 本機記住已驗證身分（僅存身分 key 與時間，不存密碼） */
const STORAGE_KEY = 'voc_auth_trust_v1';
/** 30 天內曾成功登入則視為本機已信任 */
const TRUST_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** 全校教師預設密碼變更時撤銷所有 teacher:* 信任 */
export const ALL_TEACHERS_TRUST_REVOCATION_KEY = 'teacher:*';

type TrustStore = Record<string, number>;

/** 由 AppContext 注入、隨雲端同步的撤銷表 */
let syncedRevocations: Record<string, number> = {};

export function setAuthTrustRevocations(revocations?: Record<string, number> | null) {
  syncedRevocations =
    revocations && typeof revocations === 'object' ? { ...revocations } : {};
}

export function getAuthTrustRevocations(): Record<string, number> {
  return { ...syncedRevocations };
}

export function mergeAuthTrustRevocations(
  a?: Record<string, number> | null,
  b?: Record<string, number> | null
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const src of [a, b]) {
    if (!src) continue;
    for (const [key, ts] of Object.entries(src)) {
      if (!key || typeof ts !== 'number' || !Number.isFinite(ts)) continue;
      out[key] = Math.max(out[key] || 0, ts);
    }
  }
  return out;
}

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
  // 處室／組別切換需綁定人員，避免教務主任信任後直接進實習主任等
  if (
    role === 'academic' ||
    role === 'accounting' ||
    role === 'student_affairs' ||
    role === 'principal'
  ) {
    return `role:${role}:${staffId || ''}`;
  }
  return `role:${role}`;
}

export function teacherAuthTrustKey(teacherId: string): string {
  return `teacher:${teacherId}`;
}

export function staffAuthTrustRevocationKey(staffId: string): string {
  return `staff:${staffId}`;
}

/** 角色密碼變更用（撤銷該角色下所有人員信任） */
export function rolePasswordRevocationKey(role: string): string {
  if (role === 'admin') return 'role:admin';
  return `role:${role}`;
}

/** 某信任 key 的有效撤銷時間（含前綴／人員層級） */
export function effectiveRevokedAt(
  key: string,
  revocations: Record<string, number> = syncedRevocations
): number {
  let max = revocations[key] || 0;
  if (key.startsWith('teacher:')) {
    max = Math.max(max, revocations[ALL_TEACHERS_TRUST_REVOCATION_KEY] || 0);
  }
  if (key.startsWith('role:')) {
    const parts = key.split(':');
    // role:academic:staffId → 亦看 role:academic、staff:staffId
    if (parts.length >= 2) {
      max = Math.max(max, revocations[`role:${parts[1]}`] || 0);
    }
    if (parts.length >= 3 && parts[2]) {
      max = Math.max(max, revocations[`staff:${parts[2]}`] || 0);
    }
  }
  return max;
}

export function isLocalAuthTrusted(key: string): boolean {
  if (!key) return false;
  const store = pruneStore(readStore());
  writeStore(store);
  const verifiedAt = store[key];
  if (verifiedAt == null) return false;
  if (Date.now() - verifiedAt > TRUST_TTL_MS) return false;
  return verifiedAt > effectiveRevokedAt(key);
}

export function markLocalAuthTrusted(key: string) {
  if (!key) return;
  const store = pruneStore(readStore());
  // 須嚴格晚於撤銷時間，避免同毫秒改密碼後立刻重登仍被視為未信任
  store[key] = Math.max(Date.now(), effectiveRevokedAt(key) + 1);
  writeStore(store);
}

export function clearLocalAuthTrust() {
  localStorage.removeItem(STORAGE_KEY);
}

/** 本機立刻忘掉某 key（改密碼當下）；雲端靠 revocations 同步到他台 */
export function clearLocalAuthTrustKey(key: string) {
  if (!key) return;
  const store = pruneStore(readStore());
  delete store[key];
  writeStore(store);
}
