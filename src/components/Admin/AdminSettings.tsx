import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { SystemConfig, WorkshopVenue, Teacher, DepartmentType, TeacherTitle, AcademicStaff, NonTeachingDay, TemporaryScheduleMove, PartialNonTeachingDay } from '../../types';
import {
  mergeNonTeachingDays,
  suggestNationalHolidays,
} from '../../utils/holidays';
import {
  mergeTemporaryScheduleMoves,
  mergePartialNonTeachingDays,
} from '../../utils/calendarSettlement';
import {
  classifyVenueKind,
  venueKindBadgeClass,
  venueKindLabel,
  type VenueKind,
} from '../../utils/venueKinds';
import { 
  Settings, 
  Coins, 
  BookOpen, 
  Building2, 
  Users, 
  Save, 
  RotateCcw, 
  Check,
  Plus,
  Wrench,
  ShieldCheck,
  Upload,
  Download,
  FileSpreadsheet,
  Layers,
  Sparkles,
  Edit2,
  Trash2,
  AlertTriangle,
  AlertCircle,
  HelpCircle,
  Calendar,
  FileText,
  School,
  X,
  Search,
  Filter,
  UserCheck,
  BadgeCheck,
  Lock,
  KeyRound,
  Cloud,
  Eye,
  EyeOff,
} from 'lucide-react';
import { generateTemplateExcel, exportScheduleToExcel } from '../../utils/scheduleImporter';
import { BackupTransferButtons } from '../Common/BackupTransferButtons';
import { CloudSyncPanel } from './CloudSyncPanel';
import { defaultSchoolEmail, ensureSchoolEmail, isPlaceholderSchoolEmail, SCHOOL_EMAIL_DOMAIN } from '../../utils/schoolEmail';
import { normalizeStandardBasePeriods, normalizeTeacherTitle, SCHOOL_DEPARTMENTS, teacherWeeklyOverload, TEACHER_TITLES } from '../../utils/schoolDepartments';
import { DEFAULT_ADMIN_PASSWORD } from '../../data/mockData';
import { downloadSystemManual } from '../../utils/generateManual';
import { isPasswordHash } from '../../utils/passwordCrypto';
import { ModalShell } from '../Common/ModalShell';

