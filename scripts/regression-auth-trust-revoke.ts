/**
 * 回歸：改密碼撤銷「記住此電腦」免密信任（含前綴／同步合併；無期限）
 */
import assert from 'node:assert/strict';

const memory = new Map<string, string>();
(globalThis as { localStorage?: Storage }).localStorage = {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => {
    memory.set(k, v);
  },
  removeItem: (k: string) => {
    memory.delete(k);
  },
  clear: () => memory.clear(),
  key: () => null,
  get length() {
    return memory.size;
  },
} as Storage;

import {
  ALL_TEACHERS_TRUST_REVOCATION_KEY,
  effectiveRevokedAt,
  isLocalAuthTrusted,
  markLocalAuthTrusted,
  mergeAuthTrustRevocations,
  roleAuthTrustKey,
  rolePasswordRevocationKey,
  setAuthTrustRevocations,
  staffAuthTrustRevocationKey,
  teacherAuthTrustKey,
  clearLocalAuthTrust,
} from '../src/utils/localAuthTrust';

clearLocalAuthTrust();
setAuthTrustRevocations({});

const teacherKey = teacherAuthTrustKey('t1');
markLocalAuthTrusted(teacherKey);
assert.equal(isLocalAuthTrusted(teacherKey), true, '剛登入應受信任');

const revokedAt = Date.now();
setAuthTrustRevocations({ [teacherKey]: revokedAt });
assert.equal(isLocalAuthTrusted(teacherKey), false, '改密碼撤銷後不應再免密');

// 重新登入（驗證時間較新）應可再信任
markLocalAuthTrusted(teacherKey);
assert.equal(isLocalAuthTrusted(teacherKey), true, '用新密碼重新登入後可再信任');

// 全校預設教師密碼變更 → teacher:*
clearLocalAuthTrust();
setAuthTrustRevocations({});
markLocalAuthTrusted(teacherAuthTrustKey('t2'));
setAuthTrustRevocations({ [ALL_TEACHERS_TRUST_REVOCATION_KEY]: Date.now() });
assert.equal(isLocalAuthTrusted(teacherAuthTrustKey('t2')), false);

// 處室角色密碼 → role:academic 撤銷所有 academic:staff
clearLocalAuthTrust();
setAuthTrustRevocations({});
const academicKey = roleAuthTrustKey('academic', 'staff-01');
markLocalAuthTrusted(academicKey);
setAuthTrustRevocations({ [rolePasswordRevocationKey('academic')]: Date.now() });
assert.equal(isLocalAuthTrusted(academicKey), false);

// 組員個人密碼 → staff:id
clearLocalAuthTrust();
setAuthTrustRevocations({});
markLocalAuthTrusted(academicKey);
setAuthTrustRevocations({ [staffAuthTrustRevocationKey('staff-01')]: Date.now() });
assert.equal(isLocalAuthTrusted(academicKey), false);

// 合併撤銷取較新
const merged = mergeAuthTrustRevocations(
  { [teacherKey]: 100 },
  { [teacherKey]: 200, a: 1 }
);
assert.equal(merged[teacherKey], 200);
assert.equal(effectiveRevokedAt(teacherKey, merged), 200);

// 管理員信任鍵不需 staffId（「記住此電腦」應可再進系統管理員）
clearLocalAuthTrust();
setAuthTrustRevocations({});
const adminKey = roleAuthTrustKey('admin');
assert.equal(adminKey, 'role:admin');
markLocalAuthTrusted(adminKey);
assert.equal(isLocalAuthTrusted(adminKey), true);
setAuthTrustRevocations({ [rolePasswordRevocationKey('admin')]: Date.now() });
assert.equal(isLocalAuthTrusted(adminKey), false);

clearLocalAuthTrust();
setAuthTrustRevocations({});
console.log('regression-auth-trust-revoke: ok');
