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

/** 長方紅戳：左上處室、左下職稱／動作（仿實物原子章） */
export function stampOfficeAndTitle(
  role: PatrolReviewRole,
  action?: PatrolSignOffAction | string
): { officeLabel: string; titleLabel: string } {
  const actionTitle =
    action === '校長核章' || action === '核章'
      ? '核章'
      : action === '會畢' || action === '已會畢'
        ? '會畢'
        : action === '閱畢' || action === '已閱畢'
          ? '閱畢'
          : (action || '').replace(/^已/, '') || '核章';

  switch (role) {
    case 'dean_academic':
      return { officeLabel: '教務處', titleLabel: actionTitle === '核章' ? '主任' : actionTitle };
    case 'dean_student':
      return { officeLabel: '學務處', titleLabel: actionTitle === '核章' ? '主任' : actionTitle };
    case 'student_affairs':
      return { officeLabel: '生輔組', titleLabel: actionTitle };
    case 'academic':
      return { officeLabel: '教學組', titleLabel: actionTitle };
    case 'principal':
      return { officeLabel: '校長室', titleLabel: actionTitle === '閱畢' || actionTitle === '會畢' ? actionTitle : '核章' };
    case 'homeroom':
      return { officeLabel: '導師', titleLabel: actionTitle };
    case 'subject_teacher':
      return { officeLabel: '任課', titleLabel: actionTitle };
    default:
      return { officeLabel: PATROL_REVIEW_ROLE_LABELS[role], titleLabel: actionTitle };
  }
}

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
    if (fallback && !out.some((r) => r.personId === fallback.id)) {
      pushStaff('dean_student', fallback);
    }
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
  const reopened = existing?.status === 'closed';
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
    // 自 closed 重開為新會辦；其餘保留進行中狀態
    status: existing?.status && existing.status !== 'closed' ? existing.status : 'open',
    recipients: recipients.map((r) => {
      const prev = existing?.recipients.find(
        (p) => p.role === r.role && (p.personId || p.personName) === (r.personId || r.personName)
      );
      // 重開時清除寄送狀態，以便重新通知
      if (reopened) return r;
      return prev ? { ...r, sentOk: prev.sentOk, sentError: prev.sentError } : r;
    }),
    signOffs: reopened ? [] : existing?.signOffs || [],
    notifiedAt: reopened ? undefined : existing?.notifiedAt,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    archivedAt: reopened ? undefined : existing?.archivedAt,
  };
}

/** 異常改回正常時的會辦處理：未通知且未簽核才關閉；已進入會辦則標示更正並保留可見 */
export function resolveReviewWhenIssueCleared(
  existing: PatrolReviewCase
): PatrolReviewCase {
  const now = new Date().toISOString();
  const inFlight = Boolean(existing.notifiedAt) || existing.signOffs.length > 0;
  if (!inFlight) {
    return {
      ...existing,
      status: 'closed',
      issueSummary: '已改為正常',
      updatedAt: now,
      notifiedAt: undefined,
    };
  }
  const alreadyMarked = existing.issueSummary.startsWith('【已更正為正常】');
  return {
    ...existing,
    status: existing.status === 'archived' ? 'archived' : 'reviewed',
    issueSummary: alreadyMarked
      ? existing.issueSummary
      : `【已更正為正常】原：${existing.issueSummary}`,
    updatedAt: now,
  };
}

export const PATROL_REVIEW_STATUS_LABELS: Record<PatrolReviewCase['status'], string> = {
  open: '待會辦',
  reviewed: '會辦中',
  principal_done: '校長已核',
  archived: '教務留存',
  closed: '已結案（無異常）',
};

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
  // 校長核章預設即教務留存（archived）；principal_done 保留供報表相容
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
    if (
      viewer.staffTitle &&
      isDeanStudentStaff({
        id: viewer.id,
        name: viewer.name,
        title: viewer.staffTitle,
        badge: '',
        email: '',
        phone: '',
        responsibleScope: '',
        group: 'student_affairs',
      })
    ) {
      roles.push('dean_student');
    }
  }
  if (group === 'academic') {
    roles.push('academic');
    if (
      viewer.staffTitle &&
      isDeanAcademicStaff({
        id: viewer.id,
        name: viewer.name,
        title: viewer.staffTitle,
        badge: '',
        email: '',
        phone: '',
        responsibleScope: '',
        group: 'academic',
      })
    ) {
      roles.push('dean_academic');
    }
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
