/**
 * 回歸：secureCrypto 加解密與 pathId 在有／無 subtle 時皆可用
 */
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { encryptJson, decryptJson, pathIdForSchool } from '../src/utils/cloudSync';
import { hashPassword, verifyPassword } from '../src/utils/passwordCrypto';

// Node 測試環境補上 global crypto（與瀏覽器 HTTPS 類似）
if (!globalThis.crypto) {
  // @ts-expect-error node webcrypto
  globalThis.crypto = webcrypto;
}

const key = 'test-school-key-2026';

const id1 = await pathIdForSchool(key);
const id2 = await pathIdForSchool(key);
assert.equal(id1, id2);
assert.equal(id1.length, 32);

const payload = { hello: '世界', n: 42, nested: { ok: true } };
const enc = await encryptJson(key, payload);
assert.equal(enc.v, 1);
assert.ok(enc.iv && enc.ct);
const dec = await decryptJson<typeof payload>(key, enc);
assert.deepEqual(dec, payload);

const hashed = await hashPassword('secret-1234');
assert.ok(hashed.startsWith('shfs1$'));
assert.equal(await verifyPassword('secret-1234', hashed), true);
assert.equal(await verifyPassword('wrong', hashed), false);

// 強制走 noble 後備：暫時拿掉 subtle
const subtle = globalThis.crypto.subtle;
Object.defineProperty(globalThis.crypto, 'subtle', {
  configurable: true,
  get: () => undefined,
});
try {
  const idFb = await pathIdForSchool(key);
  assert.equal(idFb, id1, 'fallback pathId 應與 subtle 一致');
  const encFb = await encryptJson(key, payload);
  const decFb = await decryptJson<typeof payload>(key, encFb);
  assert.deepEqual(decFb, payload);
  // 後備加密的資料，還原 subtle 後應仍可解密（格式相容）
  Object.defineProperty(globalThis.crypto, 'subtle', {
    configurable: true,
    get: () => subtle,
  });
  const decCross = await decryptJson<typeof payload>(key, encFb);
  assert.deepEqual(decCross, payload, 'subtle 應能解密 fallback 密文');
} finally {
  Object.defineProperty(globalThis.crypto, 'subtle', {
    configurable: true,
    get: () => subtle,
  });
}

console.log('regression-secure-crypto: ok');
