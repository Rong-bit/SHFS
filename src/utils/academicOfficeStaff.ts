import type { AcademicStaff, UserRole } from '../types';

/** 處室導覽／登入名單分流（主任在上層，組別在下層） */
export type StaffSubunit =
  | 'academic_dean'
  | 'teaching'
  | 'internship_dean'
  | 'internship_section'
  | 'general_dean'
  | 'cashier'
  | 'student_dean'
  | 'student_section'
  | 'principal';

export type OfficeNavKey = 'academic' | 'internship' | 'general' | 'student_affairs';

const titleOf = (staff: Pick<AcademicStaff, 'title'> | null | undefined) =>
  (staff?.title || '').trim();

export function isAcademicDeanStaff(staff: Pick<AcademicStaff, 'title'>): boolean {
  return titleOf(staff).includes('教務主任');
}

export function isTeachingSectionStaff(staff: Pick<AcademicStaff, 'title'>): boolean {
  if (isAcademicDeanStaff(staff)) return false;
  const t = titleOf(staff);
  return t.includes('教學組') || t.includes('教學組長');
}

export function isInternshipDeanStaff(staff: Pick<AcademicStaff, 'title'>): boolean {
  return titleOf(staff).includes('實習主任');
}

export function isInternshipSectionStaff(staff: Pick<AcademicStaff, 'title'>): boolean {
  if (isInternshipDeanStaff(staff)) return false;
  const t = titleOf(staff);
  return t.includes('實習組') || t.includes('實習組長');
}

export function isGeneralAffairsDeanStaff(staff: Pick<AcademicStaff, 'title'>): boolean {
  return titleOf(staff).includes('總務主任');
}

export function isCashierStaff(staff: Pick<AcademicStaff, 'title' | 'group'>): boolean {
  if ((staff.group || '') === 'accounting') return true;
  const t = titleOf(staff);
  return t.includes('出納');
}

export function isStudentAffairsDeanStaff(staff: Pick<AcademicStaff, 'title'>): boolean {
  return titleOf(staff).includes('學務主任');
}

export function isStudentSectionStaff(staff: Pick<AcademicStaff, 'title'>): boolean {
  if (isStudentAffairsDeanStaff(staff)) return false;
  const t = titleOf(staff);
  return t.includes('生輔');
}

export function resolveStaffSubunit(
  staff: Pick<AcademicStaff, 'title' | 'group'> | null | undefined,
  role?: UserRole | null
): StaffSubunit | null {
  if (!staff && role === 'accounting') return 'cashier';
  if (!staff && role === 'principal') return 'principal';
  if (!staff) return null;

  if (isAcademicDeanStaff(staff)) return 'academic_dean';
  if (isTeachingSectionStaff(staff)) return 'teaching';
  if (isInternshipDeanStaff(staff)) return 'internship_dean';
  if (isInternshipSectionStaff(staff)) return 'internship_section';
  if (isGeneralAffairsDeanStaff(staff)) return 'general_dean';
  if (isCashierStaff(staff) || role === 'accounting') return 'cashier';
  if (isStudentAffairsDeanStaff(staff)) return 'student_dean';
  if (isStudentSectionStaff(staff) || (staff.group || '') === 'student_affairs') {
    return isStudentAffairsDeanStaff(staff) ? 'student_dean' : 'student_section';
  }
  if ((staff.group || '') === 'principal' || role === 'principal') return 'principal';

  // academic 組但職稱未辨識時，預設教學組（相容舊資料）
  if ((staff.group || 'academic') === 'academic') return 'teaching';
  return null;
}

/** @deprecated 請用 resolveStaffSubunit */
export function resolveAcademicSubunit(
  staff: Pick<AcademicStaff, 'title'> | null | undefined
): 'dean' | 'teaching' {
  return resolveStaffSubunit(staff, 'academic') === 'academic_dean' ? 'dean' : 'teaching';
}

export function roleForSubunit(subunit: StaffSubunit): UserRole {
  switch (subunit) {
    case 'cashier':
      return 'accounting';
    case 'student_dean':
    case 'student_section':
      return 'student_affairs';
    case 'principal':
      return 'principal';
    default:
      return 'academic';
  }
}

/** 派代工作台／審核簽章可用身分：僅教務主任與教學組（不含實習／總務） */
export function isTeachingAffairsWorkbenchStaff(
  staff: Pick<AcademicStaff, 'title' | 'group'>
): boolean {
  const sub = resolveStaffSubunit(staff, 'academic');
  return sub === 'academic_dean' || sub === 'teaching';
}

export function officeMembers(list: AcademicStaff[], subunit: StaffSubunit): AcademicStaff[] {
  switch (subunit) {
    case 'academic_dean':
      return list.filter(isAcademicDeanStaff);
    case 'teaching':
      return list.filter(isTeachingSectionStaff);
    case 'internship_dean':
      return list.filter(isInternshipDeanStaff);
    case 'internship_section':
      return list.filter(isInternshipSectionStaff);
    case 'general_dean':
      return list.filter(isGeneralAffairsDeanStaff);
    case 'cashier':
      return list.filter((s) => (s.group || '') === 'accounting' || isCashierStaff(s));
    case 'student_dean':
      return list.filter(
        (s) => (s.group || '') === 'student_affairs' && isStudentAffairsDeanStaff(s)
      );
    case 'student_section':
      return list.filter(
        (s) => (s.group || '') === 'student_affairs' && isStudentSectionStaff(s)
      );
    case 'principal':
      return list.filter((s) => (s.group || '') === 'principal');
    default:
      return [];
  }
}

/** @deprecated 請用 officeMembers */
export function academicOfficeMembers(
  list: AcademicStaff[],
  subunit: 'dean' | 'teaching'
): AcademicStaff[] {
  return officeMembers(list, subunit === 'dean' ? 'academic_dean' : 'teaching');
}

export function subunitLoginLabel(subunit: StaffSubunit): string {
  switch (subunit) {
    case 'academic_dean':
      return '教務處・教務主任';
    case 'teaching':
      return '教務處・教學組';
    case 'internship_dean':
      return '實習處・實習主任';
    case 'internship_section':
      return '實習處・實習組';
    case 'general_dean':
      return '總務處・總務主任';
    case 'cashier':
      return '總務處・出納組';
    case 'student_dean':
      return '學務處・學務主任';
    case 'student_section':
      return '學務處・生輔組';
    case 'principal':
      return '校長室';
  }
}

export function officeNavActive(
  office: OfficeNavKey,
  role: UserRole,
  staff: Pick<AcademicStaff, 'title' | 'group'> | null | undefined
): boolean {
  const sub = resolveStaffSubunit(staff, role);
  switch (office) {
    case 'academic':
      return role === 'academic' && (sub === 'academic_dean' || sub === 'teaching');
    case 'internship':
      return role === 'academic' && (sub === 'internship_dean' || sub === 'internship_section');
    case 'general':
      return role === 'accounting' || (role === 'academic' && sub === 'general_dean');
    case 'student_affairs':
      return role === 'student_affairs';
  }
}
