import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { 
  CourseSession, 
  RequestType, 
  LeaveType, 
  PaymentType, 
  DayOfWeek, 
  ClashCheckResult 
} from '../../types';
import { PERIOD_DEFINITIONS } from '../../data/mockData';
import {
  countMatchingWeekdays,
  formatWeekdayList,
  resolveLeaveDateEnd,
  validateSubstituteLeaveInput,
  weekdaysInDateRange,
} from '../../utils/leaveDates';
import { nonTeachingDateSet } from '../../utils/holidays';
import { rankSubstituteCandidates } from '../../utils/substituteCandidates';
import { formatPeriodsLabel } from '../../utils/periodLabels';
import { ModalShell } from '../Common/ModalShell';
import { 
  X, 
  ArrowLeftRight, 
  Clock, 
  UserCheck, 
  AlertTriangle, 
  CheckCircle2, 
  Info,
  Building2,
  Calendar
} from 'lucide-react';

interface RequestModalProps {
  initialSession?: CourseSession;
  onClose: () => void;
}

export const RequestModal: React.FC<RequestModalProps> = ({ initialSession, onClose }) => {
  const {
    currentTeacher,
    teachers,
    venues,
    sessions,
    requests,
    systemConfig,
    addSubstituteRequest,
    addSubstituteRequests,
    checkClashes,
  } = useApp();

  // Current teacher's sessions
  const teacherSessions = useMemo(() => {
    const mine = sessions.filter((s) => s.teacherId === currentTeacher?.id);
    return [...mine].sort(
      (a, b) => a.dayOfWeek - b.dayOfWeek || a.period - b.period
    );
  }, [sessions, currentTeacher?.id]);
  
  const [selectedSessionId, setSelectedSessionId] = useState<string>(
    initialSession ? initialSession.id : teacherSessions[0]?.id || ''
  );

  const selectedSession = sessions.find((s) => s.id === selectedSessionId) || teacherSessions[0];
  const sessionHourlyRate =
    selectedSession?.period === 8 ? systemConfig.nightHourlyRate : systemConfig.dayHourlyRate;
  const sessionRateKind = selectedSession?.period === 8 ? '第八節課輔' : '日間部';

  const [requestType, setRequestType] = useState<RequestType>('substitute');
  const [leaveType, setLeaveType] = useState<LeaveType>('official');
  // 申請事由：不預設內容，讓老師自行填寫
  const [reason, setReason] = useState<string>('');

  // 歸屬月份：當月，或 7 天內跨月時可選上月
  const now = new Date();
  const thisMonth = now.getMonth() + 1;
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const canSelectLastMonth = sevenDaysAgo.getMonth() !== now.getMonth();
  const lastMonth = sevenDaysAgo.getMonth() + 1;
  const [requestMonth, setRequestMonth] = useState<number>(thisMonth);
  const [paymentType, setPaymentType] = useState<PaymentType>('public');

  // For Reschedule (自行移課)
  const [targetDay, setTargetDay] = useState<DayOfWeek>(2);
  const [targetPeriod, setTargetPeriod] = useState<number>(4);
  const [targetVenueId, setTargetVenueId] = useState<string>(
    selectedSession ? selectedSession.venueId : venues[0]?.id || ''
  );

  // For Swap (相互調課)
  const [swapTeacherId, setSwapTeacherId] = useState<string>('');
  const [swapSessionId, setSwapSessionId] = useState<string>('');

  // For Substitute (請假派代)
  const [substituteTeacherId, setSubstituteTeacherId] = useState<string>('');
  const [showAllTeachers, setShowAllTeachers] = useState(false);
  const [hasUserChosenSubstituteTeacher, setHasUserChosenSubstituteTeacher] = useState(false);
  const [manualTeacherQuery, setManualTeacherQuery] = useState('');
  const [leaveDateMode, setLeaveDateMode] = useState<'single' | 'range'>('single');
  const [leaveDateStart, setLeaveDateStart] = useState<string>('');
  const [leaveDateEnd, setLeaveDateEnd] = useState<string>('');

  // When teacherSessions is empty, allow selecting a time slot (day/period)
  // so teacher can still submit a substitute (leave) request.
  const [leaveDay, setLeaveDay] = useState<DayOfWeek | ''>('');
  const [leavePeriod, setLeavePeriod] = useState<number | ''>('');
  // When teacher has sessions, offer only "has-class" slots.
  const [leaveSlotId, setLeaveSlotId] = useState<string>('');
  /** 單節｜同日連續多節（如第2～7節實習） */
  const [leavePickMode, setLeavePickMode] = useState<'single' | 'multi'>('single');
  const [selectedLeaveSlotIds, setSelectedLeaveSlotIds] = useState<string[]>([]);
  const [multiLeaveDay, setMultiLeaveDay] = useState<DayOfWeek | ''>('');

  const leaveFilterDays = useMemo(() => {
    if (requestType !== 'substitute' || !leaveDateStart) return [] as DayOfWeek[];
    return weekdaysInDateRange(
      leaveDateStart,
      leaveDateMode === 'range' ? leaveDateEnd || leaveDateStart : leaveDateStart
    );
  }, [requestType, leaveDateStart, leaveDateEnd, leaveDateMode]);
  const leaveSelectableSessions = useMemo(() => {
    const pool =
      leaveFilterDays.length === 0
        ? teacherSessions
        : teacherSessions.filter((s) => leaveFilterDays.includes(s.dayOfWeek));
    // 週一第1節 → 第7／8節，再週二…至週五
    return [...pool].sort(
      (a, b) => a.dayOfWeek - b.dayOfWeek || a.period - b.period
    );
  }, [teacherSessions, leaveFilterDays]);

  const leaveDaysAvailable = useMemo(() => {
    const days = Array.from(new Set(leaveSelectableSessions.map((s) => s.dayOfWeek))) as DayOfWeek[];
    return days.sort((a, b) => a - b);
  }, [leaveSelectableSessions]);

  const multiDaySessions = useMemo(() => {
    if (multiLeaveDay === '') return [];
    return leaveSelectableSessions.filter((s) => s.dayOfWeek === multiLeaveDay);
  }, [leaveSelectableSessions, multiLeaveDay]);

  const batchLeaveSessions = useMemo(() => {
    if (requestType !== 'substitute' || leavePickMode !== 'multi') return [];
    return multiDaySessions.filter((s) => selectedLeaveSlotIds.includes(s.id));
  }, [requestType, leavePickMode, multiDaySessions, selectedLeaveSlotIds]);

  // Smart candidate recommendations / clash checking target:
  // - substitute：必用（請假星期/節次）建立暫代課堂
  // - swap/reschedule：使用原課堂 selectedSession
  const matchedLeaveSession =
    teacherSessions.find((s) => s.id === leaveSlotId) ||
    teacherSessions.find((s) => s.dayOfWeek === leaveDay && s.period === leavePeriod);

  const placeholderSession: CourseSession | undefined =
    currentTeacher && leaveDay !== '' && leavePeriod !== ''
      ? {
          id: `s-placeholder-${currentTeacher.id}-${leaveDay}-${leavePeriod}`,
          dayOfWeek: leaveDay,
          period: leavePeriod,
          className: '未指派課堂',
          subjectName: '請假派代',
          teacherId: currentTeacher.id,
          teacherName: currentTeacher.name,
          venueId: '',
          venueName: '原教室',
          isPractical: false,
          notes: '由系統暫代課堂資訊（僅用於計算代課教師資格）',
        }
      : undefined;

  const leaveSessionsForSubmit = useMemo((): CourseSession[] => {
    if (requestType !== 'substitute') return [];
    if (leavePickMode === 'multi' && teacherSessions.length > 0) return batchLeaveSessions;
    if (matchedLeaveSession) return [matchedLeaveSession];
    if (placeholderSession) return [placeholderSession];
    return [];
  }, [
    requestType,
    leavePickMode,
    teacherSessions.length,
    batchLeaveSessions,
    matchedLeaveSession,
    placeholderSession,
  ]);

  const effectiveOriginalSession: CourseSession | undefined =
    requestType === 'substitute'
      ? leaveSessionsForSubmit[0]
      : selectedSession;

  const candidateSubstitutes = useMemo(() => {
    if (!effectiveOriginalSession || !currentTeacher) return [];
    const targets =
      leavePickMode === 'multi' && leaveSessionsForSubmit.length > 0
        ? leaveSessionsForSubmit
        : [effectiveOriginalSession];

    return rankSubstituteCandidates({
      teachers,
      sessions,
      requests,
      excludeTeacherId: currentTeacher.id,
      targetDayOfWeek: targets[0].dayOfWeek,
      targetPeriod: targets.map((s) => s.period),
      subjectName: targets.map((s) => s.subjectName),
      applicantDepartment: currentTeacher.department,
      maxWeeklyOverloadPeriods: systemConfig.maxWeeklyOverloadPeriods,
    });
  }, [
    teachers,
    currentTeacher,
    effectiveOriginalSession,
    sessions,
    requests,
    systemConfig,
    leavePickMode,
    leaveSessionsForSubmit,
  ]);

  // If in substitute mode and teacher has sessions, initialize leave slot
  useEffect(() => {
    if (requestType !== 'substitute') return;
    if (teacherSessions.length === 0) return;

    const pool =
      leaveFilterDays.length === 0
        ? teacherSessions
        : teacherSessions.filter((s) => leaveFilterDays.includes(s.dayOfWeek));

    if (pool.length === 0) {
      setLeaveSlotId('');
      if (leaveFilterDays.length === 1) {
        setLeaveDay(leaveFilterDays[0]);
        setLeavePeriod('');
      } else {
        setLeaveDay('');
        setLeavePeriod('');
      }
      return;
    }

    setLeaveSlotId((prev) => {
      if (prev && pool.some((s) => s.id === prev)) {
        const cur = pool.find((s) => s.id === prev)!;
        setLeaveDay(cur.dayOfWeek);
        setLeavePeriod(cur.period);
        return prev;
      }
      if (initialSession && pool.some((s) => s.id === initialSession.id)) {
        setLeaveDay(initialSession.dayOfWeek);
        setLeavePeriod(initialSession.period);
        return initialSession.id;
      }
      const first = pool[0];
      setLeaveDay(first.dayOfWeek);
      setLeavePeriod(first.period);
      return first.id;
    });
  }, [requestType, teacherSessions, initialSession, leaveFilterDays]);

  // 同日多節：星期對齊可選日；進入多節時預設全選該日課堂
  useEffect(() => {
    if (requestType !== 'substitute' || leavePickMode !== 'multi') return;
    if (leaveDaysAvailable.length === 0) {
      setMultiLeaveDay('');
      setSelectedLeaveSlotIds([]);
      return;
    }
    const day =
      multiLeaveDay !== '' && leaveDaysAvailable.includes(multiLeaveDay)
        ? multiLeaveDay
        : leaveDaysAvailable[0];
    if (day !== multiLeaveDay) setMultiLeaveDay(day);
    const daySessions = leaveSelectableSessions.filter((s) => s.dayOfWeek === day);
    setSelectedLeaveSlotIds((prev) => {
      const retained = prev.filter((id) => daySessions.some((s) => s.id === id));
      return retained.length > 0 ? retained : daySessions.map((s) => s.id);
    });
    if (daySessions[0]) {
      setLeaveDay(day);
      setLeavePeriod(daySessions[0].period);
      setLeaveSlotId(daySessions[0].id);
    }
  }, [requestType, leavePickMode, leaveDaysAvailable, leaveSelectableSessions, multiLeaveDay]);

  // Candidate partner sessions for swap：僅同班
  const swapTeacherSessions = sessions.filter(
    (s) =>
      s.teacherId === swapTeacherId &&
      effectiveOriginalSession &&
      s.className === effectiveOriginalSession.className &&
      s.id !== effectiveOriginalSession.id
  );

  // 同班可互調的其他教師（至少有一堂同班課）
  const swapPartnerTeachers = useMemo(() => {
    if (!effectiveOriginalSession || !currentTeacher) return [];
    const className = effectiveOriginalSession.className;
    const ids = new Set(
      sessions
        .filter(
          (s) =>
            s.className === className &&
            s.teacherId !== currentTeacher.id
        )
        .map((s) => s.teacherId)
    );
    return teachers.filter((t) => ids.has(t.id));
  }, [sessions, teachers, effectiveOriginalSession, currentTeacher]);

  // Auto-set paymentType based on leaveType
  useEffect(() => {
    if (requestType === 'substitute') {
      if (['official', 'training', 'bereavement', 'maternity'].includes(leaveType)) {
        setPaymentType('public');
      } else {
        setPaymentType('private');
      }
    } else {
      setPaymentType('private');
    }
  }, [leaveType, requestType]);

  // 互調：預設選同班教師；調課／補課仍可用全校預設
  useEffect(() => {
    if (requestType === 'swap') {
      if (swapPartnerTeachers.length === 0) {
        if (swapTeacherId) setSwapTeacherId('');
        return;
      }
      if (!swapTeacherId || !swapPartnerTeachers.some((t) => t.id === swapTeacherId)) {
        setSwapTeacherId(swapPartnerTeachers[0].id);
      }
      return;
    }
    const candidateTeachers = teachers.filter((t) => t.id !== currentTeacher?.id);
    const sameDept = candidateTeachers.find((t) => t.department === currentTeacher?.department);
    const defaultPartner = sameDept || candidateTeachers[0];
    // Substitute (請假派代) 需要先選定請假節次才知道有沒有衝堂
    if (requestType !== 'substitute' && defaultPartner && !substituteTeacherId) {
      setSubstituteTeacherId(defaultPartner.id);
    }
  }, [currentTeacher, teachers, requestType, swapPartnerTeachers, swapTeacherId, substituteTeacherId]);

  // 互調課堂：對調教師變更或同班過濾後，自動選第一堂可對調課
  useEffect(() => {
    if (requestType !== 'swap') return;
    if (swapTeacherSessions.length === 0) {
      if (swapSessionId) setSwapSessionId('');
      return;
    }
    if (!swapSessionId || !swapTeacherSessions.some((s) => s.id === swapSessionId)) {
      setSwapSessionId(swapTeacherSessions[0].id);
    }
  }, [requestType, swapTeacherSessions, swapSessionId]);

  // When substitute mode + leave slot is ready, auto-pick a non-clashing substitute
  useEffect(() => {
    if (requestType !== 'substitute') return;
    if (!effectiveOriginalSession || !currentTeacher) return;
    if (hasUserChosenSubstituteTeacher) return;

    const selected = substituteTeacherId
      ? candidateSubstitutes.find((c) => c.teacher.id === substituteTeacherId)
      : undefined;

    // If empty, or current selection clashes, choose the first non-clash candidate.
    if (!substituteTeacherId || selected?.hasClash) {
      const best =
        candidateSubstitutes.find((c) => !c.hasClash && c.isSameSubject) ||
        candidateSubstitutes.find((c) => !c.hasClash && c.isSameDept) ||
        candidateSubstitutes.find((c) => !c.hasClash);
      if (best) setSubstituteTeacherId(best.teacher.id);
    }
  }, [
    requestType,
    effectiveOriginalSession,
    currentTeacher,
    substituteTeacherId,
    candidateSubstitutes,
    hasUserChosenSubstituteTeacher,
  ]);

  // Target Reschedule Venue default
  useEffect(() => {
    if (selectedSession && !targetVenueId) {
      setTargetVenueId(selectedSession.venueId);
    }
  }, [selectedSession]);

  // Dynamic Clash Checking
  const swapTargetSession = sessions.find((s) => s.id === swapSessionId);
  const targetVenueObj = venues.find((v) => v.id === targetVenueId);

  const clashResult: ClashCheckResult = (() => {
    if (requestType === 'substitute') {
      const targets = leaveSessionsForSubmit;
      if (targets.length === 0 || !currentTeacher) {
        return { hasClash: false, severity: 'none', messages: [] };
      }
      const results = targets.map((originalSession) => {
        const result = checkClashes({
          requestType,
          applicantTeacherId: currentTeacher.id,
          originalSession,
          substituteTeacherId: substituteTeacherId || undefined,
        });
        const prefix = targets.length > 1 ? `第${originalSession.period}節：` : '';
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
    }
    if (!effectiveOriginalSession) {
      return { hasClash: false, severity: 'none', messages: [] };
    }
    return checkClashes({
      requestType,
      applicantTeacherId: currentTeacher?.id || '',
      originalSession: effectiveOriginalSession,
      targetReschedule:
        requestType === 'reschedule'
          ? {
              dayOfWeek: targetDay,
              period: targetPeriod,
              venueId: targetVenueId,
            }
          : undefined,
      swapTargetTeacherId: requestType === 'swap' ? swapTeacherId : undefined,
      swapTargetSession: requestType === 'swap' ? swapTargetSession : undefined,
      substituteTeacherId: undefined,
    });
  })();

  const dayNames = ['', '週一', '週二', '週三', '週四', '週五'];

  const leaveRangeHint =
    requestType === 'substitute' &&
    leaveDateMode === 'range' &&
    leaveDateStart &&
    leaveDateEnd &&
    leaveDateEnd >= leaveDateStart &&
    leaveDay !== ''
      ? countMatchingWeekdays(
          leaveDateStart,
          leaveDateEnd,
          leaveDay,
          nonTeachingDateSet(systemConfig.nonTeachingDays)
        )
      : 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTeacher) return;

    if (teacherSessions.length === 0 && requestType !== 'substitute') {
      alert('目前找不到你的排課資料，僅支援請假派代。請切換到「請假派代」後再送出。');
      return;
    }

    if (requestType === 'substitute') {
      const sessionsToLeave = leaveSessionsForSubmit;
      if (sessionsToLeave.length === 0) {
        alert(
          leavePickMode === 'multi'
            ? '請勾選至少一節同日請假節次。'
            : '請先選擇「請假星期」與「請假節次」。'
        );
        return;
      }
      if (leavePickMode === 'multi') {
        const days = new Set(sessionsToLeave.map((s) => s.dayOfWeek));
        if (days.size > 1) {
          alert('連續節次請假須為同一星期，請勿跨日勾選。');
          return;
        }
      }
      const leaveCheck = validateSubstituteLeaveInput({
        leaveDateMode,
        leaveDateStart,
        leaveDateEnd,
        sessions: sessionsToLeave,
        existing: requests,
        applicantTeacherId: currentTeacher.id,
        dayNames,
      });
      if (leaveCheck.ok === false) {
        alert(leaveCheck.message);
        return;
      }
      if (clashResult.hasClash) {
        alert('存在衝堂衝突，請改選代課教師或節次後再送出。');
        return;
      }

      const subTeacher = teachers.find((t) => t.id === substituteTeacherId);
      const resolvedLeaveEnd =
        leaveDateMode === 'range'
          ? resolveLeaveDateEnd(leaveDateStart, leaveDateEnd)
          : leaveDateStart;
      const batchGroupId =
        sessionsToLeave.length > 1 ? `batch-${Date.now()}` : undefined;
      const batchStamp = Date.now();

      try {
        addSubstituteRequests(
          sessionsToLeave.map((originalSession) => ({
            requestType: 'substitute' as const,
            applicantTeacherId: currentTeacher.id,
            applicantTeacherName: currentTeacher.name,
            applicantDepartment: currentTeacher.department,
            leaveType,
            leaveDateStart,
            leaveDateEnd: resolvedLeaveEnd,
            reason,
            paymentType,
            originalSession,
            batchGroupId,
            substituteTeacherId: substituteTeacherId || undefined,
            substituteTeacherName: subTeacher?.name,
          })),
          requestMonth,
          { idNoncePrefix: String(batchStamp) }
        );
      } catch (err) {
        alert(err instanceof Error ? err.message : '送出失敗，請檢查資料後重試。');
        return;
      }
      onClose();
      return;
    }

    if (!effectiveOriginalSession) return;

    if (clashResult.hasClash) {
      alert(clashResult.messages[0] || '存在衝堂衝突，請調整後再送出。');
      return;
    }

    if (requestType === 'swap' && (!swapTeacherId || !swapTargetSession)) {
      alert('請完整選擇對調教師與對調課堂');
      return;
    }

    if (requestType === 'swap' && effectiveOriginalSession && swapTargetSession) {
      if (effectiveOriginalSession.className !== swapTargetSession.className) {
        alert('相互調課僅限同一班級內、兩位教師對調時段，不可跨班。');
        return;
      }
      if (effectiveOriginalSession.teacherId === swapTargetSession.teacherId) {
        alert('相互調課須與另一位教師對調，不可選自己的課。');
        return;
      }
      if (swapTargetSession.teacherId !== swapTeacherId) {
        alert('對調課堂與所選對調教師不符，請重新選擇。');
        return;
      }
    }

    const swapPartner = teachers.find((t) => t.id === swapTeacherId);
    const subTeacher = teachers.find((t) => t.id === substituteTeacherId);

    try {
      addSubstituteRequest({
        requestType,
        applicantTeacherId: currentTeacher.id,
        applicantTeacherName: currentTeacher.name,
        applicantDepartment: currentTeacher.department,
        leaveType: undefined,
        leaveDateStart: undefined,
        leaveDateEnd: undefined,
        reason,
        paymentType,
        originalSession: effectiveOriginalSession,
        targetReschedule:
          requestType === 'reschedule'
            ? {
                dayOfWeek: targetDay,
                period: targetPeriod,
                venueId: targetVenueId,
                venueName: targetVenueObj?.name || '指定教室',
              }
            : undefined,
        swapTargetTeacherId: requestType === 'swap' ? swapTeacherId : undefined,
        swapTargetTeacherName: requestType === 'swap' ? swapPartner?.name : undefined,
        swapTargetSession: requestType === 'swap' ? swapTargetSession : undefined,
        substituteTeacherId: undefined,
        substituteTeacherName: undefined,
      }, requestMonth);
    } catch (err) {
      alert(err instanceof Error ? err.message : '送出失敗，請檢查資料後重試。');
      return;
    }

    onClose();
  };

  return (
    <ModalShell
      scroll="body"
      panelClassName="bg-white rounded-2xl shadow-2xl max-w-2xl w-full border border-slate-200 animate-in fade-in zoom-in duration-150"
    >
        {/* Header */}
        <div className="shrink-0 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500 text-slate-950 flex items-center justify-center font-bold">
              +
            </div>
            <div>
              <h2 className="font-bold text-base sm:text-lg">新增調代課申請</h2>
              <p className="text-xs text-slate-400">
                申請人：{currentTeacher?.name} ({currentTeacher?.department} · {currentTeacher?.title})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body：獨立捲動，避免連續節次時整窗超出螢幕卻捲不到 */}
          <form onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col text-slate-800 text-sm">
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-6 space-y-5">

            {/* Step 1: Select Original Session / Leave Slot */}
            <div>
              {requestType === 'substitute' ? (
                <>
                  <div className="flex items-start space-x-2 mb-2">
                    <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5" />
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                        1. 選擇要請假的節次
                      </label>
                      <p className="text-[11px] text-slate-500 mt-1">
                        請先選擇請假「星期」與「節次」，再送出派代申請。
                      </p>
                    </div>
                  </div>

                  {teacherSessions.length > 0 ? (
                    <div>
                      <select
                        id="select-leave-slot"
                        value={leaveSlotId}
                        onChange={(e) => {
                          const id = e.target.value;
                          setLeaveSlotId(id);
                          const slot = teacherSessions.find((s) => s.id === id);
                          if (slot) {
                            setLeaveDay(slot.dayOfWeek);
                            setLeavePeriod(slot.period);
                          }
                        }}
                        className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs sm:text-sm font-medium focus:ring-1 focus:ring-amber-500"
                      >
                        {teacherSessions.map((s) => (
                          <option key={s.id} value={s.id}>
                            {dayNames[s.dayOfWeek]} 第{s.period}節 《{s.subjectName}》{s.isConcurrent ? '【兼課】' : ''}
                          </option>
                        ))}
                      </select>
                      <p className="text-[11px] text-slate-500 mt-2">
                        僅列出你名下「有課」的節次。
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">星期</label>
                        <select
                          value={leaveDay}
                          onChange={(e) => {
                            const v = e.target.value;
                            setLeaveDay(v === '' ? '' : (Number(v) as DayOfWeek));
                          }}
                          className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs font-medium focus:ring-1 focus:ring-amber-500"
                        >
                          <option value="">-- 請選擇 --</option>
                          {dayNames.slice(1).map((name, idx) => {
                            const day = (idx + 1) as DayOfWeek;
                            return (
                              <option key={day} value={day}>
                                {name}
                              </option>
                            );
                          })}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">節次</label>
                        <select
                          value={leavePeriod}
                          onChange={(e) => {
                            const v = e.target.value;
                            setLeavePeriod(v === '' ? '' : Number(v));
                          }}
                          className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs font-medium focus:ring-1 focus:ring-amber-500"
                        >
                          <option value="">-- 請選擇 --</option>
                          {[1, 2, 3, 4, 5, 6, 7, 8].map((p) => (
                            <option key={p} value={p}>
                              第{p}節 ({PERIOD_DEFINITIONS.find((def) => def.period === p)?.timeRange})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    1. 選擇要調整的課堂（原授課堂）
                  </label>
                  <select
                    id="select-original-session"
                    value={selectedSessionId}
                    onChange={(e) => setSelectedSessionId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-slate-800 font-medium focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  >
                    {teacherSessions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {dayNames[s.dayOfWeek]} 第{s.period}節 ({PERIOD_DEFINITIONS.find((p) => p.period === s.period)?.timeRange}) ｜ {s.className} 《{s.subjectName}》{s.isConcurrent ? '【兼課】' : ''} @ {s.venueName}
                      </option>
                    ))}
                  </select>
                </>
              )}
            </div>

          {/* Step 2: Request Type Switcher Tabs */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
              2. 選擇調代課類型
            </label>
            <div className={`grid ${teacherSessions.length > 0 ? 'grid-cols-3' : 'grid-cols-1'} gap-2`}>
              
              {/* Substitute Tab */}
              <button
                type="button"
                id="tab-type-substitute"
                onClick={() => {
                  setRequestType('substitute');
                  setHasUserChosenSubstituteTeacher(false);
                  setSubstituteTeacherId('');
                }}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition ${
                  requestType === 'substitute'
                    ? 'bg-amber-50 border-amber-500 text-amber-900 ring-2 ring-amber-500/20 font-semibold'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <UserCheck className={`w-5 h-5 mb-1 ${requestType === 'substitute' ? 'text-amber-600' : 'text-slate-400'}`} />
                <span className="text-xs sm:text-sm">👤 請假派代</span>
                <span className="text-[10px] text-slate-500 mt-0.5">公假/事病假派代</span>
              </button>

              {teacherSessions.length > 0 && (
                <button
                  type="button"
                  id="tab-type-swap"
                  onClick={() => {
                    setRequestType('swap');
                    setHasUserChosenSubstituteTeacher(false);
                    setSubstituteTeacherId('');
                  }}
                  className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition ${
                    requestType === 'swap'
                      ? 'bg-indigo-50 border-indigo-500 text-indigo-900 ring-2 ring-indigo-500/20 font-semibold'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <ArrowLeftRight className={`w-5 h-5 mb-1 ${requestType === 'swap' ? 'text-indigo-600' : 'text-slate-400'}`} />
                  <span className="text-xs sm:text-sm">🔄 相互調課</span>
                  <span className="text-[10px] text-slate-500 mt-0.5">雙方時段互換</span>
                </button>
              )}

              {/* Reschedule Tab */}
              {teacherSessions.length > 0 && (
                <button
                  type="button"
                  id="tab-type-reschedule"
                  onClick={() => {
                    setRequestType('reschedule');
                    setHasUserChosenSubstituteTeacher(false);
                    setSubstituteTeacherId('');
                  }}
                  className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition ${
                    requestType === 'reschedule'
                      ? 'bg-emerald-50 border-emerald-500 text-emerald-900 ring-2 ring-emerald-500/20 font-semibold'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Clock className={`w-5 h-5 mb-1 ${requestType === 'reschedule' ? 'text-emerald-600' : 'text-slate-400'}`} />
                  <span className="text-xs sm:text-sm">⏱️ 自行移課</span>
                  <span className="text-[10px] text-slate-500 mt-0.5">移至無課空堂</span>
                </button>
              )}
            </div>
          </div>

          {/* Conditional Options: Type Specific Fields */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4">
            
            {/* SUBTITUTE: Leave Type & Auto Payment */}
            {requestType === 'substitute' && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    請假日期
                  </label>
                  <div className="flex gap-2 mb-2">
                    <button
                      type="button"
                      onClick={() => {
                        setLeaveDateMode('single');
                        setLeaveDateEnd('');
                      }}
                      className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
                        leaveDateMode === 'single'
                          ? 'bg-amber-500 text-slate-950 border-amber-500'
                          : 'bg-white text-slate-600 border-slate-300'
                      }`}
                    >
                      單日
                    </button>
                    <button
                      type="button"
                      onClick={() => setLeaveDateMode('range')}
                      className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
                        leaveDateMode === 'range'
                          ? 'bg-amber-500 text-slate-950 border-amber-500'
                          : 'bg-white text-slate-600 border-slate-300'
                      }`}
                    >
                      起迄
                    </button>
                  </div>
                  <div className={`grid gap-2 ${leaveDateMode === 'range' ? 'grid-cols-2' : 'grid-cols-1'}`}>
                    <div>
                      <label className="block text-[10px] text-slate-500 mb-0.5">
                        {leaveDateMode === 'range' ? '開始日' : '請假日'}
                      </label>
                      <input
                        type="date"
                        required
                        value={leaveDateStart}
                        onChange={(e) => setLeaveDateStart(e.target.value)}
                        className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs sm:text-sm font-medium focus:ring-1 focus:ring-amber-500"
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
                          className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs sm:text-sm font-medium focus:ring-1 focus:ring-amber-500"
                        />
                      </div>
                    )}
                  </div>
                  {leaveFilterDays.length > 0 ? (
                    <p className="mt-1.5 text-[11px] text-indigo-700 font-medium leading-relaxed">
                      已依請假起迄篩選，下方節次僅顯示「{formatWeekdayList(leaveFilterDays, dayNames)}」
                      {leaveDateMode === 'range' && leaveRangeHint > 0
                        ? `（所選節次區間約 ${leaveRangeHint} 次）`
                        : ''}
                      。
                    </p>
                  ) : (
                    <p className="mt-1.5 text-[11px] text-slate-500 leading-relaxed">
                      請先選擇請假日期，節次列表會自動只顯示區間內有課的課堂。
                    </p>
                  )}
                </div>

                {/* When teacher has sessions, show filtered leave slot selector */}
                {teacherSessions.length > 0 && (
                  <div className="space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="block text-xs font-semibold text-slate-700">
                        請假節次
                        {leaveFilterDays.length > 0
                          ? `（僅 ${formatWeekdayList(leaveFilterDays, dayNames)} · ${leaveSelectableSessions.length} 節）`
                          : '（請先選請假日期，或暫列全部有課節次）'}
                      </label>
                      <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden text-[11px] font-bold">
                        <button
                          type="button"
                          onClick={() => setLeavePickMode('single')}
                          className={`px-2.5 py-1 ${
                            leavePickMode === 'single'
                              ? 'bg-indigo-600 text-white'
                              : 'bg-white text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          單節
                        </button>
                        <button
                          type="button"
                          onClick={() => setLeavePickMode('multi')}
                          className={`px-2.5 py-1 border-l border-slate-200 ${
                            leavePickMode === 'multi'
                              ? 'bg-indigo-600 text-white'
                              : 'bg-white text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          同日連續多節
                        </button>
                      </div>
                    </div>
                    {leaveSelectableSessions.length === 0 ? (
                      <div className="p-2.5 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg">
                        {leaveFilterDays.length > 0
                          ? `你在「${formatWeekdayList(leaveFilterDays, dayNames)}」沒有排定課堂，請改請假起迄。`
                          : '目前沒有可選節次。'}
                      </div>
                    ) : leavePickMode === 'single' ? (
                      <select
                        id="select-leave-slot"
                        value={leaveSlotId}
                        onChange={(e) => {
                          const id = e.target.value;
                          setLeaveSlotId(id);
                          const slot = leaveSelectableSessions.find((s) => s.id === id);
                          if (slot) {
                            setLeaveDay(slot.dayOfWeek);
                            setLeavePeriod(slot.period);
                          }
                        }}
                        className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs sm:text-sm font-medium focus:ring-1 focus:ring-amber-500"
                      >
                        {leaveSelectableSessions.map((s) => (
                          <option key={s.id} value={s.id}>
                            {dayNames[s.dayOfWeek]} 第{s.period}節 《{s.subjectName}》
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="space-y-2 p-3 rounded-xl border border-indigo-100 bg-indigo-50/40">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[11px] font-bold text-slate-600">星期</span>
                          <select
                            value={multiLeaveDay === '' ? '' : String(multiLeaveDay)}
                            onChange={(e) => {
                              const d = Number(e.target.value) as DayOfWeek;
                              setMultiLeaveDay(d);
                              const daySessions = leaveSelectableSessions.filter(
                                (s) => s.dayOfWeek === d
                              );
                              setSelectedLeaveSlotIds(daySessions.map((s) => s.id));
                              if (daySessions[0]) {
                                setLeaveDay(d);
                                setLeavePeriod(daySessions[0].period);
                                setLeaveSlotId(daySessions[0].id);
                              }
                            }}
                            className="bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-xs font-medium"
                          >
                            {leaveDaysAvailable.map((d) => (
                              <option key={d} value={d}>
                                {dayNames[d]}
                              </option>
                            ))}
                          </select>
                          <span className="text-[11px] text-indigo-800 font-medium">
                            已選 {batchLeaveSessions.length} 節
                            {batchLeaveSessions.length > 0
                              ? `（${formatPeriodsLabel(batchLeaveSessions.map((s) => s.period))}）`
                              : ''}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500">
                          勾選同一天要請假的節次（例如實習第2～7節）。送出後會產生多筆申請並合併通知單。
                        </p>
                        <div className="max-h-56 sm:max-h-64 overflow-y-auto space-y-1.5 pr-1">
                          {multiDaySessions.length === 0 ? (
                            <p className="text-[11px] text-amber-800">此日沒有排定課堂。</p>
                          ) : (
                            multiDaySessions.map((s) => {
                              const checked = selectedLeaveSlotIds.includes(s.id);
                              return (
                                <label
                                  key={s.id}
                                  className={`flex items-start gap-2 p-2 rounded-lg border cursor-pointer text-xs ${
                                    checked
                                      ? 'bg-white border-indigo-300'
                                      : 'bg-white/70 border-slate-200'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    className="mt-0.5"
                                    checked={checked}
                                    onChange={() => {
                                      setSelectedLeaveSlotIds((prev) => {
                                        const next = checked
                                          ? prev.filter((id) => id !== s.id)
                                          : [...prev, s.id];
                                        const still = multiDaySessions.filter((x) =>
                                          next.includes(x.id)
                                        );
                                        if (still[0]) {
                                          setLeaveDay(still[0].dayOfWeek);
                                          setLeavePeriod(still[0].period);
                                          setLeaveSlotId(still[0].id);
                                        }
                                        return next;
                                      });
                                    }}
                                  />
                                  <span>
                                    <span className="font-bold text-slate-800">
                                      第{s.period}節
                                    </span>{' '}
                                    《{s.subjectName}》 {s.className}
                                    {s.isPractical ? (
                                      <span className="ml-1 text-amber-700">實習</span>
                                    ) : null}
                                  </span>
                                </label>
                              );
                            })
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      請假假別
                    </label>
                    <select
                      id="select-leave-type"
                      value={leaveType}
                      onChange={(e) => setLeaveType(e.target.value as LeaveType)}
                      className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs sm:text-sm font-medium focus:ring-1 focus:ring-amber-500"
                    >
                      <option value="official">🏛️ 公假 / 公差 (帶學生競賽、出差、公文指派)</option>
                      <option value="training">📚 研習 / 評鑑 / 技能檢定監評 (公假)</option>
                      <option value="bereavement">🕊️ 喪假 (依規定公費派代)</option>
                      <option value="maternity">👶 產假 / 陪產檢及產假 (公費派代)</option>
                      <option value="personal">💼 事假 (自費代課)</option>
                      <option value="sick">🩺 病假 (自費代課)</option>
                      <option value="other">📝 其他私事需求 (自費代課)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      鐘點費支給判定
                    </label>
                    <div className="p-2 rounded-lg border bg-white flex items-center justify-between text-xs sm:text-sm">
                      <span className="font-semibold">
                        {paymentType === 'public' ? (
                          <span className="text-blue-700 flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                            公費派代 (學校支付 {sessionRateKind} {sessionHourlyRate}元/節)
                          </span>
                        ) : (
                          <span className="text-amber-800 flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                            自費代課 (個人扣繳 {sessionRateKind} {sessionHourlyRate}元/節)
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-semibold text-slate-700">
                      指派代課教師（系統推薦該時段空堂師資，或留空由教學組媒合）
                    </label>
                  </div>

                  {/* Smart recommendation cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-44 overflow-y-auto pr-1 mb-2">
                    {/* "由教學組媒合" option */}
                    <div
                      onClick={() => {
                        setHasUserChosenSubstituteTeacher(false);
                        setSubstituteTeacherId('');
                      }}
                      className={`p-2.5 rounded-xl border transition cursor-pointer ${
                        !substituteTeacherId
                          ? 'bg-amber-50 border-amber-500 ring-2 ring-amber-400/20'
                          : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <div className="text-xs font-bold text-slate-700">由教學組協助媒合</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">送出後由教務處教學組指派</div>
                    </div>

                    {candidateSubstitutes
                      .filter((c) => !c.hasClash)
                      .slice(0, showAllTeachers ? undefined : 5)
                      .map(({ teacher: cand, isSameSubject, isSameDept, weeklyOverload, isNearLimit }) => {
                        const isSelected = substituteTeacherId === cand.id;
                        return (
                          <div
                            key={cand.id}
                            onClick={() => {
                              setHasUserChosenSubstituteTeacher(true);
                              setSubstituteTeacherId(cand.id);
                            }}
                            className={`p-2.5 rounded-xl border transition cursor-pointer ${
                              isSelected
                                ? 'bg-indigo-50 border-indigo-600 ring-2 ring-indigo-500/20 shadow-xs'
                                : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-bold text-slate-900">{cand.name}</span>
                              <span className="text-[11px] text-slate-500">{cand.department}</span>
                            </div>
                            <div className="flex flex-wrap items-center gap-1 mt-1 text-[10px]">
                              <span className="px-1.5 py-0.2 bg-emerald-100 text-emerald-800 font-bold rounded">
                                ✓ 空堂
                              </span>
                              {isSameSubject && (
                                <span className="px-1.5 py-0.2 bg-violet-100 text-violet-800 font-bold rounded">
                                  同科目
                                </span>
                              )}
                              {!isSameSubject && isSameDept && (
                                <span className="px-1.5 py-0.2 bg-blue-100 text-blue-800 font-bold rounded">
                                  同科
                                </span>
                              )}
                              {isNearLimit && (
                                <span className="px-1.5 py-0.2 bg-amber-100 text-amber-800 font-bold rounded">
                                  接近9節上限
                                </span>
                              )}
                              <span className="px-1.5 py-0.2 bg-slate-200 text-slate-700 rounded">
                                超鐘點 {weeklyOverload}節
                              </span>
                            </div>
                          </div>
                        );
                      })}
                  </div>

                  {candidateSubstitutes.filter((c) => !c.hasClash).length > 5 && !showAllTeachers && (
                    <button
                      type="button"
                      onClick={() => setShowAllTeachers(true)}
                      className="text-xs text-indigo-600 hover:text-indigo-800 mb-2"
                    >
                      顯示全部 {candidateSubstitutes.filter((c) => !c.hasClash).length} 位空堂教師 ▼
                    </button>
                  )}

                  {/* Fallback: manual select for teachers with clashes too */}
                  <details className="text-xs">
                    <summary className="cursor-pointer text-slate-500 hover:text-slate-700">
                      手動選取（含有課教師）
                    </summary>
                    <input
                      type="text"
                      value={manualTeacherQuery}
                      onChange={(e) => setManualTeacherQuery(e.target.value)}
                      placeholder="可輸入姓名 / 科別 / 職稱搜尋"
                      className="w-full mt-1.5 bg-white border border-slate-300 rounded-lg p-2 text-xs focus:ring-1 focus:ring-amber-500"
                    />
                    <select
                      id="select-substitute-teacher"
                      value={substituteTeacherId}
                      onChange={(e) => {
                        setHasUserChosenSubstituteTeacher(true);
                        setSubstituteTeacherId(e.target.value);
                      }}
                      className="w-full mt-1.5 bg-white border border-slate-300 rounded-lg p-2 text-xs font-medium focus:ring-1 focus:ring-amber-500"
                    >
                      <option value="">-- 由教學組媒合 --</option>
                      {teachers
                        .filter((t) => t.id !== currentTeacher?.id)
                        .filter((t) => {
                          if (!manualTeacherQuery.trim()) return true;
                          const q = manualTeacherQuery.trim().toLowerCase();
                          return (
                            t.name.toLowerCase().includes(q) ||
                            t.department.toLowerCase().includes(q) ||
                            t.title.toLowerCase().includes(q)
                          );
                        })
                        .map((t) => {
                          const targetDay = effectiveOriginalSession?.dayOfWeek;
                          const targetP = effectiveOriginalSession?.period;
                          const hasClash =
                            typeof targetDay === 'number' && typeof targetP === 'number'
                              ? sessions.some(
                                  (s) =>
                                    s.teacherId === t.id &&
                                    s.dayOfWeek === targetDay &&
                                    s.period === targetP
                                )
                              : false;

                          // Only show selectable teachers (no clash), user asked to show "可選取部份就好".
                          if (hasClash) return null;

                          return (
                            <option key={t.id} value={t.id}>
                              {t.name} ({t.department} · {t.title})
                            </option>
                          );
                        })}
                    </select>
                  </details>
                </div>
              </>
            )}

            {/* SWAP: 同班雙師對調時段；雙方教師調入後皆不可衝堂 */}
            {requestType === 'swap' && (
              <div className="space-y-3">
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                  相互調課＝同一班級內兩位教師對調時段。雙方調入對方時段後皆不可衝堂（教師課表／班級／工場）。
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      同班對調教師
                    </label>
                    <select
                      id="select-swap-teacher"
                      value={swapTeacherId}
                      disabled={swapPartnerTeachers.length === 0}
                      onChange={(e) => {
                        const nextId = e.target.value;
                        setSwapTeacherId(nextId);
                        const className = effectiveOriginalSession?.className;
                        const partnerSameClass = sessions.filter(
                          (s) =>
                            s.teacherId === nextId &&
                            s.className === className &&
                            s.id !== effectiveOriginalSession?.id
                        );
                        setSwapSessionId(partnerSameClass[0]?.id || '');
                      }}
                      className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs sm:text-sm font-medium focus:ring-1 focus:ring-indigo-500"
                    >
                      {swapPartnerTeachers.length === 0 ? (
                        <option value="">此班無其他教師可對調</option>
                      ) : (
                        swapPartnerTeachers.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name} ({t.department} · {t.title})
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      對方同班課堂（調入您時段）
                    </label>
                    <select
                      id="select-swap-session"
                      value={swapSessionId}
                      onChange={(e) => setSwapSessionId(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs sm:text-sm font-medium focus:ring-1 focus:ring-indigo-500"
                    >
                      {swapTeacherSessions.length === 0 ? (
                        <option value="">該教師於此班暫無可對調課堂</option>
                      ) : (
                        swapTeacherSessions.map((s) => (
                          <option key={s.id} value={s.id}>
                            {dayNames[s.dayOfWeek]} 第{s.period}節 《{s.subjectName}》
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* RESCHEDULE: Target Day, Period, Venue */}
            {requestType === 'reschedule' && (
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    目標星期
                  </label>
                  <select
                    id="select-target-day"
                    value={targetDay}
                    onChange={(e) => setTargetDay(Number(e.target.value) as DayOfWeek)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs sm:text-sm font-medium focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value={1}>週一</option>
                    <option value={2}>週二</option>
                    <option value={3}>週三</option>
                    <option value={4}>週四</option>
                    <option value={5}>週五</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    目標節次
                  </label>
                  <select
                    id="select-target-period"
                    value={targetPeriod}
                    onChange={(e) => setTargetPeriod(Number(e.target.value))}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs sm:text-sm font-medium focus:ring-1 focus:ring-emerald-500"
                  >
                    {PERIOD_DEFINITIONS.map((p) => (
                      <option key={p.period} value={p.period}>
                        {p.label} ({p.timeRange})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    上課工場 / 教室
                  </label>
                  <select
                    id="select-target-venue"
                    value={targetVenueId}
                    onChange={(e) => setTargetVenueId(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs sm:text-sm font-medium focus:ring-1 focus:ring-emerald-500"
                  >
                    {venues.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Reason text input */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                申請事由與備註說明
              </label>
              <textarea
                id="input-request-reason"
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="請輸入具體請假或調課事由..."
                className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-xs sm:text-sm focus:ring-1 focus:ring-amber-500 focus:outline-none"
              />
            </div>

            {/* 歸屬月份 */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                歸屬結算月份
              </label>
              <div className="flex items-center gap-2">
                <select
                  value={requestMonth}
                  onChange={(e) => setRequestMonth(Number(e.target.value))}
                  className="bg-white border border-slate-300 rounded-lg p-2 text-xs sm:text-sm font-bold focus:ring-1 focus:ring-amber-500 focus:outline-none"
                >
                  <option value={thisMonth}>{thisMonth} 月（本月）</option>
                  {canSelectLastMonth && (
                    <option value={lastMonth}>{lastMonth} 月（補登上週跨月）</option>
                  )}
                </select>
                <span className="text-[10px] text-slate-400">
                  {canSelectLastMonth
                    ? '距今 7 天內跨月，可選擇上月補登'
                    : '僅限當月申請'}
                </span>
              </div>
            </div>
          </div>

          {/* Real-time Clash Detection Status Box */}
          <div
            className={`p-3.5 rounded-xl border flex items-start space-x-3 text-xs sm:text-sm transition-all ${
              clashResult.hasClash
                ? 'bg-rose-50 border-rose-300 text-rose-900'
                : clashResult.severity === 'warning'
                ? 'bg-amber-50 border-amber-300 text-amber-900'
                : 'bg-emerald-50 border-emerald-300 text-emerald-900'
            }`}
          >
            {clashResult.hasClash ? (
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            ) : clashResult.severity === 'warning' ? (
              <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            ) : (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            )}

            <div className="space-y-1 flex-1">
              <div className="font-bold flex items-center justify-between">
                <span>
                  {clashResult.hasClash
                    ? '🚫 智慧衝堂檢測：發現衝突！'
                    : clashResult.severity === 'warning'
                    ? '⚠️ 系統提醒與法規預警'
                    : '✅ 智慧防呆檢測：無衝堂衝突，時段良好'}
                </span>
                <span className="text-[11px] font-normal opacity-75">即時檢核</span>
              </div>
              {clashResult.messages.map((msg, i) => (
                <p key={i} className="text-xs leading-relaxed">
                  {msg}
                </p>
              ))}
            </div>
          </div>

          </div>

          {/* Action Buttons：固定在底部，捲動內容時仍可見 */}
          <div className="shrink-0 flex items-center justify-end space-x-3 px-6 py-3 border-t border-slate-100 bg-white">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs sm:text-sm transition"
            >
              取消
            </button>
            <button
              type="submit"
              id="btn-submit-substitution-request"
              disabled={
                clashResult.hasClash ||
                (requestType === 'substitute' && leaveSessionsForSubmit.length === 0)
              }
              className={`px-5 py-2.5 font-bold rounded-lg text-xs sm:text-sm shadow-sm transition flex items-center space-x-1.5 ${
                clashResult.hasClash
                  ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                  : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/20 active:scale-95'
              }`}
            >
              <span>
                {requestType === 'substitute' && leaveSessionsForSubmit.length > 1
                  ? `送出連續 ${leaveSessionsForSubmit.length} 節請假申請`
                  : '送出調代課申請單'}
              </span>
            </button>
          </div>

        </form>
    </ModalShell>
  );
};
