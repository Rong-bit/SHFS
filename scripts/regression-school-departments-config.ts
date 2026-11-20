/**
 * 回歸：學校可編輯科別清單；不影響預設／空白回退。
 * 執行：npx tsx scripts/regression-school-departments-config.ts
 */
import assert from 'node:assert/strict';
import {
  DEFAULT_SCHOOL_DEPARTMENTS,
  departmentOptionsForFilter,
  departmentOptionsForSelect,
  normalizeSchoolDepartmentsList,
  resolveSchoolDepartments,
  SCHOOL_DEPARTMENTS,
} from '../src/utils/schoolDepartments';
import { normalizeLoadedSystemConfig } from '../src/utils/normalizeSystemConfig';
import { INITIAL_SYSTEM_CONFIG } from '../src/data/mockData';

assert.deepEqual(SCHOOL_DEPARTMENTS, DEFAULT_SCHOOL_DEPARTMENTS);

{
  assert.equal(normalizeSchoolDepartmentsList(undefined), null);
  assert.equal(normalizeSchoolDepartmentsList([]), null);
  assert.deepEqual(normalizeSchoolDepartmentsList([' 電機科 ', '電機科', '', '光電科']), [
    '電機科',
    '光電科',
  ]);
}

{
  assert.deepEqual(resolveSchoolDepartments(null), [...DEFAULT_SCHOOL_DEPARTMENTS]);
  assert.deepEqual(resolveSchoolDepartments({}), [...DEFAULT_SCHOOL_DEPARTMENTS]);
  assert.deepEqual(resolveSchoolDepartments({ schoolDepartments: ['共同科目', '光電科'] }), [
    '共同科目',
    '光電科',
  ]);
}

{
  const opts = departmentOptionsForSelect({ schoolDepartments: ['共同科目'] }, '機械科');
  assert.deepEqual(opts, ['共同科目', '機械科']);
  const filter = departmentOptionsForFilter({ schoolDepartments: ['共同科目'] }, [
    '共同科目',
    '舊科別',
  ]);
  assert.deepEqual(filter, ['共同科目', '舊科別']);
}

{
  const normalized = normalizeLoadedSystemConfig(
    { schoolDepartments: [' 資訊科 ', '資訊科', '語文領域'] },
    INITIAL_SYSTEM_CONFIG
  );
  assert.deepEqual(normalized.schoolDepartments, ['資訊科', '語文領域']);
  const empty = normalizeLoadedSystemConfig({ schoolDepartments: [] }, INITIAL_SYSTEM_CONFIG);
  assert.equal(empty.schoolDepartments, undefined);
}

console.log('regression-school-departments-config: ok');
