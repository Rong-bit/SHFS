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
  X, 
  ArrowLeftRight, 
  Clock, 
  UserCheck, 
  AlertTriangle, 
  CheckCircle2, 
  Info,
  Building2,
  Calendar,
  Sparkles
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
    systemConfig,
    addSubstituteRequest,
    checkClashes,
    setIsAiAdvisorOpen,
  } = useApp();

  // Current teacher's sessions
  const teacherSessions = sessions.filter((s) => s.teacherId === currentTeacher?.id);
  
  const [selectedSessionId, setSelectedSessionId] = useState<string>(
    initialSession ? initialSession.id : teacherSessions[0]?.id || ''
  );

  const selectedSession = sessions.find((s) => s.id === selectedSessionId) || teacherSessions[0];

  const [requestType, setRequestType] = useState<RequestType>('substitute');
  const [leaveType, setLeaveType] = useState<LeaveType>('official');
  // 申請事由：不預設內容，讓老師自行填寫
  const [reason, setReason] = useState<string>('');
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

  // When teacherSessions is empty, allow selecting a time slot (day/period)
  // so teacher can still submit a substitute (leave) request.
  const [leaveDay, setLeaveDay] = useState<DayOfWeek>(2);
  const [leavePeriod, setLeavePeriod] = useState<number>(1);

  // Smart candidate recommendations for substitute
  const effectiveOriginalSession: CourseSession | undefined =
    selectedSession ||
    (currentTeacher
      ? {
          id: 's-placeholder',
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
      : undefined);

  const candidateSubstitutes = useMemo(() => {
    if (!effectiveOriginalSession || !currentTeacher) return [];
    const targetDay = effectiveOriginalSession.dayOfWeek;
    const targetP = effectiveOriginalSession.period;

    return teachers
      .filter((t) => t.id !== currentTeacher.id)
      .map((t) => {
        const hasClash = sessions.some(
          (s) => s.teacherId === t.id && s.dayOfWeek === targetDay && s.period === targetP
        );
        const isSameDept = t.department === currentTeacher.department;
        const weeklyOverload = Math.max(0, t.weeklyActualPeriods - t.basePeriods);
        const isNearLimit = weeklyOverload >= systemConfig.maxWeeklyOverloadPeriods;
        let score = 0;
        if (!hasClash) score += 50;
        if (isSameDept) score += 30;
        if (!isNearLimit) score += 20;
        return { teacher: t, hasClash, isSameDept, weeklyOverload, isNearLimit, score };
      })
      .sort((a, b) => b.score - a.score);
  }, [teachers, currentTeacher, effectiveOriginalSession, sessions, systemConfig]);

  // Candidate partner sessions for swap
  const swapTeacherSessions = sessions.filter((s) => s.teacherId === swapTeacherId);

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

  // Set default swap partner or substitute when available
  useEffect(() => {
    const candidateTeachers = teachers.filter((t) => t.id !== currentTeacher?.id);
    // Prefer same department teacher
    const sameDept = candidateTeachers.find((t) => t.department === currentTeacher?.department);
    const defaultPartner = sameDept || candidateTeachers[0];
    if (defaultPartner && !swapTeacherId) {
      setSwapTeacherId(defaultPartner.id);
    }
    if (defaultPartner && !substituteTeacherId) {
      setSubstituteTeacherId(defaultPartner.id);
    }
  }, [currentTeacher, teachers]);

  // Set default swap session when swapTeacher changes
  useEffect(() => {
    if (swapTeacherSessions.length > 0 && !swapSessionId) {
      setSwapSessionId(swapTeacherSessions[0].id);
    }
  }, [swapTeacherId, swapTeacherSessions]);

  // Target Reschedule Venue default
  useEffect(() => {
    if (selectedSession && !targetVenueId) {
      setTargetVenueId(selectedSession.venueId);
    }
  }, [selectedSession]);

  // Dynamic Clash Checking
  const swapTargetSession = sessions.find((s) => s.id === swapSessionId);
  const targetVenueObj = venues.find((v) => v.id === targetVenueId);

  const clashResult: ClashCheckResult = effectiveOriginalSession
    ? checkClashes({
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
        substituteTeacherId: requestType === 'substitute' ? substituteTeacherId : undefined,
      })
    : { hasClash: false, severity: 'none', messages: [] };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveOriginalSession || !currentTeacher) return;

    if (teacherSessions.length === 0 && requestType !== 'substitute') {
      alert('目前找不到你的排課資料，僅支援請假派代。請切換到「請假派代」後再送出。');
      return;
    }

    if (requestType === 'swap' && (!swapTeacherId || !swapTargetSession)) {
      alert('請完整選擇對調教師與對調課堂');
      return;
    }

    const swapPartner = teachers.find((t) => t.id === swapTeacherId);
    const subTeacher = teachers.find((t) => t.id === substituteTeacherId);

    addSubstituteRequest({
      requestType,
      applicantTeacherId: currentTeacher.id,
      applicantTeacherName: currentTeacher.name,
      applicantDepartment: currentTeacher.department,
      leaveType: requestType === 'substitute' ? leaveType : undefined,
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
      substituteTeacherId: requestType === 'substitute' ? substituteTeacherId : undefined,
      substituteTeacherName: requestType === 'substitute' ? subTeacher?.name : undefined,
    });

    onClose();
  };

  const dayNames = ['', '週一', '週二', '週三', '週四', '週五'];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full border border-slate-200 overflow-hidden my-6 animate-in fade-in zoom-in duration-150">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white px-6 py-4 flex items-center justify-between">
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

        {/* Content Body */}
          <form onSubmit={handleSubmit} className="p-6 space-y-5 text-slate-800 text-sm">
            
            {/* Step 1: Select Original Session */}
            <div>
              {teacherSessions.length > 0 ? (
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
                        {dayNames[s.dayOfWeek]} 第{s.period}節 ({PERIOD_DEFINITIONS.find(p => p.period === s.period)?.timeRange}) ｜ {s.className} 《{s.subjectName}》 @ {s.venueName}
                      </option>
                    ))}
                  </select>
                </>
              ) : (
                <>
                  <div className="flex items-start space-x-2 mb-2">
                    <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5" />
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                        1. 選擇要請假的節次
                      </label>
                      <p className="text-[11px] text-slate-500 mt-1">
                        目前找不到你的排課資料，所以改用「週幾第幾節」建立派代申請。
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">星期</label>
                      <select
                        value={leaveDay}
                        onChange={(e) => setLeaveDay(Number(e.target.value) as DayOfWeek)}
                        className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs font-medium focus:ring-1 focus:ring-amber-500"
                      >
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
                        onChange={(e) => setLeavePeriod(Number(e.target.value))}
                        className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs font-medium focus:ring-1 focus:ring-amber-500"
                      >
                        {[1, 2, 3, 4, 5, 6, 7, 8].map((p) => (
                          <option key={p} value={p}>
                            第{p}節 ({PERIOD_DEFINITIONS.find((def) => def.period === p)?.timeRange})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
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
              {/* Swap Tab */}
              <button
                type="button"
                id="tab-type-swap"
                onClick={() => {
                  setRequestType('swap');
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
                            公費派代 (學校支付 {systemConfig.dayHourlyRate}元/節)
                          </span>
                        ) : (
                          <span className="text-amber-800 flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                            自費代課 (個人扣繳 {systemConfig.dayHourlyRate}元/節)
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
                    <button
                      type="button"
                      onClick={() => setIsAiAdvisorOpen(true)}
                      className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      詢問 AI 推薦
                    </button>
                  </div>

                  {/* Smart recommendation cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-44 overflow-y-auto pr-1 mb-2">
                    {/* "由教學組媒合" option */}
                    <div
                      onClick={() => setSubstituteTeacherId('')}
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
                      .map(({ teacher: cand, isSameDept, weeklyOverload, isNearLimit }) => {
                        const isSelected = substituteTeacherId === cand.id;
                        return (
                          <div
                            key={cand.id}
                            onClick={() => setSubstituteTeacherId(cand.id)}
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
                              {isSameDept && (
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
                    <select
                      id="select-substitute-teacher"
                      value={substituteTeacherId}
                      onChange={(e) => setSubstituteTeacherId(e.target.value)}
                      className="w-full mt-1.5 bg-white border border-slate-300 rounded-lg p-2 text-xs font-medium focus:ring-1 focus:ring-amber-500"
                    >
                      <option value="">-- 由教學組媒合 --</option>
                      {teachers
                        .filter((t) => t.id !== currentTeacher?.id)
                        .map((t) => {
                          const hasClash = sessions.some(
                            (s) =>
                              s.teacherId === t.id &&
                              s.dayOfWeek === selectedSession?.dayOfWeek &&
                              s.period === selectedSession?.period
                          );
                          return (
                            <option key={t.id} value={t.id}>
                              {hasClash ? '🚫 ' : '✓ '}
                              {t.name} ({t.department} · {t.title})
                            </option>
                          );
                        })}
                    </select>
                  </details>
                </div>
              </>
            )}

            {/* SWAP: Partner & Partner Session */}
            {requestType === 'swap' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    對調教師
                  </label>
                  <select
                    id="select-swap-teacher"
                    value={swapTeacherId}
                    onChange={(e) => {
                      setSwapTeacherId(e.target.value);
                      const targetTeacherSessions = sessions.filter((s) => s.teacherId === e.target.value);
                      if (targetTeacherSessions.length > 0) {
                        setSwapSessionId(targetTeacherSessions[0].id);
                      }
                    }}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs sm:text-sm font-medium focus:ring-1 focus:ring-indigo-500"
                  >
                    {teachers
                      .filter((t) => t.id !== currentTeacher?.id)
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.department} · {t.title})
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    對方要互換的課堂
                  </label>
                  <select
                    id="select-swap-session"
                    value={swapSessionId}
                    onChange={(e) => setSwapSessionId(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 text-xs sm:text-sm font-medium focus:ring-1 focus:ring-indigo-500"
                  >
                    {swapTeacherSessions.length === 0 ? (
                      <option value="">該教師暫無排課</option>
                    ) : (
                      swapTeacherSessions.map((s) => (
                        <option key={s.id} value={s.id}>
                          {dayNames[s.dayOfWeek]} 第{s.period}節 ｜ {s.className} 《{s.subjectName}》
                        </option>
                      ))
                    )}
                  </select>
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

          {/* Action Buttons */}
          <div className="flex items-center justify-end space-x-3 pt-2">
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
              disabled={clashResult.hasClash}
              className={`px-5 py-2.5 font-bold rounded-lg text-xs sm:text-sm shadow-sm transition flex items-center space-x-1.5 ${
                clashResult.hasClash
                  ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                  : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/20 active:scale-95'
              }`}
            >
              <span>送出調代課申請單</span>
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};
