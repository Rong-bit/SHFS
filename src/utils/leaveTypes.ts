import type { LeaveType, PaymentType } from '../types';
import {
  PERSONAL_LEAVE_PUBLIC_DAY_THRESHOLD,
  SICK_LEAVE_CONSECUTIVE_DAY_THRESHOLD,
  WELLNESS_LEAVE_HOURS_PER_YEAR,
  WELLNESS_HOURS_PER_LEAVE_DAY,
} from './leavePayrollPolicy';

export { WELLNESS_HOURS_PER_LEAVE_DAY, WELLNESS_LEAVE_HOURS_PER_YEAR };

/** 身心調適假：每學年 21 小時（1 日＝7 小時），代課鐘點費公費派代 */
export const WELLNESS_LEAVE_LEGAL_NOTE =
  `依薪資對照表：每學年准給 ${WELLNESS_LEAVE_HOURS_PER_YEAR} 小時（1 日＝${WELLNESS_HOURS_PER_LEAVE_DAY} 小時，得以時計）；代課鐘點費由學校支給（公費派代）。`;

export const PERSONAL_LEAVE_POLICY_NOTE =
  `事假學年累計第 ${PERSONAL_LEAVE_PUBLIC_DAY_THRESHOLD} 天起改公費派代；未達門檻者不入代課清冊，請假人自行與代課教師約定。`;

export const SICK_LEAVE_POLICY_NOTE =
  `病假連續 ${SICK_LEAVE_CONSECUTIVE_DAY_THRESHOLD} 日（曆日）起改公費派代；未達門檻者不入代課清冊。`;

export const INVIGILATION_LEAVE_POLICY_NOTE =
  '監考任務：基鐘與兼課課堂皆可派代，一律公費入代課清冊（基本鐘點費率）；申請人兼課不扣減。';

/** 表單預設：無日期時僅公假類固定公費；事病假預設教師自理 */
export const paymentTypeForLeaveType = (leaveType: LeaveType): PaymentType => {
  switch (normalizeLeaveTypeForForm(leaveType)) {
    case 'official':
    case 'marriage':
    case 'maternity':
    case 'wellness':
    case 'invigilation':
      return 'public';
    default:
      return 'private';
  }
};

export function normalizeLeaveTypeForForm(leaveType: LeaveType): LeaveType {
  if (leaveType === 'training' || leaveType === 'bereavement') return 'official';
  if (leaveType === 'other') return 'personal';
  return leaveType;
}

export const leaveTypeLabel = (leaveType?: LeaveType): string => {
  switch (normalizeLeaveTypeForForm(leaveType || 'official')) {
    case 'official':
      return '公假 / 公差 (檢附公文派令)';
    case 'marriage':
      return '婚假 (公費派代 · 按小時計)';
    case 'personal':
      return '事假';
    case 'sick':
      return '病假 (檢附就醫收據/證明)';
    case 'maternity':
      return '娩假 / 陪產假 (公費派代 · 按小時計)';
    case 'wellness':
      return `身心調適假 (公費派代 · 每學年 ${WELLNESS_LEAVE_HOURS_PER_YEAR} 小時)`;
    case 'invigilation':
      return '監考任務 (公費派代 · 基本鐘點)';
    default:
      return '公假 / 公差';
  }
};

export const leaveTypeRemarkShort = (leaveType?: LeaveType, reason?: string): string => {
  if (reason && /婚假/.test(reason)) return '婚假';
  switch (normalizeLeaveTypeForForm(leaveType || 'official')) {
    case 'wellness':
      return '身心假';
    case 'personal':
      return '事假';
    case 'sick':
      return '病假';
    case 'official':
      return '公假';
    case 'marriage':
      return '婚假';
    case 'maternity':
      return /陪產/.test(reason || '') ? '陪產假' : '產假';
    case 'invigilation':
      return '監考';
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
  switch (normalizeLeaveTypeForForm(leaveType || 'official')) {
    case 'wellness':
      return '身心調適假';
    case 'personal':
      return '事假';
    case 'sick':
      return '病假';
    case 'official':
      return '公假';
    case 'marriage':
      return '婚假';
    case 'maternity':
      return '產假';
    case 'invigilation':
      return '監考';
    default:
      return '請假';
  }
};

export const defaultReasonForLeaveType = (leaveType: LeaveType): string => {
  switch (normalizeLeaveTypeForForm(leaveType)) {
    case 'official':
      return '奉派代表學校出席公務會議/專業競賽 (公費派代)';
    case 'marriage':
      return '申請婚假 (公費派代)';
    case 'maternity':
      return '申請娩假/陪產假 (公費派代)';
    case 'wellness':
      return '申請身心調適假 (公費派代)';
    case 'sick':
      return '因就醫治療無法到校（未達連續三日者教師自理代課費）';
    case 'personal':
      return '個人事假（未達學年第八日者教師自理代課費）';
    case 'invigilation':
      return '因擔任考試監考任務';
    default:
      return '公務請假 (公費派代)';
  }
};

/** 教師／教學組請假假別選單 */
export const LEAVE_TYPE_FORM_OPTIONS: { value: LeaveType; label: string }[] = [
  { value: 'official', label: '🏛️ 公假 / 公差 (公文指派、出差)' },
  { value: 'invigilation', label: '📝 監考任務 (公費派代 · 基本鐘點)' },
  { value: 'marriage', label: '💒 婚假 (公費派代 · 按小時計)' },
  { value: 'maternity', label: '👶 娩假 / 陪產假 (公費派代 · 按小時計)' },
  { value: 'wellness', label: `🧘 身心調適假 (公費 · 每學年 ${WELLNESS_LEAVE_HOURS_PER_YEAR} 小時)` },
  { value: 'personal', label: `💼 事假 (第 ${PERSONAL_LEAVE_PUBLIC_DAY_THRESHOLD} 天起公費派代)` },
  { value: 'sick', label: `🩺 病假 (連續 ${SICK_LEAVE_CONSECUTIVE_DAY_THRESHOLD} 日起公費派代)` },
];
