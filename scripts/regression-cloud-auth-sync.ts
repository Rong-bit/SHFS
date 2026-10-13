/**
 * 回歸：同同步密碼下，管理員／處室角色密碼應進雲端；個人密碼與 SMTP 不進。
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
      password: 'shfs1$local-teacher-secret',
    },
  ],
  venues: [],
  sessions: [],
  requests: [],
  academicStaffList: [
    {
      ...INITIAL_ACADEMIC_STAFF[0],
      id: 's1',
      password: 'shfs1$local-staff-secret',
    },
  ],
  systemConfig: {
    ...INITIAL_SYSTEM_CONFIG,
    authConfig: {
      requirePassword: true,
      defaultTeacherPassword: 'shfs1$default-teacher',
      adminPassword: 'shfs1$admin-new',
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
      pass: 'smtp-secret',
      fromName: 'School',
      fromEmail: 'a@b.c',
    },
  },
};

const stripped = stripSecretsFromSharedData(base);
assert.equal(stripped.teachers[0].password, undefined, '教師個人密碼不應上傳');
assert.equal(stripped.academicStaffList[0].password, undefined, '組員個人密碼不應上傳');
assert.equal(stripped.systemConfig.patrolMailConfig?.pass, '', 'SMTP 密碼不應上傳');
assert.equal(
  stripped.systemConfig.authConfig?.adminPassword,
  'shfs1$admin-new',
  '管理員密碼應上傳供同步'
);
assert.equal(stripped.systemConfig.authConfig?.academicPassword, 'shfs1$academic');
assert.equal(stripped.systemConfig.authConfig?.defaultTeacherPassword, 'shfs1$default-teacher');

// 舊雲端（角色密碼被清空）→ 保留本機
const oldRemote: SharedSchoolData = {
  ...stripped,
  systemConfig: {
    ...stripped.systemConfig,
    authConfig: {
      requirePassword: true,
      defaultTeacherPassword: '',
      adminPassword: '',
      academicPassword: '',
      accountingPassword: '',
      studentAffairsPassword: '',
      principalPassword: '',
    },
  },
};
const mergedOld = mergeLocalSecretsIntoRemote(
  oldRemote,
  base.teachers,
  base.systemConfig.authConfig,
  base.academicStaffList,
  'smtp-secret'
);
assert.equal(mergedOld.systemConfig.authConfig?.adminPassword, 'shfs1$admin-new');
assert.equal(mergedOld.teachers[0].password, 'shfs1$local-teacher-secret');
assert.equal(mergedOld.systemConfig.patrolMailConfig?.pass, 'smtp-secret');

// 新雲端有管理員密碼 → 覆寫本機舊密碼
const newRemote: SharedSchoolData = {
  ...stripped,
  systemConfig: {
    ...stripped.systemConfig,
    authConfig: {
      ...stripped.systemConfig.authConfig!,
      adminPassword: 'shfs1$admin-from-cloud',
    },
  },
};
const mergedNew = mergeLocalSecretsIntoRemote(
  newRemote,
  base.teachers,
  {
    ...base.systemConfig.authConfig!,
    adminPassword: 'shfs1$admin-local-old',
  },
  base.academicStaffList,
  'smtp-secret'
);
assert.equal(
  mergedNew.systemConfig.authConfig?.adminPassword,
  'shfs1$admin-from-cloud',
  '雲端管理員密碼應覆寫本機'
);

console.log('regression-cloud-auth-sync: ok');
