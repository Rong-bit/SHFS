/**
 * 回歸：師資信箱 Excel 解析與寫入名冊
 */
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import type { Teacher } from '../src/types';
import {
  applyTeacherEmails,
  parseTeacherEmailWorkbook,
} from '../src/utils/teacherEmailImporter';

const teachers: Teacher[] = [
  {
    id: 't1',
    name: '王小明',
    title: '導師',
    department: '電機科',
    homeroomClass: '機二忠',
    basePeriods: 12,
    weeklyActualPeriods: 12,
    email: '',
    phone: '',
    certifications: [],
  },
  {
    id: 't2',
    name: '李小華',
    title: '專任教師',
    department: '電機科',
    basePeriods: 16,
    weeklyActualPeriods: 16,
    email: 'old@school.edu.tw',
    phone: '',
    certifications: [],
  },
];

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(
  wb,
  XLSX.utils.aoa_to_sheet([
    ['姓名', '信箱'],
    ['王小明', 'wang@mail2.ccvs.kh.edu.tw'],
    ['李小華老師', 'lee@mail2.ccvs.kh.edu.tw'],
    ['尚無此人', 'ghost@mail2.ccvs.kh.edu.tw'],
    ['格式錯', 'not-an-email'],
    ['空白信箱', ''],
  ]),
  '師資信箱'
);

const parsed = parseTeacherEmailWorkbook(wb);
assert.equal(parsed.imported, 3, '有效列應為 3（王、李、尚無）');
assert.ok(parsed.invalid.includes('格式錯'));
assert.equal(parsed.emailsByName['王小明'], 'wang@mail2.ccvs.kh.edu.tw');
assert.equal(parsed.emailsByName['李小華老師'], 'lee@mail2.ccvs.kh.edu.tw');

const applied = applyTeacherEmails(teachers, parsed.emailsByName);
assert.equal(applied.matchedInRoster, 2);
assert.equal(applied.updated, 2);
assert.deepEqual(applied.unmatched, ['尚無此人']);
assert.equal(applied.teachers.find((t) => t.id === 't1')?.email, 'wang@mail2.ccvs.kh.edu.tw');
assert.equal(applied.teachers.find((t) => t.id === 't2')?.email, 'lee@mail2.ccvs.kh.edu.tw');

// 缺欄應拋錯
const bad = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(bad, XLSX.utils.aoa_to_sheet([['姓名'], ['王']]), 'x');
assert.throws(() => parseTeacherEmailWorkbook(bad), /信箱/);

console.log('regression-teacher-email-import: ok');
