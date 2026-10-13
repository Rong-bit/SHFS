import type { AcademicStaff } from '../types';

/** 教務處上層：教務主任（非教學組） */
export function isAcademicDeanStaff(staff: Pick<AcademicStaff, 'title'>): boolean {
  return (staff.title || '').includes('教務主任');
}

/** 教務處・教學組：教學組長／組員／助理（不含教務主任） */
export function isTeachingSectionStaff(staff: Pick<AcademicStaff, 'title'>): boolean {
  if (isAcademicDeanStaff(staff)) return false;
  const t = staff.title || '';
  return t.includes('教學組') || t.includes('教學組長');
}

export function academicOfficeMembers(
  list: AcademicStaff[],
  subunit: 'dean' | 'teaching'
): AcademicStaff[] {
  const inAcademic = list.filter((s) => (s.group || 'academic') === 'academic');
  return subunit === 'dean'
    ? inAcademic.filter(isAcademicDeanStaff)
    : inAcademic.filter(isTeachingSectionStaff);
}

export function resolveAcademicSubunit(
  staff: Pick<AcademicStaff, 'title'> | null | undefined
): 'dean' | 'teaching' {
  return staff && isAcademicDeanStaff(staff) ? 'dean' : 'teaching';
}
