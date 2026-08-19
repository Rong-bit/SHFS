export type UserRole = 'teacher' | 'academic' | 'accounting' | 'admin';

export interface AcademicStaff {
  id: string;
  name: string;
  title: string;
  badge: string;
  email: string;
  phone: string;
  avatarBg?: string;
  responsibleScope: string;
  group?: 'academic' | 'accounting';
}

export type DepartmentType =
  | '電機科'
  | '電子科'
  | '控制科'
  | '冷凍科'
  | '化工科'
  | '建築科'
  | '汽車科'
  | '機械科'
  | '資訊科'
  | '製圖科'
  | '金工科'
  | '電圖科'
  | '服務科'
  | '普通科'
  | '共同科目';

export type TeacherTitle = '專任教師' | '導師' | '組長' | '科主任' | '主任';

export interface Teacher {
  id: string;
  name: string;
  title: TeacherTitle;
  department: DepartmentType;
  homeroomClass?: string; // 由星期三下午團體活動判斷，例如 電機三忠
  dutyReductionPeriods?: number; // 任務減授節數（導師等任務每人不同，例如減 1 節或數節）
  basePeriods: number; // 每週基本授課節數 = 專任標準 − 任務減授
  weeklyActualPeriods: number; // 每週正課節數（不含團體活動）
  email: string;
  phone: string;
  certifications: string[]; // 專業證照或任教專長
  avatarBg?: string;
  password?: string; // 自訂教師登入密碼 (未填寫時採用系統預設密碼)
}

export type DayOfWeek = 1 | 2 | 3 | 4 | 5; // 週一至週五

export interface PeriodDefinition {
  period: number;
  label: string;
  timeRange: string;
  isAfternoon: boolean;
}

export interface WorkshopVenue {
  id: string;
  name: string;
  code: string;
  department: DepartmentType | '通用教室';
  capacity: number;
  safetyLevel: '標準' | '高安全防護' | '危險機具區';
  equipmentNote: string;
}

export interface CourseSession {
  id: string;
  dayOfWeek: DayOfWeek;
  period: number; // 1 ~ 8
  className: string; // 如：電機二甲、資訊三乙、餐飲一甲
  subjectName: string; // 如：電工機械實習、數位邏輯、西餐烹調實習
  teacherId: string;
  teacherName: string;
  venueId: string;
  venueName: string;
  isPractical: boolean; // 是否為實習/專業實作課
  isSplitGroup?: boolean; // 是否分組教學 (雙師協同)
  isConcurrent?: boolean; // 課表「兼課」欄為 1
  notes?: string;
}

export type RequestType = 'swap' | 'reschedule' | 'substitute';

export type LeaveType = 
  | 'official' // 公假/公差 (公費派代)
  | 'personal' // 事假 (自費代課)
  | 'sick' // 病假 (自費代課)
  | 'bereavement' // 喪假 (公費派代)
  | 'maternity' // 產假/陪產假 (公費派代)
  | 'training' // 研習/評鑑/監評 (公費派代)
  | 'other'; // 其他

export type PaymentType = 'public' | 'private'; // 公費派代 | 自費代課

export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface ClashCheckResult {
  hasClash: boolean;
  severity: 'none' | 'warning' | 'danger';
  messages: string[];
}

export interface SubstituteRequest {
  id: string;
  requestNumber: string; // VOC-114-10-001
  requestType: RequestType;
  applicantTeacherId: string;
  applicantTeacherName: string;
  applicantDepartment: DepartmentType;
  leaveType?: LeaveType;
  reason: string;
  paymentType: PaymentType;
  
  // 原課堂資訊
  originalSession: CourseSession;
  
  // 自行移課目標時段
  targetReschedule?: {
    dayOfWeek: DayOfWeek;
    period: number;
    venueId: string;
    venueName: string;
  };
  
  // 相互調課目標對象與課堂
  swapTargetTeacherId?: string;
  swapTargetTeacherName?: string;
  swapTargetSession?: CourseSession;
  
  // 請假派代指定的代課教師
  substituteTeacherId?: string;
  substituteTeacherName?: string;
  
  status: RequestStatus;
  rejectReason?: string;
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  
  clashStatus: ClashCheckResult;
}

export interface SystemConfig {
  dayHourlyRate: number; // 日間部每節鐘點費 (420)
  nightHourlyRate: number; // 夜間部/課輔每節鐘點費 (500)
  maxWeeklyOverloadPeriods: number; // 法定每週兼代課上限 (9)
  standardBasePeriods: {
    head: number; // 科主任基本鐘點（可設定）
    homeroom: number; // 導師基本鐘點（可設定）
    fulltime: number; // 專任基本鐘點（可設定，預設 16）
    sectionChief: number; // 組長基本鐘點（可設定）
    director: number; // 主任基本鐘點（可設定）
  };
  academicYear: string; // 114
  semester: string; // 1
  currentMonth: number; // 10
  weeksInMonth: number; // 4 週
  authConfig?: {
    requirePassword: boolean; // 是否啟用密碼確認
    defaultTeacherPassword: string; // 預設教師密碼 (預設 "1234")
    adminPassword: string; // 系統管理員密碼 (預設不顯示於畫面)
    academicPassword: string; // 教務組經辦密碼 (預設 "academic123")
    accountingPassword: string; // 主計出納密碼 (預設 "account123")
  };
}

export interface MonthlyTeacherSettlement {
  teacherId: string;
  teacherName: string;
  department: DepartmentType;
  title: TeacherTitle;
  homeroomClass?: string;
  basePeriods: number; // 基本節數
  weeklyActualPeriods: number; // 本職每週正課（不含團體活動）
  weeklyOverloadPeriods: number; // 每週超鐘點＝正課（不含團體活動）＋任務減授 − 基本
  monthlyOverloadAmount: number; // 超鐘點費 (每週超額 × 4週 × 420)
  
  // 公費代課 (學校公款加發)
  publicSubstitutePeriods: number;
  publicSubstituteAmount: number;
  
  // 自費代課 - 請假支出 (被扣款)
  privateLeaveDeductionPeriods: number;
  privateLeaveDeductionAmount: number;
  
  // 自費代課 - 受代領取 (受託代課加發款)
  privateSubstituteEarnPeriods: number;
  privateSubstituteEarnAmount: number;
  
  // 兼代課法規檢核
  totalSubstituteWeeklyEstimated: number; // 代課換算每週
  isOverLimit: boolean; // 是否超過9節法定上限
  
  // 總應發/結算金額
  netPayableAmount: number; // (超鐘點費 + 公費代課 + 受代領取 - 事病假代課扣款)
}
