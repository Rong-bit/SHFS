/** 密碼雜湊：shfs1$iterations$saltB64$hashB64（PBKDF2-SHA-256） */

const PREFIX = 'shfs1';
const ITERATIONS = 100000;
const encoder = new TextEncoder();

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

export function isPasswordHash(value?: string | null): boolean {
  if (!value) return false;
  const parts = value.split('$');
  return parts.length === 4 && parts[0] === PREFIX && Boolean(parts[2] && parts[3]);
}

async function deriveBits(plain: string, salt: Uint8Array, iterations: number): Promise<ArrayBuffer> {
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(plain), 'PBKDF2', false, [
    'deriveBits',
  ]);
  return crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );
}

export async function hashPassword(plain: string): Promise<string> {
  const trimmed = plain.trim();
  if (!trimmed) return '';
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await deriveBits(trimmed, salt, ITERATIONS);
  return `${PREFIX}$${ITERATIONS}$${bytesToBase64(salt)}$${bytesToBase64(new Uint8Array(bits))}`;
}

/** 驗證輸入；相容舊版明文（遷移前） */
export async function verifyPassword(plain: string, stored?: string | null): Promise<boolean> {
  if (stored == null || stored === '') return false;
  const input = plain.trim();
  if (!isPasswordHash(stored)) {
    return input === stored;
  }
  const [, iterStr, saltB64, hashB64] = stored.split('$');
  const iterations = Number(iterStr) || ITERATIONS;
  const salt = base64ToBytes(saltB64);
  const expected = base64ToBytes(hashB64);
  const bits = await deriveBits(input, salt, iterations);
  const actual = new Uint8Array(bits);
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i += 1) diff |= actual[i] ^ expected[i];
  return diff === 0;
}

export async function ensurePasswordHashed(value?: string | null): Promise<string | undefined> {
  if (value == null || value === '') return undefined;
  if (isPasswordHash(value)) return value;
  return hashPassword(value);
}

export type AuthPasswordFields = {
  requirePassword?: boolean;
  defaultTeacherPassword?: string;
  adminPassword?: string;
  academicPassword?: string;
  accountingPassword?: string;
};

/** 將 authConfig 內仍為明文的欄位改為雜湊；已是雜湊則保留 */
export async function hashAuthConfigPasswords<T extends AuthPasswordFields>(auth: T): Promise<T> {
  const keys = [
    'defaultTeacherPassword',
    'adminPassword',
    'academicPassword',
    'accountingPassword',
  ] as const;
  const next = { ...auth };
  for (const key of keys) {
    const v = next[key];
    if (typeof v === 'string' && v && !isPasswordHash(v)) {
      (next as AuthPasswordFields)[key] = await hashPassword(v);
    }
  }
  return next;
}

/**
 * 表單送出用：欄位空白→沿用舊值；新明文→雜湊；已是雜湊→保留。
 */
export async function resolveAuthConfigForSave(
  draft: AuthPasswordFields,
  previous?: AuthPasswordFields | null
): Promise<AuthPasswordFields> {
  const pick = async (key: keyof AuthPasswordFields): Promise<string> => {
    if (key === 'requirePassword') return '';
    const raw = draft[key];
    if (typeof raw === 'string' && raw.trim()) {
      return isPasswordHash(raw) ? raw : await hashPassword(raw.trim());
    }
    const prev = previous?.[key];
    return typeof prev === 'string' ? prev : '';
  };
  return {
    requirePassword: draft.requirePassword !== false,
    defaultTeacherPassword: await pick('defaultTeacherPassword'),
    adminPassword: await pick('adminPassword'),
    academicPassword: await pick('academicPassword'),
    accountingPassword: await pick('accountingPassword'),
  };
}
