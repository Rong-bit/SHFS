import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import {
  UserRole,
  Teacher,
  WorkshopVenue,
  CourseSession,
  SubstituteRequest,
  SystemConfig,
  MonthlyTeacherSettlement,
  ClashCheckResult,
  RequestType,
  DayOfWeek,
  DepartmentType,
  AcademicStaff,
} from '../types';
import {
  INITIAL_TEACHERS,
  INITIAL_VENUES,
  INITIAL_SESSIONS,
  INITIAL_REQUESTS,
  INITIAL_SYSTEM_CONFIG,
  INITIAL_ACADEMIC_STAFF,
  withMigratedAuthConfig,
} from '../data/mockData';
import { ParsedImportRow, inferIsPractical, splitTeacherNames } from '../utils/scheduleImporter';
import { ensureSchoolEmail } from '../utils/schoolEmail';
import { countWeeklyConcurrentPeriods, countWeeklyCounselingPeriods, countWeeklyTeachingPeriods, calendarYearForSettlementMonth, departmentFromLabel, enrichTeachersFromSessions, inferTeacherDepartmentFromPracticalRows, monthlyCounselingPeriods, monthlyOverloadPeriods, normalizeStandardBasePeriods, resolveTeacherBasePeriods, settlementWeeksForMonth } from '../utils/schoolDepartments';
import { autoVenueCodePrefix, autoVenueEquipmentNote } from '../utils/venueKinds';
import { temporarySwapPeriodDeltaInMonth, validateSwapRequestFields } from '../utils/temporarySwap';
import {
  CloudSyncSettings,
  loadCloudSyncSettings,
  saveCloudSyncSettings,
  isCloudSyncReady,
  pullSharedSchoolData,
  pushSharedSchoolData,
  testCloudSyncConnection,
  mergeLocalSecretsIntoRemote,
  CLOUD_SYNC_UPDATED_AT_KEY,
} from '../utils/cloudSync';
import { countApplicantApprovedLeaveCoverPeriodsInMonth, countBillableDaysForSubstituteApprove, countLeaveSubstitutePeriods, countLeaveSubstitutePeriodsInMonth } from '../utils/leaveDates';
import { nonTeachingDateSet } from '../utils/holidays';
import { formatRequestNumber, nextRequestSequence } from '../utils/requestNumbers';
import {
  ensurePasswordHashed,
  hashAuthConfigPasswords,
  hashPassword,
  isPasswordHash,
  resolveAuthConfigForSave,
} from '../utils/passwordCrypto';
import {
  applyRequestToSessions,
  applyRequestToSessionsDetailed,
  healLegacySubstituteOwnership,
  reapplyApprovedRequestsOldestFirst,
  remapRequestSessions,
  rollbackApprovedRequestsNewestFirstDetailed,
  rollbackRequestFromSessionsDetailed,
} from '../utils/scheduleAdjustments';
import { isPlaceholderSession, resolveOriginalSession, resolveSwapTargetSession } from '../utils/resolveOriginalSession';
import {
  collectSubstituteOccupancies,
  countWeeklySubstituteOccupancySlots,
  teacherHasSubstituteOccupancy,
  teacherWeeklyLoadTowardLimit,
} from '../utils/substituteCandidates';

interface AppContextType {
  currentRole: UserRole;
  /** @deprecated 請用 requestRoleSwitchWithAuth；僅允許切回教師端 */
  setCurrentRole: (role: UserRole) => void;
  /** 密碼驗證成功後寫入角色（僅供登入視窗使用） */
  completeAuthenticatedLogin: (payload: {
    role: UserRole;
    academicStaffId?: string;
    teacherId?: string;
  }) => void;
  currentTeacherId: string;
  setCurrentTeacherId: (id: string) => void;
  currentTeacher: Teacher | undefined;
  teachers: Teacher[];
  venues: WorkshopVenue[];
  sessions: CourseSession[];
  requests: SubstituteRequest[];
  systemConfig: SystemConfig;

  // Academic Staff Identity
  academicStaffList: AcademicStaff[];
  currentAcademicStaffId: string;
  setCurrentAcademicStaffId: (id: string) => void;
  currentAcademicStaff: AcademicStaff | undefined;
  updateAcademicStaff: (id: string, data: Partial<AcademicStaff>) => void;
  addAcademicStaff: (staff: Omit<AcademicStaff, 'id'>) => AcademicStaff;
  deleteAcademicStaff: (id: string) => void;
  
  // Actions
  addSubstituteRequest: (
    data: Omit<SubstituteRequest, 'id' | 'requestNumber' | 'createdAt' | 'status' | 'clashStatus'>,
    requestMonth?: number,
    batchOptions?: { sequenceOffset?: number; idNonce?: string | number }
  ) => SubstituteRequest;
  /** 教師多節請假：全數預檢後一次寫入（原子） */
  addSubstituteRequests: (
    items: Array<
      Omit<SubstituteRequest, 'id' | 'requestNumber' | 'createdAt' | 'status' | 'clashStatus'>
    >,
    requestMonth?: number,
    batchOptions?: { idNoncePrefix?: string }
  ) => SubstituteRequest[];
  createStaffDirectDispatch: (
    data: Omit<SubstituteRequest, 'id' | 'requestNumber' | 'createdAt' | 'status' | 'clashStatus'> & {
      autoApprove?: boolean;
    },
    requestMonth?: number,
    batchOptions?: { sequenceOffset?: number; idNonce?: string | number }
  ) => SubstituteRequest;
  /** 批次逕行派代：全數預檢通過後一次寫入課表與單據（原子） */
  createStaffDirectDispatches: (
    items: Array<
      Omit<SubstituteRequest, 'id' | 'requestNumber' | 'createdAt' | 'status' | 'clashStatus'> & {
        autoApprove?: boolean;
      }
    >,
    requestMonth?: number,
    batchOptions?: { idNoncePrefix?: string }
  ) => SubstituteRequest[];
  /** 核准成功回傳 true；佔位課堂無法對應課表時回傳 false */
  approveRequest: (requestId: string, reviewerName?: string) => boolean;
  batchApproveRequests: (requestIds: string[], reviewerName?: string) => number;
  rejectRequest: (requestId: string, reason: string, reviewerName?: string) => void;
  cancelRequest: (requestId: string) => void;
  deleteRequest: (requestId: string) => void;
  clearAllRequests: () => void;
  updateSystemConfig: (newConfig: Partial<SystemConfig>) => void;
  resetToMockData: () => void;
  addVenue: (venue: Omit<WorkshopVenue, 'id'>) => WorkshopVenue;
  updateVenue: (id: string, data: Partial<WorkshopVenue>) => void;
  deleteVenue: (id: string) => void;
  /** 匯入後調整單堂課的工場／教室 */
  updateSessionVenue: (sessionId: string, venueId: string) => boolean;
  addTeacher: (teacher: Omit<Teacher, 'id' | 'weeklyActualPeriods'>) => Teacher;
  updateTeacher: (id: string, data: Partial<Teacher>) => void;
  deleteTeacher: (id: string) => void;
  
  // Schedule Import & Batch Update
  importSchedule: (params: {
    validRows: ParsedImportRow[];
    mode: 'overwrite' | 'append';
    newTeacherNames: string[];
    newVenueNames: string[];
    /** 覆蓋模式是否清空調代課申請（預設 true） */
    clearRequests?: boolean;
  }) => {
    success: boolean;
    addedCount: number;
    updatedCount: number;
    newTeachersCount: number;
    newVenuesCount: number;
  };

  // Validation
  checkClashes: (params: {
    requestType: RequestType;
    applicantTeacherId: string;
    originalSession: CourseSession;
    targetReschedule?: {
      dayOfWeek: DayOfWeek;
      period: number;
      venueId: string;
      exchangeSessionId?: string;
    };
    swapTargetTeacherId?: string;
    swapTargetSession?: CourseSession;
    substituteTeacherId?: string;
    /** 批次核准時傳入累進課表 */
    sessionsOverride?: CourseSession[];
    /** 批次核准時傳入累進申請（含已核准佔用） */
    requestsOverride?: SubstituteRequest[];
    /** 核准時排除本單，避免待簽核自佔用誤判衝堂 */
    excludeRequestIds?: string[];
    /** 代課請假區間：與既有代課佔用比對是否重疊 */
    leaveDateStart?: string;
    leaveDateEnd?: string;
  }) => ClashCheckResult;
  
  // Settlement calculation
  calculateMonthlySettlement: (month?: number) => MonthlyTeacherSettlement[];
  
  // UI states
  isAiAdvisorOpen: boolean;
  setIsAiAdvisorOpen: (open: boolean) => void;
  isImportModalOpen: boolean;
  setIsImportModalOpen: (open: boolean) => void;
  printModalRequest: SubstituteRequest | null;
  setPrintModalRequest: (req: SubstituteRequest | null) => void;
  
  // Login & Password Security
  isLoginAuthOpen: boolean;
  setIsLoginAuthOpen: (open: boolean) => void;
  loginAuthTarget: any;
  setLoginAuthTarget: (target: any) => void;
  authenticatedTeacherIds: string[];
  requestRoleSwitchWithAuth: (role: UserRole, academicStaffId?: string) => void;
  requestTeacherSwitchWithAuth: (teacherId: string) => void;
  requestTeacherActionAuth: (teacherId: string, actionCallback: () => void, actionName?: string) => void;
  updateTeacherPassword: (teacherId: string, newPassword: string) => void;
  /** 教學組／出納組組員自行設定個人登入密碼；空字串＝改回組別預設 */
  updateAcademicStaffPassword: (staffId: string, newPassword: string) => void;

  cloudSyncSettings: CloudSyncSettings;
  cloudSyncStatus: 'off' | 'connecting' | 'synced' | 'error';
  cloudSyncMessage: string;
  lastCloudSyncAt: number | null;
  updateCloudSyncSettings: (settings: CloudSyncSettings) => void;
  testCloudSync: () => Promise<string>;
  /** 衝突時：採用雲端（覆蓋本機） */
  pullCloudOverwriteLocal: () => Promise<void>;
  /** 衝突時：強制推送本機（覆蓋雲端） */
  forcePushLocalToCloud: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const STORAGE_KEYS = {
  TEACHERS: 'voc_teachers_v1',
  VENUES: 'voc_venues_v1',
  SESSIONS: 'voc_sessions_v1',
  REQUESTS: 'voc_requests_v1',
  CONFIG: 'voc_config_v1',
  ROLE: 'voc_role_v1',
  CURRENT_TEACHER: 'voc_curr_teacher_v1',
  CURRENT_STAFF: 'voc_curr_staff_v1',
  STAFF_LIST: 'voc_academic_staff_v1',
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentRole, setCurrentRole] = useState<UserRole>(() => {
    // 重整不還原教務／出納／管理員，避免略過密碼門檻；僅教師可持久化
    const saved = localStorage.getItem(STORAGE_KEYS.ROLE);
    if (saved === 'teacher') return 'teacher';
    return 'teacher';
  });

