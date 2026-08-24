import type { LeaveType, PaymentType } from '../types';

/** 依《教師請假規則》第3條（114/10/08 修正，114/10/10 施行）公費派代之假別 */
export const PUBLIC_LEAVE_TYPES: LeaveType[] = [
  'official',
  'training',
  'bereavement',
  'maternity',
  'wellness',
];

/** 身心調適假：每學年 3 日、併入事假、免證明、代課鐘點費由學校／政府補助 */
export const WELLNESS_LEAVE_LEGAL_NOTE =
  '依《教師請假規則》第3條：每學年准給3日（得以時計），併入事假計算，毋須檢附證明；代課鐘點費由學校支給（公費派代），非自費代課。';

export const paymentTypeForLeaveType = (leaveType: LeaveType): PaymentType =>
  PUBLIC_LEAVE_TYPES.includes(leaveType) ? 'public' : 'private';

export const leaveTypeLabel = (leaveType?: LeaveType): string => {
  switch (leaveType) {
    case 'official':
      return '公假 / 公差 (檢附公文派令)';
    case 'training':
      return '教師專業研習 / 競賽監評';
    case 'personal':
      return '事假';
    case 'sick':
      return '病假 (檢附就醫收據/證明)';
    case 'bereavement':
      return '喪假';
    case 'maternity':
      return '產假 / 陪產檢假';
    case 'wellness':
      return '身心調適假 (公費派代 · 每學年3日 · 併入事假 · 免證明)';
    case 'other':
      return '其他業務需求';
    default:
      return '其他業務需求';
  }
};

export const leaveTypeRemarkShort = (leaveType?: LeaveType, reason?: string): string => {
  if (reason && /婚假/.test(reason)) return '婚假';
  switch (leaveType) {
    case 'wellness':
      return '身心假';
    case 'personal':
      return '事假';
    case 'sick':
      return '病假';
    case 'official':
      return '公假';
    case 'training':
      return '研習';
    case 'bereavement':
      return '喪假';
    case 'maternity':
      return '產假';
    default:
      return '請假';
  }
};

/** 代導師清冊備註假別（對齊實務用詞：公差假、加班補休、陪產假等） */
export const actingHomeroomLeaveRemarkShort = (
  leaveType?: LeaveType,
  reason?: string
): string => {
  const r = reason || '';
  if (/加班補休|補休/.test(r)) return '加班補休';
  if (/婚假/.test(r)) return '婚假';
  if (/陪產/.test(r)) return '陪產假';
  if (/公差/.test(r)) return '公差假';
  switch (leaveType) {
    case 'wellness':
      return '身心調適假';
    case 'personal':
      return '事假';
    case 'sick':
      return '病假';
    case 'official':
      return '公假';
    case 'training':
      return '研習';
    case 'bereavement':
      return '喪假';
    case 'maternity':
      return '產假';
    default:
      return '請假';
  }
};

export const defaultReasonForLeaveType = (leaveType: LeaveType): string => {
  switch (leaveType) {
    case 'official':
      return '奉派代表學校出席公務會議/專業競賽 (公費派代)';
    case 'training':
      return '奉派參加專業技術研習與檢定監評作業 (公費派代)';
    case 'bereavement':
      return '依公務人員請假規則申請喪假 (公費派代)';
    case 'maternity':
      return '申請產假/陪產假 (公費派代)';
    case 'wellness':
      return '申請身心調適假 (公費派代，依教師請假規則第3條)';
    case 'sick':
      return '因突發病假就醫治療無法到校 (自費代課)';
    case 'personal':
      return '個人事假申請代課 (自費代課)';
    default:
      return '其他業務需求 (自費代課)';
  }
};
