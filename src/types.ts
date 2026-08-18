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
}

export type DepartmentType = 
  | '電機科' 
  | '資訊科' 
  | '機械科' 
  | '餐飲管理科' 
  | '廣告設計科' 
  | '共同科目';

export type TeacherTitle = '科主任' | '導師' | '專任教師' | '教學組長';

export interface Teacher {
  id: string;
  name: string;
  title: TeacherTitle;
  department: DepartmentType;
  basePeriods: number; // 每週基本授課節數 (如專任16、導師12、主任10、組長8)
  weeklyActualPeriods: number; // 本學期每週排定節數
  email: string;
  phone: string;
  certifications: string[]; // 專業證照或任教專長
  avatarBg?: string;
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
    head: number; // 科主任 (10)
    homeroom: number; // 導師 (12)
    fulltime: number; // 專任 (16)
    sectionChief: number; // 組長 (8)
  };
  academicYear: string; // 114
  semester: string; // 1
  currentMonth: number; // 10
  weeksInMonth: number; // 4 週
}

export interface MonthlyTeacherSettlement {
  teacherId: string;
  teacherName: string;
  department: DepartmentType;
  title: TeacherTitle;
  basePeriods: number; // 基本節數
  weeklyActualPeriods: number; // 本職每週排定節數
  weeklyOverloadPeriods: number; // 每週超鐘點節數 (Math.max(0, weeklyActualPeriods - basePeriods))
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
