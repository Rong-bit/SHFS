import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { 
  CourseSession, 
  DayOfWeek, 
  DepartmentType, 
  LeaveType, 
  PaymentType, 
  RequestType, 
  SubstituteRequest,
  Teacher 
} from '../../types';
import { PERIOD_DEFINITIONS } from '../../data/mockData';
import { isPracticalSession, SCHOOL_DEPARTMENTS } from '../../utils/schoolDepartments';
import {
  defaultReasonForLeaveType,
  LEAVE_TYPE_FORM_OPTIONS,
  PERSONAL_LEAVE_POLICY_NOTE,
  requiresSubstituteTeacherForLeave,
  SICK_LEAVE_POLICY_NOTE,
} from '../../utils/leaveTypes';
import {
  buildLeavePayrollContext,
  getWellnessLeaveHoursStatus,
  leavePaymentDisplayLabel,
  resolvePaymentTypeForLeaveDraft,
  resolveRequestPaymentType,
  validateWellnessLeaveHoursForDrafts,
} from '../../utils/leavePayrollPolicy';
import { WellnessLeaveHoursAlert } from '../Common/WellnessLeaveHoursAlert';
import { resolveOriginalSession, isPlaceholderSession } from '../../utils/resolveOriginalSession';
import {
  countMatchingWeekdays,
  dateToDayOfWeek,
  formatLeaveDateLabel,
  formatWeekdayList,
  resolveLeaveDateEnd,
  validateSubstituteLeaveInput,
  weekdaysInDateRange,
} from '../../utils/leaveDates';
import { nonTeachingDateSet } from '../../utils/holidays';
import { rankSubstituteCandidates } from '../../utils/substituteCandidates';
import { formatPeriodsLabel } from '../../utils/periodLabels';
import {
  formatTemporarySwapEffectLabel,
  validateTemporarySwapEffectiveDate,
} from '../../utils/temporarySwap';
import { ModalShell } from '../Common/ModalShell';
import { SessionVenueSelect } from '../Common/SessionVenueSelect';
import { TeacherSearchCombobox } from '../Common/TeacherSearchCombobox';
import { isHomeroomTeacher, isActingHomeroomOnlyRequest } from '../../utils/actingHomeroomPayrollRegister';
import {
  MAX_NOTICE_TABLE_ROWS,
  NoticeTableEditor,
  chunkNoticeRows,
  useSubstituteNoticeEditor,
} from '../TeacherPortal/SubstituteNoticeEditor';
import { 
  UserCheck, 
  User, 
  Building2, 
  Clock, 
  Calendar, 
  CheckCircle, 
  AlertTriangle, 
  FileText, 
  Printer, 
  Plus, 
  Check,
  Trash2,
  Layers,
  Filter, 
  ShieldCheck, 
  ArrowRight, 
  Search,
  BadgeCheck,
  Send,
  Zap,
  HelpCircle,
  Edit2,
  X
} from 'lucide-react';

const RequestNoticeTab: React.FC<{
  request: SubstituteRequest;
  onDirtyChange?: (dirty: boolean) => void;
  onBindDiscard?: (discard: () => void) => void;
}> = ({ request, onDirtyChange, onBindDiscard }) => {
  const { editableRows, isDirty, onRowsChange, onReset, onSave, discardChanges } =
    useSubstituteNoticeEditor(request);
  const rowPages = chunkNoticeRows(editableRows, MAX_NOTICE_TABLE_ROWS);
  const multiPage = rowPages.length > 1;

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    onBindDiscard?.(discardChanges);
  }, [discardChanges, onBindDiscard]);

  return (
    <div className="space-y-3">
      <NoticeTableEditor
        rows={editableRows}
        onChange={onRowsChange}
        onReset={onReset}
        onSave={onSave}
        compact
      />
      {multiPage && (
        <p className="text-xs text-indigo-800 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2">
          課程共 {editableRows.length} 列，已自動分成 {rowPages.length} 張通知單（每張最多{' '}
          {MAX_NOTICE_TABLE_ROWS} 列）；列印時每張為獨立一頁。
        </p>
      )}
    </div>
  );
};

