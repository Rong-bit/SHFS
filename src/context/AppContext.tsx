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
} from '../data/mockData';
import { ParsedImportRow } from '../utils/scheduleImporter';
import {
  CloudSyncSettings,
  loadCloudSyncSettings,
  saveCloudSyncSettings,
  isCloudSyncReady,
  pullSharedSchoolData,
  pushSharedSchoolData,
  testCloudSyncConnection,
  CLOUD_SYNC_UPDATED_AT_KEY,
} from '../utils/cloudSync';

interface AppContextType {
  currentRole: UserRole;
  setCurrentRole: (role: UserRole) => void;
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
    data: Omit<SubstituteRequest, 'id' | 'requestNumber' | 'createdAt' | 'status' | 'clashStatus'>
  ) => SubstituteRequest;
  createStaffDirectDispatch: (
    data: Omit<SubstituteRequest, 'id' | 'requestNumber' | 'createdAt' | 'status' | 'clashStatus'> & {
      autoApprove?: boolean;
    }
  ) => SubstituteRequest;
  approveRequest: (requestId: string, reviewerName?: string) => void;
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
  addTeacher: (teacher: Omit<Teacher, 'id' | 'weeklyActualPeriods'>) => Teacher;
  updateTeacher: (id: string, data: Partial<Teacher>) => void;
  deleteTeacher: (id: string) => void;
  
  // Schedule Import & Batch Update
  importSchedule: (params: {
    validRows: ParsedImportRow[];
    mode: 'overwrite' | 'append';
    newTeacherNames: string[];
    newVenueNames: string[];
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
    targetReschedule?: { dayOfWeek: DayOfWeek; period: number; venueId: string };
    swapTargetTeacherId?: string;
    swapTargetSession?: CourseSession;
    substituteTeacherId?: string;
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

  cloudSyncSettings: CloudSyncSettings;
  cloudSyncStatus: 'off' | 'connecting' | 'synced' | 'error';
  cloudSyncMessage: string;
  lastCloudSyncAt: number | null;
  updateCloudSyncSettings: (settings: CloudSyncSettings) => void;
  testCloudSync: () => Promise<string>;
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
    const saved = localStorage.getItem(STORAGE_KEYS.ROLE);
    return (saved as UserRole) || 'teacher';
  });

  const [currentTeacherId, setCurrentTeacherId] = useState<string>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.CURRENT_TEACHER);
    return saved || 't-ee-head';
  });

  const [academicStaffList, setAcademicStaffList] = useState<AcademicStaff[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.STAFF_LIST);
    return saved ? JSON.parse(saved) : INITIAL_ACADEMIC_STAFF;
  });

  const [currentAcademicStaffId, setCurrentAcademicStaffId] = useState<string>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.CURRENT_STAFF);
    return saved || 'staff-01';
  });

  const [teachers, setTeachers] = useState<Teacher[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.TEACHERS);
    return saved ? JSON.parse(saved) : INITIAL_TEACHERS;
  });

  const [venues, setVenues] = useState<WorkshopVenue[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.VENUES);
    return saved ? JSON.parse(saved) : INITIAL_VENUES;
  });

  const [sessions, setSessions] = useState<CourseSession[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.SESSIONS);
    return saved ? JSON.parse(saved) : INITIAL_SESSIONS;
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
        standardBasePeriods: {
          ...INITIAL_SYSTEM_CONFIG.standardBasePeriods,
          ...(parsed.standardBasePeriods || parsed.basePeriodsStandard || {}),
        },
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
  const lastCloudSyncAtRef = useRef<number>(lastCloudSyncAt || 0);

  // Authentication & Password Check States
  const [isLoginAuthOpen, setIsLoginAuthOpen] = useState<boolean>(false);
  const [loginAuthTarget, setLoginAuthTarget] = useState<any>(null);
  const [authenticatedTeacherIds, setAuthenticatedTeacherIds] = useState<string[]>([]);

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
    setTeachers((prev) =>
      prev.map((t) => (t.id === teacherId ? { ...t, password: newPassword } : t))
    );
  };

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.STAFF_LIST, JSON.stringify(academicStaffList));
  }, [academicStaffList]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.ROLE, currentRole);
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
    setTeachers(remote.teachers || []);
    setVenues(remote.venues || []);
    setSessions(remote.sessions || []);
    setRequests(remote.requests || []);
    setSystemConfig({
      ...INITIAL_SYSTEM_CONFIG,
      ...(remote.systemConfig || {}),
      standardBasePeriods: {
        ...INITIAL_SYSTEM_CONFIG.standardBasePeriods,
        ...(remote.systemConfig?.standardBasePeriods || {}),
      },
      authConfig: {
        ...INITIAL_SYSTEM_CONFIG.authConfig,
        ...(remote.systemConfig?.authConfig || {}),
      },
    });
    if (remote.academicStaffList?.length) {
      setAcademicStaffList(remote.academicStaffList);
    }
    lastCloudSyncAtRef.current = remote.updatedAt;
    setLastCloudSyncAt(remote.updatedAt);
    localStorage.setItem(CLOUD_SYNC_UPDATED_AT_KEY, String(remote.updatedAt));
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
    setCloudSyncSettings(settings);
    saveCloudSyncSettings(settings);
    if (!isCloudSyncReady(settings)) {
      setCloudSyncStatus('off');
      setCloudSyncMessage('尚未啟用跨電腦同步');
      cloudReadyRef.current = false;
    } else {
      setCloudSyncStatus('connecting');
      setCloudSyncMessage('正在連線同步...');
    }
  };

  const testCloudSync = () => testCloudSyncConnection(cloudSyncSettings);

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
      try {
        const remote = await pullSharedSchoolData(cloudSyncSettings);
        if (stopped) return;
        if (remote && remote.updatedAt > lastCloudSyncAtRef.current) {
          applySharedSchoolData(remote);
          setCloudSyncMessage('已從雲端更新課表與設定');
        } else if (!remote && lastCloudSyncAtRef.current === 0) {
          const now = Date.now();
          lastCloudSyncAtRef.current = now;
          await pushSharedSchoolData(cloudSyncSettings, buildSharedSchoolData(now));
          setLastCloudSyncAt(now);
          localStorage.setItem(CLOUD_SYNC_UPDATED_AT_KEY, String(now));
          setCloudSyncMessage('已建立雲端資料，其他電腦可用同一組設定讀取');
        }
        cloudReadyRef.current = true;
        setCloudSyncStatus('synced');
      } catch (err: any) {
        if (stopped) return;
        cloudReadyRef.current = true;
        setCloudSyncStatus('error');
        setCloudSyncMessage(err?.message || '同步失敗');
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
    if (skipCloudPushRef.current) {
      skipCloudPushRef.current = false;
      return;
    }
    const handle = window.setTimeout(async () => {
      try {
        const now = Date.now();
        lastCloudSyncAtRef.current = now;
        await pushSharedSchoolData(cloudSyncSettings, buildSharedSchoolData(now));
        setLastCloudSyncAt(now);
        localStorage.setItem(CLOUD_SYNC_UPDATED_AT_KEY, String(now));
        setCloudSyncStatus('synced');
        setCloudSyncMessage('已同步到其他電腦');
      } catch (err: any) {
        setCloudSyncStatus('error');
        setCloudSyncMessage(err?.message || '同步寫入失敗');
      }
    }, 800);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teachers, venues, sessions, requests, systemConfig, academicStaffList]);

  const currentTeacher = teachers.find((t) => t.id === currentTeacherId) || teachers[0];
  const currentAcademicStaff = academicStaffList.find((s) => s.id === currentAcademicStaffId) || academicStaffList[0];

  // Clash checking algorithm
  const checkClashes = (params: {
    requestType: RequestType;
    applicantTeacherId: string;
    originalSession: CourseSession;
    targetReschedule?: { dayOfWeek: DayOfWeek; period: number; venueId: string };
    swapTargetTeacherId?: string;
    swapTargetSession?: CourseSession;
    substituteTeacherId?: string;
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
    } = params;

    const applicant = teachers.find((t) => t.id === applicantTeacherId);

    if (requestType === 'reschedule' && targetReschedule) {
      const { dayOfWeek, period, venueId } = targetReschedule;

      // 1. Check if applicant already teaches at target time
      const teacherClash = sessions.find(
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
      const classClash = sessions.find(
        (s) =>
          s.className === originalSession.className &&
          s.dayOfWeek === dayOfWeek &&
          s.period === period &&
          s.id !== originalSession.id
      );
      if (classClash) {
        messages.push(`【班級衝堂】班級 ${originalSession.className} 在 週${dayOfWeek} 第${period}節 已排有「${classClash.subjectName}（${classClash.teacherName}）」`);
        severity = 'danger';
      }

      // 3. Check if target venue/workshop is occupied
      const venueClash = sessions.find(
        (s) =>
          s.venueId === venueId &&
          s.dayOfWeek === dayOfWeek &&
          s.period === period &&
          s.id !== originalSession.id
      );
      if (venueClash) {
        const venueObj = venues.find((v) => v.id === venueId);
        messages.push(`【工場教室衝堂】${venueObj?.name || '指定教室/工場'} 在 週${dayOfWeek} 第${period}節 已被「${venueClash.className} ${venueClash.subjectName}」借用`);
        severity = 'danger';
      }

      if (messages.length === 0) {
        messages.push(`檢核通過：目標時段（週${dayOfWeek} 第${period}節）教師空堂、班級空堂、教室工場無佔用，可順利移課。`);
      }
    } else if (requestType === 'swap') {
      if (!swapTargetTeacherId || !swapTargetSession) {
        return {
          hasClash: true,
          severity: 'warning',
          messages: ['請選擇相互調課之對象教師與互換課堂'],
        };
      }

      const partner = teachers.find((t) => t.id === swapTargetTeacherId);

      // Applicant going to partner's slot (swapTargetSession.dayOfWeek, swapTargetSession.period)
      const applicantClashInPartnerSlot = sessions.find(
        (s) =>
          s.teacherId === applicantTeacherId &&
          s.dayOfWeek === swapTargetSession.dayOfWeek &&
          s.period === swapTargetSession.period &&
          s.id !== originalSession.id
      );
      if (applicantClashInPartnerSlot) {
        messages.push(`【申請人衝堂】${applicant?.name} 在互調時段（週${swapTargetSession.dayOfWeek} 第${swapTargetSession.period}節）已有「${applicantClashInPartnerSlot.subjectName}」`);
        severity = 'danger';
      }

      // Partner going to applicant's slot (originalSession.dayOfWeek, originalSession.period)
      const partnerClashInApplicantSlot = sessions.find(
        (s) =>
          s.teacherId === swapTargetTeacherId &&
          s.dayOfWeek === originalSession.dayOfWeek &&
          s.period === originalSession.period &&
          s.id !== swapTargetSession.id
      );
      if (partnerClashInApplicantSlot) {
        messages.push(`【對調教師衝堂】${partner?.name} 在原課堂時段（週${originalSession.dayOfWeek} 第${originalSession.period}節）已有「${partnerClashInApplicantSlot.subjectName}」`);
        severity = 'danger';
      }

      // Check class conflicts
      const applicantClassInPartnerSlot = sessions.find(
        (s) =>
          s.className === originalSession.className &&
          s.dayOfWeek === swapTargetSession.dayOfWeek &&
          s.period === swapTargetSession.period &&
          s.id !== originalSession.id &&
          s.id !== swapTargetSession.id
      );
      if (applicantClassInPartnerSlot) {
        messages.push(`【班級衝堂】${originalSession.className} 在 週${swapTargetSession.dayOfWeek} 第${swapTargetSession.period}節 已有其他課程`);
        severity = 'danger';
      }

      const partnerClassInApplicantSlot = sessions.find(
        (s) =>
          s.className === swapTargetSession.className &&
          s.dayOfWeek === originalSession.dayOfWeek &&
          s.period === originalSession.period &&
          s.id !== originalSession.id &&
          s.id !== swapTargetSession.id
      );
      if (partnerClassInApplicantSlot) {
        messages.push(`【班級衝堂】${swapTargetSession.className} 在 週${originalSession.dayOfWeek} 第${originalSession.period}節 已有其他課程`);
        severity = 'danger';
      }

      if (messages.length === 0) {
        messages.push(`檢核通過：雙方教師與班級在互換時段均為空堂，實習工場與教室無衝突。`);
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
      const subClash = sessions.find(
        (s) =>
          s.teacherId === substituteTeacherId &&
          s.dayOfWeek === originalSession.dayOfWeek &&
          s.period === originalSession.period
      );
      if (subClash) {
        messages.push(`【代課教師衝堂】${subTeacher?.name} 在 週${originalSession.dayOfWeek} 第${originalSession.period}節 已有正課「${subClash.className} ${subClash.subjectName}」`);
        severity = 'danger';
      }

      // Overload check (9 periods limit)
      if (subTeacher) {
        const weeklyOverload = Math.max(0, subTeacher.weeklyActualPeriods - subTeacher.basePeriods);
        if (weeklyOverload >= systemConfig.maxWeeklyOverloadPeriods) {
          messages.push(`【法規防呆警示】${subTeacher.name} 本週兼任超鐘點已達 ${weeklyOverload} 節（法定上限為 ${systemConfig.maxWeeklyOverloadPeriods} 節），若再承擔代課將超過法規上限！`);
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

  const addSubstituteRequest = (
    data: Omit<SubstituteRequest, 'id' | 'requestNumber' | 'createdAt' | 'status' | 'clashStatus'>
  ): SubstituteRequest => {
    const newId = `req-${Date.now()}`;
    const nextSeq = (requests.length + 1).toString().padStart(3, '0');
    const requestNumber = `VOC-${systemConfig.academicYear}-${systemConfig.currentMonth}-${nextSeq}`;

    const clashStatus = checkClashes({
      requestType: data.requestType,
      applicantTeacherId: data.applicantTeacherId,
      originalSession: data.originalSession,
      targetReschedule: data.targetReschedule,
      swapTargetTeacherId: data.swapTargetTeacherId,
      swapTargetSession: data.swapTargetSession,
      substituteTeacherId: data.substituteTeacherId,
    });

    const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 16);

    const newRequest: SubstituteRequest = {
      ...data,
      id: newId,
      requestNumber,
      createdAt: nowStr,
      status: 'pending',
      clashStatus,
    };

    setRequests((prev) => [newRequest, ...prev]);
    return newRequest;
  };

  const approveRequest = (requestId: string, reviewerName: string = '陳雅筑 組長 (教學組)') => {
    const targetReq = requests.find((r) => r.id === requestId);
    if (!targetReq) return;

    const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 16);

    // Apply timetable adjustments if approved
    if (targetReq.requestType === 'reschedule' && targetReq.targetReschedule) {
      setSessions((prev) =>
        prev.map((s) => {
          if (s.id === targetReq.originalSession.id) {
            return {
              ...s,
              dayOfWeek: targetReq.targetReschedule!.dayOfWeek,
              period: targetReq.targetReschedule!.period,
              venueId: targetReq.targetReschedule!.venueId,
              venueName: targetReq.targetReschedule!.venueName,
              notes: `[已移課] 原週${targetReq.originalSession.dayOfWeek}第${targetReq.originalSession.period}節`,
            };
          }
          return s;
        })
      );
    } else if (targetReq.requestType === 'swap' && targetReq.swapTargetSession) {
      setSessions((prev) =>
        prev.map((s) => {
          if (s.id === targetReq.originalSession.id) {
            return {
              ...s,
              dayOfWeek: targetReq.swapTargetSession!.dayOfWeek,
              period: targetReq.swapTargetSession!.period,
              notes: `[相互調課] 與 ${targetReq.swapTargetTeacherName} 對調`,
            };
          }
          if (s.id === targetReq.swapTargetSession!.id) {
            return {
              ...s,
              dayOfWeek: targetReq.originalSession.dayOfWeek,
              period: targetReq.originalSession.period,
              notes: `[相互調課] 與 ${targetReq.applicantTeacherName} 對調`,
            };
          }
          return s;
        })
      );
    } else if (targetReq.requestType === 'substitute' && targetReq.substituteTeacherId) {
      setSessions((prev) =>
        prev.map((s) => {
          if (s.id === targetReq.originalSession.id) {
            return {
              ...s,
              teacherId: targetReq.substituteTeacherId!,
              teacherName: targetReq.substituteTeacherName!,
              notes: `[派代] 原任: ${targetReq.applicantTeacherName} (${targetReq.paymentType === 'public' ? '公費派代' : '自費代課'})`,
            };
          }
          return s;
        })
      );
    }

    setRequests((prev) =>
      prev.map((r) =>
        r.id === requestId
          ? {
              ...r,
              status: 'approved',
              reviewedAt: nowStr,
              reviewedBy: reviewerName,
            }
          : r
      )
    );
  };

  const batchApproveRequests = (requestIds: string[], reviewerName: string = '陳雅筑 組長 (教學組)'): number => {
    let count = 0;
    requestIds.forEach((id) => {
      approveRequest(id, reviewerName);
      count++;
    });
    return count;
  };

  const createStaffDirectDispatch = (
    data: Omit<SubstituteRequest, 'id' | 'requestNumber' | 'createdAt' | 'status' | 'clashStatus'> & {
      autoApprove?: boolean;
    }
  ): SubstituteRequest => {
    const newId = `req-${Date.now()}`;
    const nextSeq = (requests.length + 1).toString().padStart(3, '0');
    const requestNumber = `VOC-${systemConfig.academicYear}-${systemConfig.currentMonth}-${nextSeq}`;

    const clashStatus = checkClashes({
      requestType: data.requestType,
      applicantTeacherId: data.applicantTeacherId,
      originalSession: data.originalSession,
      targetReschedule: data.targetReschedule,
      swapTargetTeacherId: data.swapTargetTeacherId,
      swapTargetSession: data.swapTargetSession,
      substituteTeacherId: data.substituteTeacherId,
    });

    const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 16);
    const staffName = currentAcademicStaff ? `${currentAcademicStaff.name} (${currentAcademicStaff.title})` : '教學組經辦';

    const isAutoApproved = data.autoApprove !== false;

    const newRequest: SubstituteRequest = {
      ...data,
      id: newId,
      requestNumber,
      createdAt: nowStr,
      status: isAutoApproved ? 'approved' : 'pending',
      reviewedAt: isAutoApproved ? nowStr : undefined,
      reviewedBy: isAutoApproved ? `${staffName} [教務處逕行派代]` : undefined,
      clashStatus,
    };

    if (isAutoApproved) {
      // Apply session modifications immediately
      if (newRequest.requestType === 'reschedule' && newRequest.targetReschedule) {
        setSessions((prev) =>
          prev.map((s) => {
            if (s.id === newRequest.originalSession.id) {
              return {
                ...s,
                dayOfWeek: newRequest.targetReschedule!.dayOfWeek,
                period: newRequest.targetReschedule!.period,
                venueId: newRequest.targetReschedule!.venueId,
                venueName: newRequest.targetReschedule!.venueName,
                notes: `[教學組移課] 原週${newRequest.originalSession.dayOfWeek}第${newRequest.originalSession.period}節`,
              };
            }
            return s;
          })
        );
      } else if (newRequest.requestType === 'swap' && newRequest.swapTargetSession) {
        setSessions((prev) =>
          prev.map((s) => {
            if (s.id === newRequest.originalSession.id) {
              return {
                ...s,
                dayOfWeek: newRequest.swapTargetSession!.dayOfWeek,
                period: newRequest.swapTargetSession!.period,
                notes: `[教學組互調] 與 ${newRequest.swapTargetTeacherName}`,
              };
            }
            if (s.id === newRequest.swapTargetSession!.id) {
              return {
                ...s,
                dayOfWeek: newRequest.originalSession.dayOfWeek,
                period: newRequest.originalSession.period,
                notes: `[教學組互調] 與 ${newRequest.applicantTeacherName}`,
              };
            }
            return s;
          })
        );
      } else if (newRequest.requestType === 'substitute' && newRequest.substituteTeacherId) {
        setSessions((prev) =>
          prev.map((s) => {
            if (s.id === newRequest.originalSession.id) {
              return {
                ...s,
                teacherId: newRequest.substituteTeacherId!,
                teacherName: newRequest.substituteTeacherName!,
                notes: `[教學組派代] 原任: ${newRequest.applicantTeacherName} (${newRequest.paymentType === 'public' ? '公費派代' : '自費代課'})`,
              };
            }
            return s;
          })
        );
      }
    }

    setRequests((prev) => [newRequest, ...prev]);
    return newRequest;
  };

  const rejectRequest = (requestId: string, reason: string, reviewerName: string = '陳雅筑 組長 (教學組)') => {
    const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 16);
    setRequests((prev) =>
      prev.map((r) =>
        r.id === requestId
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
    setRequests((prev) =>
      prev.map((r) => (r.id === requestId ? { ...r, status: 'cancelled' } : r))
    );
  };

  const deleteRequest = (requestId: string) => {
    setRequests((prev) => prev.filter((r) => r.id !== requestId));
  };

  const clearAllRequests = () => {
    setRequests([]);
    localStorage.removeItem(STORAGE_KEYS.REQUESTS);
  };

  const updateSystemConfig = (newConfig: Partial<SystemConfig>) => {
    setSystemConfig((prev) => ({ ...prev, ...newConfig }));
  };

  const importSchedule = (params: {
    validRows: ParsedImportRow[];
    mode: 'overwrite' | 'append';
    newTeacherNames: string[];
    newVenueNames: string[];
  }) => {
    const { validRows, mode } = params;

    // Collect all unique real teacher names in the imported file
    const importedTeacherNames = Array.from(
      new Set(
        validRows
          .map((r) => r.teacherName.trim())
          .filter((n) => n && n !== '未指派教師')
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
        const matchingRow = validRows.find((r) => r.teacherName.trim() === name);
        const dept = matchingRow?.department || existing?.department || '共同科目';

        const teacherObj: Teacher = existing
          ? { ...existing, department: dept, weeklyActualPeriods: 0 }
          : {
              id: `t-imp-${Date.now()}-${idx}`,
              name,
              title: '專任教師',
              department: dept,
              basePeriods: systemConfig.standardBasePeriods.fulltime,
              weeklyActualPeriods: 0,
              email: `${name}@school.edu.tw`,
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
          const matchingRow = validRows.find((r) => r.teacherName.trim() === name);
          const dept = matchingRow?.department || '共同科目';
          const newTeacher: Teacher = {
            id: `t-imp-${Date.now()}-${idx}`,
            name,
            title: '專任教師',
            department: dept,
            basePeriods: systemConfig.standardBasePeriods.fulltime,
            weeklyActualPeriods: 0,
            email: `${name}@school.edu.tw`,
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

    // 2. Process venues
    let updatedVenues: WorkshopVenue[] = [];
    let newVenuesCount = 0;
    const venueMap = new Map<string, WorkshopVenue>();

    if (mode === 'overwrite') {
      importedVenueNames.forEach((name, idx) => {
        const existing = venues.find((v) => v.name.trim() === name);
        const isWorkshop = name.includes('工場') || name.includes('實習') || name.includes('教室');
        const getVenueDept = (vName: string): DepartmentType | '通用教室' => {
          if (vName.includes('電機')) return '電機科';
          if (vName.includes('資訊') || vName.includes('電腦')) return '資訊科';
          if (vName.includes('機械') || vName.includes('CNC')) return '機械科';
          if (vName.includes('餐飲') || vName.includes('烘焙')) return '餐飲管理科';
          if (vName.includes('設計') || vName.includes('繪圖')) return '廣告設計科';
          if (vName.includes('普通') || vName.includes('通用')) return '通用教室';
          return '共同科目';
        };

        const venueObj: WorkshopVenue = existing
          ? existing
          : {
              id: `v-imp-${Date.now()}-${idx}`,
              name,
              code: `IMP-${100 + idx}`,
              department: getVenueDept(name),
              capacity: 40,
              safetyLevel: isWorkshop ? '標準' : '標準',
              equipmentNote: '匯入課表時自動登記建立之教學場地',
            };
        updatedVenues.push(venueObj);
        venueMap.set(name, venueObj);
        if (!existing) newVenuesCount++;
      });
    } else {
      updatedVenues = [...venues];
      venues.forEach((v) => venueMap.set(v.name.trim(), v));

      importedVenueNames.forEach((name, idx) => {
        if (!venueMap.has(name)) {
          const isWorkshop = name.includes('工場') || name.includes('實習') || name.includes('教室');
          const getVenueDept = (vName: string): DepartmentType | '通用教室' => {
            if (vName.includes('電機')) return '電機科';
            if (vName.includes('資訊') || vName.includes('電腦')) return '資訊科';
            if (vName.includes('機械') || vName.includes('CNC')) return '機械科';
            if (vName.includes('餐飲') || vName.includes('烘焙')) return '餐飲管理科';
            if (vName.includes('設計') || vName.includes('繪圖')) return '廣告設計科';
            if (vName.includes('普通') || vName.includes('通用')) return '通用教室';
            return '共同科目';
          };

          const newVenue: WorkshopVenue = {
            id: `v-imp-${Date.now()}-${idx}`,
            name,
            code: `IMP-${100 + idx}`,
            department: getVenueDept(name),
            capacity: 40,
            safetyLevel: isWorkshop ? '標準' : '標準',
            equipmentNote: '匯入課表時自動登記建立之教學場地',
          };
          updatedVenues.push(newVenue);
          venueMap.set(name, newVenue);
          newVenuesCount++;
        }
      });
    }

    // 3. Convert parsed rows into CourseSession objects
    const newSessionsList: CourseSession[] = validRows.map((row, idx) => {
      const teacherObj = teacherMap.get(row.teacherName.trim()) || {
        id: `t-auto-${idx}`,
        name: row.teacherName,
      };
      const venueObj = venueMap.get(row.venueName.trim()) || {
        id: `v-auto-${idx}`,
        name: row.venueName,
      };

      return {
        id: `s-imp-${Date.now()}-${idx}`,
        dayOfWeek: row.dayOfWeek,
        period: row.period,
        className: row.className,
        subjectName: row.subjectName,
        teacherId: teacherObj.id,
        teacherName: teacherObj.name,
        venueId: venueObj.id,
        venueName: venueObj.name,
        isPractical: row.isPractical,
        notes: row.notes,
      };
    });

    let finalSessions: CourseSession[] = [];
    let addedCount = 0;
    let updatedCount = 0;

    if (mode === 'overwrite') {
      finalSessions = newSessionsList;
      addedCount = newSessionsList.length;
      // Also clear old mock substitute requests when fully overwriting schedule
      setRequests([]);
      localStorage.removeItem(STORAGE_KEYS.REQUESTS);
    } else {
      // Append / Merge mode: overwrite existing session if same class at same day/period, else add
      const existingMap = new Map<string, CourseSession>();
      sessions.forEach((s) => {
        existingMap.set(`${s.dayOfWeek}-${s.period}-${s.className}`, s);
      });

      newSessionsList.forEach((s) => {
        const key = `${s.dayOfWeek}-${s.period}-${s.className}`;
        if (existingMap.has(key)) {
          existingMap.set(key, s);
          updatedCount++;
        } else {
          existingMap.set(key, s);
          addedCount++;
        }
      });

      finalSessions = Array.from(existingMap.values());
    }

    // 4. Update teachers' weeklyActualPeriods counts
    const teacherPeriodCount = new Map<string, number>();
    finalSessions.forEach((s) => {
      teacherPeriodCount.set(s.teacherId, (teacherPeriodCount.get(s.teacherId) || 0) + 1);
    });

    updatedTeachers = updatedTeachers.map((t) => ({
      ...t,
      weeklyActualPeriods: teacherPeriodCount.get(t.id) || 0,
    }));

    setTeachers(updatedTeachers);
    setVenues(updatedVenues);
    setSessions(finalSessions);

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
    setVenues((prev) => prev.map((v) => (v.id === id ? { ...v, ...data } : v)));
  };

  const deleteVenue = (id: string) => {
    setVenues((prev) => prev.filter((v) => v.id !== id));
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
    setTeachers((prev) => prev.map((t) => (t.id === id ? { ...t, ...data } : t)));
  };

  const deleteTeacher = (id: string) => {
    setTeachers((prev) => prev.filter((t) => t.id !== id));
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

  // Monthly settlement computation
  const calculateMonthlySettlement = (_month?: number): MonthlyTeacherSettlement[] => {
    const hourlyRate = systemConfig.dayHourlyRate;
    const weeks = systemConfig.weeksInMonth;

    return teachers.map((teacher) => {
      // 1. Weekly actual and overload
      const weeklyActual = teacher.weeklyActualPeriods;
      const base = teacher.basePeriods;
      const weeklyOverload = Math.max(0, weeklyActual - base);
      const monthlyOverloadAmount = weeklyOverload * weeks * hourlyRate;

      // 2. Tally approved substitution requests
      let publicSubstitutePeriods = 0;
      let privateLeaveDeductionPeriods = 0;
      let privateSubstituteEarnPeriods = 0;

      requests
        .filter((r) => r.status === 'approved')
        .forEach((r) => {
          if (r.requestType === 'substitute') {
            // If this teacher was the substitute teacher
            if (r.substituteTeacherId === teacher.id) {
              if (r.paymentType === 'public') {
                publicSubstitutePeriods += 1;
              } else {
                privateSubstituteEarnPeriods += 1;
              }
            }
            // If this teacher was the applicant (leave taker)
            if (r.applicantTeacherId === teacher.id) {
              if (r.paymentType === 'private') {
                privateLeaveDeductionPeriods += 1;
              }
            }
          }
        });

      const publicSubstituteAmount = publicSubstitutePeriods * hourlyRate;
      const privateLeaveDeductionAmount = privateLeaveDeductionPeriods * hourlyRate;
      const privateSubstituteEarnAmount = privateSubstituteEarnPeriods * hourlyRate;

      const netPayableAmount =
        monthlyOverloadAmount +
        publicSubstituteAmount +
        privateSubstituteEarnAmount -
        privateLeaveDeductionAmount;

      const totalSubstituteWeeklyEstimated =
        weeklyOverload + (publicSubstitutePeriods + privateSubstituteEarnPeriods) / weeks;

      const isOverLimit = totalSubstituteWeeklyEstimated > systemConfig.maxWeeklyOverloadPeriods;

      return {
        teacherId: teacher.id,
        teacherName: teacher.name,
        department: teacher.department,
        title: teacher.title,
        basePeriods: base,
        weeklyActualPeriods: weeklyActual,
        weeklyOverloadPeriods: weeklyOverload,
        monthlyOverloadAmount,
        publicSubstitutePeriods,
        publicSubstituteAmount,
        privateLeaveDeductionPeriods,
        privateLeaveDeductionAmount,
        privateSubstituteEarnPeriods,
        privateSubstituteEarnAmount,
        totalSubstituteWeeklyEstimated,
        isOverLimit,
        netPayableAmount,
      };
    });
  };

  return (
    <AppContext.Provider
      value={{
        currentRole,
        setCurrentRole,
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
        createStaffDirectDispatch,
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
        cloudSyncSettings,
        cloudSyncStatus,
        cloudSyncMessage,
        lastCloudSyncAt,
        updateCloudSyncSettings,
        testCloudSync,
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
