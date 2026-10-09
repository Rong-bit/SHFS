/**
 * 回歸：整份備份匯入對巡堂／pending／null 的行為。
 * 執行：npx tsx scripts/regression-backup-import.ts
 */
import assert from 'node:assert/strict';
import { BACKUP_APP_ID, BACKUP_VERSION, POST_BACKUP_IMPORT_FLAG } from '../src/utils/dataBackup';
import { PATROL_PENDING_KEY, PATROL_RECORDS_KEY } from '../src/utils/patrolSync';

type Store = Record<string, string>;

function installLocalStorage(initial: Store = {}) {
  const store: Store = { ...initial };
  const ls = {
    getItem: (k: string) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k: string, v: string) => {
      store[k] = String(v);
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      for (const k of Object.keys(store)) delete store[k];
    },
    key: (i: number) => Object.keys(store)[i] ?? null,
    get length() {
      return Object.keys(store).length;
    },
  };
  (globalThis as unknown as { localStorage: typeof ls }).localStorage = ls;
  return store;
}

async function main() {
  // Mock reload
  Object.defineProperty(globalThis, 'window', {
    value: { location: { reload: () => {} } },
    configurable: true,
  });

  const { importSystemBackup } = await import('../src/utils/dataBackup');

  // 1) 明確 null 應清除巡堂紀錄；pending 一律清除；寫入匯入旗標
  {
    const store = installLocalStorage({
      voc_teachers_v1: '[]',
      voc_venues_v1: '[]',
      voc_sessions_v1: '[]',
      voc_requests_v1: '[]',
      voc_config_v1: '{}',
      voc_role_v1: 'teacher',
      voc_curr_teacher_v1: 't1',
      voc_curr_staff_v1: 's1',
      voc_academic_staff_v1: '[]',
      [PATROL_RECORDS_KEY]: JSON.stringify([{ id: 'keep-me' }]),
      [PATROL_PENDING_KEY]: JSON.stringify([{ opId: 'x', op: 'delete', id: 'keep-me', date: '2020-01-01' }]),
      voc_auth_trust_v1: JSON.stringify({ 'role:admin': Date.now() }),
    });

    const file = new File(
      [
        JSON.stringify({
          app: BACKUP_APP_ID,
          version: BACKUP_VERSION,
          exportedAt: new Date().toISOString(),
          data: {
            voc_teachers_v1: '[]',
            voc_venues_v1: '[]',
            voc_sessions_v1: '[]',
            voc_requests_v1: '[]',
            voc_config_v1: '{}',
            voc_role_v1: 'teacher',
            voc_curr_teacher_v1: 't1',
            voc_curr_staff_v1: 's1',
            voc_academic_staff_v1: '[]',
            [PATROL_RECORDS_KEY]: null,
          },
        }),
      ],
      'b.json',
      { type: 'application/json' }
    );

    await importSystemBackup(file);
    assert.equal(store[PATROL_RECORDS_KEY], undefined, 'null 應清除巡堂紀錄');
    assert.equal(store[PATROL_PENDING_KEY], undefined, 'pending 應清除');
    assert.equal(store.voc_auth_trust_v1, undefined, '登入信任應清除');
    assert.equal(store[POST_BACKUP_IMPORT_FLAG], '1', '應標記剛匯入');
  }

  // 2) 舊備份缺巡堂欄位 → 保留本機紀錄
  {
    const store = installLocalStorage({
      voc_teachers_v1: '[]',
      voc_venues_v1: '[]',
      voc_sessions_v1: '[]',
      voc_requests_v1: '[]',
      voc_config_v1: '{}',
      voc_role_v1: 'teacher',
      voc_curr_teacher_v1: 't1',
      voc_curr_staff_v1: 's1',
      voc_academic_staff_v1: '[]',
      [PATROL_RECORDS_KEY]: JSON.stringify([{ id: 'old-local' }]),
    });

    const file = new File(
      [
        JSON.stringify({
          app: BACKUP_APP_ID,
          version: 1,
          exportedAt: new Date().toISOString(),
          data: {
            voc_teachers_v1: '[]',
            voc_venues_v1: '[]',
            voc_sessions_v1: '[]',
            voc_requests_v1: '[]',
            voc_config_v1: '{}',
            voc_role_v1: 'teacher',
            voc_curr_teacher_v1: 't1',
            voc_curr_staff_v1: 's1',
            voc_academic_staff_v1: '[]',
          },
        }),
      ],
      'old.json',
      { type: 'application/json' }
    );

    await importSystemBackup(file);
    assert.equal(store[PATROL_RECORDS_KEY], JSON.stringify([{ id: 'old-local' }]), '缺欄位應保留');
  }

  // 3) 過新版本應拒絕
  {
    installLocalStorage({});
    const file = new File(
      [
        JSON.stringify({
          app: BACKUP_APP_ID,
          version: BACKUP_VERSION + 1,
          exportedAt: new Date().toISOString(),
          data: {},
        }),
      ],
      'new.json',
      { type: 'application/json' }
    );
    await assert.rejects(() => importSystemBackup(file), /不支援的備份版本/);
  }

  console.log('regression-backup-import: OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
