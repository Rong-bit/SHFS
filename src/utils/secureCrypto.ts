/**
 * Web Crypto 相容層：Chrome 在非安全環境（http://區網IP）沒有 crypto.subtle，
 * 會出現 Cannot read properties of undefined (reading 'digest')。
 * HTTPS／localhost 仍走原生 subtle；否則用 @noble 純 JS 後備（演算法與參數相容）。
 */
import { gcm } from '@noble/ciphers/aes';
import { pbkdf2 } from '@noble/hashes/pbkdf2';
import { sha256 } from '@noble/hashes/sha256';

const encoder = new TextEncoder();

export function hasSubtleCrypto(): boolean {
  return typeof globalThis !== 'undefined' && Boolean(globalThis.crypto?.subtle);
}

export function isSecureCryptoContext(): boolean {
  if (typeof window === 'undefined') return hasSubtleCrypto();
  // 安全內容（https／localhost）通常有 subtle；區網 http://IP 則無
  return Boolean(window.isSecureContext && hasSubtleCrypto());
}

export function getRandomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length);
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(out);
    return out;
  }
  // 極少數環境：不應用於正式密碼學，僅避免崩潰
  for (let i = 0; i < length; i += 1) out[i] = Math.floor(Math.random() * 256);
  return out;
}

export async function digestSha256(data: BufferSource): Promise<ArrayBuffer> {
  if (hasSubtleCrypto()) {
    return crypto.subtle.digest('SHA-256', data);
  }
  const bytes =
    data instanceof ArrayBuffer
      ? new Uint8Array(data)
      : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  const out = sha256(bytes);
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
}

export async function pbkdf2Sha256Bits(
  password: string,
  salt: Uint8Array,
  iterations: number,
  bits = 256
): Promise<ArrayBuffer> {
  if (hasSubtleCrypto()) {
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      'PBKDF2',
      false,
      ['deriveBits']
    );
    return crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt,
        iterations,
        hash: 'SHA-256',
      },
      keyMaterial,
      bits
    );
  }
  const dkLen = Math.ceil(bits / 8);
  const out = pbkdf2(sha256, encoder.encode(password), salt, { c: iterations, dkLen });
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
}

/** AES-GCM-256 金鑰（raw 32 bytes），供快取與加解密 */
export async function deriveAesGcmRawKey(
  password: string,
  salt: Uint8Array,
  iterations: number
): Promise<Uint8Array> {
  const bits = await pbkdf2Sha256Bits(password, salt, iterations, 256);
  return new Uint8Array(bits);
}

export async function aesGcmEncrypt(
  rawKey: Uint8Array,
  iv: Uint8Array,
  plaintext: Uint8Array
): Promise<Uint8Array> {
  if (hasSubtleCrypto()) {
    const key = await crypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, false, [
      'encrypt',
    ]);
    const buf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
    return new Uint8Array(buf);
  }
  const cipher = gcm(rawKey, iv);
  return cipher.encrypt(plaintext);
}

export async function aesGcmDecrypt(
  rawKey: Uint8Array,
  iv: Uint8Array,
  ciphertext: Uint8Array
): Promise<Uint8Array> {
  if (hasSubtleCrypto()) {
    const key = await crypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, false, [
      'decrypt',
    ]);
    const buf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return new Uint8Array(buf);
  }
  const cipher = gcm(rawKey, iv);
  return cipher.decrypt(ciphertext);
}
