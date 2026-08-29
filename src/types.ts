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
  /** 個人登入密碼雜湊；未填則使用系統教學組／出納組預設密碼 */
  password?: string;
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
  password?: string; // 自訂教師登入密碼雜湊 (shfs1$…；未填寫時採用系統預設)
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
  | 'marriage' // 婚假 (公費派代 · 按小時計)
  | 'maternity' // 娩假/陪產假 (公費派代 · 按小時計)
  | 'wellness' // 身心調適假 (公費派代 · 21 小時/學年)
  | 'personal' // 事假 (第 8 天起公費派代)
  | 'sick' // 病假 (連續 3 日起公費派代)
  | 'training' // @deprecated 舊資料：併入公假
  | 'bereavement' // @deprecated 舊資料：併入公假
  | 'other'; // @deprecated 舊資料：併入事假

export type PaymentType = 'public' | 'private'; // 公費派代 | 自費代課

/** 調代課通知單表格列（列印用，可人工調整） */
export type SubstituteNoticeRow = {
  date: string;
  weekday: string;
  period: string;
  className: string;
  subjectName: string;
  hours: string;
};

export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface ClashCheckResult {
  hasClash: boolean;
  severity: 'none' | 'warning' | 'danger';
  messages: string[];
}

export interface SubstituteRequest {
  id: string;
  requestNumber: string; // 115-1-0001（學年度-學期-流水號）
  requestType: RequestType;
  applicantTeacherId: string;
  applicantTeacherName: string;
  applicantDepartment: DepartmentType;
  leaveType?: LeaveType;
  /** 請假起始日 YYYY-MM-DD（請假派代必填） */
  leaveDateStart?: string;
  /** 請假結束日 YYYY-MM-DD；未填或同日＝單日 */
  leaveDateEnd?: string;
  reason: string;
  paymentType: PaymentType;
  
  // 原課堂資訊
  originalSession: CourseSession;
  
  // 自行／行政移課目標時段
  targetReschedule?: {
    dayOfWeek: DayOfWeek;
    period: number;
    venueId: string;
    venueName: string;
    /**
     * 與目標節既有課堂置換（兩邊互換時段，不必先有空堂）。
     * 有值時核准會永久對調雙方星期／節次；申請人場地改為下方 venue。
     */
    exchangeSessionId?: string;
    /** 置換對方課堂快照（回滾／顯示用） */
    exchangeSession?: CourseSession;
  };
  
  // 相互調課目標對象與課堂
  swapTargetTeacherId?: string;
  swapTargetTeacherName?: string;
  swapTargetSession?: CourseSession;
  /**
   * 同班對調效期：temporary＝選日暫時（不改週模板）；permanent＝永久改週模板。
   * 未填時：有 effectiveDate 視為暫時，否則視為永久（舊資料相容）。
   */
  swapMode?: 'temporary' | 'permanent';
  /**
   * 暫時對調生效錨定日 YYYY-MM-DD（swapMode=temporary 時必填）。
   * 兩堂同星期＝當日；跨星期＝該日所屬週內雙方原上課日各一次。
   */
  effectiveDate?: string;
  
  // 請假派代指定的代課教師
  substituteTeacherId?: string;
  substituteTeacherName?: string;

  /**
   * 代導師（領取代導師減授鐘點費者；可與代課教師不同人）。
   * 申請人為導師且請假派代時填寫；按「日」計費，非按節。
   */
  actingHomeroomTeacherId?: string;
  actingHomeroomTeacherName?: string;

  /** 連續節次或連續起迄批次派代共用群組 ID；有值時通知單合併列印 */
  batchGroupId?: string;

  /** 通知單表格列（人工調整後儲存；列印時優先使用） */
  noticeRows?: SubstituteNoticeRow[];

  /** 為 true 時，代課清冊依 noticeRows 計算（基本鐘點）；未調整則仍依課表原邏輯 */
  noticeRowsCustomized?: boolean;
  
  status: RequestStatus;
  rejectReason?: string;
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  
  clashStatus: ClashCheckResult;
}

