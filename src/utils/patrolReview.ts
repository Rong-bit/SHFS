import {
  AcademicStaff,
  PatrolKind,
  PatrolRecord,
  PatrolReviewCase,
  PatrolReviewRecipient,
  PatrolReviewRole,
  PatrolSignOff,
  PatrolSignOffAction,
  Teacher,
} from '../types';

export const PATROL_REVIEW_ROLE_LABELS: Record<PatrolReviewRole, string> = {
  student_affairs: '生輔組',
  academic: '教學組',
  dean_academic: '教務',
  dean_student: '學務主任',
  homeroom: '導師',
  subject_teacher: '任課老師',
  principal: '校長',
};

export const isObservationPatrolKind = (kind: PatrolKind) => kind === 'class' || kind === 'exam';

export function patrolIssueSummary(r: Pick<PatrolRecord, 'kind' | 'observations' | 'checks' | 'itemLabels' | 'note'>): string {
  if (isObservationPatrolKind(r.kind)) {
    const parts = r.observations.map((id) => r.itemLabels?.[id] || id);
    const base = parts.length ? parts.join('、') : '有異常';
    return r.note ? `${base}；${r.note}` : base;
  }
  const failed = Object.entries(r.checks)
    .filter(([, v]) => v === false)
    .map(([id]) => r.itemLabels?.[id] || id);
  const base = failed.length ? `未合格：${failed.join('、')}` : '有缺失';
  return r.note ? `${base}；${r.note}` : base;
}

/** 依職稱／組別判斷是否為學務主任 */
export function isDeanStudentStaff(s: AcademicStaff): boolean {
  const t = `${s.title}${s.badge}${s.responsibleScope}`;
  return /學務主任|學務處主任/.test(t);
}

/** 依職稱判斷是否為教務主任／教務 */
export function isDeanAcademicStaff(s: AcademicStaff): boolean {
  const t = `${s.title}${s.badge}`;
  return /教務主任|教務處主任/.test(t) || (s.group === 'academic' && /教務/.test(s.title) && /主任/.test(s.title));
}

