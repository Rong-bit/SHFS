import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { 
  CourseSession, 
  DayOfWeek, 
  DepartmentType, 
  LeaveType, 
  PaymentType, 
  RequestType, 
  Teacher 
} from '../../types';
import { PERIOD_DEFINITIONS } from '../../data/mockData';
import { displayTeacherTitle, isPracticalSession, SCHOOL_DEPARTMENTS, teacherWeeklyOverload } from '../../utils/schoolDepartments';
import { resolveOriginalSession } from '../../utils/resolveOriginalSession';
import {
  countMatchingWeekdays,
  dateToDayOfWeek,
  formatLeaveDateLabel,
  resolveLeaveDateEnd,
} from '../../utils/leaveDates';
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
    createStaffDirectDispatch,
    approveRequest,
    deleteRequest,
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
  const [paymentType, setPaymentType] = useState<PaymentType>('public');
  const [reason, setReason] = useState<string>('奉派參加教育部技術型高中專業群科專題競賽指導研習 (公假公費派代)');

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
  const [leaveDateMode, setLeaveDateMode] = useState<'single' | 'range'>('single');
  const [leaveDateStart, setLeaveDateStart] = useState<string>('');
  const [leaveDateEnd, setLeaveDateEnd] = useState<string>('');

  // Reschedule specific
  const [targetDay, setTargetDay] = useState<DayOfWeek>(1);
  const [targetPeriod, setTargetPeriod] = useState<number>(5);
  const [targetVenueId, setTargetVenueId] = useState<string>(venues[0]?.id || '');

  // Swap specific
  const [swapTargetTeacherId, setSwapTargetTeacherId] = useState<string>('');
  const [swapTargetSessionId, setSwapTargetSessionId] = useState<string>('');

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
  const leaveFilterDay =
    requestType === 'substitute' && leaveDateStart
      ? dateToDayOfWeek(leaveDateStart)
      : null;
  const applicantSessions = useMemo(() => {
    if (!applicantTeacher) return [];
    const all = sessions.filter((s) => s.teacherId === applicantTeacher.id);
    if (leaveFilterDay == null) return all;
    return all.filter((s) => s.dayOfWeek === leaveFilterDay);
  }, [sessions, applicantTeacher, leaveFilterDay]);

  // Selected original session
  const selectedOriginalSession = applicantSessions.find((s) => s.id === selectedSessionId) || applicantSessions[0];

  // Smart matching candidate teachers when appointing a substitute
  const candidateSubstitutes = useMemo(() => {
    if (!selectedOriginalSession) return [];

    const targetDayOfWeek = selectedOriginalSession.dayOfWeek;
    const targetP = selectedOriginalSession.period;

    return teachers
      .filter((t) => t.id !== applicantTeacher?.id)
      .map((t) => {
        // 1. Check if teacher has class at that day & period
        const hasClash = sessions.some(
          (s) => s.teacherId === t.id && s.dayOfWeek === targetDayOfWeek && s.period === targetP
        );

        // 2. Department match
        const isSameDept = t.department === selectedOriginalSession.department || t.department === applicantTeacher?.department;

        // 3. Current workload
        const weeklyOverload = teacherWeeklyOverload(t, sessions);
        const isNearLimit = weeklyOverload >= systemConfig.maxWeeklyOverloadPeriods;

        // 4. Recommendation score
        let score = 0;
        if (!hasClash) score += 50;
        if (isSameDept) score += 30;
        if (!isNearLimit) score += 20;

        return {
          teacher: t,
          hasClash,
          isSameDept,
          weeklyOverload,
          isNearLimit,
          score,
        };
      })
      .sort((a, b) => b.score - a.score);
  }, [teachers, applicantTeacher, selectedOriginalSession, sessions, systemConfig]);

  // Auto-select first candidate if not set
  React.useEffect(() => {
    if (candidateSubstitutes.length > 0 && !substituteTeacherId) {
      const best = candidateSubstitutes.find((c) => !c.hasClash);
      if (best) setSubstituteTeacherId(best.teacher.id);
    }
  }, [candidateSubstitutes, substituteTeacherId]);

  // Auto-select first session if not set
  React.useEffect(() => {
    if (applicantSessions.length > 0 && (!selectedSessionId || !applicantSessions.some(s => s.id === selectedSessionId))) {
      setSelectedSessionId(applicantSessions[0].id);
    }
  }, [applicantSessions, selectedSessionId]);

  // Auto-switch payment type default when leave type changes
  const handleLeaveTypeChange = (type: LeaveType) => {
    setLeaveType(type);
    if (['official', 'bereavement', 'maternity', 'training'].includes(type)) {
      setPaymentType('public');
      setReason(
        type === 'official'
          ? '奉派代表學校出席公務會議/專業競賽 (公費派代)'
          : type === 'training'
          ? '奉派參加專業技術研習與檢定監評作業 (公費派代)'
          : type === 'bereavement'
          ? '依公務人員請假規則申請喪假 (公費派代)'
          : '申請產假/陪產假 (公費派代)'
      );
    } else {
      setPaymentType('private');
      setReason(
        type === 'sick'
          ? '因突發病假就醫治療無法到校 (自費代課)'
          : '個人事假申請代課 (自費代課)'
      );
    }
  };

  // Preview clash check
  const clashPreview = useMemo(() => {
    if (!selectedOriginalSession || !applicantTeacher) {
      return { hasClash: false, severity: 'none', messages: [] } as any;
    }

    const swapPartnerSession = sessions.find((s) => s.id === swapTargetSessionId);

    return checkClashes({
      requestType,
      applicantTeacherId: applicantTeacher.id,
      originalSession: selectedOriginalSession,
      targetReschedule: requestType === 'reschedule' ? {
        dayOfWeek: targetDay,
        period: targetPeriod,
        venueId: targetVenueId,
      } : undefined,
      swapTargetTeacherId: requestType === 'swap' ? swapTargetTeacherId : undefined,
      swapTargetSession: requestType === 'swap' ? swapPartnerSession : undefined,
      substituteTeacherId: requestType === 'substitute' ? substituteTeacherId : undefined,
    });
  }, [
    checkClashes,
    requestType,
    applicantTeacher,
    selectedOriginalSession,
    targetDay,
    targetPeriod,
    targetVenueId,
    swapTargetTeacherId,
    swapTargetSessionId,
    substituteTeacherId,
    sessions,
  ]);

  // Handle direct dispatch submission
  const handleSubmitDispatch = (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedOriginalSession) {
      alert('請先選擇欲辦理調代課之原課堂！');
      return;
    }

    if (requestType === 'substitute') {
      if (!leaveDateStart) {
        alert('請填寫請假日期。');
        return;
      }
      const startDow = dateToDayOfWeek(leaveDateStart);
      if (startDow === null) {
        alert('請假日期須為週一至週五。');
        return;
      }
      if (startDow !== selectedOriginalSession.dayOfWeek) {
        alert(
          `請假日期的星期（${dayNames[startDow]}）與原課堂（${dayNames[selectedOriginalSession.dayOfWeek]}）不符，請改日期或改課堂。`
        );
        return;
      }
      if (leaveDateMode === 'range') {
        if (!leaveDateEnd) {
          alert('起迄請假請填寫結束日期。');
          return;
        }
        if (leaveDateEnd < leaveDateStart) {
          alert('結束日期不可早於開始日期。');
          return;
        }
      }
    }

    const subTeacher = teachers.find((t) => t.id === substituteTeacherId);
    const swapTeacher = teachers.find((t) => t.id === swapTargetTeacherId);
    const swapSession = sessions.find((s) => s.id === swapTargetSessionId);
    const targetVenue = venues.find((v) => v.id === targetVenueId);
    const resolvedLeaveEnd =
      requestType === 'substitute'
        ? leaveDateMode === 'range'
          ? resolveLeaveDateEnd(leaveDateStart, leaveDateEnd)
          : leaveDateStart
        : undefined;

    const newReq = createStaffDirectDispatch({
      requestType,
      applicantTeacherId: applicantTeacher.id,
      applicantTeacherName: applicantTeacher.name,
      applicantDepartment: applicantTeacher.department,
      leaveType,
      leaveDateStart: requestType === 'substitute' ? leaveDateStart : undefined,
      leaveDateEnd: requestType === 'substitute' ? resolvedLeaveEnd : undefined,
      paymentType,
      reason,
      originalSession: selectedOriginalSession,
      substituteTeacherId: requestType === 'substitute' ? substituteTeacherId : undefined,
      substituteTeacherName: requestType === 'substitute' ? subTeacher?.name : undefined,
      targetReschedule: requestType === 'reschedule' && targetVenue ? {
        dayOfWeek: targetDay,
        period: targetPeriod,
        venueId: targetVenue.id,
        venueName: targetVenue.name,
      } : undefined,
      swapTargetTeacherId: requestType === 'swap' ? swapTargetTeacherId : undefined,
      swapTargetTeacherName: requestType === 'swap' ? swapTeacher?.name : undefined,
      swapTargetSession: requestType === 'swap' ? swapSession : undefined,
      autoApprove,
    }, dispatchMonth);

    setSuccessToast(`【${newReq.requestNumber}】調代課已成功由教學組登錄${autoApprove ? '並立即核定生效' : '並進入簽核清冊'}！`);
    setTimeout(() => setSuccessToast(null), 4000);

    // Switch to list view to see result
    setActiveSubView('list');
  };

  const resolvedRequests = useMemo(
    () => requests.map((r) => ({ ...r, originalSession: resolveOriginalSession(r, sessions) })),
    [requests, sessions]
  );

  // Filtered requests in list view
  const filteredRequests = useMemo(() => {
    return resolvedRequests.filter((r) => {
      // Filter tab
      if (listFilter === 'pending' && r.status !== 'pending') return false;
      if (listFilter === 'public' && r.paymentType !== 'public') return false;
      if (listFilter === 'private' && r.paymentType !== 'private') return false;
      if (listFilter === 'practical' && !isPracticalSession(r.originalSession)) return false;

      // Search term
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matchName = r.applicantTeacherName.toLowerCase().includes(term);
        const matchSub = (r.substituteTeacherName || '').toLowerCase().includes(term);
        const matchClass = r.originalSession.className.toLowerCase().includes(term);
        const matchSubject = r.originalSession.subjectName.toLowerCase().includes(term);
        const matchNum = r.requestNumber.toLowerCase().includes(term);
        if (!matchName && !matchSub && !matchClass && !matchSubject && !matchNum) return false;
      }

      return true;
    });
  }, [resolvedRequests, listFilter, searchTerm]);

  // Handle batch approval
  const handleBatchApprove = () => {
    if (selectedRequestIds.length === 0) return;
    const reviewer = `${currentAcademicStaff?.name || '陳雅筑'} (${currentAcademicStaff?.title || '教學組'})`;
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
              {academicStaffList.map((staff) => (
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
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
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
          </div>
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
            <span>➕ 教學組代為經辦 · 快速派代與調課</span>
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
            <span>📋 全校調代課登錄簿與公假代課清冊</span>
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
                    { key: 'reschedule', label: '⏱️ 行政移課', desc: '實習檢定、全校模擬考改期' },
                    { key: 'swap', label: '🔄 雙師調課', desc: '兩位教師對調授課時段' },
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
                          <option value="official">🏛️ 公假 / 公差 (公費派代 · 420元/節)</option>
                          <option value="training">📚 專題競賽 / 專業研習 / 監評 (公費派代 · 420元/節)</option>
                          <option value="sick">🏥 病假 / 住院 / 緊急就醫 (自費代課)</option>
                          <option value="personal">💼 個人事假 (自費代課)</option>
                          <option value="bereavement">🕊️ 喪假 (公費派代)</option>
                          <option value="maternity">👶 產假 / 陪產假 (公費派代)</option>
                          <option value="other">📌 其他專案指派</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1.5">
                          鐘點費支給來源 (主計出納結算依據)：
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setPaymentType('public')}
                            className={`p-2.5 rounded-xl text-xs font-bold text-center border transition ${
                              paymentType === 'public'
                                ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                                : 'bg-white text-slate-700 border-slate-300'
                            }`}
                          >
                            🏛️ 公費派代 (學校預算)
                          </button>
                          <button
                            type="button"
                            onClick={() => setPaymentType('private')}
                            className={`p-2.5 rounded-xl text-xs font-bold text-center border transition ${
                              paymentType === 'private'
                                ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                                : 'bg-white text-slate-700 border-slate-300'
                            }`}
                          >
                            👤 自費代課 (教師自理)
                          </button>
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
                      {selectedOriginalSession && leaveFilterDay == null && (
                        <p className="mt-1.5 text-[11px] text-slate-500">
                          {leaveDateMode === 'single'
                            ? `請假日須為「${dayNames[selectedOriginalSession.dayOfWeek]}」，對應所選課堂。`
                            : `將涵蓋區間內所有「${dayNames[selectedOriginalSession.dayOfWeek]} 第${selectedOriginalSession.period}節」。`}
                        </p>
                      )}
                      {leaveFilterDay != null && (
                        <p className="mt-1.5 text-[11px] text-indigo-700 font-medium">
                          已依請假日篩選，下方課堂僅顯示「{dayNames[leaveFilterDay]}」
                          {leaveDateMode === 'range' &&
                          leaveDateStart &&
                          leaveDateEnd &&
                          leaveDateEnd >= leaveDateStart &&
                          selectedOriginalSession
                            ? `（區間約 ${countMatchingWeekdays(leaveDateStart, leaveDateEnd, leaveFilterDay)} 次）`
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
                    required
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

                {/* Teacher Selector */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    原授課教師：
                  </label>
                  <select
                    value={selectedTeacherId}
                    onChange={(e) => setSelectedTeacherId(e.target.value)}
                    className="w-full text-xs sm:text-sm p-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 font-medium"
                  >
                    {filteredTeachers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.department} · {displayTeacherTitle(t)} · 基本{t.basePeriods}節 / 現排{t.weeklyActualPeriods}節)
                      </option>
                    ))}
                  </select>
                </div>

                {/* Sessions Grid */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-2">
                    請點選欲辦理調代之課堂 ({applicantSessions.length} 節)
                    {leaveFilterDay != null ? ` · 僅顯示${dayNames[leaveFilterDay]}` : ''}：
                  </label>

                  {requestType === 'substitute' && !leaveDateStart && (
                    <p className="mb-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                      建議先選擇上方「請假日期」，課堂列表會自動只顯示該星期有課的節次。
                    </p>
                  )}

                  {applicantSessions.length === 0 ? (
                    <div className="p-6 text-center text-slate-400 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                      {leaveFilterDay != null
                        ? `該教師在「${dayNames[leaveFilterDay]}」沒有排定課堂，請改請假日期或確認課表。`
                        : '該教師目前在課表中無排定課堂，請至總課表確認或重新匯入課表。'}
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
                            <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1">
                              <Building2 className="w-3 h-3 text-slate-400" />
                              <span>{s.venueName}</span>
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
                      優先推薦同科別、時段空堂且每週未逾9節者
                    </span>
                  </div>

                  {/* Smart candidate recommendations */}
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-slate-700">
                      智慧推薦師資清單 (點選即指定)：
                    </label>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-56 overflow-y-auto pr-1">
                      {candidateSubstitutes.map(({ teacher: cand, hasClash, isSameDept, weeklyOverload, isNearLimit, score }) => {
                        const isSelected = substituteTeacherId === cand.id;

                        return (
                          <div
                            key={cand.id}
                            onClick={() => !hasClash && setSubstituteTeacherId(cand.id)}
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

                              {isSameDept && (
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
                  </div>
                </div>
              )}

              {/* If Reschedule: Destination period and venue */}
              {requestType === 'reschedule' && (
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
                  <div className="border-b border-slate-100 pb-3">
                    <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
                      <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center font-bold">3</span>
                      <span>指定移課目標時段與工場/教室</span>
                    </h3>
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

              {/* If Swap: Partner teacher and partner session */}
              {requestType === 'swap' && (
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
                  <div className="border-b border-slate-100 pb-3">
                    <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
                      <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center font-bold">3</span>
                      <span>指定對調之教師與目標課堂</span>
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">對調教師：</label>
                      <select
                        value={swapTargetTeacherId}
                        onChange={(e) => {
                          setSwapTargetTeacherId(e.target.value);
                          const partnerSess = sessions.filter(s => s.teacherId === e.target.value);
                          if (partnerSess[0]) setSwapTargetSessionId(partnerSess[0].id);
                        }}
                        className="w-full text-xs sm:text-sm p-2.5 bg-slate-50 border border-slate-300 rounded-xl"
                      >
                        <option value="">-- 請選擇對調教師 --</option>
                        {teachers.filter(t => t.id !== applicantTeacher.id).map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name} ({t.department})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">對調課堂：</label>
                      <select
                        value={swapTargetSessionId}
                        onChange={(e) => setSwapTargetSessionId(e.target.value)}
                        className="w-full text-xs sm:text-sm p-2.5 bg-slate-50 border border-slate-300 rounded-xl"
                      >
                        <option value="">-- 請選擇互換課堂 --</option>
                        {sessions.filter(s => s.teacherId === swapTargetTeacherId).map((s) => (
                          <option key={s.id} value={s.id}>
                            {dayNames[s.dayOfWeek]} 第{s.period}節 - {s.className} 《{s.subjectName}》
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
                      {selectedOriginalSession && `${dayNames[selectedOriginalSession.dayOfWeek]} 第${selectedOriginalSession.period}節 (${selectedOriginalSession.venueName})`}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-800">
                    <span className="text-slate-400 block">調代安排：</span>
                    {requestType === 'substitute' && (
                      <div className="text-slate-200">
                        代課教師：<strong className="text-indigo-400 text-sm">{teachers.find(t => t.id === substituteTeacherId)?.name || '未指定'}</strong>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {paymentType === 'public' ? '🏛️ 公費派代 (420元/節)' : '👤 自費代課 (420元/節)'}
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
                        對調對象：<strong>{teachers.find(t => t.id === swapTargetTeacherId)?.name || '未指定'}</strong>
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
                  disabled={clashPreview.hasClash}
                  className={`w-full py-3 rounded-xl font-bold text-sm shadow-md transition flex items-center justify-center space-x-2 ${
                    clashPreview.hasClash
                      ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                      : 'bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 active:scale-98'
                  }`}
                >
                  <Send className="w-4 h-4" />
                  <span>確定登記並執行派代</span>
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
                { key: 'public', label: `🏛️ 公費派代 (${requests.filter(r => r.paymentType === 'public').length})` },
                { key: 'private', label: `👤 自費代課 (${requests.filter(r => r.paymentType === 'private').length})` },
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
                              </div>
                            )}
                          </td>

                          <td className="p-3">
                            {req.requestType === 'substitute' && (
                              <div>
                                <span className="text-slate-500">代課：</span>
                                <strong className="text-indigo-900">{req.substituteTeacherName || '由教學組媒合'}</strong>
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
                                <span className="text-slate-500">互調：</span>
                                <strong>{req.swapTargetTeacherName}</strong>
                              </div>
                            )}
                            <div className="text-[11px] text-slate-500 truncate max-w-xs mt-0.5">
                              事由：{req.reason}
                            </div>
                          </td>

                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded font-bold text-[11px] ${
                              req.paymentType === 'public'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}>
                              {req.paymentType === 'public' ? '🏛️ 公費' : '👤 自費'}
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
                            <div className="flex items-center justify-center space-x-1.5">
                              {req.status === 'approved' && (
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
                                    const title = currentAcademicStaff?.title || '經辦';
                                    const m = title.match(/^(.+?組).*?\((.+?)\)$/);
                                    const stampTitle = m ? `${m[1]}${m[2]}` : title;
                                    approveRequest(req.id, `${currentAcademicStaff?.name || '教學組'}(${stampTitle})`);
                                  }}
                                  className="flex items-center space-x-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg shadow-xs transition"
                                >
                                  <Check className="w-3 h-3" />
                                  <span>核定</span>
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

      {deletingRequestId && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border border-slate-200">
            <div className="flex items-center space-x-2 text-rose-600 font-bold text-base">
              <AlertTriangle className="w-5 h-5" />
              <span>確認刪除此調代課申請單？</span>
            </div>
            <p className="text-xs text-slate-600 mt-2 leading-relaxed">
              即將刪除{' '}
              <strong className="text-slate-900">
                {requests.find((r) => r.id === deletingRequestId)?.requestNumber || '此單'}
              </strong>
              。刪除後無法復原，也不再計入鐘點費結算。若只是填錯，刪除後可重新登錄。
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
                  deleteRequest(deletingRequestId);
                  setDeletingRequestId(null);
                  setSelectedRequestIds((prev) => prev.filter((id) => id !== deletingRequestId));
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl shadow-xs transition"
              >
                確認刪除
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
