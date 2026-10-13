/**
 * 回歸：同同步密碼下，管理員／處室／教師個人／SMTP 密碼皆進雲端並雙向同步。
 */
import assert from 'node:assert/strict';
import {
  mergeLocalSecretsIntoRemote,
  stripSecretsFromSharedData,
  SharedSchoolData,
} from '../src/utils/cloudSync';
import { INITIAL_SYSTEM_CONFIG, INITIAL_TEACHERS, INITIAL_ACADEMIC_STAFF } from '../src/data/mockData';

const base: SharedSchoolData = {
  updatedAt: Date.now(),
  teachers: [
    {
      ...INITIAL_TEACHERS[0],
      id: 't1',
      password: 'shfs1$teacher-a',
    },
  ],
  venues: [],
  sessions: [],
  requests: [],
  academicStaffList: [
    {
      ...INITIAL_ACADEMIC_STAFF[0],
      id: 's1',
      password: 'shfs1$staff-a',
    },
  ],
  systemConfig: {
    ...INITIAL_SYSTEM_CONFIG,
    authConfig: {
      requirePassword: true,
      defaultTeacherPassword: 'shfs1$default-teacher',
      adminPassword: 'shfs1$admin-a',
      academicPassword: 'shfs1$academic',
      accountingPassword: 'shfs1$accounting',
      studentAffairsPassword: 'shfs1$sa',
      principalPassword: 'shfs1$principal',
    },
    patrolMailConfig: {
      enabled: true,
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      user: 'a@b.c',
      pass: 'smtp-secret-a',
      fromName: 'School',
      fromEmail: 'a@b.c',
    },
  },
};

const stripped = stripSecretsFromSharedData(base);
assert.equal(stripped.teachers[0].password, 'shfs1$teacher-a', '教師個人密碼應上傳');
assert.equal(stripped.academicStaffList[0].password, 'shfs1$staff-a', '組員個人密碼應上傳');
assert.equal(stripped.systemConfig.patrolMailConfig?.pass, 'smtp-secret-a', 'SMTP 密碼應上傳');
assert.equal(stripped.systemConfig.authConfig?.adminPassword, 'shfs1$admin-a');

// 雲端有新密碼 → 覆寫本機
const remoteNewer: SharedSchoolData = {
  ...stripped,
  teachers: [{ ...stripped.teachers[0], password: 'shfs1$teacher-b' }],
  academicStaffList: [{ ...stripped.academicStaffList[0], password: 'shfs1$staff-b' }],
  systemConfig: {
    ...stripped.systemConfig,
    authConfig: {
      ...stripped.systemConfig.authConfig!,
      adminPassword: 'shfs1$admin-b',
    },
    patrolMailConfig: {
      ...stripped.systemConfig.patrolMailConfig!,
      pass: 'smtp-secret-b',
    },
  },
};
const merged = mergeLocalSecretsIntoRemote(
  remoteNewer,
  base.teachers,
  base.systemConfig.authConfig,
  base.academicStaffList,
  'smtp-secret-a'
);
assert.equal(merged.systemConfig.authConfig?.adminPassword, 'shfs1$admin-b');
assert.equal(merged.teachers[0].password, 'shfs1$teacher-b');
assert.equal(merged.academicStaffList[0].password, 'shfs1$staff-b');
assert.equal(merged.systemConfig.patrolMailConfig?.pass, 'smtp-secret-b');

// 舊雲端空密碼 → 保留本機
const oldRemote: SharedSchoolData = {
  ...stripped,
  teachers: [{ ...stripped.teachers[0], password: undefined }],
  academicStaffList: [{ ...stripped.academicStaffList[0], password: undefined }],
  systemConfig: {
    ...stripped.systemConfig,
    authConfig: {
      ...stripped.systemConfig.authConfig!,
      adminPassword: '',
    },
    patrolMailConfig: {
      ...stripped.systemConfig.patrolMailConfig!,
      pass: '',
    },
  },
};
const mergedOld = mergeLocalSecretsIntoRemote(
  oldRemote,
  base.teachers,
  base.systemConfig.authConfig,
  base.academicStaffList,
  'smtp-secret-a'
);
assert.equal(mergedOld.systemConfig.authConfig?.adminPassword, 'shfs1$admin-a');
assert.equal(mergedOld.teachers[0].password, 'shfs1$teacher-a');
assert.equal(mergedOld.systemConfig.patrolMailConfig?.pass, 'smtp-secret-a');

console.log('regression-cloud-auth-sync: ok');