export const AdminSettings: React.FC = () => {
  const { 
    systemConfig, 
    updateSystemConfig, 
    teachers, 
    venues, 
    sessions, 
    resetToMockData, 
    setIsImportModalOpen,
    addVenue,
    updateVenue,
    deleteVenue,
    addTeacher,
    updateTeacher,
    deleteTeacher,
    updateTeacherPassword,
    academicStaffList,
    updateAcademicStaff,
    addAcademicStaff,
    deleteAcademicStaff
  } = useApp();

  const [activeTab, setActiveTab] = useState<'config' | 'venues' | 'teachers' | 'staff' | 'schedules' | 'sync' | 'maintenance'>('config');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  
  // Safe form config state
  const [formConfig, setFormConfig] = useState<SystemConfig>(() => ({
    dayHourlyRate: systemConfig?.dayHourlyRate ?? 420,
    nightHourlyRate: systemConfig?.nightHourlyRate ?? 500,
    maxWeeklyOverloadPeriods: systemConfig?.maxWeeklyOverloadPeriods ?? 9,
    standardBasePeriods: normalizeStandardBasePeriods(systemConfig?.standardBasePeriods),
    schoolName: systemConfig?.schoolName ?? '國立技術型高級中等學校',
    academicYear: systemConfig?.academicYear ?? '114',
    semester: systemConfig?.semester ?? '1',
    currentMonth: systemConfig?.currentMonth ?? new Date().getMonth() + 1,
    weeksInMonth: systemConfig?.weeksInMonth ?? 4,
    nonTeachingDays: systemConfig?.nonTeachingDays ?? [],
    temporaryScheduleMoves: systemConfig?.temporaryScheduleMoves ?? [],
    partialNonTeachingDays: systemConfig?.partialNonTeachingDays ?? [],
    authConfig: {
      requirePassword: systemConfig?.authConfig?.requirePassword ?? true,
      // 表單不回填雜湊／明文，留空表示沿用既有密碼
      defaultTeacherPassword: '',
      adminPassword: '',
      academicPassword: '',
      accountingPassword: '',
    },
  }));

  const [newHolidayDate, setNewHolidayDate] = useState('');
  const [newHolidayLabel, setNewHolidayLabel] = useState('放假');
  const [moveSourceDate, setMoveSourceDate] = useState('');
  const [moveTargetDate, setMoveTargetDate] = useState('');
  const [moveLabel, setMoveLabel] = useState('暫時移課／補課');
  const [movePeriods, setMovePeriods] = useState<number[]>([]);
  const [partialDate, setPartialDate] = useState('');
  const [partialLabel, setPartialLabel] = useState('半日停課');
  const [partialPeriods, setPartialPeriods] = useState<number[]>([5, 6, 7, 8]);

  // Sync if systemConfig changes
  useEffect(() => {
    setFormConfig({
      dayHourlyRate: systemConfig?.dayHourlyRate ?? 420,
      nightHourlyRate: systemConfig?.nightHourlyRate ?? 500,
      maxWeeklyOverloadPeriods: systemConfig?.maxWeeklyOverloadPeriods ?? 9,
      standardBasePeriods: normalizeStandardBasePeriods(systemConfig?.standardBasePeriods),
      schoolName: systemConfig?.schoolName ?? '國立技術型高級中等學校',
      academicYear: systemConfig?.academicYear ?? '114',
      semester: systemConfig?.semester ?? '1',
      currentMonth: systemConfig?.currentMonth ?? new Date().getMonth() + 1,
      weeksInMonth: systemConfig?.weeksInMonth ?? 4,
      nonTeachingDays: systemConfig?.nonTeachingDays ?? [],
      temporaryScheduleMoves: systemConfig?.temporaryScheduleMoves ?? [],
      partialNonTeachingDays: systemConfig?.partialNonTeachingDays ?? [],
      authConfig: {
        requirePassword: systemConfig?.authConfig?.requirePassword ?? true,
        defaultTeacherPassword: '',
        adminPassword: '',
        academicPassword: '',
        accountingPassword: '',
      },
    });
  }, [systemConfig]);

  // Venue management modal state
  const [editingVenue, setEditingVenue] = useState<WorkshopVenue | null>(null);
  const [isVenueModalOpen, setIsVenueModalOpen] = useState(false);
  const [venueFormData, setVenueFormData] = useState<Omit<WorkshopVenue, 'id'>>({
    code: '',
    name: '',
    department: '電機科',
    capacity: 40,
    safetyLevel: '標準',
    equipmentNote: '',
  });

  // Teacher management modal state
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);
  const [isTeacherModalOpen, setIsTeacherModalOpen] = useState(false);
  const [teacherFormData, setTeacherFormData] = useState<{
    name: string;
    title: TeacherTitle;
    department: DepartmentType;
    dutyReductionPeriods: number;
    basePeriods: number;
    email: string;
    phone: string;
    certifications: string;
  }>({
    name: '',
    title: '專任教師',
    department: '電機科',
    dutyReductionPeriods: 0,
    basePeriods: 16,
    email: '',
    phone: '',
    certifications: '',
  });

  // Academic Staff management modal state
  const [editingStaff, setEditingStaff] = useState<AcademicStaff | null>(null);
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);
  const [staffFormData, setStaffFormData] = useState<Omit<AcademicStaff, 'id'>>({
    name: '',
    title: '教學組組員 (幹事)',
    badge: '經辦 · 實習調代課與公差派代',
    email: '',
    phone: '分機 211',
    avatarBg: 'from-amber-600 to-amber-800',
    responsibleScope: '全校各科專業實習工場調代課經辦、突發病假與公假派代',
    group: 'academic',
  });

  // In-app Confirm & Alert Dialogs (100% reliable inside iFrames, avoiding window.confirm/alert)
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    warningMessage?: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const [alertNotice, setAlertNotice] = useState<string | null>(null);

  // Search/Filters for tables
  const [venueSearch, setVenueSearch] = useState('');
  const [venueDeptFilter, setVenueDeptFilter] = useState('ALL');
  const [venueKindFilter, setVenueKindFilter] = useState<'ALL' | VenueKind>('ALL');
  const [teacherSearch, setTeacherSearch] = useState('');
  const [teacherDeptFilter, setTeacherDeptFilter] = useState('ALL');
  const [passwordResetTeacher, setPasswordResetTeacher] = useState<Teacher | null>(null);
  const [adminSetPassword, setAdminSetPassword] = useState('');
  const [passwordResetNotice, setPasswordResetNotice] = useState('');

  const handleConfigSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const nextConfig = {
      ...formConfig,
      standardBasePeriods: normalizeStandardBasePeriods(formConfig.standardBasePeriods),
    };
    setFormConfig(nextConfig);
    updateSystemConfig(nextConfig);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  // Open Venue Modal
  const handleOpenAddVenue = () => {
    setEditingVenue(null);
    setVenueFormData({
      code: `LAB-${venues.length + 101}`,
      name: '',
      department: '電機科',
      capacity: 40,
      safetyLevel: '標準',
      equipmentNote: '',
    });
    setIsVenueModalOpen(true);
  };

  const handleOpenEditVenue = (v: WorkshopVenue) => {
    setEditingVenue(v);
    setVenueFormData({
      code: v.code,
      name: v.name,
      department: v.department,
      capacity: v.capacity,
      safetyLevel: v.safetyLevel,
      equipmentNote: v.equipmentNote,
    });
    setIsVenueModalOpen(true);
  };

  const handleSaveVenue = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingVenue) {
      updateVenue(editingVenue.id, venueFormData);
    } else {
      addVenue(venueFormData);
    }
    setIsVenueModalOpen(false);
    setEditingVenue(null);
  };

  // Open Teacher Modal
  const handleOpenAddTeacher = () => {
    setEditingTeacher(null);
    setTeacherFormData({
      name: '',
      title: '專任教師',
      department: '電機科',
      dutyReductionPeriods: 0,
      basePeriods: formConfig.standardBasePeriods.fulltime,
      email: '',
      phone: '',
      certifications: '專業專長檢定合格',
    });
    setIsTeacherModalOpen(true);
  };

  const handleOpenEditTeacher = (t: Teacher) => {
    setEditingTeacher(t);
    setTeacherFormData({
      name: t.name,
      title: normalizeTeacherTitle(t.title),
      department: t.department,
      dutyReductionPeriods: t.dutyReductionPeriods ?? 0,
      basePeriods: t.basePeriods,
      email: t.email,
      phone: t.phone,
      certifications: t.certifications.join(', '),
    });
    setIsTeacherModalOpen(true);
  };

  const calcTeacherFormBase = (title = teacherFormData.title) => {
    if (title === '主任') return formConfig.standardBasePeriods.director;
    if (title === '科主任') return formConfig.standardBasePeriods.head;
    if (title === '組長') return formConfig.standardBasePeriods.sectionChief;
    if (title === '導師' || Boolean(editingTeacher?.homeroomClass && editingTeacher.title !== '科主任' && editingTeacher.title !== '組長' && editingTeacher.title !== '主任')) {
      return formConfig.standardBasePeriods.homeroom;
    }
    return formConfig.standardBasePeriods.fulltime;
  };

  const defaultDutyForTitle = (title: TeacherTitle) => {
    if (title === '科主任') return 2;
    if (title === '導師') return 1;
    if (title === '組長' || title === '主任') return 0;
    return 0;
  };

  const handleSaveTeacher = (e: React.FormEvent) => {
    e.preventDefault();
    const certArray = teacherFormData.certifications
      .split(/[,，]/)
      .map((c) => c.trim())
      .filter(Boolean);

    const nextBasePeriods = calcTeacherFormBase();

    if (editingTeacher) {
      updateTeacher(editingTeacher.id, {
        name: teacherFormData.name,
        title: teacherFormData.title,
        department: teacherFormData.department,
        dutyReductionPeriods: Number(teacherFormData.dutyReductionPeriods) || 0,
        basePeriods: nextBasePeriods,
        email: ensureSchoolEmail(teacherFormData.name, teacherFormData.email),
        phone: teacherFormData.phone,
        certifications: certArray,
      });
    } else {
      addTeacher({
        name: teacherFormData.name,
        title: teacherFormData.title,
        department: teacherFormData.department,
        dutyReductionPeriods: Number(teacherFormData.dutyReductionPeriods) || 0,
        basePeriods: nextBasePeriods,
        email: ensureSchoolEmail(teacherFormData.name, teacherFormData.email),
        phone: teacherFormData.phone || '分機 300',
        certifications: certArray,
        avatarBg: 'from-slate-700 to-indigo-800',
      });
    }
    setIsTeacherModalOpen(false);
    setEditingTeacher(null);
  };

  const handleOpenAddStaff = () => {
    setEditingStaff(null);
    setStaffFormData({
      name: '',
      title: '教學組組員 (幹事)',
      badge: '經辦 · 實習調代課與公差派代',
      email: '',
      phone: '分機 211',
      avatarBg: 'from-amber-600 to-amber-800',
      responsibleScope: '全校各科專業實習工場調代課經辦、突發病假與公假派代',
      group: 'academic',
    });
    setIsStaffModalOpen(true);
  };

  const handleOpenEditStaff = (staff: AcademicStaff) => {
    setEditingStaff(staff);
    setStaffFormData({
      name: staff.name,
      title: staff.title,
      badge: staff.badge,
      email: staff.email,
      phone: staff.phone,
      avatarBg: staff.avatarBg || 'from-indigo-600 to-indigo-800',
      responsibleScope: staff.responsibleScope,
      group: staff.group || 'academic',
    });
    setIsStaffModalOpen(true);
  };

  const handleSaveStaff = (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffFormData.name.trim()) return;

    if (editingStaff) {
      updateAcademicStaff(editingStaff.id, {
        name: staffFormData.name.trim(),
        title: staffFormData.title,
        badge: staffFormData.badge,
        email: ensureSchoolEmail(staffFormData.name, staffFormData.email),
        phone: staffFormData.phone || '分機 210',
        avatarBg: staffFormData.avatarBg,
        responsibleScope: staffFormData.responsibleScope,
        group: staffFormData.group || 'academic',
      });
    } else {
      addAcademicStaff({
        name: staffFormData.name.trim(),
        title: staffFormData.title,
        badge: staffFormData.badge,
        email: ensureSchoolEmail(staffFormData.name, staffFormData.email),
        phone: staffFormData.phone || '分機 210',
        avatarBg: staffFormData.avatarBg,
        responsibleScope: staffFormData.responsibleScope,
        group: staffFormData.group || 'academic',
      });
    }
    setIsStaffModalOpen(false);
    setEditingStaff(null);
  };

  const handleDeleteStaff = (staff: AcademicStaff) => {
    if (academicStaffList.length <= 1) {
      setAlertNotice('系統中至少需保留一名教學組成員（供調代課簽章與經辦登入）。若僅有一位組員，請直接點擊「修改組員姓名/資料」更新為現任人員即可！');
      return;
    }
    setConfirmDialog({
      isOpen: true,
      title: '確認自名冊刪除教學組成員',
      message: `確定要自教學組名冊中刪除「${staff.name} (${staff.title})」嗎？`,
      warningMessage: '刪除後，此組員將不再出現在經辦切換選單中。若日後需要可隨時重新新增。',
      onConfirm: () => {
        deleteAcademicStaff(staff.id);
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  const handleDeleteVenue = (v: WorkshopVenue) => {
    setConfirmDialog({
      isOpen: true,
      title: '確認刪除實習工場/教室',
      message: `確定要刪除「${v.name} (${v.code})」嗎？`,
      warningMessage: '若已有課表排定在此場地，該堂課將保留場域名稱但失去場地配置聯結。',
      onConfirm: () => {
        deleteVenue(v.id);
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  const handleDeleteTeacher = (t: Teacher) => {
    setConfirmDialog({
      isOpen: true,
      title: '確認刪除教師資料',
      message: `確定要自全校師資名冊中刪除「${t.name} (${t.title})」嗎？`,
      warningMessage:
        '將一併移除該教師的週課表節次，以及尚未核准的相關調代課申請。若尚有已核准案件則無法刪除。',
      onConfirm: () => {
        deleteTeacher(t.id);
        setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  // Filtered venues & teachers
  const filteredVenues = venues.filter((v) => {
    const matchSearch = v.name.toLowerCase().includes(venueSearch.toLowerCase()) || v.code.toLowerCase().includes(venueSearch.toLowerCase());
    const matchDept = venueDeptFilter === 'ALL' || v.department === venueDeptFilter;
    const kind = classifyVenueKind(v.name);
    const matchKind = venueKindFilter === 'ALL' || kind === venueKindFilter;
    return matchSearch && matchDept && matchKind;
  });

  const venueKindCounts = {
    homeroom: venues.filter((v) => classifyVenueKind(v.name) === 'homeroom').length,
    workshop: venues.filter((v) => classifyVenueKind(v.name) === 'workshop').length,
    classroom: venues.filter((v) => classifyVenueKind(v.name) === 'classroom').length,
  };
  const filteredTeachers = teachers.filter((t) => {
    const matchSearch = t.name.toLowerCase().includes(teacherSearch.toLowerCase()) || t.title.includes(teacherSearch);
    const matchDept = teacherDeptFilter === 'ALL' || t.department === teacherDeptFilter;
    return matchSearch && matchDept;
  });

  return (
    <div className="space-y-6">
      
      {/* Top Header Card */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-indigo-50 text-indigo-700 rounded-xl">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                系統管理員後台 · 參數與全校資源維護中樞
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                技術型高中教育部部定授課基準 · 鐘點費率標準 · 實習工場與師資資源管理
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Direct Import Schedule Button */}
          <button
            id="btn-admin-top-import-schedule"
            onClick={() => setIsImportModalOpen(true)}
            className="flex items-center space-x-1.5 px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-xs transition active:scale-95 cursor-pointer"
            title="開啟課表匯入精靈 (支援 Excel / CSV)"
          >
            <Upload className="w-3.5 h-3.5 text-slate-950" />
            <span>匯入全校課表 (Excel/CSV)</span>
          </button>

          {/* Download Template Excel */}
          <button
            id="btn-admin-top-download-template"
            onClick={() => generateTemplateExcel(venues)}
            className="flex items-center space-x-1 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition"
            title="下載標準課表 Excel 範本檔案（含場地清單）"
          >
            <Download className="w-3.5 h-3.5 text-slate-600" />
            <span className="hidden sm:inline">下載範本</span>
          </button>

          <BackupTransferButtons variant="light" />

          {/* Download Manual */}
          <button
            id="btn-admin-download-manual"
            onClick={downloadSystemManual}
            className="flex items-center space-x-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition"
            title="下載系統完整使用說明書"
          >
            <FileText className="w-3.5 h-3.5 text-indigo-600" />
            <span className="hidden md:inline">下載說明書</span>
          </button>

          {/* Reset Defaults */}
          <button
            id="btn-admin-reset-defaults"
            onClick={() => {
              setConfirmDialog({
                isOpen: true,
                title: '確認重設系統預設值',
                message: '確定要將所有系統參數、師資、工場與課表重設回預設高職示範值嗎？',
                warningMessage: '此操作將還原所有自訂課表與師資至預設示範狀態。若已啟用跨電腦同步，示範資料會覆蓋全校雲端課表，請謹慎使用。',
                onConfirm: () => {
                  resetToMockData();
                  setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
                },
              });
            }}
            className="flex items-center space-x-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden md:inline">重設預設值</span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          
          <button
            id="tab-admin-config"
            onClick={() => setActiveTab('config')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition ${
              activeTab === 'config'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Coins className="w-4 h-4 text-amber-300" />
            <span>鐘點費與授課節數標準</span>
          </button>

          <button
            id="tab-admin-venues"
            onClick={() => setActiveTab('venues')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition ${
              activeTab === 'venues'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Building2 className="w-4 h-4 text-amber-400" />
            <span>工場與教室維護 ({venues.length})</span>
          </button>

          <button
            id="tab-admin-teachers"
            onClick={() => setActiveTab('teachers')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition ${
              activeTab === 'teachers'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Users className="w-4 h-4 text-emerald-400" />
            <span>全校師資名冊與節數 ({teachers.length})</span>
          </button>

          <button
            id="tab-admin-staff"
            onClick={() => setActiveTab('staff')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition ${
              activeTab === 'staff'
                ? 'bg-indigo-600 text-white shadow-sm ring-2 ring-indigo-500/20'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <UserCheck className="w-4 h-4 text-amber-300" />
            <span>成員名冊維護 ({academicStaffList.length})</span>
          </button>

          <button
            id="tab-admin-schedules"
            onClick={() => setActiveTab('schedules')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition ${
              activeTab === 'schedules'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4 text-sky-400" />
            <span>課表資料與批次中心</span>
          </button>

          <button
            id="tab-admin-sync"
            onClick={() => setActiveTab('sync')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition ${
              activeTab === 'sync'
                ? 'bg-sky-700 text-white shadow-sm'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Cloud className="w-4 h-4 text-sky-500" />
            <span>跨電腦同步</span>
          </button>

          <button
            id="tab-admin-maintenance"
            onClick={() => setActiveTab('maintenance')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition ${
              activeTab === 'maintenance'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <ShieldCheck className="w-4 h-4 text-purple-400" />
            <span>法規依據與系統日誌</span>
          </button>

        </div>

        {/* Global Quick Stats */}
        <div className="hidden lg:flex items-center space-x-3 text-xs text-slate-500">
          <span>學期：{formConfig.academicYear}-{formConfig.semester}</span>
          <span>•</span>
          <span>公立鐘點費：日間 {formConfig.dayHourlyRate}／課輔 {formConfig.nightHourlyRate} 元/節</span>
        </div>
      </div>

      {/* TAB 1: 鐘點費與授課節數標準 */}
      {activeTab === 'config' && (
        <form onSubmit={handleConfigSubmit} className="space-y-6">

          {/* 學校名稱 — 獨立置頂 */}
          <div className="bg-gradient-to-r from-indigo-50 to-blue-50 p-5 rounded-2xl border border-indigo-200 shadow-xs">
            <label className="block text-sm font-bold text-indigo-900 mb-2 flex items-center space-x-2">
              <School className="w-4 h-4 text-indigo-600" />
              <span>學校名稱（通知單抬頭 · 匯出課表標題）</span>
            </label>
            <input
              type="text"
              value={formConfig.schoolName || ''}
              onChange={(e) => setFormConfig({ ...formConfig, schoolName: e.target.value })}
              className="w-full bg-white border border-indigo-300 rounded-xl p-3 text-lg font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500"
              placeholder="如：國立○○高級工業職業學校"
            />
            <p className="text-[11px] text-indigo-600 mt-1.5">修改後將套用於代課通知單抬頭及匯出 Excel 課表標題。</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Hourly Rates Card */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
              <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
                <h3 className="font-bold text-slate-900 text-sm flex items-center space-x-2">
                  <Coins className="w-4 h-4 text-amber-500" />
                  <span>鐘點費率與結算標準設定</span>
                </h3>
                <span className="text-[11px] px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full font-bold border border-amber-200">
                  教育部公立高中標準
                </span>
              </div>

              <div className="space-y-4 text-xs sm:text-sm">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    日間部標準鐘點費 (元/節)
                  </label>
                  <div className="relative">
                    <input
                      id="input-admin-day-rate"
                      type="number"
                      value={formConfig.dayHourlyRate}
                      onChange={(e) =>
                        setFormConfig({ ...formConfig, dayHourlyRate: Number(e.target.value) })
                      }
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 font-mono font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500"
                      required
                    />
                    <span className="absolute right-3 top-2.5 text-xs text-slate-400">NTD / 節</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    公立高級中等學校日間部兼課、代課、超鐘點每節公定 420 元。
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    進修部 / 第八節課輔鐘點費 (元/節)
                  </label>
                  <div className="relative">
                    <input
                      id="input-admin-night-rate"
                      type="number"
                      value={formConfig.nightHourlyRate}
                      onChange={(e) =>
                        setFormConfig({ ...formConfig, nightHourlyRate: Number(e.target.value) })
                      }
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 font-mono font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500"
                      required
                    />
                    <span className="absolute right-3 top-2.5 text-xs text-slate-400">NTD / 節</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    第八節輔導課不計入日間超鐘點，改依此費率另計。
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      全月折算週數基準
                    </label>
                    <input
                      type="number"
                      value={formConfig.weeksInMonth}
                      onChange={(e) =>
                        setFormConfig({ ...formConfig, weeksInMonth: Number(e.target.value) })
                      }
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 font-mono font-bold text-slate-900"
                      required
                    />
                    <span className="text-[10px] text-slate-400">結算依該月週一至週五實際日數（並扣除下方放假日）</span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      每週兼代課法定上限 (節)
                    </label>
                    <input
                      type="number"
                      value={formConfig.maxWeeklyOverloadPeriods}
                      onChange={(e) =>
                        setFormConfig({
                          ...formConfig,
                          maxWeeklyOverloadPeriods: Number(e.target.value),
                        })
                      }
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 font-mono font-bold text-slate-900"
                      required
                    />
                    <span className="text-[10px] text-slate-400">法規上限 9 節（兼4+代5）</span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">學年度</label>
                    <input
                      type="text"
                      value={formConfig.academicYear}
                      onChange={(e) => setFormConfig({ ...formConfig, academicYear: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 text-center font-mono font-bold text-slate-900"
                    />
                    {Number(formConfig.academicYear) <
                      (() => {
                        const y = new Date().getFullYear();
                        const m = new Date().getMonth() + 1;
                        return m >= 8 ? y - 1911 : y - 1912;
                      })() && (
                      <p className="text-[10px] text-amber-700 mt-1 leading-snug">
                        學年度似乎未更新至本學期；結算將暫以西曆校正，建議改為{' '}
                        {(() => {
                          const y = new Date().getFullYear();
                          const m = new Date().getMonth() + 1;
                          return m >= 8 ? y - 1911 : y - 1912;
                        })()}
                        。
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">學期</label>
                    <select
                      value={formConfig.semester}
                      onChange={(e) => setFormConfig({ ...formConfig, semester: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 font-bold text-slate-900"
                    >
                      <option value="1">第 1 學期</option>
                      <option value="2">第 2 學期</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">結算月份</label>
                    <select
                      value={formConfig.currentMonth}
                      onChange={(e) => setFormConfig({ ...formConfig, currentMonth: Number(e.target.value) })}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 font-bold text-slate-900"
                    >
                      {[1,2,3,4,5,6,7,8,9,10,11,12].map((m) => (
                        <option key={m} value={m}>{m} 月</option>
                      ))}
                    </select>
                    <p className="text-[10px] text-slate-400 mt-0.5">預設自動帶入系統當月，需補登過去月份時可手動調整</p>
                  </div>
                </div>

              </div>
            </div>

            {/* 放假日行事曆 */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
              <div className="border-b border-slate-100 pb-3 flex items-center justify-between gap-2 flex-wrap">
                <h3 className="font-bold text-slate-900 text-sm flex items-center space-x-2">
                  <Calendar className="w-4 h-4 text-rose-500" />
                  <span>放假日行事曆（不計鐘點）</span>
                </h3>
                <span className="text-[11px] px-2 py-0.5 bg-rose-50 text-rose-700 rounded-full font-bold border border-rose-200">
                  國定假日／校慶／彈性放假
                </span>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                列入此處的日期（週一至週五）在超鐘點、課輔月結與代課費／自費扣款計算時一律<strong>整天</strong>不計節。週末本來就不計，無需登錄。請依人事行政總處與校曆公告維護。
              </p>
              <div className="text-[11px] text-slate-600 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 leading-relaxed space-y-1">
                <p className="font-bold text-amber-900">操作建議（三種常見情境）</p>
                <p>
                  <strong>半日停課</strong>（如下午佈置考場）：勿標整天放假；改用下方「半日／節次停課」。
                </p>
                <p>
                  <strong>連假平日對調／週六補課</strong>：原日列入放假日，再用下方「暫時移課／補課」指定補課日（可選週六）。勿用教師端自行移課永久改週模板。
                </p>
              </div>
              <div className="flex flex-wrap gap-2 items-end">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">日期</label>
                  <input
                    type="date"
                    value={newHolidayDate}
                    onChange={(e) => setNewHolidayDate(e.target.value)}
                    className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 text-sm"
                  />
                </div>
                <div className="flex-1 min-w-[8rem]">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">說明</label>
                  <input
                    type="text"
                    value={newHolidayLabel}
                    onChange={(e) => setNewHolidayLabel(e.target.value)}
                    placeholder="例：國慶日、校慶"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 text-sm"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (!newHolidayDate) {
                      alert('請選擇日期');
                      return;
                    }
                    const js = new Date(newHolidayDate.replace(/-/g, '/') + ' 12:00:00').getDay();
                    if (js === 0 || js === 6) {
                      alert('週末本來就不計鐘點，無需登錄放假日。');
                      return;
                    }
                    const next: NonTeachingDay = {
                      date: newHolidayDate,
                      label: newHolidayLabel.trim() || '放假',
                    };
                    setFormConfig({
                      ...formConfig,
                      nonTeachingDays: mergeNonTeachingDays(formConfig.nonTeachingDays, [next]),
                    });
                    setNewHolidayDate('');
                    setNewHolidayLabel('放假');
                  }}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-rose-600 text-white text-xs font-bold hover:bg-rose-500"
                >
                  <Plus className="w-3.5 h-3.5" />
                  新增
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const y = new Date().getFullYear();
                    const suggested = suggestNationalHolidays(y);
                    if (suggested.length === 0) {
                      alert(`${y} 年暫無內建建議，請手動新增。`);
                      return;
                    }
                    setFormConfig({
                      ...formConfig,
                      nonTeachingDays: mergeNonTeachingDays(formConfig.nonTeachingDays, suggested),
                    });
                    alert(`已合併 ${y} 年建議放假日 ${suggested.length} 筆（請再核對校曆後按「儲存設定」）。`);
                  }}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50"
                >
                  匯入今年建議國定假日
                </button>
              </div>
              <div className="max-h-48 overflow-y-auto border border-slate-100 rounded-xl divide-y divide-slate-100">
                {(formConfig.nonTeachingDays || []).length === 0 ? (
                  <p className="text-xs text-slate-400 p-3">尚未設定放假日；目前結算會把所有平日都計入。</p>
                ) : (
                  (formConfig.nonTeachingDays || []).map((d) => (
                    <div
                      key={d.date}
                      className="flex items-center justify-between gap-2 px-3 py-2 text-xs sm:text-sm"
                    >
                      <div>
                        <span className="font-mono font-semibold text-slate-800">{d.date}</span>
                        <span className="text-slate-500 ml-2">{d.label}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setFormConfig({
                            ...formConfig,
                            nonTeachingDays: (formConfig.nonTeachingDays || []).filter(
                              (x) => x.date !== d.date
                            ),
                          })
                        }
                        className="p-1 text-slate-400 hover:text-rose-600"
                        title="移除"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* 暫時移課／補課 */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
              <div className="border-b border-slate-100 pb-3 flex items-center justify-between gap-2 flex-wrap">
                <h3 className="font-bold text-slate-900 text-sm flex items-center space-x-2">
                  <Calendar className="w-4 h-4 text-sky-500" />
                  <span>暫時移課／補課（單日對應）</span>
                </h3>
                <span className="text-[11px] px-2 py-0.5 bg-sky-50 text-sky-700 rounded-full font-bold border border-sky-200">
                  不改週課表模板
                </span>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                把「原日」的週課表（依該日是星期幾）加計到「補課日」。例：週四放假 → 週六補上＝原日選該週四、補課日選週六。原日請一併列入上方放假日。可選只移部分節次（空白＝全日 1～8 節）。
              </p>
              <div className="flex flex-wrap gap-2 items-end">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">原日（放假／停課）</label>
                  <input
                    type="date"
                    value={moveSourceDate}
                    onChange={(e) => setMoveSourceDate(e.target.value)}
                    className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">補課日（可週六）</label>
                  <input
                    type="date"
                    value={moveTargetDate}
                    onChange={(e) => setMoveTargetDate(e.target.value)}
                    className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 text-sm"
                  />
                </div>
                <div className="flex-1 min-w-[8rem]">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">說明</label>
                  <input
                    type="text"
                    value={moveLabel}
                    onChange={(e) => setMoveLabel(e.target.value)}
                    placeholder="例：連假補課"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 text-sm"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (!moveSourceDate || !moveTargetDate) {
                      alert('請選擇原日與補課日');
                      return;
                    }
                    const srcJs = new Date(moveSourceDate.replace(/-/g, '/') + ' 12:00:00').getDay();
                    if (srcJs === 0 || srcJs === 6) {
                      alert('原日須為平日（週一至週五），才能對應週課表模板。');
                      return;
                    }
                    const next: TemporaryScheduleMove = {
                      id: `move-${Date.now()}`,
                      sourceDate: moveSourceDate,
                      targetDate: moveTargetDate,
                      label: moveLabel.trim() || '暫時移課／補課',
                      periods: movePeriods.length > 0 ? [...movePeriods].sort((a, b) => a - b) : undefined,
                    };
                    setFormConfig({
                      ...formConfig,
                      temporaryScheduleMoves: mergeTemporaryScheduleMoves(
                        formConfig.temporaryScheduleMoves,
                        [next]
                      ),
                    });
                    setMoveSourceDate('');
                    setMoveTargetDate('');
                    setMovePeriods([]);
                  }}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-sky-600 text-white text-xs font-bold hover:bg-sky-500"
                >
                  <Plus className="w-3.5 h-3.5" />
                  新增暫時移課
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5 items-center">
                <span className="text-[11px] text-slate-500 mr-1">只移節次（可空白＝全日）：</span>
                {[1, 2, 3, 4, 5, 6, 7, 8].map((p) => {
                  const on = movePeriods.includes(p);
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() =>
                        setMovePeriods((prev) =>
                          on ? prev.filter((x) => x !== p) : [...prev, p].sort((a, b) => a - b)
                        )
                      }
                      className={`px-2 py-0.5 rounded text-[11px] font-bold border ${
                        on
                          ? 'bg-sky-600 text-white border-sky-600'
                          : 'bg-white text-slate-600 border-slate-300'
                      }`}
                    >
                      第{p}節
                    </button>
                  );
                })}
              </div>
              <div className="max-h-40 overflow-y-auto border border-slate-100 rounded-xl divide-y divide-slate-100">
                {(formConfig.temporaryScheduleMoves || []).length === 0 ? (
                  <p className="text-xs text-slate-400 p-3">尚未設定暫時移課。</p>
                ) : (
                  (formConfig.temporaryScheduleMoves || []).map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between gap-2 px-3 py-2 text-xs sm:text-sm"
                    >
                      <div>
                        <span className="font-mono font-semibold text-slate-800">
                          {m.sourceDate} → {m.targetDate}
                        </span>
                        <span className="text-slate-500 ml-2">{m.label}</span>
                        {m.periods && m.periods.length > 0 && (
                          <span className="text-sky-700 ml-2">
                            第{m.periods.join('、')}節
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setFormConfig({
                            ...formConfig,
                            temporaryScheduleMoves: (formConfig.temporaryScheduleMoves || []).filter(
                              (x) => x.id !== m.id
                            ),
                          })
                        }
                        className="p-1 text-slate-400 hover:text-rose-600"
                        title="移除"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* 半日／節次停課 */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
              <div className="border-b border-slate-100 pb-3 flex items-center justify-between gap-2 flex-wrap">
                <h3 className="font-bold text-slate-900 text-sm flex items-center space-x-2">
                  <Calendar className="w-4 h-4 text-amber-500" />
                  <span>半日／節次停課</span>
                </h3>
                <span className="text-[11px] px-2 py-0.5 bg-amber-50 text-amber-800 rounded-full font-bold border border-amber-200">
                  例：下午佈置考場
                </span>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                指定日期的部分節次不計超鐘點／課輔；其他節次仍計。預設勾選第 5～8 節（下午含課輔），可自行調整。
              </p>
              <div className="flex flex-wrap gap-2 items-end">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">日期</label>
                  <input
                    type="date"
                    value={partialDate}
                    onChange={(e) => setPartialDate(e.target.value)}
                    className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 text-sm"
                  />
                </div>
                <div className="flex-1 min-w-[8rem]">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">說明</label>
                  <input
                    type="text"
                    value={partialLabel}
                    onChange={(e) => setPartialLabel(e.target.value)}
                    placeholder="例：佈置考場"
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 text-sm"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (!partialDate) {
                      alert('請選擇日期');
                      return;
                    }
                    if (partialPeriods.length === 0) {
                      alert('請至少勾選一節停課節次');
                      return;
                    }
                    const next: PartialNonTeachingDay = {
                      id: `partial-${Date.now()}`,
                      date: partialDate,
                      periods: [...partialPeriods].sort((a, b) => a - b),
                      label: partialLabel.trim() || '半日停課',
                    };
                    setFormConfig({
                      ...formConfig,
                      partialNonTeachingDays: mergePartialNonTeachingDays(
                        formConfig.partialNonTeachingDays,
                        [next]
                      ),
                    });
                    setPartialDate('');
                    setPartialPeriods([5, 6, 7, 8]);
                  }}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-amber-500 text-slate-950 text-xs font-bold hover:bg-amber-400"
                >
                  <Plus className="w-3.5 h-3.5" />
                  新增半日停課
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5 items-center">
                <span className="text-[11px] text-slate-500 mr-1">停課節次：</span>
                {[1, 2, 3, 4, 5, 6, 7, 8].map((p) => {
                  const on = partialPeriods.includes(p);
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() =>
                        setPartialPeriods((prev) =>
                          on ? prev.filter((x) => x !== p) : [...prev, p].sort((a, b) => a - b)
                        )
                      }
                      className={`px-2 py-0.5 rounded text-[11px] font-bold border ${
                        on
                          ? 'bg-amber-500 text-slate-950 border-amber-500'
                          : 'bg-white text-slate-600 border-slate-300'
                      }`}
                    >
                      第{p}節
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setPartialPeriods([5, 6, 7, 8])}
                  className="ml-1 text-[11px] text-amber-800 font-semibold underline"
                >
                  下午（5–8）
                </button>
              </div>
              <div className="max-h-40 overflow-y-auto border border-slate-100 rounded-xl divide-y divide-slate-100">
                {(formConfig.partialNonTeachingDays || []).length === 0 ? (
                  <p className="text-xs text-slate-400 p-3">尚未設定半日停課。</p>
                ) : (
                  (formConfig.partialNonTeachingDays || []).map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between gap-2 px-3 py-2 text-xs sm:text-sm"
                    >
                      <div>
                        <span className="font-mono font-semibold text-slate-800">{m.date}</span>
                        <span className="text-slate-500 ml-2">{m.label}</span>
                        <span className="text-amber-800 ml-2">第{m.periods.join('、')}節</span>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setFormConfig({
                            ...formConfig,
                            partialNonTeachingDays: (formConfig.partialNonTeachingDays || []).filter(
                              (x) => x.id !== m.id
                            ),
                          })
                        }
                        className="p-1 text-slate-400 hover:text-rose-600"
                        title="移除"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Base Teaching Periods Card */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
              <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
                <h3 className="font-bold text-slate-900 text-sm flex items-center space-x-2">
                  <BookOpen className="w-4 h-4 text-indigo-500" />
                  <span>職務基本鐘點設定</span>
                </h3>
                <span className="text-[11px] px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full font-bold border border-indigo-200">
                  五種職稱基本鐘點皆可設定（專任預設 16）
                </span>
              </div>

              <div className="space-y-4 text-xs sm:text-sm">
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-[11px] text-amber-950 leading-relaxed">
                  <strong>超鐘點＝課表標示「兼課」的節數</strong>（依該月週一至週五實際日數計費，並扣除放假日行事曆）。基本鐘點與任務減授仍顯示於師資名冊，不列入超鐘點費。
                  專任、導師、組長、科主任、主任都可在下方填節數，按「儲存系統參數設定」後會套用到全校該職稱教師。團體活動 3 節中：班會／班級活動計入正課，對開社團 2 節不計入。
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      專任教師基本鐘點 (節/週)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={formConfig.standardBasePeriods.fulltime}
                      onChange={(e) =>
                        setFormConfig({
                          ...formConfig,
                          standardBasePeriods: {
                            ...formConfig.standardBasePeriods,
                            fulltime: Math.max(0, Number(e.target.value) || 0),
                          },
                        })
                      }
                      className="w-full bg-white border border-slate-300 rounded-lg p-2 font-mono font-bold text-slate-900 text-base"
                    />
                    <span className="text-[10px] text-slate-500 mt-1 block">可設定，預設 16 節；儲存後套用全體專任教師</span>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      導師基本鐘點
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={formConfig.standardBasePeriods.homeroom}
                      onChange={(e) =>
                        setFormConfig({
                          ...formConfig,
                          standardBasePeriods: {
                            ...formConfig.standardBasePeriods,
                            homeroom: Math.max(0, Number(e.target.value) || 0),
                          },
                        })
                      }
                      className="w-full bg-white border border-slate-300 rounded-lg p-2 font-mono font-bold text-slate-900 text-base"
                    />
                    <span className="text-[10px] text-slate-500 mt-1 block">可設定；儲存後套用全體導師</span>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      組長基本鐘點
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={formConfig.standardBasePeriods.sectionChief}
                      onChange={(e) =>
                        setFormConfig({
                          ...formConfig,
                          standardBasePeriods: {
                            ...formConfig.standardBasePeriods,
                            sectionChief: Math.max(0, Number(e.target.value) || 0),
                          },
                        })
                      }
                      className="w-full bg-white border border-slate-300 rounded-lg p-2 font-mono font-bold text-slate-900 text-base"
                    />
                    <span className="text-[10px] text-slate-500 mt-1 block">可設定；儲存後套用全體組長</span>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      科主任基本鐘點
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={formConfig.standardBasePeriods.head}
                      onChange={(e) =>
                        setFormConfig({
                          ...formConfig,
                          standardBasePeriods: {
                            ...formConfig.standardBasePeriods,
                            head: Math.max(0, Number(e.target.value) || 0),
                          },
                        })
                      }
                      className="w-full bg-white border border-slate-300 rounded-lg p-2 font-mono font-bold text-slate-900 text-base"
                    />
                    <span className="text-[10px] text-slate-500 mt-1 block">可設定；儲存後套用全體科主任</span>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      主任基本鐘點
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={formConfig.standardBasePeriods.director}
                      onChange={(e) =>
                        setFormConfig({
                          ...formConfig,
                          standardBasePeriods: {
                            ...formConfig.standardBasePeriods,
                            director: Math.max(0, Number(e.target.value) || 0),
                          },
                        })
                      }
                      className="w-full bg-white border border-slate-300 rounded-lg p-2 font-mono font-bold text-slate-900 text-base"
                    />
                    <span className="text-[10px] text-slate-500 mt-1 block">可設定；儲存後套用全體主任</span>
                  </div>
                </div>

                <div className="bg-indigo-50/70 p-3.5 rounded-xl border border-indigo-100 text-xs text-indigo-900 space-y-1">
                  <div className="font-bold text-indigo-950 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-indigo-600" />
                    目前套用中的基本鐘點
                  </div>
                  <p className="text-[11px] leading-relaxed text-indigo-800">
                    專任 {formConfig.standardBasePeriods.fulltime} 節、導師 {formConfig.standardBasePeriods.homeroom} 節、組長 {formConfig.standardBasePeriods.sectionChief} 節、科主任 {formConfig.standardBasePeriods.head} 節、主任 {formConfig.standardBasePeriods.director} 節。任務減授仍依各人職稱預設或名冊填寫。
                  </p>
                </div>
              </div>
            </div>

          </div>

          {/* Security & Authentication Configuration Card */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="p-1.5 bg-amber-100 text-amber-800 rounded-lg">
                  <Lock className="w-4 h-4 text-amber-600" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">
                    身分登入密碼驗證安全設定
                  </h3>
                  <p className="text-xs text-slate-500">
                    啟用身分切換密碼保護，防止教師與行政人員端未授權切換或代為送出簽核
                  </p>
                </div>
              </div>
              <label className="flex items-center space-x-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={formConfig.authConfig?.requirePassword ?? true}
                  onChange={(e) =>
                    setFormConfig({
                      ...formConfig,
                      authConfig: {
                        ...(formConfig.authConfig || {
                          defaultTeacherPassword: '1234',
                          adminPassword: DEFAULT_ADMIN_PASSWORD,
                          academicPassword: '1234',
                          accountingPassword: '1234',
                        }),
                        requirePassword: e.target.checked,
                      },
                    })
                  }
                  className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                />
                <span className="text-xs font-bold text-slate-800">
                  {formConfig.authConfig?.requirePassword ? '🛡️ 密碼保護已啟用' : '🔓 密碼保護已關閉 (免密碼切換)'}
                </span>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                <label className="block text-xs font-bold text-slate-800 mb-1 flex items-center justify-between">
                  <span>全校教師預設密碼</span>
                  <span className="text-[10px] text-amber-600 font-mono">預設: 1234</span>
                </label>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={formConfig.authConfig?.defaultTeacherPassword || ''}
                  placeholder={isPasswordHash(systemConfig.authConfig?.defaultTeacherPassword) ? '已設定，留空則不變' : '預設 1234，留空沿用'}
                  onChange={(e) =>
                    setFormConfig({
                      ...formConfig,
                      authConfig: {
                        ...(formConfig.authConfig || {
                          requirePassword: true,
                          adminPassword: DEFAULT_ADMIN_PASSWORD,
                          academicPassword: '1234',
                          accountingPassword: '1234',
                        }),
                        defaultTeacherPassword: e.target.value,
                      },
                    })
                  }
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 font-mono font-bold text-slate-900 text-sm"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  老師可自行設定專屬密碼。若忘記密碼，管理員可到「師資名冊」重設為預設密碼或指定新密碼。密碼以雜湊保存。
                </p>
              </div>

              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                <label className="block text-xs font-bold text-slate-800 mb-1 flex items-center justify-between">
                  <span>教學組經辦密碼</span>
                  <span className="text-[10px] text-indigo-600 font-mono">預設: 1234</span>
                </label>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={formConfig.authConfig?.academicPassword || ''}
                  placeholder={isPasswordHash(systemConfig.authConfig?.academicPassword) ? '已設定，留空則不變' : '預設 1234，留空沿用'}
                  onChange={(e) =>
                    setFormConfig({
                      ...formConfig,
                      authConfig: {
                        ...(formConfig.authConfig || {
                          requirePassword: true,
                          defaultTeacherPassword: '1234',
                          adminPassword: DEFAULT_ADMIN_PASSWORD,
                          accountingPassword: '1234',
                        }),
                        academicPassword: e.target.value,
                      },
                    })
                  }
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 font-mono font-bold text-slate-900 text-sm"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  切換至【教務處教學組】時的組別預設密碼；組員登入後可自行設定個人密碼（未設個人密碼時才用此預設）。
                </p>
              </div>

              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                <label className="block text-xs font-bold text-slate-800 mb-1 flex items-center justify-between">
                  <span>主計出納結算密碼</span>
                  <span className="text-[10px] text-amber-600 font-mono">預設: 1234</span>
                </label>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={formConfig.authConfig?.accountingPassword || ''}
                  placeholder={isPasswordHash(systemConfig.authConfig?.accountingPassword) ? '已設定，留空則不變' : '預設 1234，留空沿用'}
                  onChange={(e) =>
                    setFormConfig({
                      ...formConfig,
                      authConfig: {
                        ...(formConfig.authConfig || {
                          requirePassword: true,
                          defaultTeacherPassword: '1234',
                          adminPassword: DEFAULT_ADMIN_PASSWORD,
                          academicPassword: '1234',
                        }),
                        accountingPassword: e.target.value,
                      },
                    })
                  }
                  className="w-full bg-white border border-slate-300 rounded-lg p-2 font-mono font-bold text-slate-900 text-sm"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  切換至【出納組】時的組別預設密碼；組員登入後可自行設定個人密碼（未設個人密碼時才用此預設）。
                </p>
              </div>

              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  系統管理員密碼
                </label>
                <div className="relative">
                  <input
                    type={showAdminPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={formConfig.authConfig?.adminPassword || ''}
                    onChange={(e) =>
                      setFormConfig({
                        ...formConfig,
                        authConfig: {
                          ...(formConfig.authConfig || {
                            requirePassword: true,
                            defaultTeacherPassword: '1234',
                            academicPassword: '1234',
                            accountingPassword: '1234',
                          }),
                          adminPassword: e.target.value,
                        },
                      })
                    }
                    className="w-full bg-white border border-slate-300 rounded-lg p-2 pr-9 font-mono font-bold text-slate-900 text-sm"
                    placeholder="請輸入管理員密碼"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAdminPassword((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-700"
                    title={showAdminPassword ? '隱藏密碼' : '顯示密碼'}
                    aria-label={showAdminPassword ? '隱藏密碼' : '顯示密碼'}
                  >
                    {showAdminPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  切換至【系統管理員】後台維護時所需的最高權限密碼。
                </p>
              </div>
            </div>
          </div>

          {/* Save Bar */}
          <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
            <div>
              {saveSuccess ? (
                <span className="text-xs text-emerald-700 font-bold flex items-center gap-1.5">
                  <Check className="w-4 h-4 text-emerald-600" />
                  系統設定參數已成功儲存並即時套用至全校課表與結算！
                </span>
              ) : (
                <span className="text-xs text-slate-500">
                  修改參數後點擊儲存，將即時更新主計出納結算與調代課計算邏輯。
                </span>
              )}
            </div>
            
            <button
              type="submit"
              id="btn-save-admin-config"
              className="flex items-center space-x-1.5 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs sm:text-sm rounded-xl shadow transition active:scale-95"
            >
              <Save className="w-4 h-4" />
              <span>儲存系統參數設定</span>
            </button>
          </div>
        </form>
      )}

      {/* TAB 2: 實習工場與教室維護 */}
      {activeTab === 'venues' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3 flex-1">
              <div className="relative min-w-[220px]">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="搜尋工場名稱、代碼..."
                  value={venueSearch}
                  onChange={(e) => setVenueSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <select
                value={venueDeptFilter}
                onChange={(e) => setVenueDeptFilter(e.target.value)}
                className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-700"
              >
                <option value="ALL">全部科別與場域</option>
                {SCHOOL_DEPARTMENTS.filter((d) => d !== '共同科目').map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
                <option value="通用教室">通用教室</option>
              </select>

              <select
                value={venueKindFilter}
                onChange={(e) => setVenueKindFilter(e.target.value as 'ALL' | VenueKind)}
                className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-700"
                title="原班教室＝匯入未填教室時依班級自動建立；實習工場＝課表填寫的工場名稱"
              >
                <option value="ALL">全部類型</option>
                <option value="workshop">實習工場 ({venueKindCounts.workshop})</option>
                <option value="homeroom">原班教室 ({venueKindCounts.homeroom})</option>
                <option value="classroom">一般教室 ({venueKindCounts.classroom})</option>
              </select>
            </div>
            <button
              id="btn-admin-add-venue"
              onClick={handleOpenAddVenue}
              className="flex items-center space-x-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs transition active:scale-95"
            >
              <Plus className="w-4 h-4 text-amber-400" />
              <span>新增實習工場 / 教室</span>
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="bg-slate-900 text-white px-6 py-3.5 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center space-x-2">
                <Building2 className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-sm">全校工場與教室清冊</h3>
              </div>
              <span className="text-xs text-slate-400">
                工場 <strong className="text-amber-400">{venueKindCounts.workshop}</strong>
                <span className="mx-1.5 text-slate-600">｜</span>
                原班教室 <strong className="text-slate-200">{venueKindCounts.homeroom}</strong>
                <span className="mx-1.5 text-slate-600">｜</span>
                一般教室 <strong className="text-sky-300">{venueKindCounts.classroom}</strong>
              </span>
            </div>

            <div className="px-4 py-2 bg-amber-50 border-b border-amber-100 text-[11px] text-amber-900">
              匯入規則：學科未填教室→「班級 原班普通教室」；實習課未填工場→「xx科實習工場」（可再細分配線／電工等）；
              有填名稱→依名稱建立／對應。篩選可分開檢視原班教室與實習工場。
            </div>

            <div className="divide-y divide-slate-100 text-xs">
              {filteredVenues.length === 0 ? (
                <div className="p-8 text-center text-slate-400">查無符合條件的工場或教室資料</div>
              ) : (
                filteredVenues.map((v) => {
                  const sessionCount = sessions.filter((s) => s.venueId === v.id).length;
                  const kind = classifyVenueKind(v.name);
                  return (
                    <div key={v.id} className="p-4 flex flex-wrap items-center justify-between gap-3 hover:bg-slate-50 transition">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono font-bold text-xs bg-slate-100 text-slate-800 px-2 py-0.5 rounded border">
                            {v.code}
                          </span>
                          <span className="font-bold text-slate-900 text-sm">{v.name}</span>
                          <span
                            className={`px-2 py-0.5 rounded font-bold text-[11px] border ${venueKindBadgeClass(kind)}`}
                          >
                            {venueKindLabel(kind)}
                          </span>
                          <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded font-semibold text-[11px]">
                            {v.department}
                          </span>
                          <span className={`px-2 py-0.5 rounded font-bold text-[11px] ${
                            v.safetyLevel === '危險機具區'
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : v.safetyLevel === '高安全防護'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-slate-100 text-slate-700 border border-slate-200'
                          }`}>
                            安全等級：{v.safetyLevel}
                          </span>
                        </div>
                        <p className="text-slate-500 text-xs">
                          <span className="font-semibold text-slate-700">設備配置與安全規範：</span> {v.equipmentNote || '標準實習防護規格'}
                        </p>
                      </div>
                      <div className="flex items-center space-x-4">
                        <div className="text-right">
                          <div className="text-xs text-slate-500">容納容量：<strong className="text-slate-800">{v.capacity} 人</strong></div>
                          <div className="text-[11px] text-indigo-600 font-semibold">排課量：{sessionCount} 節/週</div>
                        </div>

                        <div className="flex items-center space-x-1.5 border-l border-slate-200 pl-3">
                          <button
                            onClick={() => handleOpenEditVenue(v)}
                            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition"
                            title="編輯工場資料"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteVenue(v)}
                            className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg transition"
                            title="刪除此場地"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: 全校師資名冊與節數 */}
      {activeTab === 'teachers' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3 flex-1">
              <div className="relative min-w-[220px]">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="搜尋教師姓名、專長、職稱..."
                  value={teacherSearch}
                  onChange={(e) => setTeacherSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <select
                value={teacherDeptFilter}
                onChange={(e) => setTeacherDeptFilter(e.target.value)}
                className="bg-slate-50 border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-700"
              >
                <option value="ALL">全部群科科別</option>
                {SCHOOL_DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center space-x-2">
              <button
                id="btn-admin-purge-mock-teachers"
                onClick={() => {
                  const activeTeacherIds = new Set(sessions.map((s) => s.teacherId));
                  const unusedMockTeachers = teachers.filter((t) => !activeTeacherIds.has(t.id));
                  if (unusedMockTeachers.length === 0) {
                    alert('目前名冊中所有教師皆有排定課堂，無多餘未排課之測試教師。');
                    return;
                  }
                  if (confirm(`確定要清除未在課表中排課的 ${unusedMockTeachers.length} 位預設示範教師嗎？\n（包含：${unusedMockTeachers.map(t => t.name).slice(0, 5).join('、')}${unusedMockTeachers.length > 5 ? '...等' : ''}）`)) {
                    unusedMockTeachers.forEach((t) => deleteTeacher(t.id));
                  }
                }}
                className="flex items-center space-x-1 px-3 py-2 bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-700 font-semibold text-xs rounded-xl border border-slate-200 hover:border-rose-300 transition"
                title="清除未在課表中有任何授課節數的系統預設教師"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>清除未排課示範教師</span>
              </button>

              <button
                id="btn-admin-add-teacher"
                onClick={handleOpenAddTeacher}
                className="flex items-center space-x-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs transition active:scale-95"
              >
                <Plus className="w-4 h-4 text-emerald-400" />
                <span>新增教師師資資料</span>
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="bg-slate-900 text-white px-6 py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <div className="flex items-center space-x-2">
                  <Users className="w-5 h-5 text-emerald-400" />
                  <h3 className="font-bold text-sm">全校專業群科教師師資與授課標準名冊</h3>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  基本節數依系統設定。職稱請用下拉選：導師、組長、科主任、主任、專任教師。
                </p>
              </div>
              <span className="text-xs text-slate-400">
                共 <strong className="text-emerald-400">{filteredTeachers.length}</strong> 位任課教師
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-3.5">教師姓名</th>
                    <th className="p-3.5">職稱</th>
                    <th className="p-3.5">群科科別</th>
                    <th className="p-3.5 text-center">任務減授</th>
                    <th className="p-3.5 text-center">基本節數</th>
                    <th className="p-3.5 text-center">排定節數（不含團體活動）</th>
                    <th className="p-3.5 text-center">每週超額（兼課）</th>
                    <th className="p-3.5">任教專長 / 專業證照</th>
                    <th className="p-3.5">聯絡資訊</th>
                    <th className="p-3.5 text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredTeachers.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="p-8 text-center text-slate-400">
                        查無符合條件的教師資料
                      </td>
                    </tr>
                  ) : (
                    filteredTeachers.map((t) => {
                      const overload = teacherWeeklyOverload(t, sessions);
                      return (
                        <tr key={t.id} className="hover:bg-slate-50/80 transition">
                          <td className="p-3.5">
                            <div className="font-bold text-slate-900 text-sm">{t.name}</div>
                            {t.homeroomClass ? (
                              <span className="text-[10px] text-slate-400">{t.homeroomClass}導師</span>
                            ) : null}
                            {t.password ? (
                              <span className="ml-1.5 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                                已自訂密碼
                              </span>
                            ) : (
                              <span className="ml-1.5 text-[10px] text-slate-400">使用預設密碼</span>
                            )}
                          </td>
                          <td className="p-3.5">
                            <select
                              value={normalizeTeacherTitle(t.title)}
                              onChange={(e) => {
                                const newTitle = e.target.value as TeacherTitle;
                                updateTeacher(t.id, {
                                  title: newTitle,
                                  dutyReductionPeriods: defaultDutyForTitle(newTitle),
                                });
                              }}
                              className="w-[7.5rem] bg-white border border-slate-300 rounded-lg px-1.5 py-1 text-[11px] font-bold text-slate-800"
                              title="職稱"
                            >
                              {TEACHER_TITLES.map((title) => (
                                <option key={title} value={title}>{title}</option>
                              ))}
                            </select>
                          </td>
                          <td className="p-3.5">
                            <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded font-semibold text-[11px]">
                              {t.department}
                            </span>
                          </td>
                          <td className="p-3.5 text-center">
                            <input
                              type="number"
                              min={0}
                              max={formConfig.standardBasePeriods.fulltime}
                              value={t.dutyReductionPeriods ?? 0}
                              onChange={(e) =>
                                updateTeacher(t.id, {
                                  dutyReductionPeriods: Math.max(0, Number(e.target.value) || 0),
                                })
                              }
                              className="w-16 text-center bg-white border border-slate-300 rounded-lg py-1 font-mono font-bold text-slate-900"
                              title="任務減授節數（每人不同）"
                            />
                            <span className="block text-[10px] text-slate-400 mt-0.5">節</span>
                          </td>
                          <td className="p-3.5 text-center font-mono font-bold text-slate-800">
                            {t.basePeriods} 節
                          </td>
                          <td className="p-3.5 text-center font-mono font-bold text-slate-900">
                            {t.weeklyActualPeriods} 節
                          </td>
                          <td className="p-3.5 text-center">
                            {overload > 0 ? (
                              <span className="px-2 py-0.5 bg-amber-100 text-amber-800 font-mono font-bold rounded">
                                +{overload} 節
                              </span>
                            ) : (
                              <span className="text-slate-400 font-mono">0</span>
                            )}
                          </td>
                          <td className="p-3.5 max-w-[220px]">
                            <div className="flex flex-wrap gap-1">
                              {t.certifications.map((c, i) => (
                                <span key={i} className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded border">
                                  {c}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="p-3.5 text-slate-600 text-[11px]">
                            <div>{t.phone}</div>
                            <div className="text-slate-400">{t.email}</div>
                          </td>
                          <td className="p-3.5 text-right">
                            <div className="flex items-center justify-end space-x-1.5">
                              <button
                                onClick={() => {
                                  setPasswordResetTeacher(t);
                                  setAdminSetPassword('');
                                  setPasswordResetNotice('');
                                }}
                                className="p-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-lg transition"
                                title="重設此教師登入密碼"
                              >
                                <KeyRound className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleOpenEditTeacher(t)}
                                className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition"
                                title="編輯教師資料"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteTeacher(t)}
                                className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg transition"
                                title="刪除教師"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
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

      {/* TAB: 成員名冊維護 */}
      {activeTab === 'staff' && (
        <div className="space-y-6">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-indigo-600" />
                <span>行政經辦人員名冊維護</span>
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                此處設定之人員姓名與職稱，將即時同步連動至各組對應的作業畫面：教學組連動「經辦切換選單、派代工作台、調代課簽章審核、代課通知單」；出納組連動「鐘點費結算清冊」。
              </p>
            </div>

            <button
              id="btn-admin-add-staff"
              onClick={handleOpenAddStaff}
              className="flex items-center space-x-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-xs transition active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>➕ 新增成員</span>
            </button>
          </div>

          {/* Staff Cards by Group */}
          {(['academic', 'accounting'] as const).map((grp) => {
            const groupLabel = grp === 'academic' ? '教學組' : '出納組';
            const members = academicStaffList.filter((s) => (s.group || 'academic') === grp);
            return (
              <div key={grp} className="space-y-3">
                <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${grp === 'academic' ? 'bg-indigo-500' : 'bg-teal-500'}`} />
                  {groupLabel}（{members.length} 人）
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {members.map((staff) => (
                    <div
                      key={staff.id}
                      className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 flex flex-col justify-between space-y-4 hover:border-indigo-300 transition"
                    >
                      <div className="space-y-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center space-x-3">
                            <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${staff.avatarBg || 'from-indigo-600 to-indigo-800'} text-white flex items-center justify-center font-black text-xl shadow-xs`}>
                              {staff.name.slice(0, 1) || '員'}
                            </div>
                            <div>
                              <div className="flex items-center space-x-2">
                                <h4 className="font-bold text-base text-slate-900">{staff.name}</h4>
                                <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded text-xs font-bold">
                                  {staff.title}
                                </span>
                              </div>
                              <span className="inline-block mt-0.5 text-[11px] font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                {staff.badge}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs space-y-1.5">
                          <div>
                            <span className="text-slate-400 font-medium">職責執掌：</span>
                            <p className="text-slate-700 font-semibold mt-0.5 leading-relaxed">
                              {staff.responsibleScope}
                            </p>
                          </div>
                          <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500">
                            <span>📞 {staff.phone}</span>
                            <span>✉️ {staff.email}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100">
                        <button
                          onClick={() => handleOpenEditStaff(staff)}
                          className="flex items-center space-x-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition"
                        >
                          <Edit2 className="w-3.5 h-3.5 text-indigo-600" />
                          <span>修改組員姓名/資料</span>
                        </button>
                        <button
                          onClick={() => handleDeleteStaff(staff)}
                          className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg transition"
                          title="刪除此成員"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {/* Information Tip Card */}
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-900 flex items-start space-x-3">
            <Sparkles className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1 leading-relaxed">
              <span className="font-bold text-amber-950">💡 提示與姓名修正連動說明：</span>
              <p>
                點選上方「修改組員姓名/資料」按鈕即可直接更換教學組或出納組組長、組員的姓名。修改後將即時同步於全校調代課經辦簽章與代課通知單中。
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: 課表資料與批次中心 */}
      {activeTab === 'schedules' && (
        <div className="space-y-6">
          <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white rounded-2xl p-6 shadow-md space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <span className="p-1.5 bg-amber-500 text-slate-950 rounded-lg font-black">
                    <FileSpreadsheet className="w-4 h-4" />
                  </span>
                  <h3 className="text-base font-bold">全校課表資料批次匯入與 Excel 備份管理</h3>
                </div>
                <p className="text-xs text-slate-300">
                  支援匯入新學期班級與實習工場總課表 (.xlsx / .csv)，自動檢核師資基本授課節數與實習衝堂。
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 text-xs">
                <button
                  id="btn-admin-download-template"
                  onClick={() => generateTemplateExcel(venues)}
                  className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold transition"
                >
                  <Download className="w-3.5 h-3.5 text-amber-400" />
                  <span>下載課表範本 Excel</span>
                </button>

                <button
                  id="btn-admin-export-backup"
                  onClick={() => exportScheduleToExcel(sessions, teachers, formConfig.academicYear, formConfig.semester, formConfig.schoolName)}
                  className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold transition"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-400" />
                  <span>備份匯出全校課表</span>
                </button>

                <button
                  id="btn-admin-open-importer"
                  onClick={() => setIsImportModalOpen(true)}
                  className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold shadow transition active:scale-95"
                >
                  <Upload className="w-4 h-4" />
                  <span>開啟課表匯入精靈</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 text-xs border-t border-slate-800">
              <div className="bg-slate-800/60 p-2.5 rounded-xl">
                <span className="text-slate-400 block text-[11px]">目前排定總課堂數</span>
                <span className="text-base font-bold text-amber-400">{sessions.length} 節</span>
              </div>
              <div className="bg-slate-800/60 p-2.5 rounded-xl">
                <span className="text-slate-400 block text-[11px]">專業實習工場課堂</span>
                <span className="text-base font-bold text-amber-400">{sessions.filter((s) => s.isPractical).length} 節</span>
              </div>
              <div className="bg-slate-800/60 p-2.5 rounded-xl">
                <span className="text-slate-400 block text-[11px]">現有任課師資</span>
                <span className="text-base font-bold text-slate-200">{teachers.length} 位</span>
              </div>
              <div className="bg-slate-800/60 p-2.5 rounded-xl">
                <span className="text-slate-400 block text-[11px]">實習工場與教室</span>
                <span className="text-base font-bold text-slate-200">{venues.length} 間</span>
              </div>
            </div>
          </div>

          {/* Quick Schedule Overview Info */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
            <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-600" />
              <span>課表批次匯入支援格式與欄位說明</span>
            </h4>
            <p className="text-xs text-slate-600 leading-relaxed">
              系統支援標準高職排課 Excel / CSV 格式，欄位包含：<strong>星期 (1~5)、節次 (1~8)、班級、科目名稱、任課教師、上課教室/實習工場、是否為實習課、兼課（填 1 即兼課）</strong>。
              匯入時系統會自動建立新教師與新場地，並自動重算每位教師之每週授課節數與超鐘點費。兼課課堂會在課表上標示「兼課」。
            </p>
          </div>
        </div>
      )}

      {/* TAB 5: 法規依據與系統日誌 */}
      {activeTab === 'sync' && <CloudSyncPanel />}

      {activeTab === 'maintenance' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Legal Framework Reference */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
              <h3 className="font-bold text-slate-900 text-sm flex items-center space-x-2 border-b border-slate-100 pb-3">
                <ShieldCheck className="w-4 h-4 text-indigo-600" />
                <span>法規標準與主管機關函示</span>
              </h3>

              <div className="space-y-3 text-xs text-slate-600">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                  <div className="font-bold text-slate-900">1. 《國立高級中等學校教師每週教學節數標準》（111.07.04 修正）</div>
                  <p>專任教師基本 16 節（國語文 14 節）。兼任導師之專任教師基本 12 節（國語文 10 節），團體活動之班級活動節數併入計算。兼任行政職務之專任教師依班級數及職務核定：處室主任 0～7 節、二級單位組長 0～9 節、科（學程）主任依全科班級數 6～8 節。超鐘點＝每週排定教學節數 − 每週基本教學節數。</p>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                  <div className="font-bold text-slate-900">2. 《公立高級中等學校兼課代課及超時授課鐘點費支給基準》</div>
                  <p>公立高職日間部每節 420 元。兼任、代課每週合併計算不得超過 9 節（兼課 4 節、代課 5 節為限）。</p>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                  <div className="font-bold text-slate-900">3. 《高級中等學校專業群科實習課程實施辦法》</div>
                  <p>實習工場操作危險機具與高防護設備應配置專業合格教師，實施分組教學與安全查核防護。</p>
                </div>
              </div>
            </div>

            {/* System Status & Maintenance */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
              <h3 className="font-bold text-slate-900 text-sm flex items-center space-x-2 border-b border-slate-100 pb-3">
                <Wrench className="w-4 h-4 text-amber-600" />
                <span>系統診斷與資料快取維護</span>
              </h3>

              <div className="space-y-3 text-xs text-slate-600">
                <div className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <div>
                    <div className="font-bold text-slate-900">瀏覽器 LocalStorage 狀態</div>
                    <div className="text-[11px] text-slate-500">課表、申請單、師資與場地資料即時同步存儲</div>
                  </div>
                  <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-full font-bold text-[11px]">
                    運作正常
                  </span>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                  <div className="font-bold text-slate-900">重設示範資料</div>
                  <p className="text-slate-500 text-[11px]">
                    若排課或測試資料需還原為系統初始高職示範資料（含電機、資訊、機械、餐飲等群科課表），可隨時一鍵重設。
                  </p>
                  <button
                    onClick={() => {
                      setConfirmDialog({
                        isOpen: true,
                        title: '確認還原初始示範資料',
                        message: '確定要還原所有資料為初始高職示範狀態嗎？',
                        warningMessage: '包含電機、資訊、機械、餐飲等群科之預設課表與申請單。',
                        onConfirm: () => {
                          resetToMockData();
                          setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
                        },
                      });
                    }}
                    className="flex items-center space-x-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg font-bold text-xs transition"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>還原為初始示範資料</span>
                  </button>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* VENUE MODAL */}
      {isVenueModalOpen && (
        <ModalShell
          scroll="panel"
          backdropClassName="bg-slate-900/60 backdrop-blur-xs"
          panelClassName="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200"
        >
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-amber-500" />
                <span>{editingVenue ? '編輯實習工場 / 教室' : '新增實習工場 / 教室'}</span>
              </h3>
              <button
                onClick={() => setIsVenueModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveVenue} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">場地代碼</label>
                  <input
                    type="text"
                    value={venueFormData.code}
                    onChange={(e) => setVenueFormData({ ...venueFormData, code: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 font-mono font-bold"
                    placeholder="如：EE-LAB-01"
                    required
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">所屬群科</label>
                  <select
                    value={venueFormData.department}
                    onChange={(e) => setVenueFormData({ ...venueFormData, department: e.target.value as any })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 font-bold"
                  >
                    {SCHOOL_DEPARTMENTS.filter((d) => d !== '共同科目').map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                    <option value="通用教室">通用教室</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">場地 / 工場名稱</label>
                <input
                  type="text"
                  value={venueFormData.name}
                  onChange={(e) => setVenueFormData({ ...venueFormData, name: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 font-bold"
                  placeholder="如：PLC自動控制實習工場"
                  required
                />
                {editingVenue && (
                  <p className="mt-1 text-[11px] text-slate-500">
                    修改名稱後，課表與調代課單據上引用此場地的名稱會一併同步更新。
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">容納人數</label>
                  <input
                    type="number"
                    value={venueFormData.capacity}
                    onChange={(e) => setVenueFormData({ ...venueFormData, capacity: Number(e.target.value) })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 font-mono"
                    required
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">安全防護等級</label>
                  <select
                    value={venueFormData.safetyLevel}
                    onChange={(e) => setVenueFormData({ ...venueFormData, safetyLevel: e.target.value as any })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 font-bold"
                  >
                    <option value="標準">標準</option>
                    <option value="高安全防護">高安全防護</option>
                    <option value="危險機具區">危險機具區</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">設備配置與安全規範備註</label>
                <textarea
                  value={venueFormData.equipmentNote}
                  onChange={(e) => setVenueFormData({ ...venueFormData, equipmentNote: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 text-xs"
                  rows={3}
                  placeholder="例如：配備 40 套三菱FX5U工作站、高壓絕緣安全防護裝備..."
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsVenueModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold shadow"
                >
                  儲存場地資料
                </button>
              </div>
            </form>
          </div>
        </ModalShell>
      )}

      {/* TEACHER MODAL */}
      {isTeacherModalOpen && (
        <ModalShell
          scroll="panel"
          backdropClassName="bg-slate-900/60 backdrop-blur-xs"
          panelClassName="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200"
        >
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                <Users className="w-5 h-5 text-emerald-500" />
                <span>{editingTeacher ? '編輯教師師資資料' : '新增教師師資資料'}</span>
              </h3>
              <button
                onClick={() => setIsTeacherModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTeacher} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">教師姓名</label>
                  <input
                    type="text"
                    value={teacherFormData.name}
                    onChange={(e) => {
                      const name = e.target.value;
                      setTeacherFormData({
                        ...teacherFormData,
                        name,
                        email:
                          !teacherFormData.email || isPlaceholderSchoolEmail(teacherFormData.email)
                            ? name.trim()
                              ? defaultSchoolEmail(name)
                              : ''
                            : teacherFormData.email,
                      });
                    }}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 font-bold"
                    placeholder="如：王大明"
                    required
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">職稱</label>
                  <select
                    value={teacherFormData.title}
                    onChange={(e) => {
                      const newTitle = e.target.value as TeacherTitle;
                      setTeacherFormData({
                        ...teacherFormData,
                        title: newTitle,
                        dutyReductionPeriods: defaultDutyForTitle(newTitle),
                        basePeriods: calcTeacherFormBase(newTitle),
                      });
                    }}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 font-bold"
                  >
                    {TEACHER_TITLES.map((title) => (
                      <option key={title} value={title}>{title}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">群科科別</label>
                  <select
                    value={teacherFormData.department}
                    onChange={(e) => setTeacherFormData({ ...teacherFormData, department: e.target.value as any })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 font-bold"
                  >
                    {SCHOOL_DEPARTMENTS.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">任務減授（節）</label>
                  <input
                    type="number"
                    min={0}
                    max={formConfig.standardBasePeriods.fulltime}
                    value={teacherFormData.dutyReductionPeriods}
                    onChange={(e) => {
                      const dutyReductionPeriods = Math.max(0, Number(e.target.value) || 0);
                      setTeacherFormData({
                        ...teacherFormData,
                        dutyReductionPeriods,
                        basePeriods: calcTeacherFormBase(),
                      });
                    }}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 font-mono font-bold"
                    required
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">導師 1、科主任 2、組長／主任 0；超鐘點＝正課＋減授−基本</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">每週基本授課節數</label>
                  <input
                    type="number"
                    value={calcTeacherFormBase()}
                    readOnly
                    className="w-full bg-slate-100 border border-slate-300 rounded-xl p-2 font-mono font-bold text-slate-700"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">
                    {teacherFormData.title === '主任'
                      ? `主任基本 ${formConfig.standardBasePeriods.director} 節、減授 0 節`
                      : teacherFormData.title === '科主任'
                        ? `科主任基本 ${formConfig.standardBasePeriods.head} 節、減授 ${defaultDutyForTitle('科主任')} 節`
                        : teacherFormData.title === '組長'
                          ? `組長基本 ${formConfig.standardBasePeriods.sectionChief} 節、減授 0 節`
                          : teacherFormData.title === '導師'
                            ? `導師基本 ${formConfig.standardBasePeriods.homeroom} 節、減授 ${defaultDutyForTitle('導師')} 節`
                            : `專任基本 ${formConfig.standardBasePeriods.fulltime} 節、減授 0 節`}
                  </span>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">公務分機 / 電話</label>
                  <input
                    type="text"
                    value={teacherFormData.phone}
                    onChange={(e) => setTeacherFormData({ ...teacherFormData, phone: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2"
                    placeholder="如：分機 310"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">電子郵件</label>
                <input
                  type="email"
                  value={teacherFormData.email}
                  onChange={(e) => setTeacherFormData({ ...teacherFormData, email: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2"
                  placeholder={`如：王大明@${SCHOOL_EMAIL_DOMAIN}`}
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">任教專長 / 專業證照 (逗號分隔)</label>
                <input
                  type="text"
                  value={teacherFormData.certifications}
                  onChange={(e) => setTeacherFormData({ ...teacherFormData, certifications: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2"
                  placeholder="如：乙級室內配線, PLC控制, 工業電子"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsTeacherModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold shadow"
                >
                  儲存師資資料
                </button>
              </div>
            </form>
          </div>
        </ModalShell>
      )}

      {/* ACADEMIC STAFF MODAL */}
      {isStaffModalOpen && (
        <ModalShell
          scroll="panel"
          backdropClassName="bg-slate-900/60 backdrop-blur-xs"
          panelClassName="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200"
        >
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-indigo-600" />
                <span>{editingStaff ? '修改教學組成員資料' : '新增教學組成員'}</span>
              </h3>
              <button
                onClick={() => setIsStaffModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveStaff} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">組員 / 經辦姓名</label>
                  <input
                    type="text"
                    value={staffFormData.name}
                    onChange={(e) => {
                      const name = e.target.value;
                      setStaffFormData({
                        ...staffFormData,
                        name,
                        email:
                          !staffFormData.email || isPlaceholderSchoolEmail(staffFormData.email)
                            ? name.trim()
                              ? defaultSchoolEmail(name)
                              : ''
                            : staffFormData.email,
                      });
                    }}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 font-bold text-sm"
                    placeholder="請輸入姓名（例：陳雅筑、張志強）"
                    required
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">所屬組別</label>
                  <select
                    value={staffFormData.group || 'academic'}
                    onChange={(e) => {
                      const group = e.target.value as 'academic' | 'accounting';
                      const defaultTitle = group === 'academic' ? '教學組長' : '出納組長';
                      const defaults: Record<string, { badge: string; responsibleScope: string }> = {
                        '教學組長': { badge: '全權審核 · 決行簽結', responsibleScope: '全校調代課審核、鐘點費核備、重大排課爭議協調' },
                        '出納組長': { badge: '鐘點費核銷 · 出納結算', responsibleScope: '每月教師超鐘點費、調代課鐘點費之出納撥付作業，教師薪資異動通知，各項代收代辦費收支管理' },
                      };
                      const preset = defaults[defaultTitle];
                      setStaffFormData({ ...staffFormData, group, title: defaultTitle, badge: preset.badge, responsibleScope: preset.responsibleScope });
                    }}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 font-bold"
                  >
                    <option value="academic">教學組</option>
                    <option value="accounting">出納組</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">職稱</label>
                  <select
                    value={staffFormData.title}
                    onChange={(e) => {
                      const title = e.target.value;
                      const group = staffFormData.group || 'academic';
                      const presets: Record<string, { badge: string; responsibleScope: string }> = {
                        '教學組長': { badge: '全權審核 · 決行簽結', responsibleScope: '全校調代課審核、鐘點費核備、重大排課爭議協調' },
                        '教學組組員': { badge: '經辦 · 專業實習與突發公差派代', responsibleScope: '專業實習工場調代課經辦、突發病假與公假派代、實習檢定移課' },
                        '教學組助理': { badge: '協辦 · 課表登錄與代課通知單印發', responsibleScope: '課表變更登錄、調代課通知單批次列印、師資空堂媒合' },
                        '出納組長': { badge: '鐘點費核銷 · 出納結算', responsibleScope: '每月教師超鐘點費、調代課鐘點費之出納撥付作業，教師薪資異動通知，各項代收代辦費收支管理' },
                        '出納組組員': { badge: '經辦 · 鐘點費造冊與帳務', responsibleScope: '鐘點費清冊核對與造冊、代課費撥款簽收、零用金保管、各項收支傳票製作與帳務登錄' },
                      };
                      const preset = presets[title];
                      setStaffFormData({
                        ...staffFormData,
                        title,
                        ...(preset ? { badge: preset.badge, responsibleScope: preset.responsibleScope } : {}),
                      });
                    }}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2 font-bold"
                  >
                    {(staffFormData.group || 'academic') === 'academic' ? (
                      <>
                        <option value="教學組長">教學組長</option>
                        <option value="教學組組員">教學組組員</option>
                        <option value="教學組助理">教學組助理</option>
                      </>
                    ) : (
                      <>
                        <option value="出納組長">出納組長</option>
                        <option value="出納組組員">出納組組員</option>
                      </>
                    )}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">業務執掌標籤 / 徽章</label>
                <input
                  type="text"
                  value={staffFormData.badge}
                  onChange={(e) => setStaffFormData({ ...staffFormData, badge: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2"
                  placeholder="如：全權審核 · 決行簽結、經辦 · 實習派代"
                  required
                />
                <p className="text-[10px] text-slate-400 mt-0.5">選擇職稱後自動帶入，也可自行修改</p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-semibold text-slate-700">專責工作內容 / 職掌說明</label>
                  <span className="text-[10px] text-indigo-600 font-medium">選擇職稱後自動帶入，可自訂修改</span>
                </div>
                <textarea
                  value={staffFormData.responsibleScope}
                  onChange={(e) => setStaffFormData({ ...staffFormData, responsibleScope: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 leading-relaxed"
                  rows={2}
                  placeholder="請輸入此組員或組長的具體工作內容與職掌範圍..."
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">公務分機 / 連絡電話</label>
                  <input
                    type="text"
                    value={staffFormData.phone}
                    onChange={(e) => setStaffFormData({ ...staffFormData, phone: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2"
                    placeholder="如：分機 210"
                    required
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">公務電子郵件</label>
                  <input
                    type="email"
                    value={staffFormData.email}
                    onChange={(e) => setStaffFormData({ ...staffFormData, email: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2"
                    placeholder={`如：陳雅筑@${SCHOOL_EMAIL_DOMAIN}`}
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">頭像徽章風格色彩</label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { bg: 'from-indigo-600 to-indigo-800', label: '靛青藍' },
                    { bg: 'from-amber-600 to-amber-800', label: '琥珀金' },
                    { bg: 'from-emerald-600 to-emerald-800', label: '翡翠綠' },
                    { bg: 'from-rose-600 to-rose-800', label: '朱槿紅' },
                  ].map((c) => (
                    <button
                      type="button"
                      key={c.bg}
                      onClick={() => setStaffFormData({ ...staffFormData, avatarBg: c.bg })}
                      className={`p-2 rounded-xl border flex items-center justify-center space-x-1.5 transition ${
                        staffFormData.avatarBg === c.bg ? 'border-indigo-600 bg-indigo-50 font-bold' : 'border-slate-200'
                      }`}
                    >
                      <span className={`w-3.5 h-3.5 rounded-full bg-gradient-to-br ${c.bg}`}></span>
                      <span className="text-[11px]">{c.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsStaffModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold shadow"
                >
                  確認儲存組員姓名與資料
                </button>
              </div>
            </form>
          </div>
        </ModalShell>
      )}

      {passwordResetTeacher && (
        <ModalShell
          scroll="panel"
          backdropClassName="bg-slate-900/60 backdrop-blur-xs"
          panelClassName="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-slate-200"
        >
            <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <KeyRound className="w-5 h-5 text-amber-400" />
                <span className="font-bold text-sm">重設【{passwordResetTeacher.name}】登入密碼</span>
              </div>
              <button
                type="button"
                onClick={() => setPasswordResetTeacher(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4 text-xs">
              <p className="text-slate-600">
                {passwordResetTeacher.password
                  ? '此教師目前使用自訂密碼。重設後改回全校預設密碼，或在下方指定一組新密碼。'
                  : '此教師目前使用全校預設密碼。可指定一組新密碼，或維持預設。'}
              </p>
              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">指定新密碼</label>
                <input
                  type="text"
                  value={adminSetPassword}
                  onChange={(e) => {
                    setAdminSetPassword(e.target.value);
                    setPasswordResetNotice('');
                  }}
                  placeholder="至少 4 個字"
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 font-mono"
                />
              </div>
              {passwordResetNotice && (
                <p className="text-emerald-700 font-semibold">{passwordResetNotice}</p>
              )}
              <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setPasswordResetTeacher(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold"
                >
                  關閉
                </button>
                <button
                  type="button"
                  onClick={() => {
                    updateTeacherPassword(passwordResetTeacher.id, '');
                    setPasswordResetNotice('已重設為全校教師預設密碼。');
                    window.setTimeout(() => setPasswordResetTeacher(null), 700);
                  }}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold"
                >
                  重設為預設密碼
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const next = adminSetPassword.trim();
                    if (next.length < 4) {
                      setPasswordResetNotice('新密碼至少 4 個字。');
                      return;
                    }
                    updateTeacherPassword(passwordResetTeacher.id, next);
                    setPasswordResetNotice('已儲存新密碼。');
                    window.setTimeout(() => setPasswordResetTeacher(null), 700);
                  }}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl font-bold"
                >
                  儲存新密碼
                </button>
              </div>
            </div>
        </ModalShell>
      )}

      {/* In-App Confirmation Dialog Modal (100% iframe safe, zero window.confirm dependency) */}
      {confirmDialog.isOpen && (
        <ModalShell
          scroll="panel"
          backdropClassName="bg-slate-900/60 backdrop-blur-xs"
          panelClassName="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-slate-200 animate-in fade-in zoom-in-95 duration-150"
        >
            <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
                <span className="font-bold text-sm">{confirmDialog.title}</span>
              </div>
              <button
                onClick={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6 space-y-3">
              <p className="text-slate-800 text-sm font-medium leading-relaxed">
                {confirmDialog.message}
              </p>
              {confirmDialog.warningMessage && (
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-800">
                  ⚠️ {confirmDialog.warningMessage}
                </div>
              )}
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end space-x-2.5">
              <button
                type="button"
                onClick={() => setConfirmDialog((prev) => ({ ...prev, isOpen: false }))}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold transition"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => confirmDialog.onConfirm()}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center space-x-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>確認刪除</span>
              </button>
            </div>
        </ModalShell>
      )}

      {/* In-App Alert Notice Dialog Modal (100% iframe safe, zero alert() dependency) */}
      {alertNotice && (
        <ModalShell
          scroll="panel"
          backdropClassName="bg-slate-900/60 backdrop-blur-xs"
          panelClassName="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-slate-200 animate-in fade-in zoom-in-95 duration-150"
        >
            <div className="bg-amber-600 text-white p-4 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <AlertCircle className="w-5 h-5 text-white" />
                <span className="font-bold text-sm">系統維護提示</span>
              </div>
              <button
                onClick={() => setAlertNotice(null)}
                className="text-amber-100 hover:text-white p-1 rounded-lg hover:bg-amber-700 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6">
              <p className="text-slate-700 text-sm font-medium leading-relaxed">
                {alertNotice}
              </p>
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setAlertNotice(null)}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition shadow-xs"
              >
                我知道了
              </button>
            </div>
        </ModalShell>
      )}

    </div>
  );
};
