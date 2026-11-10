/**
 * 回歸：RTDB Auth 輔助函式（projectId 解析、query 附加、Web 設定解析）
 */
import assert from 'node:assert/strict';
import {
  appendQueryParam,
  projectIdFromDatabaseUrl,
  resetFirebaseRtdbClientCaches,
} from '../src/utils/firebaseRtdbClient';
import {
  DEFAULT_DATABASE_URL,
  resolveFirebaseWebConfig,
  type CloudSyncSettings,
} from '../src/utils/cloudSync';

assert.equal(
  projectIdFromDatabaseUrl(DEFAULT_DATABASE_URL),
  'linetalk-3d25e',
  'asia-southeast1 default-rtdb 網址應解析出 projectId'
);
assert.equal(
  projectIdFromDatabaseUrl('https://demo-project.firebaseio.com'),
  'demo-project'
);
assert.equal(projectIdFromDatabaseUrl('not-a-url'), null);

assert.equal(
  appendQueryParam('https://example.test/a.json', 'auth', 'tok'),
  'https://example.test/a.json?auth=tok'
);
assert.equal(
  appendQueryParam('https://example.test/a.json?orderBy=%22%24key%22', 'auth', 'tok+1'),
  'https://example.test/a.json?orderBy=%22%24key%22&auth=tok%2B1'
);

const settings: CloudSyncSettings = {
  enabled: true,
  databaseUrl: DEFAULT_DATABASE_URL,
  schoolKey: 'test-school',
  apiKey: ' AAAA ',
  appId: '1:1:web:abc',
  appCheckSiteKey: 'site',
};
const web = resolveFirebaseWebConfig(settings);
assert.equal(web.apiKey, 'AAAA');
assert.equal(web.appId, '1:1:web:abc');
assert.equal(web.appCheckSiteKey, 'site');

const fromDefault = resolveFirebaseWebConfig({
  enabled: true,
  databaseUrl: DEFAULT_DATABASE_URL,
  schoolKey: 'test-school',
});
assert.ok(fromDefault.apiKey.length > 10, '應用應內建預設 Web API 金鑰，教師端才不必手填');
assert.ok(fromDefault.appId.includes(':web:'), '應用應內建預設 App ID');

resetFirebaseRtdbClientCaches();
console.log('regression-firebase-rtdb-auth: ok');