export interface SystemConfig {
  dayHourlyRate: number; // 日間部每節鐘點費 (505，114/9/1 起)
  nightHourlyRate: number; // 第八節課輔每節鐘點費 (660，依學習輔導費要點)
  /**
   * 代導師減授鐘點費每日金額（預設 404）。
   * 法令參考：鐘點費×日數÷5×（專任基本−導師基本）；學校可改為固定日費。
   */
  actingHomeroomDailyRate: number;
  maxWeeklyOverloadPeriods: number; // 法定每週兼代課上限 (9)
  standardBasePeriods: {
    head: number; // 科主任基本鐘點（可設定）
    homeroom: number; // 導師基本鐘點（可設定）
    fulltime: number; // 專任基本鐘點（可設定，預設 16）
    sectionChief: number; // 組長基本鐘點（可設定）
    director: number; // 主任基本鐘點（可設定）
  };
  schoolName: string; // 學校名稱（匯出課表標題、列印檔名）
  academicYear: string; // 114
  semester: string; // 1
  currentMonth: number; // 10
  weeksInMonth: number; // 4 週
  /** 不計鐘點之日（國定假日、校慶、彈性放假等），格式 YYYY-MM-DD */
  nonTeachingDays?: NonTeachingDay[];
  /** 新學年度是否自動匯入人事總處國定假日（預設開啟） */
  autoSyncNationalHolidays?: boolean;
  /** 上次完成自動匯入的學年度（民國年字串） */
  nationalHolidaysAutoLoadedAcademicYear?: string;
  /**
   * 暫時移課／補課：把 sourceDate 當天的週課表（依該日星期）改在 targetDate 上計鐘點。
   * 例：週四放假 → 週六或某週二補上「週四課表」；不永久改週模板。
   */
  temporaryScheduleMoves?: TemporaryScheduleMove[];
  /** 半日／節次停課：該日指定節次不計鐘點（如上午仍上課、下午佈置考場） */
  partialNonTeachingDays?: PartialNonTeachingDay[];
  /** 教師薪資編號（teacherId → 薪資編號）— 舊版；請改用 teacherSalaryCodesByName */
  teacherSalaryCodes?: Record<string, string>;
  /** 教師薪資編號（姓名 → 薪資編號），課表匯入後仍有效 */
  teacherSalaryCodesByName?: Record<string, string>;
  authConfig?: {
    requirePassword: boolean; // 是否啟用密碼確認
    defaultTeacherPassword: string; // 預設教師密碼雜湊（或遷移前明文）
    adminPassword: string; // 系統管理員密碼雜湊
    academicPassword: string; // 教務組經辦密碼雜湊
    accountingPassword: string; // 主計出納密碼雜湊
  };
}

/** 行事曆放假日（不計超鐘點／代課鐘點） */
export interface NonTeachingDay {
  date: string; // YYYY-MM-DD
  label: string;
}

/** 暫時移課／補課（單日對應，不改週課表模板） */
export interface TemporaryScheduleMove {
  id: string;
  /** 原上課日 YYYY-MM-DD（通常為放假日；若未標放假，計費時仍會扣掉該日） */
  sourceDate: string;
  /** 實際補上日 YYYY-MM-DD（可為平日或週六） */
  targetDate: string;
  label?: string;
  /** 只移這些節次；省略或空＝全日第 1～8 節 */
  periods?: number[];
}

/** 半日／節次停課 */
export interface PartialNonTeachingDay {
  id: string;
  date: string; // YYYY-MM-DD
  periods: number[];
  label?: string;
}

export interface MonthlyTeacherSettlement {
  teacherId: string;
  teacherName: string;
  department: DepartmentType;
  title: TeacherTitle;
  homeroomClass?: string;
  basePeriods: number; // 基本節數
  weeklyActualPeriods: number; // 本職每週正課（不含團體活動）
  weeklyOverloadPeriods: number; // 每週超額＝課表兼課節數（不含第八節課輔）
  monthlyOverloadAmount: number; // 超鐘點費
  weeklyCounselingPeriods: number; // 每週第八節課輔
  monthlyCounselingAmount: number; // 第八節課輔費（系統管理員課輔費率）
  
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
  netPayableAmount: number; // 超鐘點費 + 第八節課輔費 + 公費代課 + 受代領取 - 事病假代課扣款

  /** 兼課鐘點費印領清冊：課表兼課月節數（扣假、移課前） */
  monthlyConcurrentBasePeriods: number;
  /** 應加兼課（暫時互調增加等；代課兼課改由代課費／代課清冊支給） */
  concurrentAddPeriods: number;
  /** 應減兼課（請假兼課、暫時互調減少等） */
  concurrentSubtractPeriods: number;
  /** 實得兼課節數 */
  monthlyConcurrentPeriods: number;
  /** 兼課鐘點費實發金額（實得兼課 × 日間費率） */
  concurrentPayrollAmount: number;

  /** 輔導課（第8節）月節數（扣假、移課前） */
  monthlyCounselingBasePeriods: number;
  /** 增加節數（暫時互調增加等） */
  counselingAddPeriods: number;
  /** 減少節數（請假、半日停課、段考等） */
  counselingSubtractPeriods: number;
  /** 實上節數 */
  monthlyCounselingPeriods: number;
  /** 輔導課鐘點費實發金額 */
  counselingPayrollAmount: number;
}
