/**
 * 處室導覽分層：主任在上、組別在下；登入名單不可跨層回落。
 */
import assert from 'node:assert/strict';
import {
  isTeachingAffairsWorkbenchStaff,
  officeMembers,
  officeNavActive,
  resolveStaffSubunit,
  roleForSubunit,
  subunitLoginLabel,
  type StaffSubunit,
} from '../src/utils/academicOfficeStaff';
import { INITIAL_ACADEMIC_STAFF } from '../src/data/mockData';

const list = INITIAL_ACADEMIC_STAFF;

function expectSub(title: string, group: string, expected: StaffSubunit) {
  const role =
    group === 'accounting'
      ? 'accounting'
      : group === 'student_affairs'
        ? 'student_affairs'
        : group === 'principal'
          ? 'principal'
          : 'academic';
  const got = resolveStaffSubunit({ title, group: group as any }, role as any);
  assert.equal(got, expected, `${title} 應為 ${expected}，實際 ${got}`);
}

expectSub('教務主任', 'academic', 'academic_dean');
expectSub('教學組長', 'academic', 'teaching');
expectSub('教學組組員 (幹事)', 'academic', 'teaching');
expectSub('實習主任', 'academic', 'internship_dean');
expectSub('實習組長', 'academic', 'internship_section');
expectSub('總務主任', 'academic', 'general_dean');
expectSub('出納組長', 'accounting', 'cashier');
expectSub('學務主任', 'student_affairs', 'student_dean');
expectSub('生輔組長', 'student_affairs', 'student_section');
expectSub('校長', 'principal', 'principal');

assert.equal(roleForSubunit('internship_dean'), 'academic');
assert.equal(roleForSubunit('general_dean'), 'academic');
assert.equal(roleForSubunit('cashier'), 'accounting');
assert.equal(roleForSubunit('student_dean'), 'student_affairs');

const teaching = officeMembers(list, 'teaching');
assert.ok(teaching.every((s) => !s.title.includes('教務主任')), '教學組名單不可含教務主任');
assert.ok(
  officeMembers(list, 'academic_dean').every((s) => s.title.includes('教務主任')),
  '教務主任名單只能是教務主任'
);

const studentDean = officeMembers(list, 'student_dean');
const studentSection = officeMembers(list, 'student_section');
assert.ok(studentDean.every((s) => s.title.includes('學務主任')));
assert.ok(studentSection.every((s) => s.title.includes('生輔')));
assert.ok(!studentSection.some((s) => s.title.includes('學務主任')), '生輔組不可含學務主任');

// 預設 mock 尚無實習／總務主任：點選時成員應為空，不可回落到教務主任
assert.equal(officeMembers(list, 'internship_dean').length, 0);
assert.equal(officeMembers(list, 'general_dean').length, 0);
assert.ok(officeMembers(list, 'academic_dean').length >= 1);

assert.equal(
  officeNavActive('academic', 'academic', { title: '教務主任', group: 'academic' }),
  true
);
assert.equal(
  officeNavActive('internship', 'academic', { title: '教務主任', group: 'academic' }),
  false,
  '教務主任登入時實習處不應高亮'
);
assert.equal(
  officeNavActive('general', 'accounting', { title: '出納組長', group: 'accounting' }),
  true
);
assert.equal(
  officeNavActive('general', 'academic', { title: '總務主任', group: 'academic' }),
  true
);

assert.equal(subunitLoginLabel('internship_dean'), '實習處・實習主任');
assert.equal(subunitLoginLabel('student_section'), '學務處・生輔組');

// 派代工作台不可把實習／總務主任當成教學組經辦
assert.equal(isTeachingAffairsWorkbenchStaff({ title: '教學組長', group: 'academic' }), true);
assert.equal(isTeachingAffairsWorkbenchStaff({ title: '教務主任', group: 'academic' }), true);
assert.equal(isTeachingAffairsWorkbenchStaff({ title: '實習主任', group: 'academic' }), false);
assert.equal(isTeachingAffairsWorkbenchStaff({ title: '總務主任', group: 'academic' }), false);
assert.equal(isTeachingAffairsWorkbenchStaff({ title: '出納組長', group: 'accounting' }), false);

console.log('regression-office-nav: OK');