function uniqRecipients(list: PatrolReviewRecipient[]): PatrolReviewRecipient[] {
  const seen = new Set<string>();
  const out: PatrolReviewRecipient[] = [];
  for (const r of list) {
    const key = `${r.role}|${(r.email || '').toLowerCase()}|${r.personId || r.personName}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

/**
 * 解析異常會辦收件名單。
 * 段考不含任課老師；其餘類型有任課老師時一併通知。
 */
export function resolvePatrolReviewRecipients(params: {
  record: PatrolRecord;
  teachers: Teacher[];
  academicStaffList: AcademicStaff[];
}): PatrolReviewRecipient[] {
  const { record, teachers, academicStaffList } = params;
  const out: PatrolReviewRecipient[] = [];

  const pushStaff = (role: PatrolReviewRole, staff: AcademicStaff) => {
    out.push({
      role,
      personId: staff.id,
      personName: staff.name,
      email: (staff.email || '').trim(),
    });
  };

  for (const s of academicStaffList) {
    if ((s.group || 'academic') === 'student_affairs') {
      if (isDeanStudentStaff(s)) pushStaff('dean_student', s);
      else pushStaff('student_affairs', s);
    }
  }

  for (const s of academicStaffList) {
    if ((s.group || 'academic') !== 'academic') continue;
    if (isDeanAcademicStaff(s)) pushStaff('dean_academic', s);
    else pushStaff('academic', s);
  }

  // 若名冊尚無明確「學務主任／教務」，仍保留角色槽位提示（無 email 則寄信略過）
  if (!out.some((r) => r.role === 'dean_student')) {
    const fallback = academicStaffList.find(
      (s) => (s.group || 'academic') === 'student_affairs' && /主任/.test(s.title)
    );
    if (fallback) pushStaff('dean_student', fallback);
  }
  if (!out.some((r) => r.role === 'dean_academic')) {
    const fallback = academicStaffList.find(
      (s) => (s.group || 'academic') === 'academic' && /主任|組長/.test(s.title)
    );
    if (fallback && !out.some((r) => r.personId === fallback.id)) {
      pushStaff('dean_academic', fallback);
    }
  }

  const className = (record.className || '').trim();
  if (className) {
    const tutors = teachers.filter((t) => (t.homeroomClass || '').trim() === className);
    for (const t of tutors) {
      out.push({
        role: 'homeroom',
        personId: t.id,
        personName: t.name,
        email: (t.email || '').trim(),
      });
    }
  }

  if (record.kind !== 'exam' && record.teacherName) {
    const names = record.teacherName
      .split(/[、,，/／]/)
      .map((n) => n.trim())
      .filter(Boolean);
    for (const name of names) {
      const t = teachers.find((x) => x.name === name);
      out.push({
        role: 'subject_teacher',
        personId: t?.id,
        personName: name,
        email: (t?.email || '').trim(),
      });
    }
  }

  return uniqRecipients(out);
}

export function patrolReviewCaseId(recordId: string) {
  return `review_${recordId}`.replace(/[.#$/[\]]/g, '-');
}

export function buildPatrolReviewCase(params: {
  record: PatrolRecord;
  teachers: Teacher[];
  academicStaffList: AcademicStaff[];
  existing?: PatrolReviewCase | null;
}): PatrolReviewCase {
  const { record, teachers, academicStaffList, existing } = params;
  const now = new Date().toISOString();
  const recipients = resolvePatrolReviewRecipients({ record, teachers, academicStaffList });
  return {
    id: existing?.id || patrolReviewCaseId(record.id),
    recordId: record.id,
    date: record.date,
    kind: record.kind,
    period: record.period,
    roomId: record.roomId,
    roomName: record.roomName,
    building: record.building,
    floor: record.floor,
    className: record.className,
    subjectName: record.subjectName,
    teacherName: record.teacherName,
    issueSummary: patrolIssueSummary(record),
    note: record.note,
    patrollerId: record.patrollerId,
    patrollerName: record.patrollerName,
    status: existing?.status && existing.status !== 'closed' ? existing.status : 'open',
    recipients: recipients.map((r) => {
      const prev = existing?.recipients.find(
        (p) => p.role === r.role && (p.personId || p.personName) === (r.personId || r.personName)
      );
      return prev ? { ...r, sentOk: prev.sentOk, sentError: prev.sentError } : r;
    }),
    signOffs: existing?.signOffs || [],
    notifiedAt: existing?.notifiedAt,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    archivedAt: existing?.archivedAt,
  };
}

export function applySignOff(
  reviewCase: PatrolReviewCase,
  signOff: PatrolSignOff,
  opts?: { archive?: boolean; instruction?: string }
): PatrolReviewCase {
  const nextSignOffs = [
    ...reviewCase.signOffs.filter(
      (s) => !(s.role === signOff.role && s.personId === signOff.personId)
    ),
    { ...signOff, instruction: opts?.instruction ?? signOff.instruction },
  ];
  const now = new Date().toISOString();
  let status = reviewCase.status;
  if (opts?.archive || signOff.action === '校長核章') {
    status = 'archived';
  } else if (status === 'open') {
    status = 'reviewed';
  }
  return {
    ...reviewCase,
    signOffs: nextSignOffs,
    status,
    updatedAt: now,
    archivedAt: status === 'archived' ? reviewCase.archivedAt || now : reviewCase.archivedAt,
  };
}

export function makeSignOff(params: {
  role: PatrolReviewRole;
  personId: string;
  personName: string;
  action: PatrolSignOffAction;
  instruction?: string;
  schoolName?: string;
}): PatrolSignOff {
  const stampedAt = new Date().toISOString();
  const roleLabel = PATROL_REVIEW_ROLE_LABELS[params.role];
  return {
    role: params.role,
    personId: params.personId,
    personName: params.personName,
    action: params.action,
    instruction: params.instruction,
    stampedAt,
    stampLabel: `${params.schoolName || ''}${roleLabel}${params.action}`.trim(),
  };
}

/** 目前登入者可對此案採取的會辦角色 */
export function viewerReviewRoles(params: {
  reviewCase: PatrolReviewCase;
  viewer: {
    kind: 'teacher' | 'staff';
    id: string;
    name: string;
    staffGroup?: string;
    staffTitle?: string;
    isAdmin?: boolean;
  };
}): PatrolReviewRole[] {
  const roles: PatrolReviewRole[] = [];
  const { reviewCase, viewer } = params;
  if (viewer.isAdmin) {
    return ['student_affairs', 'academic', 'dean_academic', 'dean_student', 'principal'];
  }
  if (viewer.kind === 'teacher') {
    for (const r of reviewCase.recipients) {
      if (r.personId === viewer.id && (r.role === 'homeroom' || r.role === 'subject_teacher')) {
        roles.push(r.role);
      }
    }
    return [...new Set(roles)];
  }
  const group = viewer.staffGroup || 'academic';
  if (group === 'principal') roles.push('principal');
  if (group === 'student_affairs') {
    roles.push('student_affairs');
    if (viewer.staffTitle && /學務主任|主任/.test(viewer.staffTitle)) roles.push('dean_student');
  }
  if (group === 'academic') {
    roles.push('academic');
    if (viewer.staffTitle && /教務主任|主任|組長/.test(viewer.staffTitle)) roles.push('dean_academic');
  }
  return [...new Set(roles)];
}

export function weekRangeContaining(isoDate: string): { from: string; to: string } {
  const d = new Date(`${isoDate}T12:00:00`);
  const day = d.getDay(); // 0 Sun
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + mondayOffset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (x: Date) => {
    const y = x.getFullYear();
    const m = String(x.getMonth() + 1).padStart(2, '0');
    const dd = String(x.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  };
  return { from: fmt(monday), to: fmt(sunday) };
}
