import {
  AcademicStaff,
  PatrolKind,
  PatrolMailConfig,
  PatrolNotifyGroup,
  PatrolNotifyRoles,
  PatrolRecord,
  PatrolReviewCase,
  PatrolReviewRecipient,
  PatrolReviewRole,
  PatrolSignOff,
  PatrolSignOffAction,
  Teacher,
} from '../types';
import { teacherNameMatches } from './schoolDepartments';

export const PATROL_REVIEW_ROLE_LABELS: Record<PatrolReviewRole, string> = {
  student_affairs: '生輔組',
  academic: '教學組',
  dean_academic: '教務主任',
  dean_student: '學務主任',
  homeroom: '導師',
  subject_teacher: '任課老師',
  principal: '校長',
  internship: '實習組',
  dean_internship: '實習主任',
  dean_general_affairs: '總務主任',
};

/** 會辦通知對象預設（舊六項全開；新增身分預設關，避免舊群組突然擴大） */
export const DEFAULT_PATROL_NOTIFY_ROLES: PatrolNotifyRoles = {
  student_affairs: true,
  dean_student: true,
  academic: true,
  dean_academic: true,
  homeroom: true,
  subject_teacher: true,
  internship: false,
  dean_internship: false,
  dean_general_affairs: false,
};

/** 全關（新建空白群組用） */
export const EMPTY_PATROL_NOTIFY_ROLES: PatrolNotifyRoles = {
  student_affairs: false,
  dean_student: false,
  academic: false,
  dean_academic: false,
  homeroom: false,
  subject_teacher: false,
  internship: false,
  dean_internship: false,
  dean_general_affairs: false,
};

export function resolvePatrolNotifyRoles(
  partial?: Partial<PatrolNotifyRoles> | null
): PatrolNotifyRoles {
  return { ...DEFAULT_PATROL_NOTIFY_ROLES, ...(partial || {}) };
}

