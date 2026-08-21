import * as XLSX from 'xlsx';
import { CourseSession, Teacher, WorkshopVenue, DayOfWeek, DepartmentType } from '../types';
import { departmentFromClassName, departmentFromLabel, gradeYearFromClassName, isInternshipCourse } from './schoolDepartments';
import {
  classifyVenueKind,
  practicalVenueMissingWarn,
  resolveImportVenueName,
} from './venueKinds';

export interface ParsedImportRow {
  rowNumber: number;
  dayOfWeek: DayOfWeek;
  period: number;
  className: string;
  subjectName: string;
  teacherName: string;
  department?: DepartmentType;
  venueName: string;
  isPractical: boolean;
  isConcurrent?: boolean;
  notes?: string;
  errors: string[];
  warnings: string[];
}

export interface ImportParseResult {
  validRows: ParsedImportRow[];
  invalidRows: ParsedImportRow[];
  totalCount: number;
  newTeachersDetected: string[];
  newVenuesDetected: string[];
  practicalCoursesCount: number;
  classesDetected: string[];
  clashesInFile: string[];
}

// Convert day string to number (1-5), supports '週一 第1節', '星期一', '(一)', 'Mon 1' etc.
export const parseDayOfWeek = (val: any): DayOfWeek | null => {
  if (val === undefined || val === null) return null;
  const str = String(val).trim();
  if (!str) return null;

  if (/(?:週|星期|禮拜|\()一|Mon|Monday|^1$/i.test(str)) return 1;
  if (/(?:週|星期|禮拜|\()二|Tue|Tuesday|^2$/i.test(str)) return 2;
  if (/(?:週|星期|禮拜|\()三|Wed|Wednesday|^3$/i.test(str)) return 3;
  if (/(?:週|星期|禮拜|\()四|Thu|Thursday|^4$/i.test(str)) return 4;
  if (/(?:週|星期|禮拜|\()五|Fri|Friday|^5$/i.test(str)) return 5;

  // Standalone single digit 1-5
  const num = parseInt(str, 10);
  if (num >= 1 && num <= 5) return num as DayOfWeek;
  return null;
};

const periodTokenToNum = (raw: string): number | null => {
  const chineseToNum: Record<string, number> = {
    一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8,
  };
  if (chineseToNum[raw]) return chineseToNum[raw];
  const n = parseInt(raw, 10);
  if (n >= 1 && n <= 8) return n;
  return null;
};

/** 支援單節或連堂範圍（如 1-3、第2～4節），回傳 1~8 的節次陣列 */
export const parsePeriodList = (val: any): number[] => {
  if (val === undefined || val === null) return [];
  const str = String(val).trim();
  if (!str) return [];

  const rangeMatch = str.match(
    /(?:第\s*)?([0-9一二三四五六七八])\s*[-~～—–到至]\s*(?:第\s*)?([0-9一二三四五六七八])/
  );
  if (rangeMatch) {
    const a = periodTokenToNum(rangeMatch[1]);
    const b = periodTokenToNum(rangeMatch[2]);
    if (a != null && b != null) {
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      const out: number[] = [];
      for (let p = lo; p <= hi; p++) out.push(p);
      return out;
    }
  }

  const nthMatch = str.match(/第\s*([0-9一二三四五六七八])\s*節?/);
  if (nthMatch) {
    const n = periodTokenToNum(nthMatch[1]);
    if (n != null) return [n];
  }

  const stripped = str
    .replace(/(?:週|星期|禮拜|\()[一二三四五六七日1-5\)]/gi, '')
    .replace(/Mon|Tue|Wed|Thu|Fri|Monday|Tuesday|Wednesday|Thursday|Friday/gi, '')
    .trim();

  const digitMatch = stripped.match(/\d+/);
  if (digitMatch) {
    const num = parseInt(digitMatch[0], 10);
    if (num >= 1 && num <= 8) return [num];
  }

  const chineseMap: Record<string, number> = {
    一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8,
    第一節: 1, 第二節: 2, 第三節: 3, 第四節: 4, 第五節: 5, 第六節: 6, 第七節: 7, 第八節: 8,
  };
  if (chineseMap[stripped]) return [chineseMap[stripped]];
  return [];
};

// Convert period string to number (1-8); 連堂範圍時取第一節（完整範圍請用 parsePeriodList）
export const parsePeriod = (val: any): number | null => {
  const list = parsePeriodList(val);
  return list.length ? list[0] : null;
};

// Infer practical class from subject name or venue name
export const inferIsPractical = (subjectName: string, venueName: string, explicitVal?: any): boolean => {
  if (explicitVal !== undefined && explicitVal !== null && String(explicitVal).trim() !== '') {
    const str = String(explicitVal).trim().toLowerCase();
    if (['是', 'y', 'yes', 'true', '1', '實習', '實作', '實務導向', '實務導向學習'].includes(str)) return true;
    if (['否', 'n', 'no', 'false', '學科', '一般'].includes(str)) return false;
  }
  if (isInternshipCourse(subjectName)) return true;
  const venue = venueName || '';
  if (/普通教室|原班/.test(venue) || /團體活動/.test(subjectName || '')) return false;
  return /工場|實習教室|實習室/.test(venue);
};

/** 課表「1.兼課2.」欄填 1（或是／兼課）即為兼課 */
export const parseConcurrentFlag = (val: any): boolean => {
  if (val === undefined || val === null || val === '') return false;
  if (val === true || val === 1) return true;
  const str = String(val).trim();
  if (!str) return false;
  return /^(1|1\.0|是|Y|YES|TRUE|兼課)$/i.test(str);
};

const CONCURRENT_HEADER_KEYS = ['兼課', '是否兼課', '兼課註記', '1.兼課'];

const pickConcurrentValue = (raw: Record<string, any>, findField: (keys: string[]) => any) => {
  const named = findField(CONCURRENT_HEADER_KEYS);
  if (named !== '' && named !== undefined && named !== null) return named;
  for (const k of Object.keys(raw)) {
    const cleaned = k.trim().replace(/\s+/g, '');
    if (cleaned.includes('兼課') && !cleaned.includes('輔導')) {
      const v = raw[k];
      if (v !== undefined && v !== null && String(v).trim() !== '') return v;
    }
  }
  return '';
};

// Clean teacher name from formats like "t0011.何雪玲", "*t0711.林昇蒼,*t0714.葉珈誠", "0116_林冠妙", "(t1216)何建延", "彭韶郁,t1509.李萱"
export const cleanTeacherName = (val: string): string => {
  if (!val) return '';
  const rawStr = String(val).trim();
  if (!rawStr) return '';

  // Split multiple teachers if separated by comma, slash, plus, ampersand, etc.
  const parts = rawStr.split(/[,，/、\+＆&]/);
  const cleanedList = parts
    .map((p) => {
      let s = p.trim();
      // Remove leading asterisks or symbols
      s = s.replace(/^[\*＊#\s]+/, '');
      // Remove prefix like t0011., t05085., 0116_, t1216-, etc.
      s = s.replace(/^[a-zA-Z0-9_-]+[\.\_\-\s]/, '');
      // Remove parenthesized IDs like (t0011) or [t0011]
      s = s.replace(/^\([a-zA-Z0-9_-]+\)/, '');
      s = s.replace(/^\[[a-zA-Z0-9_-]+\]/, '');
      // Remove any remaining asterisk or numbers with dot
      s = s.replace(/[\*＊]/g, '');
      s = s.replace(/^[0-9]+\./, '');
      return s.trim();
    })
    .filter((n) => n && n !== '未指派' && n !== 'null' && n !== 'undefined');

  if (cleanedList.length === 0) return '';
  // Join back multiple co-teachers cleanly
  return cleanedList.join(' / ');
};

/** 將「蘇明福 / 宋正文」拆成個別教師姓名 */
export const splitTeacherNames = (val: string): string[] => {
  const cleaned = cleanTeacherName(val);
  if (!cleaned || cleaned === '未指派教師') return [];
  return cleaned
    .split('/')
    .map((s) => s.trim())
    .filter((n) => n && n !== '未指派教師');
};

// Guess Department from class name first (電機一忠 → 電機科), then subject / venue keywords
export const guessDepartment = (text: string): DepartmentType => {
  return departmentFromClassName(text) || departmentFromLabel(text) || '共同科目';
};

interface TeacherSlotHit {
  rowNumber: number;
  className: string;
  subjectName: string;
  subjectCode: string;
}

const normalizeClashText = (s: string) => s.replace(/\s+/g, '').toLowerCase();

/** 忠/孝等同科同年級同時段合班，或完全重複列，不視為教師衝堂 */
const isCombinedOrDuplicateTeacherSlot = (
  prev: TeacherSlotHit,
  className: string,
  subjectName: string,
  subjectCode: string
) => {
  const sameSubject =
    (subjectName && normalizeClashText(prev.subjectName) === normalizeClashText(subjectName)) ||
    (subjectCode && prev.subjectCode && prev.subjectCode === subjectCode);
  if (!sameSubject) return false;
  if (prev.className === className) return true;
  const prevDept = departmentFromClassName(prev.className);
  const nextDept = departmentFromClassName(className);
  const prevGrade = gradeYearFromClassName(prev.className);
  const nextGrade = gradeYearFromClassName(className);
  return Boolean(
    prevDept &&
      nextDept &&
      prevDept === nextDept &&
      prevGrade &&
      nextGrade &&
      prevGrade === nextGrade
  );
};

/**
 * Parse an uploaded Excel file / CSV buffer into structured parsed rows
 */
export const parseScheduleFile = async (
  file: File,
  existingTeachers: Teacher[],
  existingVenues: WorkshopVenue[]
): Promise<ImportParseResult> => {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  
  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error('Excel 檔案內未發現有效工作表 (Worksheets)');
  }

  // Use the first sheet or one named "課表"
  const targetSheetName = workbook.SheetNames.find((n) => n.includes('課表') || n.includes('Schedule') || n.includes('清冊')) || workbook.SheetNames[0];
  const worksheet = workbook.Sheets[targetSheetName];
  
  // Convert sheet to JSON rows (header row as keys)
  const rawRows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

  if (rawRows.length === 0) {
    throw new Error('工作表內容為空，請填入課表資料後重試。');
  }

  const validRows: ParsedImportRow[] = [];
  const invalidRows: ParsedImportRow[] = [];
  const newTeachersSet = new Set<string>();
  const newVenuesSet = new Set<string>();
  const classesSet = new Set<string>();
  let practicalCount = 0;

  const teacherNameMap = new Map(existingTeachers.map((t) => [t.name.trim(), t]));
  const venueNameMap = new Map(existingVenues.map((v) => [v.name.trim(), v]));

  // Track collisions in file (day + period + teacher/class/venue)
  const teacherTimeSlot = new Map<string, TeacherSlotHit>();
  const classTimeSlot = new Map<string, number>();
  const venueTimeSlot = new Map<string, number>();
  const clashesInFile: string[] = [];

  // Determine if file has explicit Day / Period schedule or is a "開課配課清單 (依每週時數自動排課)"
  const hasExplicitDay = rawRows.some((raw) => {
    for (const k of Object.keys(raw)) {
      const cleaned = k.trim().replace(/\s+/g, '');
      if (['星期', '週次', '星期幾', '時間', '時段', 'Day', 'dayOfWeek'].includes(cleaned)) {
        const val = raw[k];
        if (val !== undefined && val !== null && parseDayOfWeek(val) !== null) return true;
      }
    }
    return false;
  });

  // ==========================================
  // MODE A: 開課配課清冊 (時數檔) 自動智慧排入課表
  // ==========================================
  if (!hasExplicitDay) {
    // Group courses by class
    const classCoursesMap = new Map<string, Array<{
      rawRowIndex: number;
      className: string;
      subjectName: string;
      teacherName: string;
      hours: number;
      venueName: string;
      deptName: string;
      practicalVal: any;
      notes: string;
      isPractical: boolean;
      isConcurrent: boolean;
      department: DepartmentType;
      importWarnings: string[];
    }>>();

    rawRows.forEach((raw, idx) => {
      const rowNumber = idx + 2;
      const findField = (keys: string[]) => {
        for (const target of keys) {
          for (const k of Object.keys(raw)) {
            const cleaned = k.trim().replace(/\s+/g, '');
            if (cleaned === target) {
              const v = raw[k];
              if (v !== undefined && v !== null && String(v).trim() !== '') return v;
            }
          }
        }
        for (const target of keys) {
          for (const k of Object.keys(raw)) {
            const cleaned = k.trim().replace(/\s+/g, '');
            if (cleaned.includes(target) && !cleaned.includes('代碼')) {
              const v = raw[k];
              if (v !== undefined && v !== null && String(v).trim() !== '') return v;
            }
          }
        }
        for (const target of keys) {
          for (const k of Object.keys(raw)) {
            const cleaned = k.trim().replace(/\s+/g, '');
            if (cleaned.includes(target)) {
              const v = raw[k];
              if (v !== undefined && v !== null && String(v).trim() !== '') return v;
            }
          }
        }
        return '';
      };

      const classVal = String(findField(['班級名稱', '班級', 'Class', 'className', '班級代碼'])).trim();
      const subjectVal = String(findField(['科目名稱', '課程名稱', '科目', 'Subject', 'subjectName', '科目代碼'])).trim();
      const rawTeacherVal = String(findField(['授課教師', '任課教師', '教師姓名', '教師', 'Teacher', 'teacherName', '校內教師姓名'])).trim();
      const teacherVal = cleanTeacherName(rawTeacherVal) || '未指派教師';
      const hoursVal = findField(['時數', '每週時數', '節數', '學分', '時數/週', 'Hours', 'hours', 'credit']);
      const venueVal = String(findField(['實習工場', '教學場地', '上課地點', '教室', '工場', 'Venue', 'venueName', '教室名稱'])).trim();
      const deptVal = String(findField(['科別', '群科', '教師科別', 'Department', 'department'])).trim();
      const practicalVal = findField(['是否為實習', '是否為實習實作課', '實習課', 'isPractical', '課程類別']);
      const concurrentVal = pickConcurrentValue(raw, findField);
      const notesVal = String(findField(['備註', '說明', 'Notes', 'notes'])).trim();

      if (!classVal || !subjectVal) {
        invalidRows.push({
          rowNumber,
          dayOfWeek: 1,
          period: 1,
          className: classVal || '未填班級',
          subjectName: subjectVal || '未填科目',
          teacherName: teacherVal,
          department: '共同科目',
          venueName: venueVal || '原班教室',
          isPractical: false,
          isConcurrent: false,
          errors: [!classVal ? '班級名稱未填寫' : '科目名稱未填寫'],
          warnings: [],
        });
        return;
      }

      classesSet.add(classVal);
      if (teacherVal && teacherVal !== '未指派教師' && !teacherNameMap.has(teacherVal)) {
        newTeachersSet.add(teacherVal);
      }

      // 先判定是否實習（依科目／明確欄位），再決定預設場地
      const isPractical = inferIsPractical(subjectVal, venueVal || '暫定', practicalVal);
      const isConcurrent = parseConcurrentFlag(concurrentVal);
      const department: DepartmentType =
        departmentFromClassName(classVal) ||
        (deptVal ? (deptVal as DepartmentType) : guessDepartment(subjectVal + ' ' + classVal));

      const finalVenue = resolveImportVenueName({
        venueVal,
        isPractical,
        className: classVal,
        department,
      });
      if (!venueNameMap.has(finalVenue)) {
        newVenuesSet.add(finalVenue);
      }

      const courseWarnings: string[] = [];
      if (isPractical && !venueVal) {
        courseWarnings.push(practicalVenueMissingWarn(finalVenue));
      }

      let parsedHours = parseFloat(String(hoursVal));
      if (isNaN(parsedHours) || parsedHours <= 0) {
        parsedHours = isPractical ? 3 : 2;
      }
      const roundedHours = Math.max(1, Math.min(8, Math.round(parsedHours)));

      if (!classCoursesMap.has(classVal)) {
        classCoursesMap.set(classVal, []);
      }
      classCoursesMap.get(classVal)!.push({
        rawRowIndex: rowNumber,
        className: classVal,
        subjectName: subjectVal,
        teacherName: teacherVal,
        hours: roundedHours,
        venueName: finalVenue,
        deptName: deptVal,
        practicalVal,
        notes: notesVal,
        isPractical,
        isConcurrent,
        department,
        importWarnings: courseWarnings,
      });
    });

    // Global schedule tracker across all classes, teachers, venues
    // key: "d-p"
    const occupiedClass = new Map<string, Set<string>>(); // "d-p" -> Set<className>
    const occupiedTeacher = new Map<string, Set<string>>(); // "d-p" -> Set<teacherName>
    const occupiedVenue = new Map<string, Set<string>>(); // "d-p" -> Set<venueName>

    const teacherNamesForSlot = (tName: string) => {
      const parts = splitTeacherNames(tName);
      if (parts.length) return parts;
      return tName && tName !== '未指派教師' ? [tName.trim()] : [];
    };

    const isSlotAvailable = (d: DayOfWeek, p: number, cName: string, tName: string, vName: string) => {
      const slotKey = `${d}-${p}`;
      if (occupiedClass.get(slotKey)?.has(cName)) return false;
      for (const t of teacherNamesForSlot(tName)) {
        if (occupiedTeacher.get(slotKey)?.has(t)) return false;
      }
      if (vName && !vName.includes('原班普通教室') && occupiedVenue.get(slotKey)?.has(vName)) return false;
      return true;
    };

    const occupySlot = (d: DayOfWeek, p: number, cName: string, tName: string, vName: string) => {
      const slotKey = `${d}-${p}`;
      if (!occupiedClass.has(slotKey)) occupiedClass.set(slotKey, new Set());
      occupiedClass.get(slotKey)!.add(cName);

      const teachersInSlot = teacherNamesForSlot(tName);
      if (teachersInSlot.length) {
        if (!occupiedTeacher.has(slotKey)) occupiedTeacher.set(slotKey, new Set());
        teachersInSlot.forEach((t) => occupiedTeacher.get(slotKey)!.add(t));
      }

      if (vName && !vName.includes('原班普通教室')) {
        if (!occupiedVenue.has(slotKey)) occupiedVenue.set(slotKey, new Set());
        occupiedVenue.get(slotKey)!.add(vName);
      }
    };

    // Auto-allocate periods for each class
    classCoursesMap.forEach((courses, cName) => {
      // Sort: practical courses first (need contiguous blocks), then longer subjects
      const sorted = [...courses].sort((a, b) => {
        if (a.isPractical && !b.isPractical) return -1;
        if (!a.isPractical && b.isPractical) return 1;
        return b.hours - a.hours;
      });

      for (const item of sorted) {
        let remainingHours = item.hours;

        // If practical with 3-4 hours, try to find a consecutive morning (1-3/4) or afternoon (5-7/8) block
        if (item.isPractical && remainingHours >= 3) {
          const blockSize = Math.min(4, remainingHours);
          let allocated = false;

          // Try morning blocks (periods 1..1+blockSize-1) across days 1..5
          for (let d = 1; d <= 5 && !allocated; d++) {
            const day = d as DayOfWeek;
            // Test morning: periods 1..blockSize
            let morningOk = true;
            for (let p = 1; p <= blockSize; p++) {
              if (!isSlotAvailable(day, p, cName, item.teacherName, item.venueName)) {
                morningOk = false;
                break;
              }
            }
            if (morningOk) {
              for (let p = 1; p <= blockSize; p++) {
                occupySlot(day, p, cName, item.teacherName, item.venueName);
                validRows.push({
                  rowNumber: item.rawRowIndex,
                  dayOfWeek: day,
                  period: p,
                  className: cName,
                  subjectName: item.subjectName,
                  teacherName: item.teacherName,
                  department: item.department,
                  venueName: item.venueName,
                  isPractical: true,
                  isConcurrent: item.isConcurrent,
                  notes: item.notes || `實習連堂 (${blockSize}節)`,
                  errors: [],
                  warnings: [
                    ...(item.importWarnings || []),
                    `💡 依開課清冊每週${item.hours}節自動排入`,
                  ],
                });
                practicalCount++;
              }
              remainingHours -= blockSize;
              allocated = true;
              break;
            }

            // Test afternoon: periods 5..5+blockSize-1 (up to 7)
            const aftBlock = Math.min(3, blockSize);
            let aftOk = true;
            for (let p = 5; p <= 4 + aftBlock; p++) {
              if (!isSlotAvailable(day, p, cName, item.teacherName, item.venueName)) {
                aftOk = false;
                break;
              }
            }
            if (aftOk) {
              for (let p = 5; p <= 4 + aftBlock; p++) {
                occupySlot(day, p, cName, item.teacherName, item.venueName);
                validRows.push({
                  rowNumber: item.rawRowIndex,
                  dayOfWeek: day,
                  period: p,
                  className: cName,
                  subjectName: item.subjectName,
                  teacherName: item.teacherName,
                  department: item.department,
                  venueName: item.venueName,
                  isPractical: true,
                  isConcurrent: item.isConcurrent,
                  notes: item.notes || `實習連堂 (${aftBlock}節)`,
                  errors: [],
                  warnings: [
                    ...(item.importWarnings || []),
                    `💡 依開課清冊每週${item.hours}節自動排入`,
                  ],
                });
                practicalCount++;
              }
              remainingHours -= aftBlock;
              allocated = true;
              break;
            }
          }
        }

        // Allocate remaining hours across available slots (preferring 1 period per day)
        for (let d = 1; d <= 5 && remainingHours > 0; d++) {
          const day = d as DayOfWeek;
          for (let p = 1; p <= 7 && remainingHours > 0; p++) {
            if (isSlotAvailable(day, p, cName, item.teacherName, item.venueName)) {
              occupySlot(day, p, cName, item.teacherName, item.venueName);
              validRows.push({
                rowNumber: item.rawRowIndex,
                dayOfWeek: day,
                period: p,
                className: cName,
                subjectName: item.subjectName,
                teacherName: item.teacherName,
                department: item.department,
                venueName: item.venueName,
                isPractical: item.isPractical,
                isConcurrent: item.isConcurrent,
                notes: item.notes,
                errors: [],
                warnings: [
                  ...(item.importWarnings || []),
                  `💡 依開課清冊每週${item.hours}節自動排入`,
                ],
              });
              if (item.isPractical) practicalCount++;
              remainingHours--;
              break; // go to next day for even distribution
            }
          }
        }

        // If still remaining hours, fill any remaining available slot on any day
        if (remainingHours > 0) {
          for (let d = 1; d <= 5 && remainingHours > 0; d++) {
            const day = d as DayOfWeek;
            for (let p = 1; p <= 7 && remainingHours > 0; p++) {
              if (isSlotAvailable(day, p, cName, item.teacherName, item.venueName)) {
                occupySlot(day, p, cName, item.teacherName, item.venueName);
                validRows.push({
                  rowNumber: item.rawRowIndex,
                  dayOfWeek: day,
                  period: p,
                  className: cName,
                  subjectName: item.subjectName,
                  teacherName: item.teacherName,
                  department: item.department,
                  venueName: item.venueName,
                  isPractical: item.isPractical,
                  isConcurrent: item.isConcurrent,
                  notes: item.notes,
                  errors: [],
                  warnings: [
                    ...(item.importWarnings || []),
                    `💡 依開課清冊每週${item.hours}節自動排入`,
                  ],
                });
                if (item.isPractical) practicalCount++;
                remainingHours--;
              }
            }
          }
        }
      }
    });

    return {
      validRows,
      invalidRows,
      totalCount: rawRows.length,
      newTeachersDetected: Array.from(newTeachersSet),
      newVenuesDetected: Array.from(newVenuesSet),
      practicalCoursesCount: practicalCount,
      classesDetected: Array.from(classesSet),
      clashesInFile: [],
    };
  }

  // ==========================================
  // MODE B: 標準日課表 (已有 星期 與 節次)
  // ==========================================
  rawRows.forEach((raw, idx) => {
    const rowNumber = idx + 2; // Excel row index (assuming header is row 1)

    // Normalize keys: match various column headers with prioritized precision
    const findField = (keys: string[]) => {
      // 1. Exact match first
      for (const target of keys) {
        for (const k of Object.keys(raw)) {
          const cleaned = k.trim().replace(/\s+/g, '');
          if (cleaned === target) {
            const v = raw[k];
            if (v !== undefined && v !== null && String(v).trim() !== '') return v;
          }
        }
      }
      // 2. Partial match prioritizing non-code (exclude "代碼" when looking for name)
      for (const target of keys) {
        for (const k of Object.keys(raw)) {
          const cleaned = k.trim().replace(/\s+/g, '');
          if (cleaned.includes(target) && !cleaned.includes('代碼')) {
            const v = raw[k];
            if (v !== undefined && v !== null && String(v).trim() !== '') return v;
          }
        }
      }
      // 3. General fallback partial match
      for (const target of keys) {
        for (const k of Object.keys(raw)) {
          const cleaned = k.trim().replace(/\s+/g, '');
          if (cleaned.includes(target)) {
            const v = raw[k];
            if (v !== undefined && v !== null && String(v).trim() !== '') return v;
          }
        }
      }
      return '';
    };

    // Support combined "時間" / "時段" (e.g. "週一 第1節")
    const timeVal = findField(['時間', '時段', '上課時間', '節次時間', 'Time', 'time']);
    const dayVal = findField(['星期', '週次', '週', '星期幾', 'Day', 'dayOfWeek']) || timeVal;
    const periodVal = findField(['節次', '節', '堂次', 'Period', 'period']) || timeVal;
    const classVal = String(findField(['班級名稱', '班級', 'Class', 'className'])).trim()
      || String(findField(['班級代號', '班級代碼'])).trim();
    const subjectVal = String(findField(['科目名稱', '課程名稱', '科目', 'Subject', 'subjectName'])).trim();
    const subjectCodeVal = String(findField(['科目代號', '科目代碼'])).trim();
    const teacherNameRaw = String(findField(['教師名稱', '授課教師', '任課教師', '教師姓名', '校內教師姓名', 'Teacher', 'teacherName'])).trim();
    const teacherCodeRaw = String(findField(['教師代號', '教師代碼', '教師編號'])).trim();
    const teacherVal = cleanTeacherName(teacherNameRaw || teacherCodeRaw) || '未指派教師';
    const venueVal = String(findField(['實習工場', '教學場地', '上課地點', '教室', '工場', 'Venue', 'venueName', '教室名稱'])).trim();
    const deptVal = String(findField(['科別', '群科', '教師科別', 'Department', 'department'])).trim();
    const practicalVal = findField(['是否為實習', '是否為實習實作課', '實習課', 'isPractical', '課程類別']);
    const concurrentVal = pickConcurrentValue(raw, findField);
    const notesVal = String(findField(['備註', '說明', 'Notes', 'notes'])).trim();

    const errors: string[] = [];
    const warnings: string[] = [];

    const dayOfWeek = parseDayOfWeek(dayVal);
    if (!dayOfWeek) {
      errors.push(`星期無效 (需為 1~5 或 週一~週五，目前值: "${dayVal}")`);
    }

    const periods = parsePeriodList(periodVal);
    if (periods.length === 0) {
      errors.push(`節次無效 (需為 1~8 節或如 1-3 連堂，目前值: "${periodVal}")`);
    } else if (periods.length > 1) {
      warnings.push(`節次「${periodVal}」已展開為第 ${periods.join('、')} 節`);
    }

    if (!classVal) {
      errors.push('班級名稱未填寫');
    } else {
      classesSet.add(classVal);
    }

    if (!subjectVal) {
      errors.push('科目名稱未填寫');
    }

    if (!teacherVal || teacherVal === '未指派教師') {
      warnings.push('本堂課尚未指派授課教師，匯入後可於課表中手動指定');
    } else {
      const subTeachers = splitTeacherNames(teacherVal);
      subTeachers.forEach((tName) => {
        if (tName && !teacherNameMap.has(tName)) {
          newTeachersSet.add(tName);
          warnings.push(`教師「${tName}」將自動註冊加入師資名冊`);
        }
      });
    }

    const isPractical = inferIsPractical(subjectVal, venueVal || '暫定', practicalVal);
    const isConcurrent = parseConcurrentFlag(concurrentVal);
    const department: DepartmentType =
      departmentFromClassName(classVal) ||
      (deptVal ? (deptVal as DepartmentType) : guessDepartment(subjectVal + ' ' + classVal));

    const finalVenue = resolveImportVenueName({
      venueVal,
      isPractical,
      className: classVal,
      department,
    });
    if (!venueNameMap.has(finalVenue)) {
      newVenuesSet.add(finalVenue);
      if (venueVal) {
        warnings.push(`場地「${finalVenue}」將自動註冊加入教學場地清冊`);
      } else if (isPractical) {
        warnings.push(practicalVenueMissingWarn(finalVenue));
      } else {
        warnings.push(
          `未填教室，將使用「${finalVenue}」（原班教室，非實習工場）`
        );
      }
    } else if (isPractical && !venueVal) {
      warnings.push(practicalVenueMissingWarn(finalVenue));
    }

    if (isPractical) practicalCount += Math.max(1, periods.length);

    const periodsToWrite = periods.length ? periods : [1];
    periodsToWrite.forEach((period, pIdx) => {
      const rowErrors = [...errors];
      const rowWarnings = [...warnings];
      if (periods.length > 1) {
        rowWarnings.push(`連堂第 ${pIdx + 1}/${periods.length} 節`);
      }

      // Collision check inside the imported batch
      if (dayOfWeek && periods.length > 0) {
        const timeKey = `d${dayOfWeek}-p${period}`;

        if (teacherVal && teacherVal !== '未指派教師') {
          const subTeachers = splitTeacherNames(teacherVal);
          subTeachers.forEach((tName) => {
            const teacherKey = `${timeKey}-t:${tName}`;
            const prev = teacherTimeSlot.get(teacherKey);
            if (prev) {
              if (isCombinedOrDuplicateTeacherSlot(prev, classVal, subjectVal, subjectCodeVal)) {
                return;
              }
              const msg = `第 ${rowNumber} 列與第 ${prev.rowNumber} 列衝突：教師「${tName}」在 週${dayOfWeek} 第${period}節 排定兩門課程`;
              rowWarnings.push(msg);
              clashesInFile.push(msg);
            } else {
              teacherTimeSlot.set(teacherKey, {
                rowNumber,
                className: classVal,
                subjectName: subjectVal,
                subjectCode: subjectCodeVal,
              });
            }
          });
        }

        if (classVal) {
          const classKey = `${timeKey}-c:${classVal}`;
          if (classTimeSlot.has(classKey)) {
            const prevRow = classTimeSlot.get(classKey);
            const msg = `第 ${rowNumber} 列與第 ${prevRow} 列提示：班級「${classVal}」在 週${dayOfWeek} 第${period}節 排有分組/實習連堂課`;
            rowWarnings.push(msg);
          } else {
            classTimeSlot.set(classKey, rowNumber);
          }
        }

        if (finalVenue && !finalVenue.includes('原班普通教室')) {
          const venueKey = `${timeKey}-v:${finalVenue}`;
          if (venueTimeSlot.has(venueKey)) {
            const prevRow = venueTimeSlot.get(venueKey);
            const msg = `第 ${rowNumber} 列與第 ${prevRow} 列衝堂：實習工場「${finalVenue}」在 週${dayOfWeek} 第${period}節 重複被借用`;
            rowWarnings.push(msg);
            clashesInFile.push(msg);
          } else {
            venueTimeSlot.set(venueKey, rowNumber);
          }
        }
      }

      const parsedRow: ParsedImportRow = {
        rowNumber,
        dayOfWeek: dayOfWeek || 1,
        period: period || 1,
        className: classVal || '未命名班級',
        subjectName: subjectVal || '未命名科目',
        teacherName: teacherVal || '未指派教師',
        department,
        venueName: finalVenue,
        isPractical,
        isConcurrent,
        notes: notesVal || undefined,
        errors: rowErrors,
        warnings: rowWarnings,
      };

      if (rowErrors.length > 0) {
        invalidRows.push(parsedRow);
      } else {
        validRows.push(parsedRow);
      }
    });
  });

  return {
    validRows,
    invalidRows,
    totalCount: rawRows.length,
    newTeachersDetected: Array.from(newTeachersSet),
    newVenuesDetected: Array.from(newVenuesSet),
    practicalCoursesCount: practicalCount,
    classesDetected: Array.from(classesSet),
    clashesInFile,
  };
};

/**
 * Generate sample Excel template for users to download and fill in.
 * 若傳入 venues，會附加「場地清單」工作表，方便對照／複製工場名稱。
 */
export const generateTemplateExcel = (venues: WorkshopVenue[] = []) => {
  const wb = XLSX.utils.book_new();

  // 1. Template data sheet
  const sampleData = [
    {
      '星期 (1~5 或 週一~週五)': '週一',
      '節次 (1~8)': 1,
      '班級名稱': '電機二甲',
      '科目名稱': '電工機械實習',
      '授課教師姓名': '林建宏',
      '教師科別 (電機科/資訊科/機械科/共同科目)': '電機科',
      '實習工場/教室名稱': '電機科電工機械實習工場',
      '是否為實習實作課 (是/否)': '是',
      '1.兼課2.': '',
      '備註說明 (選填)': '分組實習第1組',
    },
    {
      '星期 (1~5 或 週一~週五)': '週一',
      '節次 (1~8)': 2,
      '班級名稱': '電機二甲',
      '科目名稱': '電工機械實習',
      '授課教師姓名': '林建宏',
      '教師科別 (電機科/資訊科/機械科/共同科目)': '電機科',
      '實習工場/教室名稱': '電機科電工機械實習工場',
      '是否為實習實作課 (是/否)': '是',
      '備註說明 (選填)': '分組實習第1組',
    },
    {
      '星期 (1~5 或 週一~週五)': '週一',
      '節次 (1~8)': 3,
      '班級名稱': '電機一孝',
      '科目名稱': '配線實習',
      '授課教師姓名': '林建宏',
      '教師科別 (電機科/資訊科/機械科/共同科目)': '電機科',
      '實習工場/教室名稱': '電機科配線實習工場',
      '是否為實習實作課 (是/否)': '是',
      '備註說明 (選填)': '室內配線',
    },
    {
      '星期 (1~5 或 週一~週五)': '週二',
      '節次 (1~8)': 5,
      '班級名稱': '機械三甲',
      '科目名稱': 'CNC 銑床加工實習',
      '授課教師姓名': '陳冠宇',
      '教師科別 (電機科/資訊科/機械科/共同科目)': '機械科',
      '實習工場/教室名稱': 'CNC 精密車銑複合工場',
      '是否為實習實作課 (是/否)': '是',
      '備註說明 (選填)': '進階數值控制銑床',
    },
    {
      '星期 (1~5 或 週一~週五)': '週三',
      '節次 (1~8)': 3,
      '班級名稱': '電機二甲',
      '科目名稱': '實用數學 II',
      '授課教師姓名': '李雅筑',
      '教師科別 (電機科/資訊科/機械科/共同科目)': '共同科目',
      '實習工場/教室名稱': '',
      '是否為實習實作課 (是/否)': '否',
      '1.兼課2.': 1,
      '備註說明 (選填)': '學科未填教室→原班普通教室',
    },
  ];

  const ws = XLSX.utils.json_to_sheet(sampleData);
  
  // Set column widths
  ws['!cols'] = [
    { wch: 18 }, // 星期
    { wch: 12 }, // 節次
    { wch: 14 }, // 班級
    { wch: 22 }, // 科目
    { wch: 14 }, // 教師
    { wch: 24 }, // 科別
    { wch: 30 }, // 場地
    { wch: 18 }, // 實習
    { wch: 12 }, // 兼課
    { wch: 20 }, // 備註
  ];

  XLSX.utils.book_append_sheet(wb, ws, '高職課表匯入範本');

  // 2. Venue list sheet (for copy / Excel data validation reference)
  const venueListHeader = [['科別', '場地類型', '場地名稱', '代碼']];
  const venueListRows =
    venues.length > 0
      ? [...venues]
          .sort((a, b) =>
            String(a.department).localeCompare(String(b.department), 'zh-Hant') ||
            a.name.localeCompare(b.name, 'zh-Hant')
          )
          .map((v) => {
            const kind = classifyVenueKind(v.name);
            const kindLabel =
              kind === 'workshop' ? '實習工場' : kind === 'homeroom' ? '原班教室' : '一般教室';
            return [v.department, kindLabel, v.name, v.code];
          })
      : [
          ['電機科', '實習工場', '電機科配線實習工場', 'WS-101'],
          ['電機科', '實習工場', '電機科電工機械實習工場', 'WS-102'],
          ['電機科', '實習工場', '電機科實習工場', 'WS-100'],
          ['機械科', '實習工場', 'CNC 精密車銑複合工場', 'WS-201'],
        ];
  const wsVenues = XLSX.utils.aoa_to_sheet([...venueListHeader, ...venueListRows]);
  wsVenues['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 36 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, wsVenues, '場地清單');

  // 3. Add guide sheet
  const guideData = [
    ['技術型高級中等學校 (高職) 課表匯入說明指南'],
    [''],
    ['欄位名稱', '是否必填', '格式說明與範例'],
    ['星期', '必填', '支援 1~5 或 週一、週二、週三、週四、週五'],
    ['節次', '必填', '支援 1~8 節 (1~4 為上午，5~8 為下午與課輔)'],
    ['班級名稱', '必填', '如：電機二甲、資訊三乙、機械三甲、餐飲一甲'],
    ['科目名稱', '必填', '如：電工機械實習、數位邏輯、CNC銑床加工'],
    ['授課教師姓名', '必填', '填寫教師全名。如系統中尚無該教師，系統將自動建檔並標記科別'],
    ['教師科別', '選填', '電機科 / 資訊科 / 機械科 / 共同科目'],
    [
      '實習工場/教室名稱',
      '建議填寫',
      '請從「場地清單」工作表複製名稱貼上。實習課建議填具體工場（如電機科配線實習工場）。匯入後也可在課表格子直接下拉改選。',
    ],
    ['是否為實習實作課', '選填', '填「是」或「否」。系統亦會自動依科目名稱判定實習工場課程'],
    ['1.兼課2.', '選填', '填 1 代表此節為兼課，課表會顯示「兼課」標籤'],
    ['備註說明', '選填', '如：分組教學、協同教學、課輔節數等備註'],
    [''],
    ['如何在 Excel 設下拉選單（選用）：'],
    ['1. 選取「高職課表匯入範本」工作表的「實習工場/教室名稱」欄資料列'],
    ['2. 資料 → 資料驗證 → 允許「清單」→ 來源選「場地清單」工作表的「場地名稱」欄'],
    ['3. 可先在場地清單用篩選只顯示「電機科」再複製名稱'],
    [''],
    ['法規提醒：'],
    ['1. 實習工場請確認無同時間重複借用，以確保學生實作安全及工場容留人數限制。'],
    ['2. 匯入前系統會自動進行衝堂檢核（包含教師衝堂、班級衝堂與實習工場佔用）。'],
  ];
  const wsGuide = XLSX.utils.aoa_to_sheet(guideData);
  wsGuide['!cols'] = [{ wch: 22 }, { wch: 12 }, { wch: 70 }];
  XLSX.utils.book_append_sheet(wb, wsGuide, '欄位填寫說明與安全指南');

  XLSX.writeFile(wb, '高職課表匯入範本_技術型高中標準.xlsx');
};

/**
 * Export current active timetable to an Excel file
 */
export const exportScheduleToExcel = (
  sessions: CourseSession[],
  teachers: Teacher[],
  academicYear: string = '114',
  semester: string = '1',
  schoolName: string = '國立技術型高級中等學校'
) => {
  const wb = XLSX.utils.book_new();

  // 1. Full session list
  const exportData = sessions.map((s) => {
    const teacher = teachers.find((t) => t.id === s.teacherId);
    const dayNames = ['', '週一', '週二', '週三', '週四', '週五'];
    return {
      '課程編號': s.id,
      '星期': dayNames[s.dayOfWeek] || `週${s.dayOfWeek}`,
      '節次': `第 ${s.period} 節`,
      '班級': s.className,
      '科目名稱': s.subjectName,
      '授課教師': s.teacherName,
      '教師科別': teacher?.department || '專任教師',
      '教師職務': teacher?.title || '專任教師',
      '實習工場/上課教室': s.venueName,
      '課程性質': s.isPractical ? '專業實習/實作' : '專業/一般學科',
      '兼課': s.isConcurrent ? '1' : '',
      '備註': s.notes || '',
    };
  });

  const wsList = XLSX.utils.json_to_sheet(exportData);
  wsList['!cols'] = [
    { wch: 14 },
    { wch: 10 },
    { wch: 12 },
    { wch: 14 },
    { wch: 22 },
    { wch: 14 },
    { wch: 14 },
    { wch: 12 },
    { wch: 28 },
    { wch: 16 },
    { wch: 20 },
  ];
  XLSX.utils.book_append_sheet(wb, wsList, '全校課表課堂清冊');

  // 2. Summary stats sheet
  const totalPeriods = sessions.length;
  const practicalPeriods = sessions.filter((s) => s.isPractical).length;
  const theoryPeriods = totalPeriods - practicalPeriods;
  const classes = Array.from(new Set(sessions.map((s) => s.className)));
  const involvedTeachers = Array.from(new Set(sessions.map((s) => s.teacherName)));

  const summaryData = [
    [`${schoolName} ${academicYear} 學年度第 ${semester} 學期 全校課表總覽`],
    ['匯出時間', new Date().toLocaleString()],
    [''],
    ['統計項目', '數值', '備註'],
    ['全校每週排定總節數', totalPeriods, '節'],
    ['專業實習與實作課節數', practicalPeriods, `佔全校課程 ${(totalPeriods > 0 ? (practicalPeriods / totalPeriods) * 100 : 0).toFixed(1)}%`],
    ['一般與專業學科節數', theoryPeriods, '節'],
    ['已排課班級數', classes.length, classes.join('、')],
    ['任課教師總人數', involvedTeachers.length, '人'],
  ];

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
  wsSummary['!cols'] = [{ wch: 24 }, { wch: 20 }, { wch: 50 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, '課表統計摘要');

  XLSX.writeFile(wb, `${schoolName}全校總課表_${academicYear}學年度第${semester}學期.xlsx`);
};
