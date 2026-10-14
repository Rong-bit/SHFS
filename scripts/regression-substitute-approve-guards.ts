/**
 * 回歸：請假派代核准時段守衛、無日期假單佔用衝突
 */
import assert from 'node:assert/strict';
import type { CourseSession, SubstituteRequest } from '../src/types';
import { applyRequestToSessionsDetailed } from '../src/utils/scheduleAdjustments';
import {
  collectSubstituteOccupancies,
  teacherHasSubstituteOccupancy,
} from '../src/utils/substituteCandidates';

const baseSession: CourseSession = {
  id: 's1',
  dayOfWeek: 1,
  period: 3,
  className: '電機二甲',
  subjectName: '電工',
  teacherId: 't-app',
  teacherName: '申請人',
  venueId: 'v1',
  venueName: '301',
  isPractical: false,
};

const pendingLeave: SubstituteRequest = {
  id: 'req-leave',
  requestNumber: '115-1-0001',
  requestType: 'substitute',
  applicantTeacherId: 't-app',
  applicantTeacherName: '申請人',
  applicantDepartment: '電機科',
  reason: '公假',
  paymentType: 'public',
  leaveType: 'official',
  leaveDateStart: '2026-10-20',
  leaveDateEnd: '2026-10-20',
  substituteTeacherId: 't-sub',
  substituteTeacherName: '代理人',
  status: 'pending',
  createdAt: '2026-10-01T00:00:00.000Z',
  clashStatus: { hasClash: false, severity: 'none', messages: [] },
  originalSession: { ...baseSession },
};

// 課已永久移到週二第 3 節：核准不可把請假註記蓋到移課後節次
const movedSessions: CourseSession[] = [
  { ...baseSession, dayOfWeek: 2, period: 3, notes: '[已移課] 原週1第3節' },
];
const movedApply = applyRequestToSessionsDetailed(movedSessions, pendingLeave);
assert.equal(movedApply.applied, false, '課堂已移走時請假派代應拒絕套用');
assert.match(movedApply.reason || '', /找不到欲派代|移課/);
assert.equal(
  movedApply.sessions[0].notes?.includes('[請假派代]'),
  false,
  '不可在移課後節次標請假派代'
);

// 仍在原時段：可套用
const okApply = applyRequestToSessionsDetailed([{ ...baseSession }], pendingLeave);
assert.equal(okApply.applied, true);
assert.match(okApply.sessions[0].notes || '', /請假派代|代課/);

// 無日期探測（舊假單）vs 有區間佔用：請假路徑應衝突；移課預設路徑不衝突
const datedOcc = collectSubstituteOccupancies([
  {
    ...pendingLeave,
    id: 'occ-1',
    status: 'approved',
    leaveDateStart: '2026-10-20',
    leaveDateEnd: '2026-10-20',
  },
]);
assert.equal(
  teacherHasSubstituteOccupancy('t-sub', 1, 3, datedOcc, {}),
  false,
  '移課／對調無日期探測預設不擋有區間代課'
);
assert.equal(
  teacherHasSubstituteOccupancy('t-sub', 1, 3, datedOcc, {}, { undatedProbeBlocksDated: true }),
  true,
  '請假核准：無日期舊單須擋有區間佔用'
);
assert.equal(
  teacherHasSubstituteOccupancy(
    't-sub',
    1,
    3,
    datedOcc,
    { leaveDateStart: '2026-10-20', leaveDateEnd: '2026-10-20' },
    { undatedProbeBlocksDated: true }
  ),
  true,
  '同日請假區間應衝突'
);
assert.equal(
  teacherHasSubstituteOccupancy(
    't-sub',
    1,
    3,
    datedOcc,
    { leaveDateStart: '2026-11-01', leaveDateEnd: '2026-11-01' },
    { undatedProbeBlocksDated: true }
  ),
  false,
  '不重疊日期不應衝突'
);

console.log('regression-substitute-approve-guards: ok');
