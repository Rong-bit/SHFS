/**
 * 回歸：師資名冊群科科別不被課表實習班別覆寫；列印優先用名冊。
 * 執行：npx tsx scripts/regression-preserve-roster-department.ts
 */
import assert from 'node:assert/strict';
import { CourseSession, SubstituteRequest, Teacher } from '../src/types';
import {
  applyTeacherDepartmentsFromSessions,
  enrichTeachersFromSessions,
  inferTeacherDepartmentFromPracticalRows,
  inferTeacherDepartmentFromSessions,
} from '../src/utils/schoolDepartments';
import {
  healRequestsApplicantDepartments,
  resolveNoticeApplicantDepartment,
} from '../src/utils/noticeDocument';

const commonTeacher: Teacher = {
  id: 't-common',
  name: '王共同',
  title: '專任教師',
  department: '共同科目',
  dutyReductionPeriods: 0,
  basePeriods: 18,
  weeklyActualPeriods: 0,
  email: '',
  phone: '',
  certifications: [],
  avatarBg: 'from-slate-600 to-slate-800',
};

const mechPractical: CourseSession = {
  id: 's1',
  teacherId: 't-common',
  teacherName: '王共同',
  className: '機械一忠',
  subjectName: '專題實作',
  dayOfWeek: 1,
  period: 1,
  venueId: 'v1',
  venueName: '機械工場',
  isPractical: true,
};

{
  // 推斷本身：有機械班實習會得到機械科（僅供新教師推斷）
  assert.equal(
    inferTeacherDepartmentFromSessions(commonTeacher, [mechPractical]),
    '機械科'
  );
  assert.equal(
    inferTeacherDepartmentFromPracticalRows('王共同', [
      { teacherName: '王共同', className: '機械一忠', isPractical: true },
    ]),
    '機械科'
  );
}

{
  // enrich 不可覆寫名冊共同科目
  const enriched = enrichTeachersFromSessions([commonTeacher], [mechPractical]);
  assert.equal(enriched[0].department, '共同科目');
}

{
  // 相容函式亦不可再覆寫
  const next = applyTeacherDepartmentsFromSessions([commonTeacher], [mechPractical]);
  assert.equal(next[0].department, '共同科目');
}

{
  // 列印：id 對不到時改以姓名對名冊（避免覆寫匯入後仍印舊快照）
  const renamedId = { ...commonTeacher, id: 't-reimported' };
  assert.equal(
    resolveNoticeApplicantDepartment(
      {
        applicantTeacherId: 't-old-gone',
        applicantTeacherName: '王共同',
        applicantDepartment: '機械科',
      },
      [renamedId]
    ),
    '共同科目'
  );
  assert.equal(
    resolveNoticeApplicantDepartment(
      {
        applicantTeacherId: 't-common',
        applicantTeacherName: '王共同',
        applicantDepartment: '機械科',
      },
      [commonTeacher]
    ),
    '共同科目'
  );
}

{
  // 賴寶玉情境：名冊共同科目、舊快照機械科 → 回寫後通知單應為共同科目
  const roster = {
    ...commonTeacher,
    id: 't-paoyu',
    name: '賴寶玉',
    department: '共同科目' as const,
    title: '導師' as const,
    homeroomClass: '機械三忠',
  };
  const stale = {
    id: 'req-1',
    requestNumber: '115-1-1',
    requestType: 'substitute',
    applicantTeacherId: 't-paoyu',
    applicantTeacherName: '賴寶玉',
    applicantDepartment: '機械科',
    reason: '公假',
    paymentType: 'public',
    originalSession: mechPractical,
    status: 'approved',
    clashStatus: { hasClash: false, severity: 'none', messages: [] },
    createdAt: '2026-11-20 10:00',
  } as SubstituteRequest;
  const healed = healRequestsApplicantDepartments([stale], [roster]);
  assert.equal(healed[0].applicantDepartment, '共同科目');
  assert.equal(resolveNoticeApplicantDepartment(healed[0], [roster]), '共同科目');
}

console.log('regression-preserve-roster-department: ok');