export function newPatrolNotifyGroupId(): string {
  return `png-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** 預設兩組：學務線／教務線（可再於設定增刪） */
export function defaultPatrolNotifyGroups(): PatrolNotifyGroup[] {
  return [
    {
      id: 'png-affairs',
      name: '學務線',
      roles: {
        ...EMPTY_PATROL_NOTIFY_ROLES,
        student_affairs: true,
        dean_student: true,
        homeroom: true,
      },
    },
    {
      id: 'png-academic',
      name: '教務線',
      roles: {
        ...EMPTY_PATROL_NOTIFY_ROLES,
        academic: true,
        dean_academic: true,
        subject_teacher: true,
      },
    },
  ];
}

/**
 * 解析會辦通知群組：
 * - 有 notifyGroups → 使用並正規化 roles
 * - 僅有舊版 notifyRoles → 收成單一「預設」群組
 * - 皆無 → 預設兩組
 */
export function resolvePatrolNotifyGroups(
  mailConfig?: Pick<PatrolMailConfig, 'notifyGroups' | 'notifyRoles'> | null
): PatrolNotifyGroup[] {
  const groups = mailConfig?.notifyGroups;
  if (groups && groups.length > 0) {
    return groups.map((g, i) => ({
      id: g.id || `png-legacy-${i}`,
      name: (g.name || '').trim() || `群組${i + 1}`,
      roles: resolvePatrolNotifyRoles(g.roles),
    }));
  }
  if (mailConfig?.notifyRoles) {
    return [
      {
        id: 'png-default',
        name: '預設',
        roles: resolvePatrolNotifyRoles(mailConfig.notifyRoles),
      },
    ];
  }
  return defaultPatrolNotifyGroups();
}

/** 將勾選的群組身分取聯集 */
export function mergeNotifyRolesFromGroups(
  groups: PatrolNotifyGroup[],
  selectedGroupIds: string[]
): PatrolNotifyRoles {
  const idSet = new Set(selectedGroupIds);
  const picked = groups.filter((g) => idSet.has(g.id));
  if (picked.length === 0) return { ...EMPTY_PATROL_NOTIFY_ROLES };
  const merged: PatrolNotifyRoles = { ...EMPTY_PATROL_NOTIFY_ROLES };
  for (const g of picked) {
    const roles = resolvePatrolNotifyRoles(g.roles);
    (Object.keys(merged) as (keyof PatrolNotifyRoles)[]).forEach((key) => {
      if (roles[key]) merged[key] = true;
    });
  }
  return merged;
}

export function summarizeNotifyGroupRoles(roles: PatrolNotifyRoles): string {
  const r = resolvePatrolNotifyRoles(roles);
  const parts: string[] = [];
  if (r.student_affairs) parts.push('生輔組');
  if (r.dean_student) parts.push('學務主任');
  if (r.academic) parts.push('教學組');
  if (r.dean_academic) parts.push('教務主任');
  if (r.internship) parts.push('實習組');
  if (r.dean_internship) parts.push('實習主任');
  if (r.dean_general_affairs) parts.push('總務主任');
  if (r.homeroom) parts.push('導師');
  if (r.subject_teacher) parts.push('任課');
  return parts.length > 0 ? parts.join('、') : '（未勾選身分）';
}

/** 取得該筆巡堂紀錄造成異常的項目 id */
export function issueItemIdsForRecord(
  record: Pick<PatrolRecord, 'kind' | 'observations' | 'checks'>
): string[] {
  if (record.kind === 'class' || record.kind === 'exam') {
    return record.observations || [];
  }
  return Object.entries(record.checks || {})
    .filter(([, ok]) => ok === false)
    .map(([id]) => id);
}

/**
 * 依巡堂紀錄的異常項目，從設定對應表解析應通知的群組。
 * - groupIds：各異常項目對應群組的聯集（去重）
 * - fullyMapped：每個異常項目都至少有一個有效群組對應（才可自動會辦、略過彈窗）
 */
export function resolveNotifyGroupsForRecord(params: {
  record: Pick<PatrolRecord, 'kind' | 'observations' | 'checks'>;
  mailConfig?: Pick<PatrolMailConfig, 'notifyGroups' | 'notifyRoles' | 'itemNotifyGroupIds'> | null;
}): { groupIds: string[]; fullyMapped: boolean; issueItemIds: string[] } {
  const { record, mailConfig } = params;
  const groups = resolvePatrolNotifyGroups(mailConfig);
  const validIds = new Set(groups.map((g) => g.id));
  const map = mailConfig?.itemNotifyGroupIds || {};
  const issueItemIds = issueItemIdsForRecord(record);
  const out: string[] = [];
  const seen = new Set<string>();
  let fullyMapped = issueItemIds.length > 0;
  for (const itemId of issueItemIds) {
    const mapped = (map[itemId] || []).filter((gid) => validIds.has(gid));
    if (mapped.length === 0) fullyMapped = false;
    for (const gid of mapped) {
      if (seen.has(gid)) continue;
      seen.add(gid);
      out.push(gid);
    }
  }
  return { groupIds: out, fullyMapped, issueItemIds };
}

/** @deprecated 請用 resolveNotifyGroupsForRecord；保留給舊呼叫端 */
export function resolveNotifyGroupIdsForRecord(params: {
  record: Pick<PatrolRecord, 'kind' | 'observations' | 'checks'>;
  mailConfig?: Pick<PatrolMailConfig, 'notifyGroups' | 'notifyRoles' | 'itemNotifyGroupIds'> | null;
}): string[] {
  return resolveNotifyGroupsForRecord(params).groupIds;
}

/** 儲存時清理：只保留仍存在的群組 id */
export function sanitizeItemNotifyGroupIds(
  map: Record<string, string[]> | undefined,
  groups: PatrolNotifyGroup[]
): Record<string, string[]> {
  const valid = new Set(groups.map((g) => g.id));
  const next: Record<string, string[]> = {};
  for (const [itemId, ids] of Object.entries(map || {})) {
    const cleaned = [...new Set((ids || []).filter((id) => valid.has(id)))];
    if (cleaned.length > 0) next[itemId] = cleaned;
  }
  return next;
}

/** 信內／畫面通知對象排序 */
export const PATROL_REVIEW_ROLE_ORDER: PatrolReviewRole[] = [
  'student_affairs',
  'dean_student',
  'academic',
  'dean_academic',
  'internship',
  'dean_internship',
  'dean_general_affairs',
  'homeroom',
  'subject_teacher',
  'principal',
];

/** 自成員職稱字串萃取戳章用短職稱（左下欄） */
export function stampTitleFromStaffTitle(staffTitle?: string | null): string | null {
  const t = (staffTitle || '').trim();
  if (!t) return null;
  if (/校長/.test(t)) return '校長';
  if (/主任/.test(t) && !/科主任/.test(t)) return '主任';
  if (/科主任/.test(t)) return '科主任';
  if (/組長/.test(t)) return '組長';
  if (/助理/.test(t)) return '助理';
  if (/組員|幹事/.test(t)) return '組員';
  if (/導師/.test(t)) return '導師';
  if (/教師|老師/.test(t)) return '教師';
  // 過長職稱不硬塞進戳章
  if ([...t].length <= 4) return t;
  return null;
}

/**
 * 長方紅戳：左上處室、左下職稱、右側姓名（仿實物原子章）。
 * 「會畢／閱畢／校長核章」屬動作，應顯示在戳章下方，不進戳章左下欄。
 * @param _action 保留相容舊呼叫；不再寫入 titleLabel
 * @param staffTitle 登入者職稱（如教學組長），可精準帶入左下職稱
 */
export function stampOfficeAndTitle(
  role: PatrolReviewRole,
  _action?: PatrolSignOffAction | string,
  staffTitle?: string | null
): { officeLabel: string; titleLabel: string } {
  const fromStaff = stampTitleFromStaffTitle(staffTitle);
  const titledStub = (staffTitle || '').trim()
    ? ({
        id: '',
        name: '',
        title: staffTitle || '',
        badge: '',
        email: '',
        phone: '',
        responsibleScope: '',
        group: 'academic' as const,
      } satisfies AcademicStaff)
    : null;

  // 職稱已標示主任時，即使誤選教學組／生輔組，仍依處室主任戳章（避免「教學組／主任」）
  if (titledStub && isDeanAcademicStaff(titledStub) && (role === 'academic' || role === 'dean_academic')) {
    return { officeLabel: '教務處', titleLabel: fromStaff || '主任' };
  }
  if (
    titledStub &&
    isDeanStudentStaff({ ...titledStub, group: 'student_affairs' }) &&
    (role === 'student_affairs' || role === 'dean_student')
  ) {
    return { officeLabel: '學務處', titleLabel: fromStaff || '主任' };
  }

  switch (role) {
    case 'dean_academic':
      return { officeLabel: '教務處', titleLabel: fromStaff || '主任' };
    case 'dean_student':
      return { officeLabel: '學務處', titleLabel: fromStaff || '主任' };
    case 'dean_internship':
      return { officeLabel: '實習處', titleLabel: fromStaff || '主任' };
    case 'dean_general_affairs':
      return { officeLabel: '總務處', titleLabel: fromStaff || '主任' };
    case 'student_affairs':
      return { officeLabel: '生輔組', titleLabel: fromStaff || '組長' };
    case 'academic':
      return { officeLabel: '教學組', titleLabel: fromStaff || '組長' };
    case 'internship':
      return { officeLabel: '實習組', titleLabel: fromStaff || '組長' };
    case 'principal':
      return { officeLabel: '校長室', titleLabel: fromStaff || '校長' };
    case 'homeroom':
      return { officeLabel: '導師', titleLabel: fromStaff || '導師' };
    case 'subject_teacher':
      return { officeLabel: '任課', titleLabel: fromStaff || '教師' };
    default:
      return { officeLabel: PATROL_REVIEW_ROLE_LABELS[role], titleLabel: fromStaff || '核章' };
  }
}

/** 會辦核章預選角色：主任身分優先於組別 */
export function preferredStampRole(
  roles: PatrolReviewRole[],
  opts?: { preferPrincipal?: boolean }
): PatrolReviewRole | null {
  if (!roles.length) return null;
  if (opts?.preferPrincipal && roles.includes('principal')) return 'principal';
  const deanOrder: PatrolReviewRole[] = [
    'dean_academic',
    'dean_student',
    'dean_internship',
    'dean_general_affairs',
  ];
  for (const r of deanOrder) {
    if (roles.includes(r)) return r;
  }
  return roles[0];
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

function staffText(s: Pick<AcademicStaff, 'title' | 'badge' | 'responsibleScope'>): string {
  return `${s.title || ''}${s.badge || ''}${s.responsibleScope || ''}`;
}

/** 依職稱／組別判斷是否為學務主任 */
export function isDeanStudentStaff(s: AcademicStaff): boolean {
  return /學務主任|學務處主任/.test(staffText(s));
}

/** 依職稱判斷是否為教務主任／教務 */
export function isDeanAcademicStaff(s: AcademicStaff): boolean {
  const t = `${s.title}${s.badge}`;
  return /教務主任|教務處主任/.test(t) || (s.group === 'academic' && /教務/.test(s.title) && /主任/.test(s.title));
}

/** 實習主任 */
export function isDeanInternshipStaff(s: AcademicStaff): boolean {
  const t = staffText(s);
  return /實習主任|實習處主任/.test(t) || (/實習/.test(t) && /主任/.test(s.title || ''));
}

/** 實習組（非實習主任） */
export function isInternshipStaff(s: AcademicStaff): boolean {
  if (isDeanInternshipStaff(s)) return false;
  return /實習/.test(staffText(s));
}

/** 總務主任 */
export function isDeanGeneralAffairsStaff(s: AcademicStaff): boolean {
  const t = staffText(s);
  return /總務主任|總務處主任/.test(t) || (/總務/.test(t) && /主任/.test(s.title || ''));
}

/**
 * 職稱屬實習／總務會辦線，不應落入「教學組／教務」收件桶。
 * （僅看 title，避免教學組組員 badge 含「實習」被誤判。）
 */
export function isNonAcademicOfficeStaff(s: AcademicStaff): boolean {
  if (isDeanInternshipStaff(s) || isDeanGeneralAffairsStaff(s)) return true;
  const title = s.title || '';
  return /實習/.test(title) && !isDeanAcademicStaff(s);
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
 * 可依 notifyRoles（選項勾選）過濾身分；未傳入視為全開。
 */
export function resolvePatrolReviewRecipients(params: {
  record: PatrolRecord;
  teachers: Teacher[];
  academicStaffList: AcademicStaff[];
  notifyRoles?: Partial<PatrolNotifyRoles> | null;
}): PatrolReviewRecipient[] {
  const { record, teachers, academicStaffList } = params;
  const roles = resolvePatrolNotifyRoles(params.notifyRoles);
  const out: PatrolReviewRecipient[] = [];

  const pushStaff = (role: PatrolReviewRole, staff: AcademicStaff) => {
    out.push({
      role,
      personId: staff.id,
      personName: staff.name,
      email: (staff.email || '').trim(),
    });
  };

  if (roles.student_affairs || roles.dean_student) {
    for (const s of academicStaffList) {
      if ((s.group || 'academic') === 'student_affairs') {
        if (isDeanStudentStaff(s)) {
          if (roles.dean_student) pushStaff('dean_student', s);
        } else if (roles.student_affairs) {
          pushStaff('student_affairs', s);
        }
      }
    }
  }

  if (roles.academic || roles.dean_academic) {
    for (const s of academicStaffList) {
      if ((s.group || 'academic') !== 'academic') continue;
      // 實習／總務職稱另依 internship／dean_* 解析，勿當成教學組或教務主任
      if (isNonAcademicOfficeStaff(s)) continue;
      if (isDeanAcademicStaff(s)) {
        if (roles.dean_academic) pushStaff('dean_academic', s);
      } else if (roles.academic) {
        pushStaff('academic', s);
      }
    }
  }

  // 若尚無學務主任／教務角色：僅升級「確屬該主任職稱」者（避免實習／總務主任被誤標教務）
  if (roles.dean_student && !out.some((r) => r.role === 'dean_student')) {
    const fallback = academicStaffList.find(
      (s) => (s.group || 'academic') === 'student_affairs' && isDeanStudentStaff(s)
    );
    if (fallback) {
      const idx = out.findIndex((r) => r.personId === fallback.id);
      if (idx >= 0) out[idx] = { ...out[idx], role: 'dean_student' };
      else pushStaff('dean_student', fallback);
    }
  }
  if (roles.dean_academic && !out.some((r) => r.role === 'dean_academic')) {
    const fallback = academicStaffList.find(
      (s) =>
        (s.group || 'academic') === 'academic' &&
        isDeanAcademicStaff(s) &&
        !isNonAcademicOfficeStaff(s)
    );
    if (fallback) {
      const idx = out.findIndex((r) => r.personId === fallback.id);
      if (idx >= 0) out[idx] = { ...out[idx], role: 'dean_academic' };
      else pushStaff('dean_academic', fallback);
    }
  }

  if (roles.internship || roles.dean_internship) {
    for (const s of academicStaffList) {
      if (isDeanInternshipStaff(s)) {
        if (roles.dean_internship) pushStaff('dean_internship', s);
      } else if (roles.internship && isInternshipStaff(s)) {
        pushStaff('internship', s);
      }
    }
  }

  if (roles.dean_general_affairs) {
    for (const s of academicStaffList) {
      if (isDeanGeneralAffairsStaff(s)) pushStaff('dean_general_affairs', s);
    }
  }

  const className = (record.className || '').trim();
  if (roles.homeroom && className) {
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

  if (roles.subject_teacher && record.kind !== 'exam' && record.teacherName) {
    const names = record.teacherName
      .split(/[、,，/／]/)
      .map((n) => n.trim())
      .filter(Boolean);
    for (const name of names) {
      const t =
        teachers.find((x) => x.name === name) ||
        teachers.find((x) => teacherNameMatches(x.name, name));
      out.push({
        role: 'subject_teacher',
        personId: t?.id,
        personName: t?.name || name,
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
  notifyRoles?: Partial<PatrolNotifyRoles> | null;
}): PatrolReviewCase {
  const { record, teachers, academicStaffList, existing } = params;
  const now = new Date().toISOString();
  const recipients = resolvePatrolReviewRecipients({
    record,
    teachers,
    academicStaffList,
    notifyRoles: params.notifyRoles,
  });
  /** closed 或「已更正為正常」後再異常 → 視為新一輪會辦，可重寄 */
  const reopened =
    existing?.status === 'closed' ||
    Boolean(existing?.issueSummary?.startsWith('【已更正為正常】'));
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
    // 重開 → open；其餘保留進行中狀態（含 archived 不再降級）
    status: reopened
      ? 'open'
      : existing?.status && existing.status !== 'closed'
        ? existing.status
        : 'open',
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

/** 校長指示／各處室主任簽文可寫入 signOff.instruction */
export function signOffAllowsRemark(role: PatrolReviewRole): boolean {
  return (
    role === 'principal' ||
    role === 'dean_academic' ||
    role === 'dean_student' ||
    role === 'dean_internship' ||
    role === 'dean_general_affairs'
  );
}

export function applySignOff(
  reviewCase: PatrolReviewCase,
  signOff: PatrolSignOff,
  opts?: { archive?: boolean; instruction?: string }
): PatrolReviewCase {
  const allowRemark =
    signOffAllowsRemark(signOff.role) || signOff.action === '校長核章';
  const raw = allowRemark ? opts?.instruction ?? signOff.instruction : undefined;
  const instruction = raw?.trim() ? raw.trim() : undefined;
  const nextSignOffs = [
    ...reviewCase.signOffs.filter(
      (s) => !(s.role === signOff.role && s.personId === signOff.personId)
    ),
    { ...signOff, instruction },
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
    return [
      'student_affairs',
      'academic',
      'dean_academic',
      'dean_student',
      'internship',
      'dean_internship',
      'dean_general_affairs',
      'principal',
    ];
  }
  if (viewer.kind === 'teacher') {
    for (const r of reviewCase.recipients) {
      if (r.role !== 'homeroom' && r.role !== 'subject_teacher') continue;
      const idMatch = Boolean(r.personId && r.personId === viewer.id);
      const nameMatch =
        !r.personId &&
        Boolean(r.personName) &&
        teacherNameMatches(r.personName, viewer.name);
      if (idMatch || nameMatch) roles.push(r.role);
    }
    return [...new Set(roles)];
  }
  const stub = (title: string, group: AcademicStaff['group']): AcademicStaff => ({
    id: viewer.id,
    name: viewer.name,
    title,
    badge: '',
    email: '',
    phone: '',
    responsibleScope: '',
    group,
  });
  const group = viewer.staffGroup || 'academic';
  if (group === 'principal') roles.push('principal');
  if (group === 'student_affairs') {
    // 學務主任只走學務主任角色，勿同時當生輔組（戳章會變生輔組／主任）
    if (viewer.staffTitle && isDeanStudentStaff(stub(viewer.staffTitle, 'student_affairs'))) {
      roles.push('dean_student');
    } else {
      roles.push('student_affairs');
    }
  }
  if (group === 'academic') {
    const titled = viewer.staffTitle
      ? stub(viewer.staffTitle, 'academic')
      : null;
    // 實習／總務：不給教學組／教務核章權，改走下方專屬角色
    if (!titled || !isNonAcademicOfficeStaff(titled)) {
      // 教務主任只走教務主任角色，勿同時當教學組（戳章會變教學組／主任）
      if (titled && isDeanAcademicStaff(titled)) {
        roles.push('dean_academic');
      } else {
        roles.push('academic');
      }
    }
  }
  // 實習／總務：依職稱辨識，並需為此案收件人身分之一
  if (viewer.staffTitle) {
    const titled = stub(viewer.staffTitle, group as AcademicStaff['group']);
    const maybe: PatrolReviewRole[] = [];
    if (isDeanInternshipStaff(titled)) maybe.push('dean_internship');
    else if (isInternshipStaff(titled)) maybe.push('internship');
    if (isDeanGeneralAffairsStaff(titled)) maybe.push('dean_general_affairs');
    for (const role of maybe) {
      if (reviewCase.recipients.some((r) => r.role === role && r.personId === viewer.id)) {
        roles.push(role);
      } else if (
        reviewCase.recipients.some(
          (r) => r.role === role && !r.personId && teacherNameMatches(r.personName, viewer.name)
        )
      ) {
        roles.push(role);
      }
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