  const [currentTeacherId, setCurrentTeacherId] = useState<string>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.CURRENT_TEACHER);
    return saved || 't-ee-head';
  });

  const [academicStaffList, setAcademicStaffList] = useState<AcademicStaff[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.STAFF_LIST);
    const list: AcademicStaff[] = saved ? JSON.parse(saved) : INITIAL_ACADEMIC_STAFF;
    return list.map((s) => ({ ...s, email: ensureSchoolEmail(s.name, s.email) }));
  });

  const [currentAcademicStaffId, setCurrentAcademicStaffId] = useState<string>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.CURRENT_STAFF);
    return saved || 'staff-01';
  });

  const [teachers, setTeachers] = useState<Teacher[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.TEACHERS);
    const list: Teacher[] = saved ? JSON.parse(saved) : INITIAL_TEACHERS;
    const withEmail = list.map((t) => ({ ...t, email: ensureSchoolEmail(t.name, t.email) }));
    const savedSessions = localStorage.getItem(STORAGE_KEYS.SESSIONS);
    const sessionList: CourseSession[] = savedSessions ? JSON.parse(savedSessions) : INITIAL_SESSIONS;
    let basePeriods = normalizeStandardBasePeriods(INITIAL_SYSTEM_CONFIG.standardBasePeriods);
    try {
      const savedConfig = localStorage.getItem(STORAGE_KEYS.CONFIG);
      if (savedConfig) {
        const parsed = JSON.parse(savedConfig);
        basePeriods = normalizeStandardBasePeriods(
          parsed.standardBasePeriods || parsed.basePeriodsStandard
        );
      }
    } catch {
      /* keep defaults */
    }
    return enrichTeachersFromSessions(
      withEmail,
      sessionList,
      basePeriods.fulltime,
      basePeriods.homeroom,
      basePeriods.head,
      basePeriods.sectionChief,
      basePeriods.director
    );
  });

  const [venues, setVenues] = useState<WorkshopVenue[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.VENUES);
    return saved ? JSON.parse(saved) : INITIAL_VENUES;
  });

  const [sessions, setSessions] = useState<CourseSession[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.SESSIONS);
    const list: CourseSession[] = saved ? JSON.parse(saved) : INITIAL_SESSIONS;
    return list.map((s) => ({
      ...s,
      isPractical:
        typeof s.isPractical === 'boolean'
          ? s.isPractical
          : inferIsPractical(s.subjectName, s.venueName),
    }));
  });

  const [requests, setRequests] = useState<SubstituteRequest[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.REQUESTS);
    return saved ? JSON.parse(saved) : INITIAL_REQUESTS;
  });

  const [systemConfig, setSystemConfig] = useState<SystemConfig>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.CONFIG);
    if (!saved) return INITIAL_SYSTEM_CONFIG;
    try {
      const parsed = JSON.parse(saved);
      return {
        ...INITIAL_SYSTEM_CONFIG,
        ...parsed,
        nonTeachingDays: Array.isArray(parsed.nonTeachingDays)
          ? parsed.nonTeachingDays
          : INITIAL_SYSTEM_CONFIG.nonTeachingDays || [],
        temporaryScheduleMoves: Array.isArray(parsed.temporaryScheduleMoves)
          ? parsed.temporaryScheduleMoves
          : INITIAL_SYSTEM_CONFIG.temporaryScheduleMoves || [],
        partialNonTeachingDays: Array.isArray(parsed.partialNonTeachingDays)
          ? parsed.partialNonTeachingDays
          : INITIAL_SYSTEM_CONFIG.partialNonTeachingDays || [],
        standardBasePeriods: normalizeStandardBasePeriods(
          parsed.standardBasePeriods || parsed.basePeriodsStandard
        ),
        authConfig: withMigratedAuthConfig(parsed.authConfig || INITIAL_SYSTEM_CONFIG.authConfig),
      };
    } catch {
      return INITIAL_SYSTEM_CONFIG;
    }
  });

  const [isAiAdvisorOpen, setIsAiAdvisorOpen] = useState<boolean>(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);
  const [printModalRequest, setPrintModalRequest] = useState<SubstituteRequest | null>(null);

  const [cloudSyncSettings, setCloudSyncSettings] = useState<CloudSyncSettings>(() => loadCloudSyncSettings());
  const [cloudSyncStatus, setCloudSyncStatus] = useState<'off' | 'connecting' | 'synced' | 'error'>(
    () => (isCloudSyncReady(loadCloudSyncSettings()) ? 'connecting' : 'off')
  );
  const [cloudSyncMessage, setCloudSyncMessage] = useState('');
  const [lastCloudSyncAt, setLastCloudSyncAt] = useState<number | null>(() => {
    const saved = localStorage.getItem(CLOUD_SYNC_UPDATED_AT_KEY);
    return saved ? Number(saved) : null;
  });
  const skipCloudPushRef = useRef(false);
  const cloudReadyRef = useRef(false);
  const cloudBusyRef = useRef(false);
  /** busy 時有本機變更未推送；結束後重試 */
  const cloudDirtyRef = useRef(false);
  /** 推送衝突中：禁止輪詢自動套用遠端，直到手動拉取或強制推送 */
  const cloudConflictRef = useRef(false);
  const [cloudPushNonce, setCloudPushNonce] = useState(0);
  const lastCloudSyncAtRef = useRef<number>(lastCloudSyncAt || 0);
  const teachersRef = useRef(teachers);
  const systemConfigRef = useRef(systemConfig);
  const academicStaffListRef = useRef(academicStaffList);
  teachersRef.current = teachers;
  systemConfigRef.current = systemConfig;
  academicStaffListRef.current = academicStaffList;

  // Authentication & Password Check States
  const [isLoginAuthOpen, setIsLoginAuthOpen] = useState<boolean>(false);
  const [loginAuthTarget, setLoginAuthTarget] = useState<any>(null);
  const [authenticatedTeacherIds, setAuthenticatedTeacherIds] = useState<string[]>([]);

  const completeAuthenticatedLogin = (payload: {
    role: UserRole;
    academicStaffId?: string;
    teacherId?: string;
  }) => {
    setCurrentRole(payload.role);
    if (payload.teacherId) setCurrentTeacherId(payload.teacherId);
    if (payload.academicStaffId) setCurrentAcademicStaffId(payload.academicStaffId);
  };

  /** 對外僅允許切回教師；其他角色必須走密碼驗證 */
  const setCurrentRolePublic = (role: UserRole) => {
    if (role === 'teacher') {
      setCurrentRole('teacher');
      return;
    }
    requestRoleSwitchWithAuth(role);
  };

  const requestRoleSwitchWithAuth = (targetRole: UserRole, academicStaffId?: string) => {
    if (targetRole === 'teacher') {
      setCurrentRole('teacher');
      return;
    }

    if (targetRole === currentRole && (!academicStaffId || academicStaffId === currentAcademicStaffId)) {
      return;
    }
    const requirePass = systemConfig.authConfig?.requirePassword !== false;
    if (!requirePass) {
      setCurrentRole(targetRole);
      if (academicStaffId) setCurrentAcademicStaffId(academicStaffId);
      return;
    }
    setLoginAuthTarget({
      type: 'role',
      targetRole,
      academicStaffId,
    });
    setIsLoginAuthOpen(true);
  };

  // Switching teacher schedule view is open & instantaneous
  const requestTeacherSwitchWithAuth = (targetTeacherId: string) => {
    setCurrentTeacherId(targetTeacherId);
    setCurrentRole('teacher');
  };

  // Security Gate: Verification required ONLY when initiating an action (like + 新增調代課申請 / 課堂調課)
  const requestTeacherActionAuth = (teacherId: string, actionCallback: () => void, actionName?: string) => {
    const targetTeacherId = teacherId || currentTeacherId || teachers[0]?.id;
    const requirePass = systemConfig.authConfig?.requirePassword !== false;

    if (!targetTeacherId || !requirePass) {
      actionCallback();
      return;
    }

    setLoginAuthTarget({
      type: 'teacher_action',
      teacherId: targetTeacherId,
      actionName: actionName || '新增調代課申請',
      onSuccess: () => {
        actionCallback();
      },
    });
    setIsLoginAuthOpen(true);
  };

  const updateTeacherPassword = (teacherId: string, newPassword: string) => {
    const next = newPassword.trim();
    if (!next) {
      setTeachers((prev) =>
        prev.map((t) => (t.id === teacherId ? { ...t, password: undefined } : t))
      );
      return;
    }
    void hashPassword(next).then((hashed) => {
      setTeachers((prev) =>
        prev.map((t) => (t.id === teacherId ? { ...t, password: hashed } : t))
      );
    });
  };

  const updateAcademicStaffPassword = (staffId: string, newPassword: string) => {
    const next = newPassword.trim();
    if (!next) {
      setAcademicStaffList((prev) =>
        prev.map((s) => (s.id === staffId ? { ...s, password: undefined } : s))
      );
      return;
    }
    void hashPassword(next).then((hashed) => {
      setAcademicStaffList((prev) =>
        prev.map((s) => (s.id === staffId ? { ...s, password: hashed } : s))
      );
    });
  };

  // 啟動時將本機殘留明文密碼改為雜湊（僅執行一次）
  useEffect(() => {
    let cancelled = false;
    const migrate = async () => {
      const auth = systemConfigRef.current.authConfig;
      let authChanged = false;
      let nextAuth = auth;
      if (auth) {
        const hashedAuth = await hashAuthConfigPasswords(auth);
        authChanged = (['defaultTeacherPassword', 'adminPassword', 'academicPassword', 'accountingPassword'] as const).some(
          (k) => hashedAuth[k] !== auth[k]
        );
        if (authChanged) nextAuth = hashedAuth;
      }

      const currentTeachers = teachersRef.current;
      let teachersChanged = false;
      const nextTeachers = await Promise.all(
        currentTeachers.map(async (t) => {
          if (!t.password || isPasswordHash(t.password)) return t;
          teachersChanged = true;
          return { ...t, password: await ensurePasswordHashed(t.password) };
        })
      );

      const currentStaff = academicStaffListRef.current;
      let staffChanged = false;
      const nextStaff = await Promise.all(
        currentStaff.map(async (s) => {
          if (!s.password || isPasswordHash(s.password)) return s;
          staffChanged = true;
          return { ...s, password: await ensurePasswordHashed(s.password) };
        })
      );

      if (cancelled || (!authChanged && !teachersChanged && !staffChanged)) return;
      if (authChanged && nextAuth) {
        setSystemConfig((prev) => ({
          ...prev,
          authConfig: withMigratedAuthConfig(nextAuth),
        }));
      }
      if (teachersChanged) {
        setTeachers(nextTeachers);
      }
      if (staffChanged) {
        setAcademicStaffList(nextStaff);
      }
    };
    void migrate();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.STAFF_LIST, JSON.stringify(academicStaffList));
  }, [academicStaffList]);

  useEffect(() => {
    // 特權角色不寫入持久化，重整後一律回教師（須再密碼驗證）
    localStorage.setItem(STORAGE_KEYS.ROLE, 'teacher');
  }, [currentRole]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.CURRENT_STAFF, currentAcademicStaffId);
  }, [currentAcademicStaffId]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.CURRENT_TEACHER, currentTeacherId);
  }, [currentTeacherId]);

  // Ensure current teacher always resolves to an existing teacher
  useEffect(() => {
    if (teachers.length > 0 && !teachers.some((t) => t.id === currentTeacherId)) {
      setCurrentTeacherId(teachers[0].id);
    }
  }, [teachers, currentTeacherId]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.TEACHERS, JSON.stringify(teachers));
  }, [teachers]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.VENUES, JSON.stringify(venues));
  }, [venues]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(sessions));
  }, [sessions]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.REQUESTS, JSON.stringify(requests));
  }, [requests]);

  // 一次性：還原舊版請假把任課改走的課堂（申請人課表不應少節）
  const didHealSubstituteRef = useRef(false);
  useEffect(() => {
    if (didHealSubstituteRef.current) return;
    didHealSubstituteRef.current = true;
    setSessions((prev) => healLegacySubstituteOwnership(prev, requests));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(systemConfig));
  }, [systemConfig]);

  const applySharedSchoolData = (remote: {
    updatedAt: number;
    teachers: Teacher[];
    venues: WorkshopVenue[];
    sessions: CourseSession[];
    requests: SubstituteRequest[];
    systemConfig: SystemConfig;
    academicStaffList: AcademicStaff[];
  }) => {
    skipCloudPushRef.current = true;
    const merged = mergeLocalSecretsIntoRemote(
      remote,
      teachersRef.current,
      systemConfigRef.current.authConfig,
      academicStaffListRef.current
    );
    const remoteTeachers = (merged.teachers || []).map((t) => ({
      ...t,
      email: ensureSchoolEmail(t.name, t.email),
    }));
    const remoteSessions = (merged.sessions || []).map((s) => ({
      ...s,
      isPractical:
        typeof s.isPractical === 'boolean'
          ? s.isPractical
          : inferIsPractical(s.subjectName, s.venueName),
    }));
    const remoteStd = normalizeStandardBasePeriods(merged.systemConfig?.standardBasePeriods);
    setTeachers(
      enrichTeachersFromSessions(
        remoteTeachers,
        remoteSessions,
        remoteStd.fulltime,
        remoteStd.homeroom,
        remoteStd.head,
        remoteStd.sectionChief,
        remoteStd.director
      )
    );
    setVenues(merged.venues || []);
    setSessions(remoteSessions);
    setRequests(merged.requests || []);
    setSystemConfig({
      ...INITIAL_SYSTEM_CONFIG,
      ...(merged.systemConfig || {}),
      standardBasePeriods: remoteStd,
      authConfig: withMigratedAuthConfig({
        ...INITIAL_SYSTEM_CONFIG.authConfig,
        ...(merged.systemConfig?.authConfig || {}),
      }),
    });
    if (merged.academicStaffList?.length) {
      setAcademicStaffList(
        merged.academicStaffList.map((s) => ({ ...s, email: ensureSchoolEmail(s.name, s.email) }))
      );
    }
    lastCloudSyncAtRef.current = merged.updatedAt;
    setLastCloudSyncAt(merged.updatedAt);
    localStorage.setItem(CLOUD_SYNC_UPDATED_AT_KEY, String(merged.updatedAt));
  };

  const buildSharedSchoolData = (updatedAt: number) => ({
    updatedAt,
    teachers,
    venues,
    sessions,
    requests,
    systemConfig,
    academicStaffList,
  });

  const updateCloudSyncSettings = (settings: CloudSyncSettings) => {
    const prevKey = cloudSyncSettings.schoolKey.trim();
    const prevUrl = cloudSyncSettings.databaseUrl.trim();
    const nextKey = settings.schoolKey.trim();
    const nextUrl = settings.databaseUrl.trim();
    const pathChanged =
      prevKey !== nextKey ||
      prevUrl.replace(/\/+$/, '') !== nextUrl.replace(/\/+$/, '');

    setCloudSyncSettings(settings);
    saveCloudSyncSettings(settings);

    // 換密碼／網址＝換雲端路徑：必須清時間戳，否則可能用舊路徑時間戳覆寫新路徑
    if (pathChanged) {
      lastCloudSyncAtRef.current = 0;
      setLastCloudSyncAt(null);
      localStorage.removeItem(CLOUD_SYNC_UPDATED_AT_KEY);
      cloudConflictRef.current = false;
      cloudDirtyRef.current = false;
      cloudReadyRef.current = false;
    }

    if (!isCloudSyncReady(settings)) {
      setCloudSyncStatus('off');
      setCloudSyncMessage('尚未啟用跨電腦同步');
      cloudReadyRef.current = false;
    } else {
      setCloudSyncStatus('connecting');
      setCloudSyncMessage(
        pathChanged
          ? '同步密碼或網址已變更，正在重新連線…'
          : '正在連線同步...'
      );
    }
  };

  const testCloudSync = () => testCloudSyncConnection(cloudSyncSettings);

  const pullCloudOverwriteLocal = async () => {
    if (!isCloudSyncReady(cloudSyncSettings)) {
      setCloudSyncMessage('尚未啟用跨電腦同步');
      return;
    }
    setCloudSyncStatus('connecting');
    setCloudSyncMessage('正在拉取雲端資料…');
    try {
      const remote = await pullSharedSchoolData(cloudSyncSettings);
      if (!remote) {
        setCloudSyncStatus('error');
        setCloudSyncMessage('雲端尚無資料可拉取');
        return;
      }
      cloudDirtyRef.current = false;
      cloudConflictRef.current = false;
      applySharedSchoolData(remote);
      setCloudSyncStatus('synced');
      setCloudSyncMessage('已採用雲端資料（本機未推送變更已放棄）');
    } catch (err: any) {
      setCloudSyncStatus('error');
      setCloudSyncMessage(err?.message || '拉取雲端失敗');
    }
  };

  const forcePushLocalToCloud = async () => {
    if (!isCloudSyncReady(cloudSyncSettings)) {
      setCloudSyncMessage('尚未啟用跨電腦同步');
      return;
    }
    if (cloudBusyRef.current) {
      setCloudSyncMessage('同步進行中，請稍後再強制推送');
      return;
    }
    setCloudSyncStatus('connecting');
    setCloudSyncMessage('正在強制推送本機…');
    cloudBusyRef.current = true;
    try {
      const remote = await pullSharedSchoolData(cloudSyncSettings);
      const remoteAt = remote?.updatedAt ?? lastCloudSyncAtRef.current;
      // 不可在寫入成功前推進 lastCloudSyncAtRef，否則推送失敗後會跳過套用較新遠端
      const now = Date.now();
      let result = await pushSharedSchoolData(
        cloudSyncSettings,
        buildSharedSchoolData(now),
        { ifMatchUpdatedAt: remoteAt }
      );
      let writtenAt = now;
      if (result === 'conflict') {
        const again = await pullSharedSchoolData(cloudSyncSettings);
        const at2 = again?.updatedAt ?? Date.now();
        const now2 = Date.now();
        result = await pushSharedSchoolData(cloudSyncSettings, buildSharedSchoolData(now2), {
          ifMatchUpdatedAt: at2,
        });
        writtenAt = now2;
      }
      if (result === 'conflict') {
        cloudConflictRef.current = true;
        setCloudSyncStatus('error');
        setCloudSyncMessage(
          '強制推送仍衝突（他機同時寫入）。請稍後再試「強制推送本機」，或改「拉取遠端」。'
        );
        return;
      }
      lastCloudSyncAtRef.current = writtenAt;
      setLastCloudSyncAt(writtenAt);
      localStorage.setItem(CLOUD_SYNC_UPDATED_AT_KEY, String(writtenAt));
      cloudDirtyRef.current = false;
      cloudConflictRef.current = false;
      setCloudSyncStatus('synced');
      setCloudSyncMessage('已強制推送本機（雲端已改為本機內容）');
    } catch (err: any) {
      setCloudSyncStatus('error');
      setCloudSyncMessage(err?.message || '強制推送失敗');
    } finally {
      cloudBusyRef.current = false;
    }
  };

  useEffect(() => {
    if (!isCloudSyncReady(cloudSyncSettings)) {
      cloudReadyRef.current = false;
      setCloudSyncStatus('off');
      return;
    }

    let stopped = false;
    cloudReadyRef.current = false;
    setCloudSyncStatus('connecting');
    setCloudSyncMessage('正在連線同步...');

    const pullOnce = async () => {
      if (cloudBusyRef.current) {
        cloudDirtyRef.current = true;
        return;
      }
      cloudBusyRef.current = true;
      try {
        const remote = await pullSharedSchoolData(cloudSyncSettings);
        if (stopped) return;
        if (remote && remote.updatedAt > lastCloudSyncAtRef.current) {
          if (cloudConflictRef.current) {
            // 衝突待處理：不可靜默套用遠端，否則衝突提示／本機變更會被蓋掉
            setCloudSyncStatus('error');
            setCloudSyncMessage(
              '其他電腦有較新資料，已暫停自動覆寫。請至「雲端同步」選擇「拉取遠端（採用對方）」或「強制推送本機」。'
            );
          } else if (cloudDirtyRef.current) {
            // 本機尚有待推送變更：暫不套用遠端，避免覆蓋本機異動
            setCloudSyncStatus('error');
            setCloudSyncMessage(
              '本機有待同步變更，暫緩套用雲端較新資料。請稍候自動推送，或至雲端同步手動處理。'
            );
          } else {
            applySharedSchoolData(remote);
            setCloudSyncMessage('已從雲端更新課表與設定');
          }
        } else if (!remote && lastCloudSyncAtRef.current === 0) {
          const now = Date.now();
          const result = await pushSharedSchoolData(
            cloudSyncSettings,
            buildSharedSchoolData(now),
            { ifMatchUpdatedAt: 0 }
          );
          if (result === 'ok') {
            lastCloudSyncAtRef.current = now;
            setLastCloudSyncAt(now);
            localStorage.setItem(CLOUD_SYNC_UPDATED_AT_KEY, String(now));
            setCloudSyncMessage('已建立雲端資料，其他電腦可用同一組設定讀取');
          }
        }
        cloudReadyRef.current = true;
        // 衝突或本機 dirty 暫緩：不可改回 synced
        if (cloudConflictRef.current || cloudDirtyRef.current) {
          setCloudSyncStatus('error');
        } else {
          setCloudSyncStatus('synced');
        }
      } catch (err: any) {
        if (stopped) return;
        cloudReadyRef.current = true;
        setCloudSyncStatus('error');
        setCloudSyncMessage(err?.message || '同步失敗');
      } finally {
        cloudBusyRef.current = false;
        if (cloudDirtyRef.current && !stopped) {
          cloudDirtyRef.current = false;
          setCloudPushNonce((n) => n + 1);
        }
      }
    };

    pullOnce();
    const timer = window.setInterval(pullOnce, 5000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudSyncSettings.enabled, cloudSyncSettings.databaseUrl, cloudSyncSettings.schoolKey]);

  useEffect(() => {
    if (!isCloudSyncReady(cloudSyncSettings) || !cloudReadyRef.current) return;
    if (cloudConflictRef.current) return; // 衝突待手動處理：暫停自動推送
    if (skipCloudPushRef.current) {
      skipCloudPushRef.current = false;
      return;
    }
    const handle = window.setTimeout(async () => {
      if (cloudBusyRef.current) {
        cloudDirtyRef.current = true;
        // busy 結束後由對方 finally 或下方延遲觸發重試，避免本機變更被丟棄
        window.setTimeout(() => {
          if (cloudDirtyRef.current && !cloudBusyRef.current) {
            cloudDirtyRef.current = false;
            setCloudPushNonce((n) => n + 1);
          }
        }, 1200);
        return;
      }
      cloudBusyRef.current = true;
      cloudDirtyRef.current = false;
      try {
        const baseUpdatedAt = lastCloudSyncAtRef.current;
        const now = Date.now();
        const result = await pushSharedSchoolData(
          cloudSyncSettings,
          buildSharedSchoolData(now),
          { ifMatchUpdatedAt: baseUpdatedAt }
        );
    if (result === 'conflict') {
      // 暫停自動覆寫，避免蓋掉其他電腦已同步資料；請使用者明確選擇拉取或強制推送
      cloudConflictRef.current = true;
      setCloudSyncStatus('error');
      setCloudSyncMessage(
        '其他電腦有較新資料，已暫停自動覆寫以免覆蓋對方變更。請至「雲端同步」選擇「拉取遠端（採用對方）」或「強制推送本機」。'
      );
      cloudDirtyRef.current = false;
      return;
    }
        // 寫入成功後才更新本機時間戳
        lastCloudSyncAtRef.current = now;
        setLastCloudSyncAt(now);
        localStorage.setItem(CLOUD_SYNC_UPDATED_AT_KEY, String(now));
        setCloudSyncStatus('synced');
        setCloudSyncMessage('已同步到其他電腦');
      } catch (err: any) {
        setCloudSyncStatus('error');
        setCloudSyncMessage(err?.message || '同步寫入失敗');
      } finally {
        cloudBusyRef.current = false;
        if (cloudDirtyRef.current) {
          cloudDirtyRef.current = false;
          setCloudPushNonce((n) => n + 1);
        }
      }
    }, 800);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teachers, venues, sessions, requests, systemConfig, academicStaffList, cloudPushNonce]);

  const currentTeacher = teachers.find((t) => t.id === currentTeacherId) || teachers[0];
  const currentAcademicStaff = academicStaffList.find((s) => s.id === currentAcademicStaffId) || academicStaffList[0];

  // 教學組作業時簽章身分不可殘留出納組人員（共用 currentAcademicStaffId）
  useEffect(() => {
    if (currentRole !== 'academic') return;
    const current = academicStaffList.find((s) => s.id === currentAcademicStaffId);
    if (current && (current.group || 'academic') === 'academic') return;
    const firstAcademic = academicStaffList.find((s) => (s.group || 'academic') === 'academic');
    if (firstAcademic && firstAcademic.id !== currentAcademicStaffId) {
      setCurrentAcademicStaffId(firstAcademic.id);
    }
  }, [currentRole, currentAcademicStaffId, academicStaffList]);

  // 出納組作業時同樣對齊出納組人員
  useEffect(() => {
    if (currentRole !== 'accounting') return;
    const current = academicStaffList.find((s) => s.id === currentAcademicStaffId);
    if (current && current.group === 'accounting') return;
    const firstAcc = academicStaffList.find((s) => s.group === 'accounting');
    if (firstAcc && firstAcc.id !== currentAcademicStaffId) {
      setCurrentAcademicStaffId(firstAcc.id);
    }
  }, [currentRole, currentAcademicStaffId, academicStaffList]);

  // Clash checking algorithm
  const checkClashes = (params: {
    requestType: RequestType;
    applicantTeacherId: string;
    originalSession: CourseSession;
    targetReschedule?: {
      dayOfWeek: DayOfWeek;
      period: number;
      venueId: string;
      exchangeSessionId?: string;
    };
    swapTargetTeacherId?: string;
    swapTargetSession?: CourseSession;
    substituteTeacherId?: string;
    sessionsOverride?: CourseSession[];
    requestsOverride?: SubstituteRequest[];
    excludeRequestIds?: string[];
    leaveDateStart?: string;
    leaveDateEnd?: string;
  }): ClashCheckResult => {
    const messages: string[] = [];
    let severity: 'none' | 'warning' | 'danger' = 'none';

    const {
      requestType,
      applicantTeacherId,
      originalSession,
      targetReschedule,
      swapTargetTeacherId,
      swapTargetSession,
      substituteTeacherId,
      leaveDateStart,
      leaveDateEnd,
    } = params;

    const schedule = params.sessionsOverride ?? sessions;
    const requestPool = params.requestsOverride ?? requests;
    const applicant = teachers.find((t) => t.id === applicantTeacherId);

    if (requestType === 'reschedule' && targetReschedule) {
      const { dayOfWeek, period, venueId, exchangeSessionId } = targetReschedule;
      const exchangePartner = exchangeSessionId
        ? schedule.find((s) => s.id === exchangeSessionId)
        : undefined;

      if (exchangeSessionId) {
        if (!exchangePartner) {
          return {
            hasClash: true,
            severity: 'danger',
            messages: ['找不到要置換的目標課堂，請重新選擇時段'],
          };
        }
        if (exchangePartner.id === originalSession.id) {
          return {
            hasClash: true,
            severity: 'danger',
            messages: ['不可與自己的課堂置換'],
          };
        }
        if (
          exchangePartner.dayOfWeek !== dayOfWeek ||
          exchangePartner.period !== period
        ) {
          messages.push(
            `【置換對象時段不符】所選置換課堂目前在週${exchangePartner.dayOfWeek}第${exchangePartner.period}節，與目標週${dayOfWeek}第${period}節不一致`
          );
          severity = 'danger';
        }

        // 申請人進入對方時段：不可另有其他課（對方課堂本身會被換走）
        const applicantClash = schedule.find(
          (s) =>
            s.teacherId === applicantTeacherId &&
            s.dayOfWeek === dayOfWeek &&
            s.period === period &&
            s.id !== originalSession.id &&
            s.id !== exchangePartner.id
        );
        if (applicantClash) {
          messages.push(
            `【教師衝堂】置換後申請教師在週${dayOfWeek}第${period}節仍有「${applicantClash.className} ${applicantClash.subjectName}」`
          );
          severity = 'danger';
        }

        // 對方進入申請人原時段
        const partnerClash = schedule.find(
          (s) =>
            s.teacherId === exchangePartner.teacherId &&
            s.dayOfWeek === originalSession.dayOfWeek &&
            s.period === originalSession.period &&
            s.id !== exchangePartner.id &&
            s.id !== originalSession.id
        );
        if (partnerClash) {
          messages.push(
            `【對方教師衝堂】${exchangePartner.teacherName} 置換到週${originalSession.dayOfWeek}第${originalSession.period}節後仍有「${partnerClash.className} ${partnerClash.subjectName}」`
          );
          severity = 'danger';
        }

        // 班級：雙方若不同班，檢查置換後班級是否重疊
        if (originalSession.className !== exchangePartner.className) {
          const classAtTarget = schedule.find(
            (s) =>
              s.className === originalSession.className &&
              s.dayOfWeek === dayOfWeek &&
              s.period === period &&
              s.id !== originalSession.id &&
              s.id !== exchangePartner.id
          );
          if (classAtTarget) {
            messages.push(
              `【班級衝堂】班級 ${originalSession.className} 在週${dayOfWeek}第${period}節另有「${classAtTarget.subjectName}」`
            );
            severity = 'danger';
          }
          const partnerClassAtOrig = schedule.find(
            (s) =>
              s.className === exchangePartner.className &&
              s.dayOfWeek === originalSession.dayOfWeek &&
              s.period === originalSession.period &&
              s.id !== exchangePartner.id &&
              s.id !== originalSession.id
          );
          if (partnerClassAtOrig) {
            messages.push(
              `【班級衝堂】班級 ${exchangePartner.className} 在週${originalSession.dayOfWeek}第${originalSession.period}節另有「${partnerClassAtOrig.subjectName}」`
            );
            severity = 'danger';
          }
        }

        // 申請人指定場地在目標時段（排除對方原堂）
        if (venueId) {
          const venueClash = schedule.find(
            (s) =>
              s.venueId === venueId &&
              s.dayOfWeek === dayOfWeek &&
              s.period === period &&
              s.id !== originalSession.id &&
              s.id !== exchangePartner.id
          );
          if (venueClash) {
            const venueObj = venues.find((v) => v.id === venueId);
            messages.push(
              `【工場教室衝堂】${venueObj?.name || '指定教室/工場'} 在週${dayOfWeek}第${period}節已被「${venueClash.className} ${venueClash.subjectName}」借用`
            );
            severity = 'danger';
          }
        }

        // 對方場地帶回申請人原時段
        if (exchangePartner.venueId) {
          const partnerVenueClash = schedule.find(
            (s) =>
              s.venueId === exchangePartner.venueId &&
              s.dayOfWeek === originalSession.dayOfWeek &&
              s.period === originalSession.period &&
              s.id !== exchangePartner.id &&
              s.id !== originalSession.id
          );
          if (partnerVenueClash) {
            messages.push(
              `【工場教室衝堂】${exchangePartner.venueName} 置換到週${originalSession.dayOfWeek}第${originalSession.period}節後與「${partnerVenueClash.className} ${partnerVenueClash.subjectName}」衝突`
            );
            severity = 'danger';
          }
        }

        if (messages.length === 0) {
          messages.push(
            `檢核通過：將與「${exchangePartner.teacherName}｜${exchangePartner.className} ${exchangePartner.subjectName}」永久置換時段（週${dayOfWeek}第${period}節 ⇄ 週${originalSession.dayOfWeek}第${originalSession.period}節）。`
          );
        }
      } else {
      // 1. Check if applicant already teaches at target time
      const teacherClash = schedule.find(
        (s) =>
          s.teacherId === applicantTeacherId &&
          s.dayOfWeek === dayOfWeek &&
          s.period === period &&
          s.id !== originalSession.id
      );
      if (teacherClash) {
        messages.push(`【教師衝堂】申請教師在 週${dayOfWeek} 第${period}節 已排有「${teacherClash.className} ${teacherClash.subjectName}」`);
        severity = 'danger';
      }

      // 2. Check if the original class already has another course at target time
      const classClash = schedule.find(
        (s) =>
          s.className === originalSession.className &&
          s.dayOfWeek === dayOfWeek &&
          s.period === period &&
          s.id !== originalSession.id
      );
      if (classClash) {
        messages.push(
          `【班級衝堂】班級 ${originalSession.className} 在 週${dayOfWeek} 第${period}節 已排有「${classClash.subjectName}（${classClash.teacherName}）」。同班對調請改用「同班對調」。`
        );
        severity = 'danger';
      }

      // 3. Check if target venue/workshop is occupied
      const venueClash = schedule.find(
        (s) =>
          s.venueId === venueId &&
          s.dayOfWeek === dayOfWeek &&
          s.period === period &&
          s.id !== originalSession.id
      );
      if (venueClash) {
        const venueObj = venues.find((v) => v.id === venueId);
        messages.push(
          `【工場教室衝堂】${venueObj?.name || '指定教室/工場'} 在 週${dayOfWeek} 第${period}節 已被「${venueClash.className} ${venueClash.subjectName}」借用。同班對調請改用「同班對調」。`
        );
        severity = 'danger';
      }

      // 申請人若該時段已有代課任務（請假派代佔用），亦不可移入
      if (
        teacherHasSubstituteOccupancy(
          applicantTeacherId,
          dayOfWeek,
          period,
          collectSubstituteOccupancies(requestPool, {
            excludeRequestIds: params.excludeRequestIds,
          }),
          { leaveDateStart, leaveDateEnd }
        )
      ) {
        messages.push(
          `【代課佔用】申請教師在 週${dayOfWeek} 第${period}節 已有已派代／待簽核代課任務，不可再移課進入`
        );
        severity = 'danger';
      }

      if (messages.length === 0) {
        messages.push(`檢核通過：目標時段（週${dayOfWeek} 第${period}節）教師空堂、班級空堂、教室工場無佔用，可順利移課。`);
      }
      }
    } else if (requestType === 'swap') {
      if (!swapTargetTeacherId || !swapTargetSession) {
        return {
          hasClash: true,
          severity: 'warning',
          messages: ['請選擇同班對調之對象教師與互換課堂'],
        };
      }

      // 同班對調：同一班級、不同老師對調時段；雙方教師皆不可因此衝堂
      if (originalSession.teacherId && originalSession.teacherId !== applicantTeacherId) {
        return {
          hasClash: true,
          severity: 'danger',
          messages: ['申請課堂任課教師與申請人不符，請重新選擇課堂'],
        };
      }

      if (swapTargetSession.teacherId !== swapTargetTeacherId) {
        return {
          hasClash: true,
          severity: 'danger',
          messages: [
            `對調課堂任課為「${swapTargetSession.teacherName}」，與所選對調教師不符，請重新選擇`,
          ],
        };
      }

      if (originalSession.className !== swapTargetSession.className) {
        return {
          hasClash: true,
          severity: 'danger',
          messages: [
            `【須同班對調】同班對調僅限同一班級。申請課堂為「${originalSession.className}」，對調課堂為「${swapTargetSession.className}」，請改選同班課程。`,
          ],
        };
      }

      if (swapTargetTeacherId === applicantTeacherId) {
        return {
          hasClash: true,
          severity: 'danger',
          messages: ['同班對調須與其他教師對調，不可選擇本人'],
        };
      }

      if (
        originalSession.dayOfWeek === swapTargetSession.dayOfWeek &&
        originalSession.period === swapTargetSession.period
      ) {
        return {
          hasClash: true,
          severity: 'danger',
          messages: ['對調雙方已是同一時段，無需互調'],
        };
      }

      const partner = teachers.find((t) => t.id === swapTargetTeacherId);

      // 申請人改上對方時段：申請人在該時段不可已有其他課
      const applicantClashInPartnerSlot = schedule.find(
        (s) =>
          s.teacherId === applicantTeacherId &&
          s.dayOfWeek === swapTargetSession.dayOfWeek &&
          s.period === swapTargetSession.period &&
          s.id !== originalSession.id
      );
      if (applicantClashInPartnerSlot) {
        messages.push(
          `【教師衝堂】${applicant?.name} 在互調後時段（週${swapTargetSession.dayOfWeek} 第${swapTargetSession.period}節）已有「${applicantClashInPartnerSlot.className} ${applicantClashInPartnerSlot.subjectName}」，不可再調入`
        );
        severity = 'danger';
      }

      // 對調教師改上申請人時段：對調教師在該時段不可已有其他課
      const partnerClashInApplicantSlot = schedule.find(
        (s) =>
          s.teacherId === swapTargetTeacherId &&
          s.dayOfWeek === originalSession.dayOfWeek &&
          s.period === originalSession.period &&
          s.id !== swapTargetSession.id
      );
      if (partnerClashInApplicantSlot) {
        messages.push(
          `【教師衝堂】${partner?.name} 在互調後時段（週${originalSession.dayOfWeek} 第${originalSession.period}節）已有「${partnerClashInApplicantSlot.className} ${partnerClashInApplicantSlot.subjectName}」，不可再調入`
        );
        severity = 'danger';
      }

      const occPool = collectSubstituteOccupancies(requestPool, {
        excludeRequestIds: params.excludeRequestIds,
      });
      if (
        teacherHasSubstituteOccupancy(
          applicantTeacherId,
          swapTargetSession.dayOfWeek,
          swapTargetSession.period,
          occPool,
          { leaveDateStart, leaveDateEnd }
        )
      ) {
        messages.push(
          `【代課佔用】${applicant?.name} 在互調後時段（週${swapTargetSession.dayOfWeek} 第${swapTargetSession.period}節）已有代課任務，不可再調入`
        );
        severity = 'danger';
      }
      if (
        teacherHasSubstituteOccupancy(
          swapTargetTeacherId,
          originalSession.dayOfWeek,
          originalSession.period,
          occPool,
          { leaveDateStart, leaveDateEnd }
        )
      ) {
        messages.push(
          `【代課佔用】${partner?.name} 在互調後時段（週${originalSession.dayOfWeek} 第${originalSession.period}節）已有代課任務，不可再調入`
        );
        severity = 'danger';
      }

      // 同班在對方時段不可另有第三堂課（對調雙方那兩堂除外）
      const applicantClassInPartnerSlot = schedule.find(
        (s) =>
          s.className === originalSession.className &&
          s.dayOfWeek === swapTargetSession.dayOfWeek &&
          s.period === swapTargetSession.period &&
          s.id !== originalSession.id &&
          s.id !== swapTargetSession.id
      );
      if (applicantClassInPartnerSlot) {
        messages.push(
          `【班級衝堂】班級 ${originalSession.className} 在 週${swapTargetSession.dayOfWeek} 第${swapTargetSession.period}節 已有其他課程「${applicantClassInPartnerSlot.subjectName}」`
        );
        severity = 'danger';
      }

      const partnerClassInApplicantSlot = schedule.find(
        (s) =>
          s.className === swapTargetSession.className &&
          s.dayOfWeek === originalSession.dayOfWeek &&
          s.period === originalSession.period &&
          s.id !== originalSession.id &&
          s.id !== swapTargetSession.id
      );
      if (partnerClassInApplicantSlot) {
        messages.push(
          `【班級衝堂】班級 ${swapTargetSession.className} 在 週${originalSession.dayOfWeek} 第${originalSession.period}節 已有其他課程「${partnerClassInApplicantSlot.subjectName}」`
        );
        severity = 'danger';
      }

      // 互調後各堂帶原工場／教室至對方時段
      if (originalSession.venueId) {
        const venueClashAtPartner = schedule.find(
          (s) =>
            s.venueId === originalSession.venueId &&
            s.dayOfWeek === swapTargetSession.dayOfWeek &&
            s.period === swapTargetSession.period &&
            s.id !== originalSession.id &&
            s.id !== swapTargetSession.id
        );
        if (venueClashAtPartner) {
          messages.push(
            `【工場教室衝堂】${originalSession.venueName || '申請人教室/工場'} 在 週${swapTargetSession.dayOfWeek} 第${swapTargetSession.period}節 已被「${venueClashAtPartner.className} ${venueClashAtPartner.subjectName}」借用`
          );
          severity = 'danger';
        }
      }
      if (swapTargetSession.venueId) {
        const venueClashAtApplicant = schedule.find(
          (s) =>
            s.venueId === swapTargetSession.venueId &&
            s.dayOfWeek === originalSession.dayOfWeek &&
            s.period === originalSession.period &&
            s.id !== originalSession.id &&
            s.id !== swapTargetSession.id
        );
        if (venueClashAtApplicant) {
          messages.push(
            `【工場教室衝堂】${swapTargetSession.venueName || '對調教室/工場'} 在 週${originalSession.dayOfWeek} 第${originalSession.period}節 已被「${venueClashAtApplicant.className} ${venueClashAtApplicant.subjectName}」借用`
          );
          severity = 'danger';
        }
      }

      if (messages.length === 0) {
        messages.push(
          `檢核通過：同班「${originalSession.className}」對調時段可行（教師／班級／工場無衝突）。暫時＝不改週模板；永久＝核准後改週課表。`
        );
      }
    } else if (requestType === 'substitute') {
      if (!substituteTeacherId) {
        return {
          hasClash: false,
          severity: 'warning',
          messages: ['尚未指定代課教師（送出後將由教學組協助媒合無課專業師資）'],
        };
      }

      const subTeacher = teachers.find((t) => t.id === substituteTeacherId);
      if (substituteTeacherId === applicantTeacherId) {
        messages.push(`代課教師不能為申請人本人`);
        severity = 'danger';
      }

      // Check if substitute teacher already has a class in that slot
      const subClash = schedule.find(
        (s) =>
          s.teacherId === substituteTeacherId &&
          s.dayOfWeek === originalSession.dayOfWeek &&
          s.period === originalSession.period &&
          s.id !== originalSession.id
      );
      if (subClash) {
        messages.push(`【代課教師衝堂】${subTeacher?.name} 在 週${originalSession.dayOfWeek} 第${originalSession.period}節 已有正課「${subClash.className} ${subClash.subjectName}」`);
        severity = 'danger';
      } else if (
        teacherHasSubstituteOccupancy(
          substituteTeacherId,
          originalSession.dayOfWeek,
          originalSession.period,
          collectSubstituteOccupancies(requestPool, {
            excludeRequestIds: params.excludeRequestIds,
          }),
          { leaveDateStart, leaveDateEnd }
        )
      ) {
        messages.push(
          `【代課教師衝堂】${subTeacher?.name} 在 週${originalSession.dayOfWeek} 第${originalSession.period}節 已有其他已派代／待簽核代課（請假區間重疊）`
        );
        severity = 'danger';
      }

      // Overload check (9 periods limit：兼課 + 已派代／待簽核代課)
      if (subTeacher) {
        const weeklyOverload = teacherWeeklyLoadTowardLimit(
          subTeacher,
          schedule,
          requestPool,
          { excludeRequestIds: params.excludeRequestIds }
        );
        if (weeklyOverload >= systemConfig.maxWeeklyOverloadPeriods) {
          messages.push(`【法規防呆警示】${subTeacher.name} 本週兼課與代課合計已達 ${weeklyOverload} 節（法定上限為 ${systemConfig.maxWeeklyOverloadPeriods} 節），若再承擔代課將超過法規上限！`);
          if (severity !== 'danger') severity = 'warning';
        }
      }

      if (messages.length === 0) {
        messages.push(`檢核通過：代課教師 ${subTeacher?.name} 該時段為空堂，符合資格。`);
      }
    }

    return {
      hasClash: severity === 'danger',
      severity,
      messages,
    };
  };

  const addSubstituteRequests = (
    items: Array<
      Omit<SubstituteRequest, 'id' | 'requestNumber' | 'createdAt' | 'status' | 'clashStatus'>
    >,
    requestMonth?: number,
    batchOptions?: { idNoncePrefix?: string }
  ): SubstituteRequest[] => {
    if (items.length === 0) return [];

    const month = requestMonth ?? new Date().getMonth() + 1;
    const baseSeq = nextRequestSequence(requests, systemConfig.academicYear, month);
    const stampPrefix = batchOptions?.idNoncePrefix ?? String(Date.now());
    const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 16);

    let progressiveRequests = requests.slice();
    const prepared: SubstituteRequest[] = [];

    items.forEach((data, index) => {
      const swapErr = validateSwapRequestFields(data);
      if (swapErr) throw new Error(swapErr);

      const clashStatus = checkClashes({
        requestType: data.requestType,
        applicantTeacherId: data.applicantTeacherId,
        originalSession: data.originalSession,
        targetReschedule: data.targetReschedule,
        swapTargetTeacherId: data.swapTargetTeacherId,
        swapTargetSession: data.swapTargetSession,
        substituteTeacherId: data.substituteTeacherId,
        requestsOverride: progressiveRequests,
        leaveDateStart: data.leaveDateStart || data.effectiveDate,
        leaveDateEnd: data.leaveDateEnd || data.effectiveDate,
      });
      if (clashStatus.hasClash) {
        throw new Error(
          clashStatus.messages[0] ||
            `第${data.originalSession.period}節存在衝堂，無法送出`
        );
      }

      const seq = baseSeq + index;
      const newRequest: SubstituteRequest = {
        ...data,
        id: `req-${stampPrefix}-${index}`,
        requestNumber: formatRequestNumber(systemConfig.academicYear, month, seq),
        createdAt: nowStr,
        status: 'pending',
        clashStatus,
      };
      prepared.push(newRequest);
      progressiveRequests = [newRequest, ...progressiveRequests];
    });

    setRequests((prev) => [...prepared].reverse().concat(prev));
    return prepared;
  };

  const addSubstituteRequest = (
    data: Omit<SubstituteRequest, 'id' | 'requestNumber' | 'createdAt' | 'status' | 'clashStatus'>,
    requestMonth?: number,
    batchOptions?: { sequenceOffset?: number; idNonce?: string | number }
  ): SubstituteRequest => {
    const [created] = addSubstituteRequests([data], requestMonth, {
      idNoncePrefix: String(batchOptions?.idNonce ?? `${Date.now()}-${batchOptions?.sequenceOffset ?? 0}`),
    });
    return created;
  };

  /** 單筆核准核心；成功回傳更新後課表／申請，失敗回傳 reason */
  const approveSingleRequest = (
    requestId: string,
    reviewerName: string,
    workingSessions: CourseSession[],
    workingRequests: SubstituteRequest[]
  ):
    | { ok: true; sessions: CourseSession[]; request: SubstituteRequest }
    | { ok: false; reason: string } => {
    const targetReq = workingRequests.find((r) => r.id === requestId);
    if (!targetReq) return { ok: false, reason: '找不到申請單' };
    if (targetReq.status === 'approved') return { ok: false, reason: '已核准' };

    if (targetReq.requestType === 'substitute' && !targetReq.substituteTeacherId) {
      return { ok: false, reason: '尚未指定代課教師' };
    }
    if (targetReq.requestType === 'reschedule' && !targetReq.targetReschedule) {
      return { ok: false, reason: '移課申請缺少目標時段／場地' };
    }
    if (targetReq.requestType === 'swap') {
      const swapErr = validateSwapRequestFields(targetReq);
      if (swapErr) return { ok: false, reason: swapErr };
    }

    const resolvedOrig = resolveOriginalSession(targetReq, workingSessions);
    const resolvedSwap =
      targetReq.requestType === 'swap'
        ? resolveSwapTargetSession(targetReq, workingSessions)
        : targetReq.swapTargetSession;
    if (targetReq.requestType === 'substitute' && isPlaceholderSession(resolvedOrig)) {
      return { ok: false, reason: '找不到對應課表課堂（佔位資料）' };
    }
    if (targetReq.requestType === 'swap') {
      if (!resolvedSwap || !workingSessions.some((s) => s.id === resolvedSwap.id)) {
        return { ok: false, reason: '找不到對調課堂於現行課表' };
      }
    }

    if (targetReq.requestType === 'substitute') {
      const holidaySet = nonTeachingDateSet(systemConfig.nonTeachingDays);
      const { billable, missingLeaveDate } = countBillableDaysForSubstituteApprove(
        targetReq,
        holidaySet,
        (month) =>
          calendarYearForSettlementMonth(month, new Date(), systemConfig.academicYear),
        {
          temporaryMoves: systemConfig.temporaryScheduleMoves || [],
          partialStops: systemConfig.partialNonTeachingDays || [],
        }
      );
      if (billable <= 0) {
        return {
          ok: false,
          reason: missingLeaveDate
            ? '無請假日期，且依單號月份推估該月該星期皆為放假日'
            : '請假區間內無實際上課日（可能皆為放假日）',
        };
      }
    }

    const clashStatus = checkClashes({
      requestType: targetReq.requestType,
      applicantTeacherId: targetReq.applicantTeacherId,
      originalSession: resolvedOrig,
      targetReschedule: targetReq.targetReschedule,
      swapTargetTeacherId: targetReq.swapTargetTeacherId,
      swapTargetSession: resolvedSwap,
      substituteTeacherId: targetReq.substituteTeacherId,
      sessionsOverride: workingSessions,
      requestsOverride: workingRequests,
      excludeRequestIds: [requestId],
      leaveDateStart: targetReq.leaveDateStart || targetReq.effectiveDate,
      leaveDateEnd: targetReq.leaveDateEnd || targetReq.effectiveDate,
    });
    if (clashStatus.hasClash) {
      return { ok: false, reason: clashStatus.messages[0] || '存在衝堂衝突' };
    }

    const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 16);
    // 保留申請快照之時段；resolve 僅用於衝堂／找現行 id，不可寫回單據蓋掉原時段
    const approvedReq: SubstituteRequest = {
      ...targetReq,
      originalSession: isPlaceholderSession(targetReq.originalSession)
        ? resolvedOrig
        : {
            ...targetReq.originalSession,
            id: resolvedOrig.id,
          },
      swapTargetSession:
        targetReq.requestType === 'swap' && targetReq.swapTargetSession
          ? {
              ...targetReq.swapTargetSession,
              id: (resolvedSwap || targetReq.swapTargetSession).id,
            }
          : targetReq.swapTargetSession,
      status: 'approved',
      reviewedAt: nowStr,
      reviewedBy: reviewerName,
      clashStatus,
    };

    const applyResult = applyRequestToSessionsDetailed(workingSessions, approvedReq);
    if (!applyResult.applied) {
      return { ok: false, reason: applyResult.reason || '無法套用課表異動' };
    }

    return { ok: true, sessions: applyResult.sessions, request: approvedReq };
  };

  /** 連續節次整批：全過才寫入，任一失敗則整批不核准 */
  const batchApproveRequestsAllOrNothing = (
    requestIds: string[],
    reviewerName: string,
    options?: { alertOnFail?: boolean }
  ): number => {
    let workingSessions = sessions;
    let workingRequests = requests.slice();
    let count = 0;

    for (const id of requestIds) {
      const result = approveSingleRequest(id, reviewerName, workingSessions, workingRequests);
      if (result.ok === false) {
        if (options?.alertOnFail !== false) {
          const failed = workingRequests.find((r) => r.id === id);
          window.alert(
            `連續節次須整批核准：${failed?.requestNumber || id}（${result.reason}），整批未核准。`
          );
        }
        return 0;
      }
      workingSessions = result.sessions;
      workingRequests = workingRequests.map((r) => (r.id === id ? result.request : r));
      count += 1;
    }

    if (count === 0) return 0;
    setSessions(workingSessions);
    setRequests(workingRequests);
    return count;
  };

  const approveRequest = (requestId: string, reviewerName: string = '陳雅筑 組長 (教學組)'): boolean => {
    const targetReq = requests.find((r) => r.id === requestId);
    if (!targetReq) return false;
    if (targetReq.status === 'approved') return false;

    // 連續節次：核准與刪除／取消同為整批，避免半核准再取消踩雷
    if (targetReq.batchGroupId) {
      const pendingIds = requests
        .filter((r) => r.batchGroupId === targetReq.batchGroupId && r.status === 'pending')
        .map((r) => r.id);
      if (pendingIds.length === 0) return false;
      if (pendingIds.length > 1) {
        return batchApproveRequestsAllOrNothing(pendingIds, reviewerName) > 0;
      }
    }

    const result = approveSingleRequest(requestId, reviewerName, sessions, requests);
    if (result.ok === false) {
      window.alert(`無法核准：${result.reason}`);
      return false;
    }
    setSessions(result.sessions);
    setRequests((prev) => prev.map((r) => (r.id === requestId ? result.request : r)));
    return true;
  };

  const batchApproveRequests = (requestIds: string[], reviewerName: string = '陳雅筑 組長 (教學組)'): number => {
    // 展開連續節次同批 pending，並以 batchGroup 為單位全有或全無
    const expanded = new Set<string>();
    for (const id of requestIds) {
      const t = requests.find((r) => r.id === id);
      if (!t || t.status === 'approved') continue;
      if (t.batchGroupId) {
        requests
          .filter((r) => r.batchGroupId === t.batchGroupId && r.status === 'pending')
          .forEach((r) => expanded.add(r.id));
      } else {
        expanded.add(id);
      }
    }

    const byGroup = new Map<string, string[]>();
    for (const id of expanded) {
      const t = requests.find((r) => r.id === id);
      if (!t) continue;
      const key = t.batchGroupId || id;
      const list = byGroup.get(key) || [];
      list.push(id);
      byGroup.set(key, list);
    }

    let workingSessions = sessions;
    let workingRequests = requests.slice();
    let count = 0;
    const skipped: string[] = [];

    for (const [, ids] of byGroup) {
      let groupSessions = workingSessions;
      let groupRequests = workingRequests;
      const approvedInGroup: SubstituteRequest[] = [];
      let groupFailed: string | null = null;

      for (const id of ids) {
        const result = approveSingleRequest(id, reviewerName, groupSessions, groupRequests);
        if (result.ok === false) {
          const failed = groupRequests.find((r) => r.id === id);
          groupFailed = `${failed?.requestNumber || id}：${result.reason}`;
          break;
        }
        groupSessions = result.sessions;
        groupRequests = groupRequests.map((r) => (r.id === id ? result.request : r));
        approvedInGroup.push(result.request);
      }

      if (groupFailed) {
        skipped.push(groupFailed + (ids.length > 1 ? '（同批連續節次整批略過）' : ''));
        continue;
      }
      workingSessions = groupSessions;
      workingRequests = groupRequests;
      count += approvedInGroup.length;
    }

    if (count > 0) {
      setSessions(workingSessions);
      setRequests(workingRequests);
    }
    if (skipped.length > 0) {
      window.alert(
        `已核准 ${count} 筆；略過 ${skipped.length} 筆：\n${skipped.slice(0, 8).join('\n')}${
          skipped.length > 8 ? '\n…' : ''
        }`
      );
    }
    return count;
  };

  const createStaffDirectDispatches = (
    items: Array<
      Omit<SubstituteRequest, 'id' | 'requestNumber' | 'createdAt' | 'status' | 'clashStatus'> & {
        autoApprove?: boolean;
      }
    >,
    requestMonth?: number,
    batchOptions?: { idNoncePrefix?: string }
  ): SubstituteRequest[] => {
    if (items.length === 0) return [];

    const month = requestMonth ?? systemConfig.currentMonth;
    const baseSeq = nextRequestSequence(requests, systemConfig.academicYear, month);
    const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 16);
    const stampPrefix = batchOptions?.idNoncePrefix ?? String(Date.now());
    const staffName = (() => {
      const staff =
        (currentAcademicStaff && (currentAcademicStaff.group || 'academic') === 'academic'
          ? currentAcademicStaff
          : undefined) ||
        academicStaffList.find((s) => (s.group || 'academic') === 'academic');
      if (!staff) return '教學組經辦';
      const t = staff.title;
      const m = t.match(/^(.+?組).*?\((.+?)\)$/);
      const stamp = m ? `${m[1]}${m[2]}` : t;
      return `${staff.name}(${stamp})`;
    })();

    // 全數預檢（累進課表／申請佔用）：任一步失敗則不寫入任何單據／課表
    let progressiveSessions = sessions;
    let progressiveRequests = requests.slice();
    const prepared: SubstituteRequest[] = [];

    items.forEach((data, index) => {
      if (data.requestType === 'reschedule' && !data.targetReschedule) {
        throw new Error('移課須指定目標時段／場地');
      }
      const swapErr = validateSwapRequestFields(data);
      if (swapErr) throw new Error(swapErr);
      if (
        data.requestType === 'substitute' &&
        data.autoApprove !== false &&
        !data.substituteTeacherId
      ) {
        throw new Error('逕行核定請假派代須指定代課教師');
      }

      const resolvedOrig = resolveOriginalSession(
        {
          applicantTeacherId: data.applicantTeacherId,
          substituteTeacherId: data.substituteTeacherId,
          applicantTeacherName: data.applicantTeacherName,
          originalSession: data.originalSession,
        } as SubstituteRequest,
        progressiveSessions
      );
      if (
        data.requestType === 'substitute' &&
        data.autoApprove !== false &&
        isPlaceholderSession(resolvedOrig)
      ) {
        throw new Error('找不到對應課表課堂，無法逕行核定（請確認該時段已有課堂）');
      }

      if (
        data.requestType === 'substitute' &&
        data.autoApprove !== false
      ) {
        const holidaySet = nonTeachingDateSet(systemConfig.nonTeachingDays);
        const probe = {
          leaveDateStart: data.leaveDateStart,
          leaveDateEnd: data.leaveDateEnd,
          originalSession: data.originalSession,
          requestNumber: formatRequestNumber(systemConfig.academicYear, month, baseSeq + index),
          createdAt: nowStr,
        };
        const { billable, missingLeaveDate } = countBillableDaysForSubstituteApprove(
          probe,
          holidaySet,
          (m) => calendarYearForSettlementMonth(m, new Date(), systemConfig.academicYear),
          {
            temporaryMoves: systemConfig.temporaryScheduleMoves || [],
            partialStops: systemConfig.partialNonTeachingDays || [],
          }
        );
        if (billable <= 0) {
          throw new Error(
            missingLeaveDate
              ? `第${data.originalSession.period}節：無請假日期且該月該星期皆為放假日，無法逕行核定`
              : `第${data.originalSession.period}節：請假區間皆為放假日，無法逕行核定`
          );
        }
      }

      const clashStatus = checkClashes({
        requestType: data.requestType,
        applicantTeacherId: data.applicantTeacherId,
        originalSession: resolvedOrig,
        targetReschedule: data.targetReschedule,
        swapTargetTeacherId: data.swapTargetTeacherId,
        swapTargetSession: data.swapTargetSession,
        substituteTeacherId: data.substituteTeacherId,
        sessionsOverride: progressiveSessions,
        requestsOverride: progressiveRequests,
        leaveDateStart: data.leaveDateStart || data.effectiveDate,
        leaveDateEnd: data.leaveDateEnd || data.effectiveDate,
      });

      if (data.autoApprove !== false && clashStatus.hasClash) {
        throw new Error(clashStatus.messages[0] || '存在衝堂衝突，無法逕行核定');
      }

      const isAutoApproved = data.autoApprove !== false;
      const seq = baseSeq + index;
      const requestNumber = formatRequestNumber(systemConfig.academicYear, month, seq);

      const newRequest = {
        ...data,
        // 保留申請／逕行派代當下之時段快照（佔位才用 resolve 實課堂）
        originalSession: isPlaceholderSession(data.originalSession)
          ? resolvedOrig
          : { ...data.originalSession, id: resolvedOrig.id },
        id: `req-${stampPrefix}-${index}`,
        requestNumber,
        createdAt: nowStr,
        status: isAutoApproved ? 'approved' : 'pending',
        reviewedAt: isAutoApproved ? nowStr : undefined,
        reviewedBy: isAutoApproved ? `${staffName} [教務處逕行派代]` : undefined,
        clashStatus,
      } as SubstituteRequest;

      if (isAutoApproved) {
        const applyResult = applyRequestToSessionsDetailed(progressiveSessions, newRequest);
        if (!applyResult.applied) {
          throw new Error(
            applyResult.reason ||
              `第${data.originalSession.period}節：無法套用課表，逕行核定已取消`
          );
        }
        progressiveSessions = applyResult.sessions;
      }

      prepared.push(newRequest);
      progressiveRequests = [newRequest, ...progressiveRequests];
    });

    const approvedOnes = prepared.filter((r) => r.status === 'approved');
    if (approvedOnes.length > 0) {
      setSessions(progressiveSessions);
    }

    setRequests((prev) => [...prepared].reverse().concat(prev));
    return prepared;
  };

  const createStaffDirectDispatch = (
    data: Omit<SubstituteRequest, 'id' | 'requestNumber' | 'createdAt' | 'status' | 'clashStatus'> & {
      autoApprove?: boolean;
    },
    requestMonth?: number,
    batchOptions?: { sequenceOffset?: number; idNonce?: string | number }
  ): SubstituteRequest => {
    const [created] = createStaffDirectDispatches([data], requestMonth, {
      idNoncePrefix: String(batchOptions?.idNonce ?? `${Date.now()}-${batchOptions?.sequenceOffset ?? 0}`),
    });
    return created;
  };
  const collectRelatedRequests = (requestId: string): SubstituteRequest[] => {
    const target = requests.find((r) => r.id === requestId);
    if (!target) return [];
    if (!target.batchGroupId) return [target];
    return requests
      .filter((r) => r.batchGroupId === target.batchGroupId)
      .slice()
      .sort((a, b) => {
        // 連續節次：節次高的先回滾（較新登錄常在後面，但以節次由大到小較穩）
        const pa = a.originalSession?.period ?? 0;
        const pb = b.originalSession?.period ?? 0;
        if (pb !== pa) return pb - pa;
        const ta = a.reviewedAt || a.createdAt || '';
        const tb = b.reviewedAt || b.createdAt || '';
        return tb.localeCompare(ta);
      });
  };

  const rollbackApprovedGroup = (
    group: SubstituteRequest[]
  ): { ok: true; sessions: CourseSession[] } | { ok: false; reason: string } => {
    const approved = group.filter((r) => r.status === 'approved');
    // 回滾時需看全庫仍核准單，但已回滾的 id 須排除，避免幽靈 [請假派代] 標註
    let next = sessions;
    const completedRollbackIds = new Set<string>();
    for (const r of approved) {
      const poolForSibling = requests.filter((x) => !completedRollbackIds.has(x.id));
      const result = rollbackRequestFromSessionsDetailed(next, r, poolForSibling);
      if (!result.rolledBack && result.blockedReason) {
        return {
          ok: false,
          reason: `${r.requestNumber || r.id}：${result.blockedReason}`,
        };
      }
      if (result.rolledBack) completedRollbackIds.add(r.id);
      next = result.sessions;
    }
    return { ok: true, sessions: next };
  };

  const rejectRequest = (requestId: string, reason: string, reviewerName: string = '陳雅筑 組長 (教學組)') => {
    const group = collectRelatedRequests(requestId);
    if (group.length === 0) return;
    const rolled = rollbackApprovedGroup(group);
    if (rolled.ok === false) {
      window.alert(`無法駁回：${rolled.reason}\n請先處理後續課表異動，再駁回此單。`);
      return;
    }
    setSessions(rolled.sessions);
    const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 16);
    const ids = new Set(group.map((r) => r.id));
    setRequests((prev) =>
      prev.map((r) =>
        ids.has(r.id)
          ? {
              ...r,
              status: 'rejected',
              rejectReason: reason,
              reviewedAt: nowStr,
              reviewedBy: reviewerName,
            }
          : r
      )
    );
  };

  const cancelRequest = (requestId: string) => {
    const group = collectRelatedRequests(requestId);
    if (group.length === 0) return;
    const rolled = rollbackApprovedGroup(group);
    if (rolled.ok === false) {
      window.alert(`無法取消：${rolled.reason}\n請先處理後續課表異動，再取消此單。`);
      return;
    }
    setSessions(rolled.sessions);
    const ids = new Set(group.map((r) => r.id));
    setRequests((prev) =>
      prev.map((r) => (ids.has(r.id) ? { ...r, status: 'cancelled' } : r))
    );
  };

  const deleteRequest = (requestId: string) => {
    const group = collectRelatedRequests(requestId);
    if (group.length === 0) return;
    const rolled = rollbackApprovedGroup(group);
    if (rolled.ok === false) {
      window.alert(`無法刪除：${rolled.reason}\n請先處理後續課表異動，再刪除此單。`);
      return;
    }
    setSessions(rolled.sessions);
    const ids = new Set(group.map((r) => r.id));
    setRequests((prev) => prev.filter((r) => !ids.has(r.id)));
  };

  const clearAllRequests = () => {
    const { sessions: nextSessions, blocked } = rollbackApprovedRequestsNewestFirstDetailed(
      sessions,
      requests
    );
    if (blocked.length > 0) {
      window.alert(
        `無法一鍵清空：有 ${blocked.length} 筆已核准申請課表無法回滾（之後又有異動）。\n` +
          blocked
            .slice(0, 5)
            .map((b) => `${b.request.requestNumber}：${b.reason}`)
            .join('\n') +
          (blocked.length > 5 ? '\n…' : '') +
          '\n\n請先個別處理後再清空，以免單據與課表不一致。'
      );
      return;
    }
    setSessions(nextSessions);
    setRequests([]);
    localStorage.removeItem(STORAGE_KEYS.REQUESTS);
  };

  const updateSystemConfig = (newConfig: Partial<SystemConfig>) => {
    const nextBase = normalizeStandardBasePeriods({
      ...systemConfig.standardBasePeriods,
      ...(newConfig.standardBasePeriods || {}),
    });

    const apply = (authConfig?: SystemConfig['authConfig']) => {
      setSystemConfig((prev) => ({
        ...prev,
        ...newConfig,
        standardBasePeriods: nextBase,
        ...(authConfig ? { authConfig: withMigratedAuthConfig(authConfig) } : {}),
      }));
      setTeachers((prev) =>
        prev.map((t) => {
          const resolved = resolveTeacherBasePeriods(
            t,
            nextBase.fulltime,
            nextBase.homeroom,
            nextBase.head,
            nextBase.sectionChief,
            nextBase.director
          );
          return {
            ...t,
            dutyReductionPeriods: resolved.dutyReductionPeriods,
            basePeriods: resolved.basePeriods,
            title: resolved.title,
          };
        })
      );
    };

    if (newConfig.authConfig) {
      void resolveAuthConfigForSave(newConfig.authConfig, systemConfigRef.current.authConfig).then(
        (resolved) => apply(resolved as SystemConfig['authConfig'])
      );
      return;
    }
    apply();
  };

  const importSchedule = (params: {
    validRows: ParsedImportRow[];
    mode: 'overwrite' | 'append';
    newTeacherNames: string[];
    newVenueNames: string[];
    clearRequests?: boolean;
  }) => {
    const { validRows, mode, clearRequests = true } = params;

    // Collect all unique real teacher names（協同教師拆成個別姓名）
    const importedTeacherNames = Array.from(
      new Set(
        validRows.flatMap((r) => {
          const parts = splitTeacherNames(r.teacherName);
          if (parts.length) return parts;
          const n = r.teacherName.trim();
          return n && n !== '未指派教師' ? [n] : [];
        })
      )
    );

    const importedVenueNames = Array.from(
      new Set(
        validRows
          .map((r) => r.venueName.trim())
          .filter((n) => Boolean(n))
      )
    );

    let updatedTeachers: Teacher[] = [];
    let newTeachersCount = 0;
    const teacherMap = new Map<string, Teacher>();

    if (mode === 'overwrite') {
      // OVERWRITE MODE: Completely purge old mock demo teachers (e.g. 鄭志華) and only keep real in-school teachers from file
      importedTeacherNames.forEach((name, idx) => {
        // If an existing teacher has the same name, keep their customized info (e.g. title, basePeriods)
        const existing = teachers.find((t) => t.name.trim() === name);
        const dept = inferTeacherDepartmentFromPracticalRows(name, validRows);

        const teacherObj: Teacher = existing
          ? {
              ...existing,
              department: dept,
              weeklyActualPeriods: 0,
              email: ensureSchoolEmail(name, existing.email),
            }
          : {
              id: `t-imp-${Date.now()}-${idx}`,
              name,
              title: '專任教師',
              department: dept,
              dutyReductionPeriods: 0,
              basePeriods: systemConfig.standardBasePeriods.fulltime,
              weeklyActualPeriods: 0,
              email: ensureSchoolEmail(name),
              phone: '分機 301',
              certifications: ['高職專業群科合格教師證'],
              avatarBg: ['from-amber-600 to-amber-800', 'from-indigo-600 to-indigo-800', 'from-emerald-600 to-emerald-800', 'from-purple-600 to-purple-800', 'from-cyan-600 to-cyan-800'][idx % 5],
            };

        updatedTeachers.push(teacherObj);
        teacherMap.set(name, teacherObj);
        if (!existing) newTeachersCount++;
      });

      // Automatically switch logged-in teacher to the first real imported teacher
      if (updatedTeachers.length > 0) {
        setCurrentTeacherId(updatedTeachers[0].id);
      }
    } else {
      // APPEND MODE: Keep existing teachers and add new ones
      updatedTeachers = [...teachers];
      teachers.forEach((t) => teacherMap.set(t.name.trim(), t));

      importedTeacherNames.forEach((name, idx) => {
        if (!teacherMap.has(name)) {
          const dept = inferTeacherDepartmentFromPracticalRows(name, validRows);
          const newTeacher: Teacher = {
            id: `t-imp-${Date.now()}-${idx}`,
            name,
            title: '專任教師',
            department: dept,
            dutyReductionPeriods: 0,
            basePeriods: systemConfig.standardBasePeriods.fulltime,
            weeklyActualPeriods: 0,
            email: ensureSchoolEmail(name),
            phone: '分機 301',
            certifications: ['高職專業群科合格教師證'],
            avatarBg: 'from-emerald-600 to-emerald-800',
          };
          updatedTeachers.push(newTeacher);
          teacherMap.set(name, newTeacher);
          newTeachersCount++;
        }
      });
    }

    // 2. Process venues — 保留既有工場／教室清冊，僅追加課表中新出現的名稱（覆蓋／追加模式相同）
    let updatedVenues: WorkshopVenue[] = [...venues];
    let newVenuesCount = 0;
    const venueMap = new Map<string, WorkshopVenue>();
    venues.forEach((v) => venueMap.set(v.name.trim(), v));

    const getVenueDept = (vName: string): DepartmentType | '通用教室' => {
      if (!vName.trim() || vName.includes('通用')) return '通用教室';
      return departmentFromLabel(vName) || '共同科目';
    };

    importedVenueNames.forEach((name, idx) => {
      if (!venueMap.has(name)) {
        const newVenue: WorkshopVenue = {
          id: `v-imp-${Date.now()}-${idx}`,
          name,
          code: `${autoVenueCodePrefix(name)}-${100 + idx}`,
          department: getVenueDept(name),
          capacity: 40,
          safetyLevel: '標準',
          equipmentNote: autoVenueEquipmentNote(name),
        };
        updatedVenues.push(newVenue);
        venueMap.set(name, newVenue);
        newVenuesCount++;
      }
    });

    // 3. Convert parsed rows into CourseSession objects（協同教師各建一筆）
    const newSessionsList: CourseSession[] = [];
    let sessionIdx = 0;
    validRows.forEach((row) => {
      const teacherParts = splitTeacherNames(row.teacherName);
      const names =
        teacherParts.length > 0
          ? teacherParts
          : [row.teacherName.trim() || '未指派教師'];
      const venueObj = venueMap.get(row.venueName.trim()) || {
        id: `v-auto-${sessionIdx}`,
        name: row.venueName,
      };
      names.forEach((tName) => {
        const teacherObj = teacherMap.get(tName) || {
          id: `t-auto-${sessionIdx}`,
          name: tName,
        };
        newSessionsList.push({
          id: `s-imp-${Date.now()}-${sessionIdx++}`,
          dayOfWeek: row.dayOfWeek,
          period: row.period,
          className: row.className,
          subjectName: row.subjectName,
          teacherId: teacherObj.id,
          teacherName: teacherObj.name,
          venueId: venueObj.id,
          venueName: venueObj.name,
          isPractical: row.isPractical,
          isConcurrent: Boolean(row.isConcurrent),
          notes:
            names.length > 1
              ? [row.notes, `協同：${names.join('、')}`].filter(Boolean).join('｜')
              : row.notes,
        });
      });
    });

    let finalSessions: CourseSession[] = [];
    let addedCount = 0;
    let updatedCount = 0;

    if (mode === 'overwrite') {
      finalSessions = newSessionsList;
      addedCount = newSessionsList.length;
      if (clearRequests) {
        setRequests([]);
        localStorage.removeItem(STORAGE_KEYS.REQUESTS);
      }
    } else {
      // Append / Merge：同班同時段同教師保留原 session id，避免舊申請失效
      const existingMap = new Map<string, CourseSession>();
      sessions.forEach((s) => {
        existingMap.set(`${s.dayOfWeek}-${s.period}-${s.className}-${s.teacherId}`, s);
      });

      newSessionsList.forEach((s) => {
        const key = `${s.dayOfWeek}-${s.period}-${s.className}-${s.teacherId}`;
        const existing = existingMap.get(key);
        if (existing) {
          existingMap.set(key, { ...s, id: existing.id });
          updatedCount++;
        } else {
          existingMap.set(key, s);
          addedCount++;
        }
      });

      finalSessions = Array.from(existingMap.values());
    }

    // 4. 重算每週正課（不含團體活動）與基本節數
    updatedTeachers = enrichTeachersFromSessions(
      updatedTeachers,
      finalSessions,
      systemConfig.standardBasePeriods.fulltime,
      systemConfig.standardBasePeriods.homeroom,
      systemConfig.standardBasePeriods.head,
      systemConfig.standardBasePeriods.sectionChief,
      systemConfig.standardBasePeriods.director
    );

    setTeachers(updatedTeachers);
    setVenues(updatedVenues);
    if (mode === 'append') {
      // remap 後由舊到新重套用已核准異動，避免匯入抹掉 [代課]／移課卻仍結算
      const remapped = remapRequestSessions(requests, finalSessions);
      const withCovers = reapplyApprovedRequestsOldestFirst(finalSessions, remapped);
      const teachersAfterReapply = enrichTeachersFromSessions(
        updatedTeachers,
        withCovers,
        systemConfig.standardBasePeriods.fulltime,
        systemConfig.standardBasePeriods.homeroom,
        systemConfig.standardBasePeriods.head,
        systemConfig.standardBasePeriods.sectionChief,
        systemConfig.standardBasePeriods.director
      );
      setTeachers(teachersAfterReapply);
      setSessions(withCovers);
      setRequests(remapped);
    } else {
      setSessions(finalSessions);
    }

    return {
      success: true,
      addedCount,
      updatedCount,
      newTeachersCount,
      newVenuesCount,
    };
  };

  const addVenue = (venueData: Omit<WorkshopVenue, 'id'>): WorkshopVenue => {
    const newVenue: WorkshopVenue = {
      ...venueData,
      id: `v-custom-${Date.now()}`,
    };
    setVenues((prev) => [...prev, newVenue]);
    return newVenue;
  };

  const updateVenue = (id: string, data: Partial<WorkshopVenue>) => {
    const prev = venues.find((v) => v.id === id);
    setVenues((list) => list.map((v) => (v.id === id ? { ...v, ...data } : v)));

    // 課表／申請單另存 venueName：改名稱時一併同步
    if (data.name !== undefined && prev && data.name.trim() !== prev.name.trim()) {
      const newName = data.name.trim();
      const oldName = prev.name.trim();
      setSessions((list) =>
        list.map((s) =>
          s.venueId === id || s.venueName === oldName
            ? { ...s, venueId: id, venueName: newName }
            : s
        )
      );
      setRequests((list) =>
        list.map((r) => {
          let changed = false;
          let originalSession = r.originalSession;
          let swapTargetSession = r.swapTargetSession;
          let targetReschedule = r.targetReschedule;

          if (
            originalSession &&
            (originalSession.venueId === id || originalSession.venueName === oldName)
          ) {
            originalSession = {
              ...originalSession,
              venueId: id,
              venueName: newName,
            };
            changed = true;
          }
          if (
            swapTargetSession &&
            (swapTargetSession.venueId === id || swapTargetSession.venueName === oldName)
          ) {
            swapTargetSession = {
              ...swapTargetSession,
              venueId: id,
              venueName: newName,
            };
            changed = true;
          }
          if (
            targetReschedule &&
            (targetReschedule.venueId === id || targetReschedule.venueName === oldName)
          ) {
            targetReschedule = {
              ...targetReschedule,
              venueId: id,
              venueName: newName,
            };
            changed = true;
          }
          return changed
            ? { ...r, originalSession, swapTargetSession, targetReschedule }
            : r;
        })
      );
    }
  };

  const deleteVenue = (id: string) => {
    setVenues((prev) => prev.filter((v) => v.id !== id));
  };

  const updateSessionVenue = (sessionId: string, venueId: string): boolean => {
    const venue = venues.find((v) => v.id === venueId);
    if (!venue) return false;
    let found = false;
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id !== sessionId) return s;
        found = true;
        return { ...s, venueId: venue.id, venueName: venue.name };
      })
    );
    return found;
  };

  const addTeacher = (teacherData: Omit<Teacher, 'id' | 'weeklyActualPeriods'>): Teacher => {
    const newTeacher: Teacher = {
      ...teacherData,
      id: `t-custom-${Date.now()}`,
      weeklyActualPeriods: 0,
    };
    setTeachers((prev) => [...prev, newTeacher]);
    return newTeacher;
  };

  const updateTeacher = (id: string, data: Partial<Teacher>) => {
    setTeachers((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const merged = { ...t, ...data };
        if ((data.dutyReductionPeriods !== undefined || data.title !== undefined) && data.basePeriods === undefined) {
          const resolved = resolveTeacherBasePeriods(
            merged,
            systemConfig.standardBasePeriods.fulltime,
            systemConfig.standardBasePeriods.homeroom,
            systemConfig.standardBasePeriods.head,
            systemConfig.standardBasePeriods.sectionChief,
            systemConfig.standardBasePeriods.director
          );
          merged.basePeriods = resolved.basePeriods;
          merged.dutyReductionPeriods = resolved.dutyReductionPeriods;
          merged.title = resolved.title;
        }
        return merged;
      })
    );
  };

  const deleteTeacher = (id: string) => {
    const relatedApproved = requests.filter(
      (r) =>
        r.status === 'approved' &&
        (r.applicantTeacherId === id ||
          r.substituteTeacherId === id ||
          r.swapTargetTeacherId === id)
    );
    if (relatedApproved.length > 0) {
      window.alert(
        `無法刪除：尚有 ${relatedApproved.length} 筆已核准調代課與該教師相關。請先駁回或取消後再刪除師資。`
      );
      return;
    }

    setSessions((prev) => prev.filter((s) => s.teacherId !== id));
    setRequests((prev) =>
      prev.filter(
        (r) =>
          r.applicantTeacherId !== id &&
          r.substituteTeacherId !== id &&
          r.swapTargetTeacherId !== id
      )
    );
    setTeachers((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (currentTeacherId === id && next.length > 0) {
        setCurrentTeacherId(next[0].id);
      }
      return next;
    });
  };

  const addAcademicStaff = (staffData: Omit<AcademicStaff, 'id'>): AcademicStaff => {
    const newStaff: AcademicStaff = {
      ...staffData,
      id: `staff-${Date.now()}`,
    };
    setAcademicStaffList((prev) => [...prev, newStaff]);
    return newStaff;
  };

  const updateAcademicStaff = (id: string, data: Partial<AcademicStaff>) => {
    setAcademicStaffList((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...data } : s))
    );
  };

  const deleteAcademicStaff = (id: string) => {
    setAcademicStaffList((prev) => {
      const filtered = prev.filter((s) => s.id !== id);
      if (filtered.length > 0 && currentAcademicStaffId === id) {
        setCurrentAcademicStaffId(filtered[0].id);
      }
      return filtered;
    });
  };

  const resetToMockData = () => {
    setTeachers(INITIAL_TEACHERS);
    setVenues(INITIAL_VENUES);
    setSessions(INITIAL_SESSIONS);
    setRequests(INITIAL_REQUESTS);
    setSystemConfig(INITIAL_SYSTEM_CONFIG);
    setAcademicStaffList(INITIAL_ACADEMIC_STAFF);
    setCurrentRole('teacher');
    setCurrentTeacherId('t-ee-head');
    setCurrentAcademicStaffId('staff-01');
    localStorage.removeItem(STORAGE_KEYS.TEACHERS);
    localStorage.removeItem(STORAGE_KEYS.VENUES);
    localStorage.removeItem(STORAGE_KEYS.SESSIONS);
    localStorage.removeItem(STORAGE_KEYS.REQUESTS);
    localStorage.removeItem(STORAGE_KEYS.CONFIG);
    localStorage.removeItem(STORAGE_KEYS.STAFF_LIST);
  };

  const requestBelongsToMonth = (requestNumber: string, createdAt: string, month: number) => {
    const m = requestNumber.match(/VOC-\d+-(\d+)-/i);
    if (m) return Number(m[1]) === month;
    const parsed = new Date(createdAt.replace(/-/g, '/'));
    if (!Number.isNaN(parsed.getTime())) return parsed.getMonth() + 1 === month;
    return false;
  };

  // Monthly settlement computation
  const calculateMonthlySettlement = (month?: number): MonthlyTeacherSettlement[] => {
    const hourlyRate = systemConfig.dayHourlyRate;
    const counselingRate = systemConfig.nightHourlyRate;
    const settlementMonth = month ?? systemConfig.currentMonth ?? new Date().getMonth() + 1;
    const settlementYear = calendarYearForSettlementMonth(
      settlementMonth,
      new Date(),
      systemConfig.academicYear
    );
    const holidaySet = nonTeachingDateSet(systemConfig.nonTeachingDays);
    const calendarOpts = {
      holidaySet,
      temporaryMoves: systemConfig.temporaryScheduleMoves || [],
      partialStops: systemConfig.partialNonTeachingDays || [],
    };
    const weeks = settlementWeeksForMonth(
      settlementMonth,
      new Date(),
      holidaySet,
      systemConfig.academicYear,
      calendarOpts
    );

    return teachers.map((teacher) => {
      // 1. Weekly actual and overload（不含第八節課輔）
      const weeklyActual = countWeeklyTeachingPeriods(sessions, teacher.id);
      const base = teacher.basePeriods;
      const weeklyOverload = countWeeklyConcurrentPeriods(sessions, teacher.id);
      const rawMonthlyOverload = monthlyOverloadPeriods(
        sessions,
        teacher,
        settlementMonth,
        new Date(),
        holidaySet,
        systemConfig.academicYear,
        calendarOpts
      );
      // 請假日按日扣兼課：週課表 [請假派代] 不整月排除，只扣實際請假天數
      const leaveConcurrentDeduct = countApplicantApprovedLeaveCoverPeriodsInMonth(
        requests,
        teacher.id,
        settlementMonth,
        settlementYear,
        holidaySet,
        {
          matchSession: (s) =>
            Boolean(s.isConcurrent) &&
            s.dayOfWeek >= 1 &&
            s.dayOfWeek <= 5 &&
            s.period >= 1 &&
            s.period <= 7,
          includeLegacyWithoutDates: (r) =>
            requestBelongsToMonth(r.requestNumber, r.createdAt, settlementMonth),
          temporaryMoves: systemConfig.temporaryScheduleMoves || [],
          partialStops: systemConfig.partialNonTeachingDays || [],
        }
      );
      const swapConcurrentDelta = temporarySwapPeriodDeltaInMonth(
        requests,
        teacher.id,
        settlementMonth,
        settlementYear,
        (s) =>
          Boolean(s.isConcurrent) &&
          s.dayOfWeek >= 1 &&
          s.dayOfWeek <= 5 &&
          s.period >= 1 &&
          s.period <= 7,
        holidaySet
      );
      const monthlyOverload = Math.max(
        0,
        rawMonthlyOverload - leaveConcurrentDeduct + swapConcurrentDelta
      );
      const monthlyOverloadAmount = monthlyOverload * hourlyRate;
      const weeklyCounseling = countWeeklyCounselingPeriods(sessions, teacher.id);
      const rawMonthlyCounseling = monthlyCounselingPeriods(
        sessions,
        teacher.id,
        settlementMonth,
        new Date(),
        holidaySet,
        systemConfig.academicYear,
        calendarOpts
      );
      const leaveCounselingDeduct = countApplicantApprovedLeaveCoverPeriodsInMonth(
        requests,
        teacher.id,
        settlementMonth,
        settlementYear,
        holidaySet,
        {
          matchSession: (s) => s.dayOfWeek >= 1 && s.dayOfWeek <= 5 && s.period === 8,
          includeLegacyWithoutDates: (r) =>
            requestBelongsToMonth(r.requestNumber, r.createdAt, settlementMonth),
          temporaryMoves: systemConfig.temporaryScheduleMoves || [],
          partialStops: systemConfig.partialNonTeachingDays || [],
        }
      );
      const swapCounselingDelta = temporarySwapPeriodDeltaInMonth(
        requests,
        teacher.id,
        settlementMonth,
        settlementYear,
        (s) => s.dayOfWeek >= 1 && s.dayOfWeek <= 5 && s.period === 8,
        holidaySet
      );
      const monthlyCounseling = Math.max(
        0,
        rawMonthlyCounseling - leaveCounselingDeduct + swapCounselingDelta
      );
      const monthlyCounselingAmount = monthlyCounseling * counselingRate;
      const counselingAddPeriods = Math.max(0, swapCounselingDelta);
      const counselingSubtractPeriods = leaveCounselingDeduct + Math.max(0, -swapCounselingDelta);
      const monthlyCounselingBasePeriods = rawMonthlyCounseling;
      const counselingPayrollAmount = monthlyCounselingAmount;

      // 2. Tally approved substitution requests for the selected month only
      let publicSubstitutePeriods = 0;
      let privateLeaveDeductionPeriods = 0;
      let privateSubstituteEarnPeriods = 0;
      let concurrentSubstituteAddPeriods = 0;
      let publicSubstituteAmount = 0;
      let privateLeaveDeductionAmount = 0;
      let privateSubstituteEarnAmount = 0;

      const rateForRequest = (r: SubstituteRequest) =>
        r.originalSession?.period === 8 ? counselingRate : hourlyRate;

      const leaveCalendarOpts = {
        temporaryMoves: systemConfig.temporaryScheduleMoves || [],
        partialStops: systemConfig.partialNonTeachingDays || [],
      };

      requests
        .filter((r) => r.status === 'approved' && r.requestType === 'substitute')
        .forEach((r) => {
          const inMonthPeriods = countLeaveSubstitutePeriodsInMonth(
            r,
            settlementMonth,
            settlementYear,
            holidaySet,
            leaveCalendarOpts
          );
          // 有請假日期：依實際落在結算月的相符星期計節；無日期舊案：依單號月份，且該月該星期須有上課日
          const periods =
            inMonthPeriods === null
              ? requestBelongsToMonth(r.requestNumber, r.createdAt, settlementMonth)
                ? countLeaveSubstitutePeriods(r, holidaySet, {
                    settlementMonth,
                    settlementYear,
                    ...leaveCalendarOpts,
                  })
                : 0
              : inMonthPeriods;
          if (periods <= 0) return;

          const rate = rateForRequest(r);
          // 未指定代課教師：不發代課費、也不自費扣款（避免只扣錢沒人代）
          if (!r.substituteTeacherId) return;

          if (r.substituteTeacherId === teacher.id) {
            if (r.paymentType === 'public') {
              publicSubstitutePeriods += periods;
              publicSubstituteAmount += rate * periods;
            } else {
              privateSubstituteEarnPeriods += periods;
              privateSubstituteEarnAmount += rate * periods;
            }
            if (
              r.originalSession?.isConcurrent &&
              r.originalSession.period >= 1 &&
              r.originalSession.period <= 7
            ) {
              concurrentSubstituteAddPeriods += periods;
            }
          }
          if (r.applicantTeacherId === teacher.id) {
            if (r.paymentType === 'private') {
              privateLeaveDeductionPeriods += periods;
              privateLeaveDeductionAmount += rate * periods;
            }
          }
        });

      const swapConcurrentAdd = Math.max(0, swapConcurrentDelta);
      const swapConcurrentSubtract = Math.max(0, -swapConcurrentDelta);
      const monthlyConcurrentBasePeriods = rawMonthlyOverload;
      const concurrentSubtractPeriods = leaveConcurrentDeduct + swapConcurrentSubtract;
      const concurrentAddPeriods = concurrentSubstituteAddPeriods + swapConcurrentAdd;
      const monthlyConcurrentPeriods = Math.max(
        0,
        monthlyConcurrentBasePeriods - leaveConcurrentDeduct + swapConcurrentDelta + concurrentSubstituteAddPeriods
      );
      const concurrentPayrollAmount = monthlyConcurrentPeriods * hourlyRate;

      const netPayableAmount =
        monthlyOverloadAmount +
        monthlyCounselingAmount +
        publicSubstituteAmount +
        privateSubstituteEarnAmount -
        privateLeaveDeductionAmount;

      // 整月平日皆放假時 weeks=0，避免 Infinity
      const totalSubstituteWeeklyEstimated =
        weeks > 0
          ? weeklyOverload + (publicSubstitutePeriods + privateSubstituteEarnPeriods) / weeks
          : weeklyOverload;

      const isOverLimit =
        weeks > 0 &&
        totalSubstituteWeeklyEstimated > systemConfig.maxWeeklyOverloadPeriods;

      return {
        teacherId: teacher.id,
        teacherName: teacher.name,
        department: teacher.department,
        title: teacher.title,
        homeroomClass: teacher.homeroomClass,
        basePeriods: base,
        weeklyActualPeriods: weeklyActual,
        weeklyOverloadPeriods: weeklyOverload,
        monthlyOverloadAmount,
        weeklyCounselingPeriods: weeklyCounseling,
        monthlyCounselingAmount,
        publicSubstitutePeriods,
        publicSubstituteAmount,
        privateLeaveDeductionPeriods,
        privateLeaveDeductionAmount,
        privateSubstituteEarnPeriods,
        privateSubstituteEarnAmount,
        totalSubstituteWeeklyEstimated,
        isOverLimit,
        netPayableAmount,
        monthlyConcurrentBasePeriods,
        concurrentAddPeriods,
        concurrentSubtractPeriods,
        monthlyConcurrentPeriods,
        concurrentPayrollAmount,
        monthlyCounselingBasePeriods,
        counselingAddPeriods,
        counselingSubtractPeriods,
        monthlyCounselingPeriods: monthlyCounseling,
        counselingPayrollAmount,
      };
    });
  };

  return (
    <AppContext.Provider
      value={{
        currentRole,
        setCurrentRole: setCurrentRolePublic,
        completeAuthenticatedLogin,
        currentTeacherId,
        setCurrentTeacherId,
        currentTeacher,
        academicStaffList,
        currentAcademicStaffId,
        setCurrentAcademicStaffId,
        currentAcademicStaff,
        updateAcademicStaff,
        addAcademicStaff,
        deleteAcademicStaff,
        teachers,
        venues,
        sessions,
        requests,
        systemConfig,
        addSubstituteRequest,
        addSubstituteRequests,
        createStaffDirectDispatch,
        createStaffDirectDispatches,
        approveRequest,
        batchApproveRequests,
        rejectRequest,
        cancelRequest,
        deleteRequest,
        clearAllRequests,
        updateSystemConfig,
        resetToMockData,
        addVenue,
        updateVenue,
        deleteVenue,
        updateSessionVenue,
        addTeacher,
        updateTeacher,
        deleteTeacher,
        checkClashes,
        calculateMonthlySettlement,
        isAiAdvisorOpen,
        setIsAiAdvisorOpen,
        isImportModalOpen,
        setIsImportModalOpen,
        importSchedule,
        printModalRequest,
        setPrintModalRequest,
        isLoginAuthOpen,
        setIsLoginAuthOpen,
        loginAuthTarget,
        setLoginAuthTarget,
        authenticatedTeacherIds,
        requestRoleSwitchWithAuth,
        requestTeacherSwitchWithAuth,
        requestTeacherActionAuth,
        updateTeacherPassword,
        updateAcademicStaffPassword,
        cloudSyncSettings,
        cloudSyncStatus,
        cloudSyncMessage,
        lastCloudSyncAt,
        updateCloudSyncSettings,
        testCloudSync,
        pullCloudOverwriteLocal,
        forcePushLocalToCloud,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