export const StaffDispatchWorkbench: React.FC = () => {
  const {
    currentAcademicStaff,
    currentAcademicStaffId,
    setCurrentAcademicStaffId,
    academicStaffList,
    updateAcademicStaff,
    teachers,
    venues,
    sessions,
    requests,
    systemConfig,
    createStaffDirectDispatches,
    approveRequest,
    deleteRequest,
    updateStaffDispatchFields,
    batchApproveRequests,
    setPrintModalRequest,
    checkClashes
  } = useApp();

  // Mode: 'list' (登錄簿與批次管理) vs 'create' (教學組直接經辦派代/調課)
  const [activeSubView, setActiveSubView] = useState<'create' | 'list'>('create');

  // Quick edit modal for current staff
  const [isQuickEditOpen, setIsQuickEditOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editBadge, setEditBadge] = useState('');
  const [editScope, setEditScope] = useState('');
  const [deletingRequestId, setDeletingRequestId] = useState<string | null>(null);
  const [editingRequest, setEditingRequest] = useState<SubstituteRequest | null>(null);
  const [editLeaveType, setEditLeaveType] = useState<LeaveType>('official');
  const [editReason, setEditReason] = useState('');
  const [editLeaveDateMode, setEditLeaveDateMode] = useState<'single' | 'range'>('single');
  const [editLeaveDateStart, setEditLeaveDateStart] = useState('');
  const [editLeaveDateEnd, setEditLeaveDateEnd] = useState('');
  const [editSubstituteTeacherId, setEditSubstituteTeacherId] = useState('');
  const [editActingHomeroomTeacherId, setEditActingHomeroomTeacherId] = useState('');
  const [editModalTab, setEditModalTab] = useState<'request' | 'notice'>('request');
  const [noticeTableDirty, setNoticeTableDirty] = useState(false);
  const noticeDiscardRef = useRef<(() => void) | null>(null);

  const openEditRequest = (req: SubstituteRequest) => {
    if (req.requestType !== 'substitute') {
      alert('目前僅支援修改請假派代單。');
      return;
    }
    const showNoticeTab =
      req.status === 'approved' && !isActingHomeroomOnlyRequest(req);
    setEditModalTab(showNoticeTab ? 'notice' : 'request');
    setNoticeTableDirty(false);
    noticeDiscardRef.current = null;
    setEditingRequest(req);
    setEditLeaveType(req.leaveType || 'official');
    setEditReason(req.reason || '');
    const start = req.leaveDateStart || '';
    const end = req.leaveDateEnd || start;
    setEditLeaveDateStart(start);
    setEditLeaveDateEnd(end);
    setEditLeaveDateMode(end && start && end !== start ? 'range' : 'single');
    setEditSubstituteTeacherId(req.substituteTeacherId || '');
    setEditActingHomeroomTeacherId(req.actingHomeroomTeacherId || '');
  };

  const handleSaveEditRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRequest) return;
    if (editLeaveType === 'wellness' && editWellnessHoursStatus?.exceeded) {
      alert(editWellnessHoursStatus.warningMessage || '身心調適假已超出學年 21 小時上限。');
      return;
    }
    const sub = teachers.find((t) => t.id === editSubstituteTeacherId);
    const acting = teachers.find((t) => t.id === editActingHomeroomTeacherId);
    const ok = updateStaffDispatchFields(editingRequest.id, {
      leaveType: editLeaveType,
      reason: editReason,
      leaveDateStart: editLeaveDateStart,
      leaveDateEnd:
        editLeaveDateMode === 'range'
          ? editLeaveDateEnd || editLeaveDateStart
          : editLeaveDateStart,
      substituteTeacherId: isPlaceholderSession(editingRequest.originalSession)
        ? ''
        : editSubstituteTeacherId,
      substituteTeacherName: isPlaceholderSession(editingRequest.originalSession)
        ? ''
        : sub?.name || '',
      actingHomeroomTeacherId: editActingHomeroomTeacherId,
      actingHomeroomTeacherName: acting?.name || '',
    });
    if (ok) {
      setEditingRequest(null);
      setSuccessToast(`已更新 ${editingRequest.requestNumber}`);
      setTimeout(() => setSuccessToast(null), 2500);
    }
  };

  const handleOpenQuickEdit = () => {
    if (currentAcademicStaff) {
      setEditName(currentAcademicStaff.name);
      setEditTitle(currentAcademicStaff.title);
      setEditPhone(currentAcademicStaff.phone);
      setEditBadge(currentAcademicStaff.badge);
      setEditScope(currentAcademicStaff.responsibleScope);
      setIsQuickEditOpen(true);
    }
  };

  const handleSaveQuickEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (currentAcademicStaff && editName.trim()) {
      updateAcademicStaff(currentAcademicStaff.id, {
        name: editName.trim(),
        title: editTitle.trim() || currentAcademicStaff.title,
        phone: editPhone.trim() || currentAcademicStaff.phone,
        badge: editBadge.trim() || currentAcademicStaff.badge,
        responsibleScope: editScope.trim() || currentAcademicStaff.responsibleScope,
      });
      setIsQuickEditOpen(false);
    }
  };

  // Creation form states
  const [selectedDept, setSelectedDept] = useState<DepartmentType | '全部'>('全部');
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>(teachers[0]?.id || '');
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [requestType, setRequestType] = useState<RequestType>('substitute');
  const [leaveType, setLeaveType] = useState<LeaveType>('official');
  const [reason, setReason] = useState<string>('');

  // 歸屬月份：本月、7 天內可選上月，以及系統管理員指定的補登月份
  const thisMonth = new Date().getMonth() + 1;
  const today = new Date();
  const lastDayOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
  const diffDays = Math.floor((today.getTime() - lastDayOfLastMonth.getTime()) / 86400000);
  const canSelectLastMonth = diffDays <= 7;
  const lastMonth = thisMonth === 1 ? 12 : thisMonth - 1;
  const adminMonth = systemConfig.currentMonth;
  const canSelectAdminMonth =
    Boolean(adminMonth) &&
    adminMonth !== thisMonth &&
    !(canSelectLastMonth && adminMonth === lastMonth);
  const [dispatchMonth, setDispatchMonth] = useState<number>(thisMonth);
  const [autoApprove, setAutoApprove] = useState<boolean>(true);

  // Substitute specific
  const [substituteTeacherId, setSubstituteTeacherId] = useState<string>('');
  const [actingHomeroomTeacherId, setActingHomeroomTeacherId] = useState<string>('');
  const [hasUserChosenSubstituteTeacher, setHasUserChosenSubstituteTeacher] = useState(false);
  const [leaveDateMode, setLeaveDateMode] = useState<'single' | 'range'>('single');
  const [leaveDateStart, setLeaveDateStart] = useState<string>('');
  const [leaveDateEnd, setLeaveDateEnd] = useState<string>('');
  /** 單節｜同日連續節次（如第1～7節） */
  const [sessionPickMode, setSessionPickMode] = useState<'single' | 'periodRange'>('single');
  const [rangeDayOfWeek, setRangeDayOfWeek] = useState<DayOfWeek>(1);
  const [rangePeriodStart, setRangePeriodStart] = useState<number>(1);
  const [rangePeriodEnd, setRangePeriodEnd] = useState<number>(7);
  const [selectedSessionIds, setSelectedSessionIds] = useState<string[]>([]);

  /** 連續起迄多次派代時，共用同一 batchGroupId 以合併一張通知單 */
  const dispatchNoticeGroupIdRef = useRef<string | null>(null);

  useEffect(() => {
    dispatchNoticeGroupIdRef.current = null;
  }, [selectedTeacherId, leaveDateMode, leaveDateStart, leaveDateEnd]);

  // Reschedule specific（僅移入空堂）
  const [targetDay, setTargetDay] = useState<DayOfWeek>(1);
  const [targetPeriod, setTargetPeriod] = useState<number>(5);
  const [targetVenueId, setTargetVenueId] = useState<string>(venues[0]?.id || '');

  // Swap specific（同班對調：暫時／永久）
  const [swapTargetTeacherId, setSwapTargetTeacherId] = useState<string>('');
  const [swapTargetSessionId, setSwapTargetSessionId] = useState<string>('');
  const [swapMode, setSwapMode] = useState<'temporary' | 'permanent'>('temporary');
  const [swapEffectiveDate, setSwapEffectiveDate] = useState<string>('');

  // Batch selection states in list view
  const [selectedRequestIds, setSelectedRequestIds] = useState<string[]>([]);
  const [listFilter, setListFilter] = useState<'all' | 'pending' | 'public' | 'private' | 'practical'>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Filtered teachers based on dept
  const filteredTeachers = useMemo(() => {
    if (selectedDept === '全部') return teachers;
    return teachers.filter((t) => t.department === selectedDept);
  }, [teachers, selectedDept]);

  // Selected applicant teacher & their sessions
  const applicantTeacher = teachers.find((t) => t.id === selectedTeacherId) || teachers[0];
  const leaveFilterDays = useMemo(() => {
    if (requestType !== 'substitute' || !leaveDateStart) return [] as DayOfWeek[];
    return weekdaysInDateRange(
      leaveDateStart,
      leaveDateMode === 'range' ? leaveDateEnd || leaveDateStart : leaveDateStart
    );
  }, [requestType, leaveDateStart, leaveDateEnd, leaveDateMode]);
  const applicantSessions = useMemo(() => {
    if (!applicantTeacher) return [];
    const all = sessions.filter((s) => s.teacherId === applicantTeacher.id);
    const pool =
      leaveFilterDays.length === 0
        ? all
        : all.filter((s) => leaveFilterDays.includes(s.dayOfWeek));
    // 週一第1節起，依星期→節次排列至週五
    return [...pool].sort(
      (a, b) => a.dayOfWeek - b.dayOfWeek || a.period - b.period
    );
  }, [sessions, applicantTeacher, leaveFilterDays]);

  // 連續節次：同日、節次介於起迄之間的課堂
  const periodRangeSessions = useMemo(() => {
    const lo = Math.min(rangePeriodStart, rangePeriodEnd);
    const hi = Math.max(rangePeriodStart, rangePeriodEnd);
    return applicantSessions
      .filter((s) => s.dayOfWeek === rangeDayOfWeek && s.period >= lo && s.period <= hi)
      .sort((a, b) => a.period - b.period);
  }, [applicantSessions, rangeDayOfWeek, rangePeriodStart, rangePeriodEnd]);

  const batchSelectedSessions = useMemo(() => {
    if (sessionPickMode !== 'periodRange' || requestType !== 'substitute') return [];
    return periodRangeSessions.filter((s) => selectedSessionIds.includes(s.id));
  }, [sessionPickMode, requestType, periodRangeSessions, selectedSessionIds]);

  // Selected original session（單節模式；連續模式以第一筆為代表）
  const selectedOriginalSession =
    sessionPickMode === 'periodRange' && requestType === 'substitute'
      ? batchSelectedSessions[0] || periodRangeSessions[0]
      : applicantSessions.find((s) => s.id === selectedSessionId) || applicantSessions[0];

  // 同班可互調的其他教師（至少有一堂同班課）
  const swapPartnerTeachers = useMemo(() => {
    if (!selectedOriginalSession || !applicantTeacher) return [];
    const className = selectedOriginalSession.className;
    const ids = new Set(
      sessions
        .filter(
          (s) =>
            s.className === className &&
            s.teacherId !== applicantTeacher.id
        )
        .map((s) => s.teacherId)
    );
    return teachers.filter((t) => ids.has(t.id));
  }, [sessions, teachers, selectedOriginalSession, applicantTeacher]);

  const swapPartnerSessions = useMemo(() => {
    if (!selectedOriginalSession || !swapTargetTeacherId) return [];
    return sessions.filter(
      (s) =>
        s.teacherId === swapTargetTeacherId &&
        s.className === selectedOriginalSession.className &&
        s.id !== selectedOriginalSession.id
    );
  }, [sessions, selectedOriginalSession, swapTargetTeacherId]);

  // 進入互調或換申請課堂後，預設／校正同班對調對象
  React.useEffect(() => {
    if (requestType !== 'swap') return;
    if (swapPartnerTeachers.length === 0) {
      if (swapTargetTeacherId) setSwapTargetTeacherId('');
      if (swapTargetSessionId) setSwapTargetSessionId('');
      return;
    }
    const teacherOk = swapPartnerTeachers.some((t) => t.id === swapTargetTeacherId);
    const nextTeacherId = teacherOk ? swapTargetTeacherId : swapPartnerTeachers[0].id;
    if (nextTeacherId !== swapTargetTeacherId) {
      setSwapTargetTeacherId(nextTeacherId);
    }
    const partnerSessions = sessions.filter(
      (s) =>
        s.teacherId === nextTeacherId &&
        s.className === selectedOriginalSession?.className &&
        s.id !== selectedOriginalSession?.id
    );
    if (partnerSessions.length === 0) {
      if (swapTargetSessionId) setSwapTargetSessionId('');
      return;
    }
    if (!partnerSessions.some((s) => s.id === swapTargetSessionId)) {
      setSwapTargetSessionId(partnerSessions[0].id);
    }
  }, [
    requestType,
    swapPartnerTeachers,
    swapTargetTeacherId,
    swapTargetSessionId,
    sessions,
    selectedOriginalSession,
  ]);

  const availableRangeDays = useMemo(() => {
    const days = Array.from(
      new Set(applicantSessions.map((s) => s.dayOfWeek))
    ).sort((a, b) => Number(a) - Number(b)) as DayOfWeek[];
    return days.length > 0 ? days : ([1, 2, 3, 4, 5] as DayOfWeek[]);
  }, [applicantSessions]);

  // Smart matching candidate teachers when appointing a substitute
  const candidateSubstitutes = useMemo(() => {
    if (!selectedOriginalSession || !applicantTeacher) return [];

    const targetSessions =
      sessionPickMode === 'periodRange' && batchSelectedSessions.length > 0
        ? batchSelectedSessions
        : [selectedOriginalSession];

    return rankSubstituteCandidates({
      teachers,
      sessions,
      requests,
      excludeTeacherId: applicantTeacher.id,
      targetDayOfWeek: targetSessions[0].dayOfWeek,
      targetPeriod: targetSessions.map((s) => s.period),
      subjectName: targetSessions.map((s) => s.subjectName),
      applicantDepartment: applicantTeacher.department,
      maxWeeklyOverloadPeriods: systemConfig.maxWeeklyOverloadPeriods,
      leaveDateStart: leaveDateStart || undefined,
      leaveDateEnd:
        leaveDateMode === 'range'
          ? leaveDateEnd || leaveDateStart || undefined
          : leaveDateStart || undefined,
    });
  }, [
    teachers,
    applicantTeacher,
    selectedOriginalSession,
    sessions,
    requests,
    systemConfig,
    sessionPickMode,
    batchSelectedSessions,
    leaveDateStart,
    leaveDateEnd,
    leaveDateMode,
  ]);

  /** 導師請假日無授課課堂：僅需代導師，不必選原課堂／代課教師 */
  const canActingHomeroomOnly = Boolean(
    requestType === 'substitute' &&
      isHomeroomTeacher(applicantTeacher) &&
      leaveDateStart &&
      leaveFilterDays.length > 0 &&
      applicantSessions.length === 0
  );
  const substituteTeacherRequired = requiresSubstituteTeacherForLeave(leaveType, {
    actingHomeroomOnly: canActingHomeroomOnly,
  });

  // 課堂／候選變更時自動補人選：使用者已點選則不覆寫；僅空值或現人選衝堂時補最佳
  // 請假日無課（無可派代課堂）時清除殘留預選，避免「沒有原課堂卻有代課教師」
  React.useEffect(() => {
    if (requestType !== 'substitute') return;
    if (applicantSessions.length === 0) {
      if (substituteTeacherId) {
        setSubstituteTeacherId('');
        setHasUserChosenSubstituteTeacher(false);
      }
      return;
    }
    if (candidateSubstitutes.length === 0) return;
    if (hasUserChosenSubstituteTeacher) return;

    const selected = substituteTeacherId
      ? candidateSubstitutes.find((c) => c.teacher.id === substituteTeacherId)
      : undefined;

    if (!substituteTeacherId || selected?.hasClash) {
      const best =
        candidateSubstitutes.find((c) => !c.hasClash && c.isSameSubject) ||
        candidateSubstitutes.find((c) => !c.hasClash && c.isSameDept) ||
        candidateSubstitutes.find((c) => !c.hasClash);
      if (best) setSubstituteTeacherId(best.teacher.id);
    }
  }, [
    requestType,
    applicantSessions.length,
    substituteTeacherId,
    hasUserChosenSubstituteTeacher,
    candidateSubstitutes,
  ]);

  // 切換申請教師／單節選堂／模式時，允許重新智慧媒合（多選勾選變化不重置，避免覆寫人選）
  React.useEffect(() => {
    setHasUserChosenSubstituteTeacher(false);
  }, [selectedTeacherId, sessionPickMode, selectedSessionId, requestType]);

  // Auto-select first session if not set；篩選後無課則清空選堂
  React.useEffect(() => {
    if (applicantSessions.length === 0) {
      if (selectedSessionId) setSelectedSessionId('');
      return;
    }
    if (!selectedSessionId || !applicantSessions.some((s) => s.id === selectedSessionId)) {
      setSelectedSessionId(applicantSessions[0].id);
    }
  }, [applicantSessions, selectedSessionId]);

  // 請假日／篩選變更時，連續節次的「星期」自動對齊
  React.useEffect(() => {
    if (availableRangeDays.length === 0) return;
    if (!availableRangeDays.includes(rangeDayOfWeek)) {
      setRangeDayOfWeek(availableRangeDays[0]);
    }
  }, [availableRangeDays, rangeDayOfWeek]);

  // 連續節次：僅首次進入全選；之後只保留與範圍的交集（不整表覆寫）
  const prevSessionPickModeRef = React.useRef(sessionPickMode);
  React.useEffect(() => {
    if (sessionPickMode !== 'periodRange') {
      prevSessionPickModeRef.current = sessionPickMode;
      return;
    }
    const ids = periodRangeSessions.map((s) => s.id);
    const entering = prevSessionPickModeRef.current !== 'periodRange';
    prevSessionPickModeRef.current = sessionPickMode;
    setSelectedSessionIds((prev) => {
      if (entering) return ids;
      return prev.filter((id) => ids.includes(id));
    });
  }, [sessionPickMode, periodRangeSessions]);

  // 切換回單節／非派代時清掉多選
  React.useEffect(() => {
    if (requestType !== 'substitute') {
      setSessionPickMode('single');
    }
  }, [requestType]);

  // Auto-switch payment type default when leave type changes
  const handleLeaveTypeChange = (type: LeaveType) => {
    setLeaveType(type);
    setReason(defaultReasonForLeaveType(type));
  };

  const payrollCtx = useMemo(
    () => buildLeavePayrollContext(requests, systemConfig),
    [requests, systemConfig]
  );
  const holidaySet = useMemo(
    () => nonTeachingDateSet(systemConfig.nonTeachingDays),
    [systemConfig.nonTeachingDays]
  );
  const calendarBillableOpts = useMemo(
    () => ({
      temporaryMoves: systemConfig.temporaryScheduleMoves || [],
      partialStops: systemConfig.partialNonTeachingDays || [],
    }),
    [systemConfig.temporaryScheduleMoves, systemConfig.partialNonTeachingDays]
  );

  const dispatchSampleSession =
    sessionPickMode === 'periodRange' ? batchSelectedSessions[0] : selectedOriginalSession;

  const resolvedDispatchPayment = useMemo(() => {
    if (requestType !== 'substitute' || !applicantTeacher || !dispatchSampleSession) {
      return 'private' as PaymentType;
    }
    return resolvePaymentTypeForLeaveDraft(
      {
        leaveType,
        reason,
        leaveDateStart,
        leaveDateEnd:
          leaveDateMode === 'range'
            ? resolveLeaveDateEnd(leaveDateStart, leaveDateEnd)
            : leaveDateStart,
        originalSession: dispatchSampleSession,
        applicantTeacherId: applicantTeacher.id,
        requestType: 'substitute',
      },
      payrollCtx,
      holidaySet,
      { ...calendarBillableOpts, period: dispatchSampleSession.period }
    );
  }, [
    requestType,
    applicantTeacher,
    dispatchSampleSession,
    leaveType,
    reason,
    leaveDateStart,
    leaveDateEnd,
    leaveDateMode,
    payrollCtx,
    holidaySet,
    calendarBillableOpts,
  ]);

  const dispatchPaymentDisplay = leavePaymentDisplayLabel(
    resolvedDispatchPayment,
    leaveType,
    reason
  );

  const dispatchSessionsForWellness = useMemo(() => {
    if (requestType !== 'substitute') return [] as CourseSession[];
    if (sessionPickMode === 'periodRange') return batchSelectedSessions;
    if (selectedOriginalSession) return [selectedOriginalSession];
    return [];
  }, [requestType, sessionPickMode, batchSelectedSessions, selectedOriginalSession]);

  const wellnessHoursStatus = useMemo(() => {
    if (leaveType !== 'wellness' || !applicantTeacher || !leaveDateStart) return null;
    if (dispatchSessionsForWellness.length === 0) return null;
    const resolvedEnd =
      leaveDateMode === 'range'
        ? resolveLeaveDateEnd(leaveDateStart, leaveDateEnd)
        : leaveDateStart;
    return getWellnessLeaveHoursStatus(
      dispatchSessionsForWellness.map((originalSession) => ({
        leaveDateStart,
        leaveDateEnd: resolvedEnd,
        originalSession,
        applicantTeacherId: applicantTeacher.id,
      })),
      payrollCtx,
      holidaySet,
      calendarBillableOpts
    );
  }, [
    leaveType,
    applicantTeacher,
    leaveDateStart,
    leaveDateEnd,
    leaveDateMode,
    dispatchSessionsForWellness,
    payrollCtx,
    holidaySet,
    calendarBillableOpts,
  ]);

  const wellnessHoursExceeded = wellnessHoursStatus?.exceeded === true;

  const requestPaymentCounts = useMemo(() => {
    const ctx = buildLeavePayrollContext(requests, systemConfig, {
      countStatuses: ['approved', 'pending'],
    });
    const hs = nonTeachingDateSet(systemConfig.nonTeachingDays);
    const opts = {
      temporaryMoves: systemConfig.temporaryScheduleMoves || [],
      partialStops: systemConfig.partialNonTeachingDays || [],
    };
    let publicCount = 0;
    let privateCount = 0;
    for (const r of requests) {
      if (r.requestType !== 'substitute') continue;
      const resolved = resolveRequestPaymentType(r, ctx, hs, {
        ...opts,
        period: resolveOriginalSession(r, sessions)?.period,
      });
      if (resolved === 'public') publicCount += 1;
      else privateCount += 1;
    }
    return { public: publicCount, private: privateCount };
  }, [requests, systemConfig, sessions]);

  const editWellnessExcludeIds = useMemo(() => {
    if (!editingRequest) return [] as string[];
    if (editingRequest.batchGroupId) {
      return requests
        .filter((r) => r.batchGroupId === editingRequest.batchGroupId)
        .map((r) => r.id);
    }
    return [editingRequest.id];
  }, [editingRequest, requests]);

  const editWellnessHoursStatus = useMemo(() => {
    if (!editingRequest || editLeaveType !== 'wellness' || !editLeaveDateStart) return null;
    const resolvedEnd =
      editLeaveDateMode === 'range'
        ? resolveLeaveDateEnd(editLeaveDateStart, editLeaveDateEnd)
        : editLeaveDateStart;
    const orig = resolveOriginalSession(editingRequest, sessions);
    if (!orig) return null;
    return getWellnessLeaveHoursStatus(
      [
        {
          leaveDateStart: editLeaveDateStart,
          leaveDateEnd: resolvedEnd,
          originalSession: orig,
          applicantTeacherId: editingRequest.applicantTeacherId,
        },
      ],
      buildLeavePayrollContext(requests, systemConfig, {
        excludeRequestIds: editWellnessExcludeIds,
      }),
      nonTeachingDateSet(systemConfig.nonTeachingDays),
      {
        temporaryMoves: systemConfig.temporaryScheduleMoves || [],
        partialStops: systemConfig.partialNonTeachingDays || [],
        period: orig.period,
      }
    );
  }, [
    editingRequest,
    editLeaveType,
    editLeaveDateStart,
    editLeaveDateEnd,
    editLeaveDateMode,
    editWellnessExcludeIds,
    requests,
    systemConfig,
    sessions,
  ]);

  // Preview clash check（連續節次：逐節檢核後合併）
  const clashPreview = useMemo(() => {
    const empty = { hasClash: false, severity: 'none' as const, messages: [] as string[] };
    if (!applicantTeacher) return empty;

    const sessionsToCheck =
      requestType === 'substitute' && sessionPickMode === 'periodRange'
        ? batchSelectedSessions
        : selectedOriginalSession
        ? [selectedOriginalSession]
        : [];

    if (sessionsToCheck.length === 0) return empty;

    const swapPartnerSession = sessions.find((s) => s.id === swapTargetSessionId);
    const results = sessionsToCheck.map((originalSession) => {
      const result = checkClashes({
        requestType,
        applicantTeacherId: applicantTeacher.id,
        originalSession,
        targetReschedule:
          requestType === 'reschedule'
            ? {
                dayOfWeek: targetDay,
                period: targetPeriod,
                venueId: targetVenueId,
              }
            : undefined,
        swapTargetTeacherId: requestType === 'swap' ? swapTargetTeacherId : undefined,
        swapTargetSession: requestType === 'swap' ? swapPartnerSession : undefined,
        substituteTeacherId: requestType === 'substitute' ? substituteTeacherId : undefined,
        actingHomeroomTeacherId:
          requestType === 'substitute' ? actingHomeroomTeacherId || undefined : undefined,
        leaveType: requestType === 'substitute' ? leaveType : undefined,
        leaveDateStart:
          requestType === 'substitute'
            ? leaveDateStart || undefined
            : requestType === 'swap' && swapMode === 'temporary' && swapEffectiveDate
              ? swapEffectiveDate
              : undefined,
        leaveDateEnd:
          requestType === 'substitute'
            ? leaveDateMode === 'range'
              ? leaveDateEnd || leaveDateStart || undefined
              : leaveDateStart || undefined
            : requestType === 'swap' && swapMode === 'temporary' && swapEffectiveDate
              ? swapEffectiveDate
              : undefined,
      });
      const prefix =
        sessionsToCheck.length > 1 ? `第${originalSession.period}節：` : '';
      return {
        ...result,
        messages: result.messages.map((m) => `${prefix}${m}`),
      };
    });

    const messages = results.flatMap((r) => r.messages);
    const hasClash = results.some((r) => r.hasClash);
    const severity = results.some((r) => r.severity === 'danger')
      ? ('danger' as const)
      : results.some((r) => r.severity === 'warning')
      ? ('warning' as const)
      : ('none' as const);

    return { hasClash, severity, messages };
  }, [
    checkClashes,
    requestType,
    applicantTeacher,
    selectedOriginalSession,
    batchSelectedSessions,
    sessionPickMode,
    targetDay,
    targetPeriod,
    targetVenueId,
    swapTargetTeacherId,
    swapTargetSessionId,
    substituteTeacherId,
    actingHomeroomTeacherId,
    sessions,
    leaveDateStart,
    leaveDateEnd,
    leaveDateMode,
    swapMode,
    swapEffectiveDate,
  ]);

  /** 導師當日無排課：建立僅供代導師清冊用的佔位課堂 */
  const buildActingHomeroomOnlySession = (
    teacher: Teacher,
    leaveStart: string
  ): CourseSession | null => {
    const dow = dateToDayOfWeek(leaveStart);
    if (dow === null) return null;
    const className = teacher.homeroomClass?.trim() || '導師班';
    return {
      id: `s-placeholder-acting-${teacher.id}-${leaveStart}`,
      dayOfWeek: dow,
      period: 1,
      className,
      subjectName: '代導師代理（當日無排課）',
      teacherId: teacher.id,
      teacherName: teacher.name,
      venueId: '',
      venueName: '',
      isPractical: false,
      notes: '僅代導師派代，當日無授課課堂',
    };
  };

  // Handle direct dispatch submission
  const handleSubmitDispatch = (e: React.FormEvent) => {
    e.preventDefault();

    const actingHomeroomOnly =
      requestType === 'substitute' &&
      canActingHomeroomOnly &&
      Boolean(actingHomeroomTeacherId);

    let sessionsToDispatch =
      requestType === 'substitute' && sessionPickMode === 'periodRange'
        ? batchSelectedSessions
        : selectedOriginalSession
        ? [selectedOriginalSession]
        : [];

    if (sessionsToDispatch.length === 0 && actingHomeroomOnly && applicantTeacher) {
      const placeholder = buildActingHomeroomOnlySession(applicantTeacher, leaveDateStart);
      if (!placeholder) {
        alert('請假開始日須為週一至週五。');
        return;
      }
      sessionsToDispatch = [placeholder];
    }

    if (sessionsToDispatch.length === 0) {
      alert(
        requestType === 'substitute' && canActingHomeroomOnly
          ? '該請假日無授課課堂。請指定代導師後送出（僅辦理代導師，無須選原課堂／代課教師）。'
          : requestType === 'substitute' && sessionPickMode === 'periodRange'
            ? '請先設定連續節次範圍，並確認該範圍內有可派代課堂！'
            : '請先選擇欲辦理調代課之原課堂！'
      );
      return;
    }

    if (requestType === 'substitute') {
      if (!substituteTeacherRequired && !substituteTeacherId) {
        // 僅代導師：無須代課教師
      } else if (substituteTeacherRequired && !substituteTeacherId) {
        alert('請假派代須指定代課教師。');
        return;
      }
      // 當日無課、僅辦代導師時才必填；有課（例如僅請上午）可不指定代導師
      if (actingHomeroomOnly && !actingHomeroomTeacherId) {
        alert('該請假日無授課課堂。若僅辦理代導師，請指定代導師後再送出。');
        return;
      }
      const leaveCheck = validateSubstituteLeaveInput({
        leaveDateMode,
        leaveDateStart,
        leaveDateEnd,
        sessions: sessionsToDispatch,
        existing: requests,
        applicantTeacherId: applicantTeacher.id,
        dayNames,
        nonTeachingDates: nonTeachingDateSet(systemConfig.nonTeachingDays),
        temporaryMoves: systemConfig.temporaryScheduleMoves || [],
        partialStops: systemConfig.partialNonTeachingDays || [],
      });
      if (leaveCheck.ok === false) {
        alert(leaveCheck.message);
        return;
      }
      if (leaveType === 'wellness') {
        const resolvedEnd =
          leaveDateMode === 'range'
            ? resolveLeaveDateEnd(leaveDateStart, leaveDateEnd)
            : leaveDateStart;
        const wellnessCheck = validateWellnessLeaveHoursForDrafts(
          sessionsToDispatch.map((originalSession) => ({
            leaveDateStart,
            leaveDateEnd: resolvedEnd,
            originalSession,
            applicantTeacherId: applicantTeacher.id,
          })),
          payrollCtx,
          holidaySet,
          calendarBillableOpts
        );
        if (wellnessCheck.ok === false) {
          alert(wellnessCheck.message);
          return;
        }
      }
    }

    if (requestType === 'reschedule') {
      if (venues.length === 0) {
        alert('尚未維護實習工場／教室清單，無法送出移課。請先至系統參數新增場地。');
        return;
      }
      if (!targetVenueId) {
        alert('請選擇移課目標工場／教室。');
        return;
      }
      if (!venues.some((v) => v.id === targetVenueId)) {
        alert('所選移課場地無效或不存在，請重新選擇目標工場／教室。');
        return;
      }
    }

    if (requestType === 'swap') {
      if (!swapTargetTeacherId || !swapTargetSessionId) {
        alert('請完整選擇對調教師與對調課堂');
        return;
      }
      const swapSessionForDate = sessions.find((s) => s.id === swapTargetSessionId);
      const origForDate = sessionsToDispatch[0];
      if (swapMode === 'temporary' && origForDate && swapSessionForDate) {
        const dateErr = validateTemporarySwapEffectiveDate(
          swapEffectiveDate,
          origForDate.dayOfWeek,
          swapSessionForDate.dayOfWeek,
          nonTeachingDateSet(systemConfig.nonTeachingDays)
        );
        if (dateErr) {
          alert(dateErr);
          return;
        }
      }
    }

    // 送出前再逐節衝堂（防預覽與送出之間狀態變化）；僅代導師無代課時略過
    const swapPartnerSession = sessions.find((s) => s.id === swapTargetSessionId);
    if (!(requestType === 'substitute' && actingHomeroomOnly)) {
      for (const originalSession of sessionsToDispatch) {
        const clash = checkClashes({
          requestType,
          applicantTeacherId: applicantTeacher.id,
          originalSession,
          targetReschedule:
            requestType === 'reschedule'
              ? {
                  dayOfWeek: targetDay,
                  period: targetPeriod,
                  venueId: targetVenueId,
                }
              : undefined,
          swapTargetTeacherId: requestType === 'swap' ? swapTargetTeacherId : undefined,
          swapTargetSession: requestType === 'swap' ? swapPartnerSession : undefined,
          substituteTeacherId:
            requestType === 'substitute' && substituteTeacherId
              ? substituteTeacherId
              : undefined,
          actingHomeroomTeacherId:
            requestType === 'substitute' ? actingHomeroomTeacherId || undefined : undefined,
          leaveDateStart:
            requestType === 'substitute'
              ? leaveDateStart || undefined
              : requestType === 'swap' && swapMode === 'temporary' && swapEffectiveDate
                ? swapEffectiveDate
                : undefined,
          leaveDateEnd:
            requestType === 'substitute'
              ? leaveDateMode === 'range'
                ? leaveDateEnd || leaveDateStart || undefined
                : leaveDateStart || undefined
              : requestType === 'swap' && swapMode === 'temporary' && swapEffectiveDate
                ? swapEffectiveDate
                : undefined,
        });
        if (clash.hasClash) {
          alert(
            `第${originalSession.period}節存在衝堂，無法送出：\n${clash.messages.join('\n')}`
          );
          return;
        }
      }
    }

    const subTeacher = teachers.find((t) => t.id === substituteTeacherId);
    const actingHomeroomTeacher = teachers.find((t) => t.id === actingHomeroomTeacherId);
    const swapTeacher = teachers.find((t) => t.id === swapTargetTeacherId);
    const swapSession = sessions.find((s) => s.id === swapTargetSessionId);
    const targetVenue = venues.find((v) => v.id === targetVenueId);
    const resolvedLeaveEnd =
      requestType === 'substitute'
        ? leaveDateMode === 'range'
          ? resolveLeaveDateEnd(leaveDateStart, leaveDateEnd)
          : leaveDateStart
        : undefined;

    let batchGroupId: string | undefined;
    if (requestType === 'substitute') {
      if (leaveDateMode === 'range' || sessionsToDispatch.length > 1) {
        if (!dispatchNoticeGroupIdRef.current) {
          dispatchNoticeGroupIdRef.current = `batch-${Date.now()}`;
        }
        batchGroupId = dispatchNoticeGroupIdRef.current;
      }
    }

    let created;
    try {
      const batchStamp = Date.now();
      created = createStaffDirectDispatches(
        sessionsToDispatch.map((originalSession) => ({
          requestType,
          applicantTeacherId: applicantTeacher.id,
          applicantTeacherName: applicantTeacher.name,
          applicantDepartment: applicantTeacher.department,
          leaveType,
          leaveDateStart: requestType === 'substitute' ? leaveDateStart : undefined,
          leaveDateEnd: requestType === 'substitute' ? resolvedLeaveEnd : undefined,
          paymentType: resolvedDispatchPayment,
          reason,
          originalSession,
          substituteTeacherId:
            requestType === 'substitute' && substituteTeacherId
              ? substituteTeacherId
              : undefined,
          substituteTeacherName:
            requestType === 'substitute' && substituteTeacherId
              ? subTeacher?.name
              : undefined,
          actingHomeroomTeacherId:
            requestType === 'substitute' && isHomeroomTeacher(applicantTeacher)
              ? actingHomeroomTeacherId || undefined
              : undefined,
          actingHomeroomTeacherName:
            requestType === 'substitute' && isHomeroomTeacher(applicantTeacher)
              ? actingHomeroomTeacher?.name
              : undefined,
          batchGroupId,
          targetReschedule:
            requestType === 'reschedule' && targetVenue
              ? {
                  dayOfWeek: targetDay,
                  period: targetPeriod,
                  venueId: targetVenue.id,
                  venueName: targetVenue.name,
                }
              : undefined,
          swapTargetTeacherId: requestType === 'swap' ? swapTargetTeacherId : undefined,
          swapTargetTeacherName: requestType === 'swap' ? swapTeacher?.name : undefined,
          swapTargetSession: requestType === 'swap' ? swapSession : undefined,
          swapMode: requestType === 'swap' ? swapMode : undefined,
          effectiveDate:
            requestType === 'swap' && swapMode === 'temporary' ? swapEffectiveDate : undefined,
          autoApprove,
        })),
        dispatchMonth,
        { idNoncePrefix: String(batchStamp) }
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : '派代失敗，請檢查資料後重試。');
      return;
    }

    const first = created[0];
    const mergedNoticeHint =
      batchGroupId && leaveDateMode === 'range'
        ? '（與同批連續起迄派代合併一張通知單，可繼續選其他課堂）'
        : batchGroupId
          ? '（連續節次合併一張通知單）'
          : '';
    setSuccessToast(
      created.length > 1
        ? `已批次登錄 ${created.length} 筆派代（${first.requestNumber} 起）${
            autoApprove ? '並立即核定生效' : '並進入簽核清冊'
          }${mergedNoticeHint}！`
        : `【${first.requestNumber}】調代課已成功由教學組登錄${
            autoApprove ? '並立即核定生效' : '並進入簽核清冊'
          }${mergedNoticeHint}！`
    );
    setTimeout(() => setSuccessToast(null), 4000);

    if (requestType === 'substitute') {
      setSelectedSessionId('');
      setSelectedSessionIds([]);
      if (!actingHomeroomOnly) {
        setSubstituteTeacherId('');
        setHasUserChosenSubstituteTeacher(false);
      }
    }
  };

  const resolvedRequests = useMemo(
    () => requests.map((r) => ({ ...r, originalSession: resolveOriginalSession(r, sessions) })),
    [requests, sessions]
  );

  // Filtered requests in list view
  const filteredRequests = useMemo(() => {
    const listPayrollCtx = buildLeavePayrollContext(requests, systemConfig, {
      countStatuses: ['approved', 'pending'],
    });
    const listHolidaySet = nonTeachingDateSet(systemConfig.nonTeachingDays);
    const listCalendarOpts = {
      temporaryMoves: systemConfig.temporaryScheduleMoves || [],
      partialStops: systemConfig.partialNonTeachingDays || [],
    };
    return resolvedRequests
      .map((r) => ({
        ...r,
        resolvedPayment:
          r.requestType === 'substitute'
            ? resolveRequestPaymentType(r, listPayrollCtx, listHolidaySet, {
                ...listCalendarOpts,
                period: r.originalSession?.period,
              })
            : r.paymentType,
      }))
      .filter((r) => {
      // Filter tab
      if (listFilter === 'pending' && r.status !== 'pending') return false;
      if (listFilter === 'public' && r.resolvedPayment !== 'public') return false;
      if (listFilter === 'private' && r.resolvedPayment !== 'private') return false;
      if (listFilter === 'practical' && !isPracticalSession(r.originalSession)) return false;

      // Search term
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matchName = (r.applicantTeacherName || '').toLowerCase().includes(term);
        const matchSub = (r.substituteTeacherName || '').toLowerCase().includes(term);
        const matchActing = (r.actingHomeroomTeacherName || '').toLowerCase().includes(term);
        const matchClass = (r.originalSession?.className || '').toLowerCase().includes(term);
        const matchSubject = (r.originalSession?.subjectName || '').toLowerCase().includes(term);
        const matchNum = (r.requestNumber || '').toLowerCase().includes(term);
        if (!matchName && !matchSub && !matchActing && !matchClass && !matchSubject && !matchNum) return false;
      }

      return true;
    });
  }, [resolvedRequests, listFilter, searchTerm, requests, systemConfig]);

  // Handle batch approval
  const handleBatchApprove = () => {
    if (selectedRequestIds.length === 0) return;
    const academicStaff =
      (currentAcademicStaff && (currentAcademicStaff.group || 'academic') === 'academic'
        ? currentAcademicStaff
        : undefined) ||
      academicStaffList.find((s) => (s.group || 'academic') === 'academic');
    const reviewer = `${academicStaff?.name || '陳雅筑'} (${academicStaff?.title || '教學組'})`;
    const count = batchApproveRequests(selectedRequestIds, reviewer);
    setSelectedRequestIds([]);
    setSuccessToast(`已成功批次核准 ${count} 筆調代課案件！`);
    setTimeout(() => setSuccessToast(null), 3000);
  };

  // Handle toggle select all
  const handleToggleSelectAll = () => {
    const pendingIds = filteredRequests.filter((r) => r.status === 'pending').map((r) => r.id);
    if (selectedRequestIds.length === pendingIds.length && pendingIds.length > 0) {
      setSelectedRequestIds([]);
    } else {
      setSelectedRequestIds(pendingIds);
    }
  };

  const dayNames = ['', '週一', '週二', '週三', '週四', '週五'];

  return (
    <div className="space-y-6">
      
      {/* Toast Notification */}
      {successToast && (
        <div className="bg-emerald-600 text-white px-5 py-3 rounded-2xl shadow-lg flex items-center justify-between text-xs sm:text-sm font-bold animate-fade-in">
          <div className="flex items-center space-x-2">
            <CheckCircle className="w-5 h-5 text-amber-300" />
            <span>{successToast}</span>
          </div>
          <button onClick={() => setSuccessToast(null)} className="text-white/80 hover:text-white">
            ✕
          </button>
        </div>
      )}

      {/* Staff Identity Switcher & Profile Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          
          <div className="flex items-center space-x-3.5">
            <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${currentAcademicStaff?.avatarBg || 'from-indigo-600 to-indigo-800'} text-white flex items-center justify-center font-black text-xl shadow-sm`}>
              {currentAcademicStaff?.name.slice(0, 1) || '教'}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-1.5">
                  <UserCheck className="w-5 h-5 text-indigo-600" />
                  <span>教學組經辦作業工作台</span>
                </h2>
                <span className="px-2.5 py-0.5 bg-indigo-100 text-indigo-800 border border-indigo-200 text-xs font-bold rounded-full">
                  {currentAcademicStaff?.title}
                </span>
                <span className="px-2 py-0.5 bg-amber-50 text-amber-900 border border-amber-200 text-[11px] font-semibold rounded-md hidden sm:inline-block">
                  {currentAcademicStaff?.badge}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                經辦人職責範圍：<strong className="text-slate-700">{currentAcademicStaff?.responsibleScope}</strong>
              </p>
            </div>
          </div>

          {/* Academic Staff Identity Switcher Dropdown */}
          <div className="flex items-center space-x-2 bg-slate-50 p-2 rounded-xl border border-slate-200 text-xs">
            <span className="text-slate-500 font-semibold flex items-center gap-1">
              <BadgeCheck className="w-3.5 h-3.5 text-amber-500" />
              經辦簽章身分：
            </span>
            <select
              id="select-academic-staff-identity"
              value={currentAcademicStaffId}
              onChange={(e) => setCurrentAcademicStaffId(e.target.value)}
              className="bg-white text-slate-800 font-bold px-3 py-1 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              {academicStaffList
                .filter((staff) => (staff.group || 'academic') === 'academic')
                .map((staff) => (
                  <option key={staff.id} value={staff.id}>
                    {staff.name} ({staff.title} · {staff.phone})
                  </option>
                ))}
            </select>
            <button
              onClick={handleOpenQuickEdit}
              className="flex items-center space-x-1 px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 rounded-lg border border-slate-200 font-semibold transition"
              title="快速修正組員姓名與職稱"
            >
              <Edit2 className="w-3 h-3 text-indigo-600" />
              <span>修改姓名</span>
            </button>
          </div>
        </div>

        {/* Quick Edit Current Academic Staff Modal */}
        {isQuickEditOpen && currentAcademicStaff && (
          <ModalShell
            scroll="panel"
            backdropClassName="bg-slate-900/60 backdrop-blur-xs"
            panelClassName="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200"
          >
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center space-x-2">
                  <UserCheck className="w-5 h-5 text-indigo-600" />
                  <h3 className="font-bold text-sm text-slate-900">修正教學組組員 / 經辦姓名資料</h3>
                </div>
                <button
                  onClick={() => setIsQuickEditOpen(false)}
                  className="text-slate-400 hover:text-slate-600 p-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveQuickEdit} className="space-y-3.5 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">組員 / 經辦人員姓名</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 font-bold text-sm text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    placeholder="請輸入姓名"
                    required
                    autoFocus
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">公務職稱</label>
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 font-medium"
                      placeholder="如：教學組長、幹事"
                      required
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">公務分機</label>
                    <input
                      type="text"
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 font-medium"
                      placeholder="如：分機 211"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">經辦標籤徽章</label>
                  <input
                    type="text"
                    value={editBadge}
                    onChange={(e) => setEditBadge(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 font-medium"
                    placeholder="如：經辦 · 實習調代課"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-slate-700">專責工作內容 / 職責執掌說明</label>
                    <span className="text-[10px] text-indigo-600 font-medium">可任意填寫修正</span>
                  </div>
                  <div className="flex flex-wrap gap-1 mb-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditTitle('教學組長 (一人兼辦)');
                        setEditBadge('一人統籌 · 全組業務全權經辦');
                        setEditScope('全權統籌全校專業群科實習調代課、突發病假與公差派代、課表維護與主計鐘點費核銷');
                      }}
                      className="px-2 py-0.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded border border-indigo-200 text-[10px] transition"
                    >
                      🌟 一人統籌全組業務
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditBadge('經辦 · 實習工場專責');
                        setEditScope('全校各科專業群科工場實習調代課經辦、檢定移課與設備安全巡查');
                      }}
                      className="px-2 py-0.5 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded border border-amber-200 text-[10px] transition"
                    >
                      ⚡ 實習工場專責
                    </button>
                  </div>
                  <textarea
                    value={editScope}
                    onChange={(e) => setEditScope(e.target.value)}
                    rows={2}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 font-medium"
                    placeholder="如：全校各科專業實習調代課經辦、突發病假與公差派代..."
                  />
                </div>

                <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsQuickEditOpen(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold transition"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition shadow-xs"
                  >
                    儲存修正
                  </button>
                </div>
              </form>
            </div>
          </ModalShell>
        )}

        {/* Sub Navigation Switcher */}
        <div className="flex items-center space-x-2 border-t border-slate-100 pt-3">
          <button
            onClick={() => setActiveSubView('create')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition ${
              activeSubView === 'create'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Plus className="w-4 h-4" />
            <span>教學組代為經辦 · 快速派代與調課</span>
          </button>

          <button
            onClick={() => setActiveSubView('list')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition ${
              activeSubView === 'list'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>全校調代課登錄簿與公假代課清冊</span>
            <span className="px-1.5 py-0.2 bg-amber-500 text-slate-950 rounded-full text-[10px] font-black">
              {requests.length}
            </span>
          </button>
        </div>
      </div>

      {/* Sub View 1: Direct Dispatch Form (教學組代為發起 / 快速派代) */}
      {activeSubView === 'create' && (
        <form onSubmit={handleSubmitDispatch} className="space-y-6">
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Left 2 Cols: Main Setup */}
            <div className="lg:col-span-2 space-y-6">
              
              {/* Step 1: Request Type & Reason Configuration */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
                    <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center font-bold">1</span>
                    <span>設定調代課類型與請假事由 (差假公費派代依據)</span>
                  </h3>
                  <span className="text-xs text-indigo-600 font-semibold bg-indigo-50 px-2.5 py-1 rounded-full">
                    經辦人：{currentAcademicStaff?.name}
                  </span>
                </div>

                {/* Request Type Selector */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { key: 'substitute', label: '👤 差假派代', desc: '公假公差、研習、事病假指定代課' },
                    { key: 'reschedule', label: '⏱️ 行政移課', desc: '移入空堂（目標須空）；同班對調請用下方' },
                    { key: 'swap', label: '🔄 同班對調', desc: '可選暫時（選日）或永久（改週課表）' },
                  ].map((t) => (
                    <button
                      type="button"
                      key={t.key}
                      onClick={() => setRequestType(t.key as RequestType)}
                      className={`p-3 rounded-xl text-left border transition ${
                        requestType === t.key
                          ? 'border-indigo-600 bg-indigo-50/70 ring-2 ring-indigo-500/20'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div className="font-bold text-xs sm:text-sm text-slate-900">{t.label}</div>
                      <div className="text-[11px] text-slate-500 mt-1 leading-snug">{t.desc}</div>
                    </button>
                  ))}
                </div>

                {/* If substitute: Leave Type & Payment Type */}
                {requestType === 'substitute' && (
                  <div className="space-y-4 pt-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1.5">
                          差假類型 (系統自動判定公/自費)：
                        </label>
                        <select
                          value={leaveType}
                          onChange={(e) => handleLeaveTypeChange(e.target.value as LeaveType)}
                          className="w-full text-xs sm:text-sm p-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500"
                        >
                          {LEAVE_TYPE_FORM_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                        {leaveType === 'wellness' && (
                          <WellnessLeaveHoursAlert
                            status={wellnessHoursStatus}
                            showUsage={
                              Boolean(leaveDateStart && dispatchSessionsForWellness.length > 0)
                            }
                          />
                        )}
                        {leaveType === 'personal' && (
                          <p className="mt-1.5 text-[10px] text-amber-900 leading-snug bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
                            {PERSONAL_LEAVE_POLICY_NOTE}
                          </p>
                        )}
                        {leaveType === 'sick' && (
                          <p className="mt-1.5 text-[10px] text-amber-900 leading-snug bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
                            {SICK_LEAVE_POLICY_NOTE}
                          </p>
                        )}
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1.5">
                          鐘點費支給判定（依對照表自動）：
                        </label>
                        <div className="p-2.5 rounded-xl border bg-white text-xs sm:text-sm">
                          <span
                            className={`font-bold ${
                              dispatchPaymentDisplay.kind === 'public'
                                ? 'text-blue-700'
                                : 'text-amber-800'
                            }`}
                          >
                            {dispatchPaymentDisplay.kind === 'public' ? '🏛️ ' : '👤 '}
                            {dispatchPaymentDisplay.label}
                          </span>
                          <p className="text-[10px] text-slate-600 mt-1 leading-snug">
                            {dispatchPaymentDisplay.detail}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        請假日期：
                      </label>
                      <div className="flex gap-2 mb-2">
                        <button
                          type="button"
                          onClick={() => {
                            setLeaveDateMode('single');
                            setLeaveDateEnd('');
                          }}
                          className={`flex-1 px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
                            leaveDateMode === 'single'
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'bg-white text-slate-600 border-slate-300'
                          }`}
                        >
                          單日
                        </button>
                        <button
                          type="button"
                          onClick={() => setLeaveDateMode('range')}
                          className={`flex-1 px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
                            leaveDateMode === 'range'
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'bg-white text-slate-600 border-slate-300'
                          }`}
                        >
                          起迄
                        </button>
                      </div>
                      <div className={`grid gap-3 ${leaveDateMode === 'range' ? 'grid-cols-2' : 'grid-cols-1'}`}>
                        <div>
                          <label className="block text-[10px] text-slate-500 mb-0.5">
                            {leaveDateMode === 'range' ? '開始日' : '請假日'}
                          </label>
                          <input
                            type="date"
                            required
                            value={leaveDateStart}
                            onChange={(e) => setLeaveDateStart(e.target.value)}
                            className="w-full text-xs sm:text-sm p-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>
                        {leaveDateMode === 'range' && (
                          <div>
                            <label className="block text-[10px] text-slate-500 mb-0.5">結束日</label>
                            <input
                              type="date"
                              required
                              value={leaveDateEnd}
                              min={leaveDateStart || undefined}
                              onChange={(e) => setLeaveDateEnd(e.target.value)}
                              className="w-full text-xs sm:text-sm p-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500"
                            />
                          </div>
                        )}
                      </div>
                      {leaveDateMode === 'range' && leaveDateStart && leaveDateEnd && leaveDateEnd >= leaveDateStart && (
                        <p className="mt-1.5 text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5">
                          連續起迄模式下，每次派代後仍留在此頁；同老師、同起迄區間內多次派代會合併為一張通知單（超過 7 列自動分頁）。
                        </p>
                      )}
                      {selectedOriginalSession && leaveFilterDays.length === 0 && (
                        <p className="mt-1.5 text-[11px] text-slate-500">
                          {leaveDateMode === 'single'
                            ? `請假日須為「${dayNames[selectedOriginalSession.dayOfWeek]}」，對應所選課堂。`
                            : `將涵蓋區間內所有「${dayNames[selectedOriginalSession.dayOfWeek]} 第${selectedOriginalSession.period}節」。`}
                        </p>
                      )}
                      {leaveFilterDays.length > 0 && (
                        <p className="mt-1.5 text-[11px] text-indigo-700 font-medium">
                          已依請假起迄篩選，下方課堂僅顯示「{formatWeekdayList(leaveFilterDays, dayNames)}」
                          {leaveDateMode === 'range' &&
                          leaveDateStart &&
                          leaveDateEnd &&
                          leaveDateEnd >= leaveDateStart &&
                          selectedOriginalSession
                            ? `（所選節次在區間約 ${countMatchingWeekdays(leaveDateStart, leaveDateEnd, selectedOriginalSession.dayOfWeek, nonTeachingDateSet(systemConfig.nonTeachingDays))} 次，已扣除放假日）`
                            : ''}
                          。
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Reason Text */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    具體事由與公文號碼：
                  </label>
                  <input
                    type="text"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="請輸入事由（例：代表學校參加全國技能競賽指導研習，公文號 114-08992）"
                    className="w-full text-xs sm:text-sm p-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {/* 歸屬結算月份 */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">歸屬結算月份：</label>
                  <select
                    value={dispatchMonth}
                    onChange={(e) => setDispatchMonth(Number(e.target.value))}
                    className="bg-white border border-slate-300 rounded-xl p-2.5 text-xs sm:text-sm font-bold focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  >
                    <option value={thisMonth}>{thisMonth} 月（本月）</option>
                    {canSelectLastMonth && (
                      <option value={lastMonth}>{lastMonth} 月（補登上週跨月）</option>
                    )}
                    {canSelectAdminMonth && (
                      <option value={adminMonth}>{adminMonth} 月（管理員指定補登）</option>
                    )}
                  </select>
                </div>
              </div>

              {/* Step 2: Select Teacher & Course Session */}
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
                    <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center font-bold">2</span>
                    <span>選擇原授課教師與受影響之課堂</span>
                  </h3>
                  
                  {/* Department Filter for Teachers */}
                  <div className="flex items-center space-x-1 text-xs">
                    <span className="text-slate-500 font-semibold">篩選科別：</span>
                    <select
                      value={selectedDept}
                      onChange={(e) => {
                        const val = e.target.value as any;
                        setSelectedDept(val);
                        const list = val === '全部' ? teachers : teachers.filter(t => t.department === val);
                        if (list[0]) setSelectedTeacherId(list[0].id);
                      }}
                      className="bg-slate-100 text-slate-800 font-medium px-2 py-1 rounded border border-slate-300 text-xs"
                    >
                      <option value="全部">全部科別</option>
                      {SCHOOL_DEPARTMENTS.map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Teacher Selector：下拉＋輸入搜尋 */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    原授課教師：
                  </label>
                  <TeacherSearchCombobox
                    teachers={
                      filteredTeachers.some((t) => t.id === selectedTeacherId)
                        ? filteredTeachers
                        : [
                            ...(teachers.find((t) => t.id === selectedTeacherId)
                              ? [teachers.find((t) => t.id === selectedTeacherId)!]
                              : []),
                            ...filteredTeachers,
                          ]
                    }
                    currentTeacherId={selectedTeacherId}
                    onSelectTeacher={setSelectedTeacherId}
                    placeholder="輸入姓名／科別搜尋，或點下拉選擇…"
                    variant="light"
                    fullWidth
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    可直接輸入姓名搜尋，或點右側箭頭從清單選擇。
                  </p>
                </div>

                {/* Sessions Grid */}
                <div>
                  {requestType === 'substitute' && (
                    <div className="mb-3">
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        課堂選取方式：
                      </label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setSessionPickMode('single')}
                          className={`flex-1 px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
                            sessionPickMode === 'single'
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'bg-white text-slate-600 border-slate-300'
                          }`}
                        >
                          單節派代
                        </button>
                        <button
                          type="button"
                          onClick={() => setSessionPickMode('periodRange')}
                          className={`flex-1 px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
                            sessionPickMode === 'periodRange'
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'bg-white text-slate-600 border-slate-300'
                          }`}
                        >
                          連續節次（如第1～7節）
                        </button>
                      </div>
                    </div>
                  )}

                  {requestType === 'substitute' && sessionPickMode === 'periodRange' && (
                    <div className="mb-3 p-3 bg-indigo-50/70 border border-indigo-200 rounded-xl space-y-3">
                      <p className="text-xs font-bold text-indigo-900">
                        如第{Math.min(rangePeriodStart, rangePeriodEnd)}～
                        {Math.max(rangePeriodStart, rangePeriodEnd)}節
                      </p>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[10px] text-slate-500 mb-0.5">星期</label>
                          <select
                            value={rangeDayOfWeek}
                            onChange={(e) => setRangeDayOfWeek(Number(e.target.value) as DayOfWeek)}
                            className="w-full text-xs p-2 bg-white border border-slate-300 rounded-lg"
                          >
                            {availableRangeDays.map((d) => (
                              <option key={d} value={d}>
                                {dayNames[d]}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-500 mb-0.5">起節</label>
                          <select
                            value={rangePeriodStart}
                            onChange={(e) => setRangePeriodStart(Number(e.target.value))}
                            className="w-full text-xs p-2 bg-white border border-slate-300 rounded-lg"
                          >
                            {PERIOD_DEFINITIONS.map((p) => (
                              <option key={p.period} value={p.period}>
                                第{p.period}節
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] text-slate-500 mb-0.5">迄節</label>
                          <select
                            value={rangePeriodEnd}
                            onChange={(e) => setRangePeriodEnd(Number(e.target.value))}
                            className="w-full text-xs p-2 bg-white border border-slate-300 rounded-lg"
                          >
                            {PERIOD_DEFINITIONS.map((p) => (
                              <option key={p.period} value={p.period}>
                                第{p.period}節
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <p className="text-[11px] text-indigo-800 leading-relaxed">
                        將一次派代「{dayNames[rangeDayOfWeek]} 第
                        {Math.min(rangePeriodStart, rangePeriodEnd)}～
                        {Math.max(rangePeriodStart, rangePeriodEnd)}節」內有課的節次（目前{' '}
                        {periodRangeSessions.length} 節，已勾選 {batchSelectedSessions.length} 節）。同一位代課教師須在這些節次皆空堂。
                      </p>
                    </div>
                  )}

                  <label className="block text-xs font-bold text-slate-700 mb-2">
                    {requestType === 'substitute' && sessionPickMode === 'periodRange'
                      ? `連續節次課堂（可取消勾選個別節次 · ${batchSelectedSessions.length}/${periodRangeSessions.length}）`
                      : `請點選欲辦理調代之課堂 (${applicantSessions.length} 節)${
                          leaveFilterDays.length > 0
                            ? ` · 僅顯示${formatWeekdayList(leaveFilterDays, dayNames)}`
                            : ''
                        }`}
                    ：
                  </label>

                  {requestType === 'substitute' && !leaveDateStart && (
                    <p className="mb-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                      建議先選擇上方「請假日期」，課堂列表會自動只顯示區間內有課的節次。
                    </p>
                  )}

                  {requestType === 'substitute' && sessionPickMode === 'periodRange' ? (
                    periodRangeSessions.length === 0 ? (
                      <div className="p-6 text-center text-slate-400 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                        該範圍內沒有排定課堂。請調整星期或起迄節次（例如第1～7節）。
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-56 overflow-y-auto pr-1">
                        {periodRangeSessions.map((s) => {
                          const isSelected = selectedSessionIds.includes(s.id);
                          return (
                            <div
                              key={s.id}
                              onClick={() => {
                                setSelectedSessionIds((prev) =>
                                  prev.includes(s.id)
                                    ? prev.filter((id) => id !== s.id)
                                    : [...prev, s.id]
                                );
                              }}
                              className={`p-3 rounded-xl border cursor-pointer transition ${
                                isSelected
                                  ? 'bg-indigo-50 border-indigo-600 ring-2 ring-indigo-500/20 shadow-xs'
                                  : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                              }`}
                            >
                              <div className="flex items-center justify-between text-xs gap-1">
                                <span className="font-bold text-slate-900">
                                  {isSelected ? '✓ ' : ''}
                                  {dayNames[s.dayOfWeek]} 第{s.period}節
                                </span>
                                <span className="flex items-center gap-0.5 shrink-0">
                                  {s.isConcurrent && (
                                    <span className="px-1.5 py-0.2 bg-violet-100 text-violet-800 border border-violet-300 rounded text-[10px] font-bold">
                                      兼課
                                    </span>
                                  )}
                                  {isPracticalSession(s) ? (
                                    <span className="px-1.5 py-0.2 bg-amber-100 text-amber-900 border border-amber-300 rounded text-[10px] font-bold">
                                      專業實習
                                    </span>
                                  ) : (
                                    <span className="px-1.5 py-0.2 bg-blue-50 text-blue-800 rounded text-[10px]">
                                      一般學科
                                    </span>
                                  )}
                                </span>
                              </div>
                              <div className="text-xs font-bold text-slate-800 mt-1">
                                {s.className} ｜ {s.subjectName}
                              </div>
                              <div
                                className="text-[11px] text-slate-500 mt-1 flex items-center gap-1"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Building2 className="w-3 h-3 text-slate-400 shrink-0" />
                                <SessionVenueSelect session={s} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )
                  ) : applicantSessions.length === 0 ? (
                    <div className="p-6 text-center text-slate-500 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-2">
                      {leaveFilterDays.length > 0 ? (
                        <>
                          <p>
                            該教師在「{formatWeekdayList(leaveFilterDays, dayNames)}
                            」沒有排定課堂，無需選擇原課堂／代課教師。
                          </p>
                          {isHomeroomTeacher(applicantTeacher) ? (
                            <p className="text-violet-700 font-medium">
                              申請人為導師：請於下方指定代導師後即可送出（僅辦理代導師派代）。
                            </p>
                          ) : (
                            <p>請改請假起迄，或確認課表後再辦派代。</p>
                          )}
                        </>
                      ) : (
                        <p>該教師目前在課表中無排定課堂，請至總課表確認，或洽系統管理員重新匯入課表。</p>
                      )}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-56 overflow-y-auto pr-1">
                      {applicantSessions.map((s) => {
                        const isSelected = s.id === (selectedOriginalSession?.id || '');
                        return (
                          <div
                            key={s.id}
                            onClick={() => setSelectedSessionId(s.id)}
                            className={`p-3 rounded-xl border cursor-pointer transition ${
                              isSelected
                                ? 'bg-indigo-50 border-indigo-600 ring-2 ring-indigo-500/20 shadow-xs'
                                : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            <div className="flex items-center justify-between text-xs gap-1">
                              <span className="font-bold text-slate-900">
                                {dayNames[s.dayOfWeek]} 第{s.period}節
                              </span>
                              <span className="flex items-center gap-0.5 shrink-0">
                              {s.isConcurrent && (
                                <span className="px-1.5 py-0.2 bg-violet-100 text-violet-800 border border-violet-300 rounded text-[10px] font-bold">
                                  兼課
                                </span>
                              )}
                              {isPracticalSession(s) ? (
                                <span className="px-1.5 py-0.2 bg-amber-100 text-amber-900 border border-amber-300 rounded text-[10px] font-bold">
                                  專業實習
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.2 bg-blue-50 text-blue-800 rounded text-[10px]">
                                  一般學科
                                </span>
                              )}
                              </span>
                            </div>
                            <div className="text-xs font-bold text-slate-800 mt-1">
                              {s.className} ｜ {s.subjectName}
                            </div>
                            <div
                              className="text-[11px] text-slate-500 mt-1 flex items-center gap-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Building2 className="w-3 h-3 text-slate-400 shrink-0" />
                              <SessionVenueSelect session={s} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Step 3: Substitute / Reschedule Target Setup */}
              {requestType === 'substitute' && (
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
                      <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center font-bold">3</span>
                      <span>教學組智慧媒合 · 代課教師推薦與指定</span>
                    </h3>
                    <span className="text-xs text-slate-500">
                      優先：相同科目 → 同科別 → 該時段空堂
                    </span>
                  </div>

                  {/* Smart candidate recommendations */}
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-slate-700">
                      智慧推薦師資清單 (點選即指定)：
                    </label>

                    {canActingHomeroomOnly ? (
                      <div className="p-4 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-xl">
                        請假日無授課課堂，無需指定代課教師。請指定代導師後送出即可。
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-56 overflow-y-auto pr-1">
                          {candidateSubstitutes.map(({ teacher: cand, hasClash, isSameSubject, isSameDept, weeklyOverload }) => {
                            const isSelected = substituteTeacherId === cand.id;

                            return (
                              <div
                                key={cand.id}
                                onClick={() => {
                                  if (hasClash) return;
                                  setHasUserChosenSubstituteTeacher(true);
                                  setSubstituteTeacherId(cand.id);
                                }}
                                className={`p-3 rounded-xl border transition ${
                                  hasClash
                                    ? 'opacity-50 bg-rose-50/40 border-rose-200 cursor-not-allowed'
                                    : isSelected
                                    ? 'bg-indigo-50 border-indigo-600 ring-2 ring-indigo-500/20 shadow-xs cursor-pointer'
                                    : 'bg-slate-50 border-slate-200 hover:bg-slate-100 cursor-pointer'
                                }`}
                              >
                                <div className="flex items-center justify-between text-xs">
                                  <span className="font-bold text-slate-900">{cand.name}</span>
                                  <span className="text-[11px] text-slate-500">{cand.department}</span>
                                </div>

                                <div className="flex flex-wrap items-center gap-1.5 mt-1.5 text-[10px]">
                                  {hasClash ? (
                                    <span className="px-1.5 py-0.2 bg-rose-100 text-rose-800 font-bold rounded">
                                      🚫 時段衝堂 (已有課)
                                    </span>
                                  ) : (
                                    <span className="px-1.5 py-0.2 bg-emerald-100 text-emerald-800 font-bold rounded">
                                      ✓ 此時段空堂
                                    </span>
                                  )}

                                  {isSameSubject && (
                                    <span className="px-1.5 py-0.2 bg-violet-100 text-violet-800 font-bold rounded">
                                      同科目
                                    </span>
                                  )}

                                  {!isSameSubject && isSameDept && (
                                    <span className="px-1.5 py-0.2 bg-blue-100 text-blue-800 font-bold rounded">
                                      同專業科系
                                    </span>
                                  )}

                                  <span className="px-1.5 py-0.2 bg-slate-200 text-slate-700 rounded">
                                    超鐘點: {weeklyOverload}節
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        <div className="pt-2 space-y-1.5 border-t border-slate-100">
                          <label className="block text-xs font-bold text-slate-700">
                            或自行輸入／搜尋指定：
                          </label>
                          <TeacherSearchCombobox
                            teachers={teachers.filter((t) => t.id !== applicantTeacher?.id)}
                            currentTeacherId={substituteTeacherId}
                            onSelectTeacher={(id) => {
                              setHasUserChosenSubstituteTeacher(true);
                              setSubstituteTeacherId(id);
                            }}
                            placeholder="輸入姓名或科別搜尋代課教師…"
                            variant="light"
                            fullWidth
                            allowClear
                            clearLabel="清除代課教師"
                          />
                          {substituteTeacherId && (
                            <button
                              type="button"
                              onClick={() => {
                                setHasUserChosenSubstituteTeacher(true);
                                setSubstituteTeacherId('');
                              }}
                              className="text-[11px] text-rose-600 font-semibold hover:underline"
                            >
                              清除代課教師
                            </button>
                          )}
                          <p className="text-[11px] text-slate-500">
                            可直接輸入姓名搜尋，不限智慧推薦清單。點選推薦卡片或由此搜尋皆可指定。
                          </p>
                        </div>
                      </>
                    )}
                  </div>

                  {isHomeroomTeacher(applicantTeacher) && (
                    <div className="p-3 bg-violet-50 border border-violet-200 rounded-xl space-y-2">
                      <label className="block text-xs font-bold text-violet-900">
                        代導師
                        {canActingHomeroomOnly
                          ? '（必填 · 當日無課僅辦代導師）'
                          : '（選填 · 領取代導師減授鐘點費）'}
                      </label>
                      <TeacherSearchCombobox
                        teachers={teachers.filter((t) => t.id !== applicantTeacher?.id)}
                        currentTeacherId={actingHomeroomTeacherId}
                        onSelectTeacher={setActingHomeroomTeacherId}
                        placeholder="搜尋代導師姓名…"
                        variant="light"
                        fullWidth
                        allowClear={!canActingHomeroomOnly}
                        clearLabel="清除代導師"
                      />
                      {actingHomeroomTeacherId && !canActingHomeroomOnly && (
                        <button
                          type="button"
                          onClick={() => setActingHomeroomTeacherId('')}
                          className="text-[11px] text-rose-600 font-semibold hover:underline"
                        >
                          清除代導師
                        </button>
                      )}
                      <p className="text-[11px] text-violet-700">
                        {canActingHomeroomOnly
                          ? `當日無授課課堂，請指定代導師。出納清冊僅「未接班專任教師」領費（每日 ${systemConfig.actingHomeroomDailyRate ?? 404} 元）；導師／組長等可代理但不列領費。`
                          : `可指定專任、導師或行政職代理。僅請上午等不需代理時可留空。出納清冊僅「未接班專任教師」領費（每日 ${systemConfig.actingHomeroomDailyRate ?? 404} 元）。`}
                      </p>
                      {actingHomeroomTeacherId &&
                        substituteTeacherId &&
                        actingHomeroomTeacherId === substituteTeacherId && (
                          <p className="text-[11px] text-slate-600">
                            目前代導師與代課教師為同一人。
                          </p>
                        )}
                    </div>
                  )}
                </div>
              )}

              {/* If Reschedule: 僅移入空堂 */}
              {requestType === 'reschedule' && (
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
                  <div className="border-b border-slate-100 pb-3">
                    <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
                      <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center font-bold">3</span>
                      <span>指定移課目標時段與工場/教室</span>
                    </h3>
                    <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 mt-3">
                      行政移課＝移進<strong className="font-semibold">空堂</strong>。目標已有課、要同班對調請改選「同班對調」。
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">目標星期：</label>
                      <select
                        value={targetDay}
                        onChange={(e) => setTargetDay(Number(e.target.value) as DayOfWeek)}
                        className="w-full text-xs sm:text-sm p-2.5 bg-slate-50 border border-slate-300 rounded-xl"
                      >
                        <option value={1}>週一</option>
                        <option value={2}>週二</option>
                        <option value={3}>週三</option>
                        <option value={4}>週四</option>
                        <option value={5}>週五</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">目標節次：</label>
                      <select
                        value={targetPeriod}
                        onChange={(e) => setTargetPeriod(Number(e.target.value))}
                        className="w-full text-xs sm:text-sm p-2.5 bg-slate-50 border border-slate-300 rounded-xl"
                      >
                        {PERIOD_DEFINITIONS.map((p) => (
                          <option key={p.period} value={p.period}>
                            {p.label} ({p.timeRange})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">目標實習工場/教室：</label>
                      <select
                        value={targetVenueId}
                        onChange={(e) => setTargetVenueId(e.target.value)}
                        className="w-full text-xs sm:text-sm p-2.5 bg-slate-50 border border-slate-300 rounded-xl"
                      >
                        {venues.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.name} ({v.department})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* If Swap: 同班對調 暫時／永久 */}
              {requestType === 'swap' && (
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
                  <div className="border-b border-slate-100 pb-3">
                    <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
                      <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center font-bold">3</span>
                      <span>同班對調：效期與對調課堂</span>
                    </h3>
                    <p className="text-xs text-indigo-800 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2 mt-3">
                      暫時＝選日期、不改週模板（鐘點按日調整）；永久＝核准後改週課表（之後依新星期計）。
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setSwapMode('temporary')}
                      className={`text-left p-2.5 rounded-xl border text-xs transition ${
                        swapMode === 'temporary'
                          ? 'border-indigo-600 bg-indigo-50 ring-2 ring-indigo-500/20'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="font-bold text-slate-900">暫時</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">選日期；不改週模板</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSwapMode('permanent')}
                      className={`text-left p-2.5 rounded-xl border text-xs transition ${
                        swapMode === 'permanent'
                          ? 'border-emerald-600 bg-emerald-50 ring-2 ring-emerald-500/20'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="font-bold text-slate-900">永久</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">核准後改週課表</div>
                    </button>
                  </div>

                  {swapMode === 'temporary' && (
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">暫時對調日期（必填）：</label>
                      <input
                        type="date"
                        value={swapEffectiveDate}
                        onChange={(e) => setSwapEffectiveDate(e.target.value)}
                        className="w-full sm:w-56 text-xs sm:text-sm p-2.5 bg-slate-50 border border-slate-300 rounded-xl"
                      />
                      {swapEffectiveDate &&
                        selectedOriginalSession &&
                        sessions.find((s) => s.id === swapTargetSessionId) && (
                          <p className="text-[11px] text-indigo-700 mt-1.5">
                            {formatTemporarySwapEffectLabel(
                              swapEffectiveDate,
                              selectedOriginalSession.dayOfWeek,
                              sessions.find((s) => s.id === swapTargetSessionId)!.dayOfWeek
                            )}
                          </p>
                        )}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">同班對調教師：</label>
                      <select
                        value={swapTargetTeacherId}
                        disabled={swapPartnerTeachers.length === 0}
                        onChange={(e) => {
                          const nextId = e.target.value;
                          setSwapTargetTeacherId(nextId);
                          const className = selectedOriginalSession?.className;
                          const partnerSameClass = sessions.filter(
                            (s) =>
                              s.teacherId === nextId &&
                              s.className === className &&
                              s.id !== selectedOriginalSession?.id
                          );
                          setSwapTargetSessionId(partnerSameClass[0]?.id || '');
                        }}
                        className="w-full text-xs sm:text-sm p-2.5 bg-slate-50 border border-slate-300 rounded-xl"
                      >
                        {swapPartnerTeachers.length === 0 ? (
                          <option value="">此班無其他教師可對調</option>
                        ) : (
                          <>
                            <option value="">-- 請選擇同班對調教師 --</option>
                            {swapPartnerTeachers.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name} ({t.department})
                              </option>
                            ))}
                          </>
                        )}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">對方同班課堂：</label>
                      <select
                        value={swapTargetSessionId}
                        onChange={(e) => setSwapTargetSessionId(e.target.value)}
                        className="w-full text-xs sm:text-sm p-2.5 bg-slate-50 border border-slate-300 rounded-xl"
                      >
                        <option value="">-- 請選擇互換課堂 --</option>
                        {swapPartnerSessions.map((s) => (
                          <option key={s.id} value={s.id}>
                            {dayNames[s.dayOfWeek]} 第{s.period}節 《{s.subjectName}》
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}

            </div>

            {/* Right 1 Col: Summary & Approval Actions */}
            <div className="space-y-4">
              
              {/* Summary Card */}
              <div className="bg-slate-900 text-white rounded-2xl p-5 shadow-sm space-y-4">
                <div className="flex items-center space-x-2 border-b border-slate-800 pb-3">
                  <Zap className="w-5 h-5 text-amber-400" />
                  <h3 className="font-bold text-sm">調代課經辦摘要確認</h3>
                </div>

                <div className="space-y-3 text-xs">
                  <div>
                    <span className="text-slate-400 block">原授課堂：</span>
                    <strong className="text-slate-100 text-sm">
                      {selectedOriginalSession ? (
                        `${selectedOriginalSession.className} ｜ ${selectedOriginalSession.subjectName}`
                      ) : (
                        '未選定'
                      )}
                    </strong>
                    <div className="text-amber-400 mt-0.5">
                      {selectedOriginalSession &&
                        (requestType === 'substitute' &&
                        sessionPickMode === 'periodRange' &&
                        batchSelectedSessions.length > 1
                          ? `${dayNames[selectedOriginalSession.dayOfWeek]} ${formatPeriodsLabel(
                              batchSelectedSessions.map((s) => s.period)
                            )}（共 ${batchSelectedSessions.length} 節）`
                          : `${dayNames[selectedOriginalSession.dayOfWeek]} 第${selectedOriginalSession.period}節 (${selectedOriginalSession.venueName})`)}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-800">
                    <span className="text-slate-400 block">調代安排：</span>
                    {requestType === 'substitute' && (
                      <div className="text-slate-200">
                        代課教師：<strong className="text-indigo-400 text-sm">{teachers.find(t => t.id === substituteTeacherId)?.name || '未指定'}</strong>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {dispatchPaymentDisplay.kind === 'public'
                            ? `🏛️ 公費派代 (${(sessionPickMode === 'periodRange' ? batchSelectedSessions[0]?.period : selectedOriginalSession?.period) === 8 ? systemConfig.nightHourlyRate : systemConfig.dayHourlyRate}元/節)`
                            : `👤 ${dispatchPaymentDisplay.label}（不入代課清冊）`}
                        </div>
                      </div>
                    )}
                    {requestType === 'reschedule' && (
                      <div className="text-slate-200">
                        改至：<strong>{dayNames[targetDay]} 第{targetPeriod}節</strong>
                        <div className="text-[11px] text-slate-400">{venues.find(v => v.id === targetVenueId)?.name}</div>
                      </div>
                    )}
                    {requestType === 'swap' && (
                      <div className="text-slate-200">
                        同班對調（{swapMode === 'permanent' ? '永久' : '暫時'}）：
                        <strong>{teachers.find(t => t.id === swapTargetTeacherId)?.name || '未指定'}</strong>
                        {swapMode === 'temporary' &&
                          swapEffectiveDate &&
                          selectedOriginalSession &&
                          sessions.find((s) => s.id === swapTargetSessionId) && (
                          <span className="block text-[11px] text-indigo-300 mt-0.5">
                            {formatTemporarySwapEffectLabel(
                              swapEffectiveDate,
                              selectedOriginalSession.dayOfWeek,
                              sessions.find((s) => s.id === swapTargetSessionId)!.dayOfWeek
                            )}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="pt-2 border-t border-slate-800">
                    <span className="text-slate-400 block">經辦簽章：</span>
                    <span className="text-slate-200 font-bold">
                      {currentAcademicStaff?.name} ({currentAcademicStaff?.title})
                    </span>
                  </div>
                </div>

                {/* Realtime Conflict Check Display */}
                <div className={`p-3 rounded-xl text-xs border ${
                  clashPreview.hasClash
                    ? 'bg-rose-950/70 border-rose-700 text-rose-200'
                    : clashPreview.severity === 'warning'
                    ? 'bg-amber-950/70 border-amber-700 text-amber-200'
                    : 'bg-emerald-950/70 border-emerald-700 text-emerald-200'
                }`}>
                  <div className="flex items-center space-x-1.5 font-bold mb-1">
                    {clashPreview.hasClash ? (
                      <AlertTriangle className="w-4 h-4 text-rose-400" />
                    ) : (
                      <CheckCircle className="w-4 h-4 text-emerald-400" />
                    )}
                    <span>{clashPreview.hasClash ? '🚫 存在衝堂衝突' : '✓ 衝堂檢核無異常'}</span>
                  </div>
                  <ul className="text-[11px] space-y-0.5 list-disc pl-4 opacity-90">
                    {clashPreview.messages.map((m: string, idx: number) => (
                      <li key={idx}>{m}</li>
                    ))}
                  </ul>
                </div>

                {/* Auto Approve Checkbox */}
                <div className="pt-2">
                  <label className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoApprove}
                      onChange={(e) => setAutoApprove(e.target.checked)}
                      className="w-4 h-4 text-indigo-600 rounded bg-slate-800 border-slate-700 focus:ring-indigo-500"
                    />
                    <span className="font-bold text-amber-300">
                      ⚡ 教務處逕行核定生效 (同步直接更新課表)
                    </span>
                  </label>
                </div>

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={
                    clashPreview.hasClash ||
                    wellnessHoursExceeded ||
                    (requestType === 'substitute' &&
                      substituteTeacherRequired &&
                      !substituteTeacherId) ||
                    (requestType === 'substitute' &&
                      canActingHomeroomOnly &&
                      !actingHomeroomTeacherId)
                  }
                  className={`w-full py-3 rounded-xl font-bold text-sm shadow-md transition flex items-center justify-center space-x-2 ${
                    clashPreview.hasClash ||
                    wellnessHoursExceeded ||
                    (requestType === 'substitute' &&
                      substituteTeacherRequired &&
                      !substituteTeacherId) ||
                    (requestType === 'substitute' &&
                      canActingHomeroomOnly &&
                      !actingHomeroomTeacherId)
                      ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                      : 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 active:scale-98'
                  }`}
                >
                  <Send className="w-4 h-4" />
                  <span>
                    {requestType === 'substitute' &&
                    canActingHomeroomOnly &&
                    !actingHomeroomTeacherId
                      ? '請先指定代導師'
                      : requestType === 'substitute' &&
                          canActingHomeroomOnly &&
                          actingHomeroomTeacherId
                        ? '確定僅派代導師（當日無課）'
                      : requestType === 'substitute' && substituteTeacherRequired && !substituteTeacherId
                        ? '請先指定代課教師'
                      : requestType === 'substitute' &&
                        sessionPickMode === 'periodRange' &&
                        batchSelectedSessions.length > 1
                      ? `確定批次派代 ${batchSelectedSessions.length} 節`
                      : '確定登記並執行派代'}
                  </span>
                </button>
              </div>

            </div>

          </div>

        </form>
      )}

      {/* Sub View 2: Ledger & Batch Approval/Printing List */}
      {activeSubView === 'list' && (
        <div className="space-y-4">
          
          {/* Controls Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
            
            {/* Filter Pills */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              {[
                { key: 'all', label: `全部案件 (${requests.length})` },
                { key: 'pending', label: `⏳ 待簽核 (${requests.filter(r => r.status === 'pending').length})` },
                { key: 'public', label: `🏛️ 公費派代 (${requestPaymentCounts.public})` },
                { key: 'private', label: `👤 教師自理 (${requestPaymentCounts.private})` },
                { key: 'practical', label: `🔧 實習工場課 (${resolvedRequests.filter(r => isPracticalSession(r.originalSession)).length})` },
              ].map((f) => (
                <button
                  key={f.key}
                  onClick={() => setListFilter(f.key as any)}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                    listFilter === f.key
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Search Box */}
            <div className="flex items-center space-x-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="搜尋教師、班級、單號..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs w-48 sm:w-60 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Batch Approve button if items selected */}
              {selectedRequestIds.length > 0 && (
                <button
                  onClick={handleBatchApprove}
                  className="flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg shadow-sm transition active:scale-95 animate-pulse"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>批次核准 ({selectedRequestIds.length}) 筆</span>
                </button>
              )}
            </div>

          </div>

          {/* Table of requests */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-900 text-white font-bold divide-x divide-slate-800">
                    <th className="p-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={
                          selectedRequestIds.length > 0 &&
                          selectedRequestIds.length === filteredRequests.filter(r => r.status === 'pending').length
                        }
                        onChange={handleToggleSelectAll}
                        className="rounded text-indigo-600 focus:ring-indigo-500"
                        title="全選待簽核項目"
                      />
                    </th>
                    <th className="p-3 w-28">申請單號</th>
                    <th className="p-3">原授課教師 / 科別</th>
                    <th className="p-3">受影響課堂與工場</th>
                    <th className="p-3">調代內容 / 代課教師</th>
                    <th className="p-3 w-24">費用別</th>
                    <th className="p-3 w-24 text-center">狀態</th>
                    <th className="p-3 w-36 text-center">經辦與操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRequests.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-10 text-center text-slate-400">
                        查無符合篩選條件之調代課紀錄
                      </td>
                    </tr>
                  ) : (
                    filteredRequests.map((req) => {
                      const isPending = req.status === 'pending';
                      const isSelected = selectedRequestIds.includes(req.id);

                      return (
                        <tr
                          key={req.id}
                          className={`hover:bg-slate-50 transition ${
                            isSelected ? 'bg-indigo-50/50' : ''
                          }`}
                        >
                          <td className="p-3 text-center">
                            {isPending ? (
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedRequestIds(prev => [...prev, req.id]);
                                  } else {
                                    setSelectedRequestIds(prev => prev.filter(id => id !== req.id));
                                  }
                                }}
                                className="rounded text-indigo-600 focus:ring-indigo-500"
                              />
                            ) : (
                              <span className="text-slate-300">-</span>
                            )}
                          </td>

                          <td className="p-3 font-mono font-bold text-indigo-900">
                            {req.requestNumber}
                          </td>

                          <td className="p-3">
                            <div className="font-bold text-slate-900">{req.applicantTeacherName}</div>
                            <div className="text-[11px] text-slate-500">{req.applicantDepartment}</div>
                          </td>

                          <td className="p-3">
                            <div className="font-semibold text-slate-800">
                              {req.originalSession.className} 《{req.originalSession.subjectName}》
                            </div>
                            <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                              <span>{dayNames[req.originalSession.dayOfWeek]} 第{req.originalSession.period}節</span>
                              <span>·</span>
                              <span>{req.originalSession.venueName}</span>
                              {isPracticalSession(req.originalSession) && (
                                <span className="px-1 bg-amber-100 text-amber-800 rounded font-bold text-[10px]">實習</span>
                              )}
                            </div>
                            {req.requestType === 'substitute' && (
                              <div className="text-[11px] text-amber-800 font-semibold mt-0.5">
                                請假：{formatLeaveDateLabel(req.leaveDateStart, req.leaveDateEnd)}
                                {req.batchGroupId ? ' · 合併通知單' : ''}
                              </div>
                            )}
                          </td>

                          <td className="p-3">
                            {req.requestType === 'substitute' && (
                              <div>
                                {isActingHomeroomOnlyRequest(req) ? (
                                  <>
                                    <span className="text-slate-500">代導師：</span>
                                    <strong className="text-violet-900">
                                      {req.actingHomeroomTeacherName || '尚未指定'}
                                    </strong>
                                  </>
                                ) : (
                                  <>
                                    <span className="text-slate-500">代課：</span>
                                    <strong className="text-indigo-900">
                                      {req.substituteTeacherName || '由教學組媒合'}
                                    </strong>
                                    {req.actingHomeroomTeacherName && (
                                      <div className="text-[11px] text-violet-800 mt-0.5">
                                        代導師：{req.actingHomeroomTeacherName}
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                            )}
                            {req.requestType === 'reschedule' && req.targetReschedule && (
                              <div>
                                <span className="text-slate-500">移至：</span>
                                <strong>{dayNames[req.targetReschedule.dayOfWeek]} 第{req.targetReschedule.period}節</strong>
                              </div>
                            )}
                            {req.requestType === 'swap' && (
                              <div>
                                <span className="text-slate-500">
                                  同班對調（{req.swapMode === 'permanent' || (!req.swapMode && !req.effectiveDate) ? '永久' : '暫時'}）：
                                </span>
                                <strong>{req.swapTargetTeacherName}</strong>
                                {req.effectiveDate && req.swapTargetSession && (
                                  <span className="block text-[11px] text-indigo-700 mt-0.5">
                                    {formatTemporarySwapEffectLabel(
                                      req.effectiveDate,
                                      req.originalSession.dayOfWeek,
                                      req.swapTargetSession.dayOfWeek
                                    )}
                                  </span>
                                )}
                              </div>
                            )}
                            <div className="text-[11px] text-slate-500 truncate max-w-xs mt-0.5">
                              事由：{req.reason}
                            </div>
                          </td>

                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded font-bold text-[11px] ${
                              req.resolvedPayment === 'public'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}>
                              {req.resolvedPayment === 'public' ? '🏛️ 公費' : '👤 自理'}
                            </span>
                          </td>

                          <td className="p-3 text-center">
                            {req.status === 'approved' && (
                              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold rounded-full text-[11px]">
                                ✓ 已核准
                              </span>
                            )}
                            {req.status === 'pending' && (
                              <span className="px-2 py-0.5 bg-amber-100 text-amber-900 font-bold rounded-full text-[11px] animate-pulse">
                                ⏳ 待審核
                              </span>
                            )}
                            {req.status === 'rejected' && (
                              <span className="px-2 py-0.5 bg-rose-100 text-rose-800 font-bold rounded-full text-[11px]">
                                ✕ 已駁回
                              </span>
                            )}
                          </td>

                          <td className="p-3 text-center">
                            <div className="flex items-center justify-center flex-wrap gap-1.5">
                              {req.requestType === 'substitute' && (
                                <button
                                  type="button"
                                  onClick={() => openEditRequest(req)}
                                  className="flex items-center space-x-1 px-2.5 py-1 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold rounded-lg border border-slate-200 transition"
                                  title={
                                    req.status === 'approved' && !isActingHomeroomOnlyRequest(req)
                                      ? '修改申請資料與課程表格（儲存表格後代課清冊依基本鐘點計算）'
                                      : '修改假別、事由、請假日、代課／代導師'
                                  }
                                >
                                  <Edit2 className="w-3 h-3" />
                                  <span>修改</span>
                                </button>
                              )}
                              {req.status === 'approved' && !isActingHomeroomOnlyRequest(req) && (
                                <button
                                  onClick={() => setPrintModalRequest(req)}
                                  className="flex items-center space-x-1 px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-lg border border-indigo-200 transition"
                                  title="列印調代課通知單"
                                >
                                  <Printer className="w-3 h-3" />
                                  <span>通知單</span>
                                </button>
                              )}

                              {req.status === 'pending' && (
                                <button
                                  onClick={() => {
                                    const academicOnly = academicStaffList.filter(
                                      (s) => (s.group || 'academic') === 'academic'
                                    );
                                    const staff =
                                      (currentAcademicStaff &&
                                      (currentAcademicStaff.group || 'academic') === 'academic'
                                        ? currentAcademicStaff
                                        : undefined) || academicOnly[0];
                                    const title = staff?.title || '教學組';
                                    const m = title.match(/^(.+?組).*?\((.+?)\)$/);
                                    const stampTitle = m ? `${m[1]}${m[2]}` : title;
                                    const pendingCount = req.batchGroupId
                                      ? requests.filter(
                                          (r) =>
                                            r.batchGroupId === req.batchGroupId &&
                                            r.status === 'pending'
                                        ).length
                                      : 1;
                                    if (pendingCount > 1) {
                                      const ok = window.confirm(
                                        `此為連續節次（共 ${pendingCount} 節待核定），將整批一次核准。確定？`
                                      );
                                      if (!ok) return;
                                    }
                                    approveRequest(req.id, `${staff?.name || '教學組'}(${stampTitle})`);
                                  }}
                                  className="flex items-center space-x-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg shadow-xs transition"
                                >
                                  <Check className="w-3 h-3" />
                                  <span>
                                    {req.batchGroupId &&
                                    requests.filter(
                                      (r) =>
                                        r.batchGroupId === req.batchGroupId &&
                                        r.status === 'pending'
                                    ).length > 1
                                      ? '整批核定'
                                      : '核定'}
                                  </span>
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => setDeletingRequestId(req.id)}
                                className="flex items-center space-x-1 px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded-lg border border-rose-200 transition"
                                title="刪除此申請單（做錯可刪）"
                              >
                                <Trash2 className="w-3 h-3" />
                                <span>刪除</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {editingRequest && (() => {
        const showNoticeTab =
          editingRequest.status === 'approved' && !isActingHomeroomOnlyRequest(editingRequest);

        const tryCloseEditModal = () => {
          if (showNoticeTab && noticeTableDirty) {
            const ok = window.confirm(
              '課程表格有未儲存的修改，關閉後將還原為上次儲存的內容。確定關閉？'
            );
            if (!ok) return;
            noticeDiscardRef.current?.();
          }
          setEditingRequest(null);
          setNoticeTableDirty(false);
        };

        const trySwitchEditTab = (tab: 'request' | 'notice') => {
          if (tab === editModalTab) return;
          if (editModalTab === 'notice' && tab === 'request' && noticeTableDirty) {
            const ok = window.confirm(
              '課程表格有未儲存的修改，切換分頁後將還原為上次儲存的內容。確定切換？'
            );
            if (!ok) return;
            noticeDiscardRef.current?.();
            setNoticeTableDirty(false);
          }
          setEditModalTab(tab);
        };

        return (
        <ModalShell
          scroll="panel"
          backdropClassName="bg-slate-900/60 backdrop-blur-xs"
          panelClassName={`bg-white rounded-2xl shadow-2xl w-full border border-slate-200 max-h-[90vh] overflow-y-auto ${
            showNoticeTab && editModalTab === 'notice' ? 'max-w-3xl' : 'max-w-lg'
          }`}
        >
          <div className="p-6 space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Edit2 className="w-4 h-4 text-indigo-600" />
                  修改請假派代單
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  {editingRequest.requestNumber}
                  {editingRequest.batchGroupId ? ' · 連續節次同批一併更新' : ''}
                  {' · '}
                  {editingRequest.applicantTeacherName}
                </p>
              </div>
              <button
                type="button"
                onClick={tryCloseEditModal}
                className="text-slate-400 hover:text-slate-700 text-sm font-bold px-2"
              >
                關閉
              </button>
            </div>

            {showNoticeTab && (
              <div className="flex gap-1 p-1 bg-slate-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => trySwitchEditTab('request')}
                  className={`flex-1 px-3 py-2 text-xs font-bold rounded-lg transition ${
                    editModalTab === 'request'
                      ? 'bg-white text-indigo-700 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  申請資料
                </button>
                <button
                  type="button"
                  onClick={() => trySwitchEditTab('notice')}
                  className={`flex-1 px-3 py-2 text-xs font-bold rounded-lg transition ${
                    editModalTab === 'notice'
                      ? 'bg-white text-indigo-700 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  課程表格
                </button>
              </div>
            )}

            {showNoticeTab && (
              <div className={editModalTab === 'notice' ? 'space-y-3' : 'hidden'}>
                <RequestNoticeTab
                  request={editingRequest}
                  onDirtyChange={setNoticeTableDirty}
                  onBindDiscard={(discard) => {
                    noticeDiscardRef.current = discard;
                  }}
                />
              </div>
            )}

            {(editModalTab === 'request' || !showNoticeTab) && (
          <form onSubmit={handleSaveEditRequest} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">假別</label>
              <select
                value={editLeaveType}
                onChange={(e) => {
                  const next = e.target.value as LeaveType;
                  setEditLeaveType(next);
                  setEditReason(defaultReasonForLeaveType(next));
                }}
                className="w-full text-xs sm:text-sm p-2.5 bg-slate-50 border border-slate-300 rounded-xl"
              >
                {LEAVE_TYPE_FORM_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-slate-500 mt-1">
                鐘點費依對照表自動判定（儲存時重新計算，無法手動覆寫）。
              </p>
              {editLeaveType === 'wellness' && (
                <WellnessLeaveHoursAlert
                  status={editWellnessHoursStatus}
                  showUsage={Boolean(editLeaveDateStart)}
                />
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">請假日期</label>
              <div className="flex gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditLeaveDateMode('single');
                    setEditLeaveDateEnd(editLeaveDateStart);
                  }}
                  className={`flex-1 px-3 py-1.5 rounded-xl text-xs font-bold border ${
                    editLeaveDateMode === 'single'
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-slate-600 border-slate-300'
                  }`}
                >
                  單日
                </button>
                <button
                  type="button"
                  onClick={() => setEditLeaveDateMode('range')}
                  className={`flex-1 px-3 py-1.5 rounded-xl text-xs font-bold border ${
                    editLeaveDateMode === 'range'
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-slate-600 border-slate-300'
                  }`}
                >
                  起迄
                </button>
              </div>
              <div className={`grid gap-2 ${editLeaveDateMode === 'range' ? 'grid-cols-2' : 'grid-cols-1'}`}>
                <input
                  type="date"
                  required
                  value={editLeaveDateStart}
                  onChange={(e) => {
                    setEditLeaveDateStart(e.target.value);
                    if (editLeaveDateMode === 'single') setEditLeaveDateEnd(e.target.value);
                  }}
                  className="w-full text-xs sm:text-sm p-2.5 bg-slate-50 border border-slate-300 rounded-xl"
                />
                {editLeaveDateMode === 'range' && (
                  <input
                    type="date"
                    required
                    value={editLeaveDateEnd}
                    onChange={(e) => setEditLeaveDateEnd(e.target.value)}
                    className="w-full text-xs sm:text-sm p-2.5 bg-slate-50 border border-slate-300 rounded-xl"
                  />
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">事由</label>
              <input
                type="text"
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
                placeholder="可留空"
                className="w-full text-xs sm:text-sm p-2.5 bg-slate-50 border border-slate-300 rounded-xl"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">代課教師</label>
              {isPlaceholderSession(editingRequest.originalSession) ? (
                <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl p-3">
                  當日無排課佔位單，無法指定代課教師（可改代導師／假別／請假日／事由）。
                </p>
              ) : (
                <TeacherSearchCombobox
                  teachers={teachers.filter((t) => t.id !== editingRequest.applicantTeacherId)}
                  currentTeacherId={editSubstituteTeacherId}
                  onSelectTeacher={setEditSubstituteTeacherId}
                  placeholder="搜尋代課教師…"
                  variant="light"
                  fullWidth
                />
              )}
            </div>

            {isHomeroomTeacher(
              teachers.find((t) => t.id === editingRequest.applicantTeacherId)
            ) && (
              <div>
                <label className="block text-xs font-bold text-violet-900 mb-1">
                  代導師
                  {isPlaceholderSession(editingRequest.originalSession) ? '（必填）' : '（選填）'}
                </label>
                <TeacherSearchCombobox
                  teachers={teachers.filter((t) => t.id !== editingRequest.applicantTeacherId)}
                  currentTeacherId={editActingHomeroomTeacherId}
                  onSelectTeacher={setEditActingHomeroomTeacherId}
                  placeholder="搜尋代導師…"
                  variant="light"
                  fullWidth
                  allowClear={!isPlaceholderSession(editingRequest.originalSession)}
                  clearLabel="清除代導師"
                />
                {editActingHomeroomTeacherId &&
                  !isPlaceholderSession(editingRequest.originalSession) && (
                  <button
                    type="button"
                    onClick={() => setEditActingHomeroomTeacherId('')}
                    className="text-[11px] text-rose-600 font-semibold hover:underline"
                  >
                    清除代導師
                  </button>
                )}
                <p className="text-[11px] text-violet-700 mt-1">
                  出納清冊僅「未接班專任教師」領費。
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={tryCloseEditModal}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={editLeaveType === 'wellness' && editWellnessHoursStatus?.exceeded}
                className={`px-4 py-2 text-white text-xs font-bold rounded-xl shadow-xs ${
                  editLeaveType === 'wellness' && editWellnessHoursStatus?.exceeded
                    ? 'bg-slate-400 cursor-not-allowed'
                    : 'bg-indigo-600 hover:bg-indigo-500'
                }`}
              >
                儲存修改
              </button>
            </div>
          </form>
            )}
          </div>
        </ModalShell>
        );
      })()}

      {deletingRequestId && (
        <ModalShell
          scroll="panel"
          backdropClassName="bg-slate-900/60 backdrop-blur-xs"
          panelClassName="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-slate-200"
        >
          <div className="p-6">
            <div className="flex items-center space-x-2 text-rose-600 font-bold text-base">
              <AlertTriangle className="w-5 h-5" />
              <span>確認刪除此調代課申請單？</span>
            </div>
            <p className="text-xs text-slate-600 mt-2 leading-relaxed">
              即將刪除{' '}
              <strong className="text-slate-900">
                {(() => {
                  const t = requests.find((r) => r.id === deletingRequestId);
                  if (!t) return '此單';
                  if (!t.batchGroupId) return t.requestNumber || '此單';
                  const n = requests.filter((r) => r.batchGroupId === t.batchGroupId).length;
                  return `${t.requestNumber || '此單'}（含同批連續節次共 ${n} 筆）`;
                })()}
              </strong>
              。刪除後無法復原，也不再計入鐘點費結算；已核准者會一併回滾課表代課覆蓋。若只是填錯，刪除後可重新登錄。
            </p>
            <div className="flex justify-end space-x-2 mt-5">
              <button
                type="button"
                onClick={() => setDeletingRequestId(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  const t = requests.find((r) => r.id === deletingRequestId);
                  const ids = t?.batchGroupId
                    ? requests.filter((r) => r.batchGroupId === t.batchGroupId).map((r) => r.id)
                    : [deletingRequestId];
                  deleteRequest(deletingRequestId);
                  setDeletingRequestId(null);
                  setSelectedRequestIds((prev) => prev.filter((id) => !ids.includes(id)));
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl shadow-xs transition"
              >
                確認刪除
              </button>
            </div>
          </div>
        </ModalShell>
      )}

    </div>
  );
};
