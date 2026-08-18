import * as XLSX from 'xlsx';
import { CourseSession, Teacher, WorkshopVenue, DayOfWeek, DepartmentType } from '../types';

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

// Convert period string to number (1-8), supports '週一 第1節', '第1節', '3', '1-2節' etc.
export const parsePeriod = (val: any): number | null => {
  if (val === undefined || val === null) return null;
  const str = String(val).trim();
  if (!str) return null;

  // 1. Explicit "第1節", "第 2 節" pattern
  const nthMatch = str.match(/第\s*([0-9一二三四五六七八])\s*節?/);
  if (nthMatch) {
    const raw = nthMatch[1];
    const chineseToNum: Record<string, number> = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8 };
    if (chineseToNum[raw]) return chineseToNum[raw];
    const n = parseInt(raw, 10);
    if (n >= 1 && n <= 8) return n;
  }

  // 2. Strip day prefixes like "週一", "星期二", "Mon" etc.
  const stripped = str
    .replace(/(?:週|星期|禮拜|\()[一二三四五六七日1-5\)]/gi, '')
    .replace(/Mon|Tue|Wed|Thu|Fri|Monday|Tuesday|Wednesday|Thursday|Friday/gi, '')
    .trim();

  // 3. Match first digit 1-8
  const digitMatch = stripped.match(/\d+/);
  if (digitMatch) {
    const num = parseInt(digitMatch[0], 10);
    if (num >= 1 && num <= 8) return num;
  }

  const chineseMap: Record<string, number> = {
    '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8,
    '第一節': 1, '第二節': 2, '第三節': 3, '第四節': 4, '第五節': 5, '第六節': 6, '第七節': 7, '第八節': 8,
  };
  if (chineseMap[stripped]) return chineseMap[stripped];
  return null;
};

// Infer practical class from subject name or venue name
export const inferIsPractical = (subjectName: string, venueName: string, explicitVal?: any): boolean => {
  if (explicitVal !== undefined && explicitVal !== null && String(explicitVal).trim() !== '') {
    const str = String(explicitVal).trim().toLowerCase();
    if (['是', 'y', 'yes', 'true', '1', '實習', '實作'].includes(str)) return true;
    if (['否', 'n', 'no', 'false', '0', '學科', '一般'].includes(str)) return false;
  }
  const practicalKeywords = ['實習', '實作', '工場', '實驗', '專題', '製圖', '車床', '烘焙', '配線', '金工', '烹調', '程式設計', '單晶片'];
  return practicalKeywords.some((kw) => subjectName.includes(kw) || venueName.includes(kw));
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

// Guess Department from Subject or Teacher or Class name
export const guessDepartment = (text: string): DepartmentType => {
  if (/電機|配線|電工|PLC|電子|控制/.test(text)) return '電機科';
  if (/資訊|程式|軟體|物聯網|微處理|單晶片|網路/.test(text)) return '資訊科';
  if (/機械|車床|銑床|CNC|製圖|加工|鉗工/.test(text)) return '機械科';
  if (/餐飲|烘焙|西餐|中餐|飲料|調酒|觀光/.test(text)) return '餐飲管理科';
  if (/廣告|設計|美工|多媒體|繪圖|排版/.test(text)) return '廣告設計科';
  return '共同科目';
};

interface TeacherSlotHit {
  rowNumber: number;
  className: string;
  subjectName: string;
  subjectCode: string;
}

const normalizeClashText = (s: string) => s.replace(/\s+/g, '').toLowerCase();

/** 忠/孝等同科同時段合班，或完全重複列，不視為教師衝堂 */
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
  return true;
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
      department: DepartmentType;
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
      const practicalVal = findField(['是否為實習', '實習課', '實習', '屬性', 'isPractical', '實作', '課程類別']);
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
          errors: [!classVal ? '班級名稱未填寫' : '科目名稱未填寫'],
          warnings: [],
        });
        return;
      }

      classesSet.add(classVal);
      if (teacherVal && teacherVal !== '未指派教師' && !teacherNameMap.has(teacherVal)) {
        newTeachersSet.add(teacherVal);
      }

      const finalVenue = venueVal || `${classVal} 原班普通教室`;
      if (!venueNameMap.has(finalVenue)) {
        newVenuesSet.add(finalVenue);
      }

      const isPractical = inferIsPractical(subjectVal, finalVenue, practicalVal);
      const department: DepartmentType = deptVal
        ? (deptVal as DepartmentType)
        : guessDepartment(subjectVal + ' ' + finalVenue + ' ' + classVal);

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
        department,
      });
    });

    // Global schedule tracker across all classes, teachers, venues
    // key: "d-p"
    const occupiedClass = new Map<string, Set<string>>(); // "d-p" -> Set<className>
    const occupiedTeacher = new Map<string, Set<string>>(); // "d-p" -> Set<teacherName>
    const occupiedVenue = new Map<string, Set<string>>(); // "d-p" -> Set<venueName>

    const isSlotAvailable = (d: DayOfWeek, p: number, cName: string, tName: string, vName: string) => {
      const slotKey = `${d}-${p}`;
      if (occupiedClass.get(slotKey)?.has(cName)) return false;
      if (tName && tName !== '未指派教師' && occupiedTeacher.get(slotKey)?.has(tName)) return false;
      if (vName && !vName.includes('原班普通教室') && occupiedVenue.get(slotKey)?.has(vName)) return false;
      return true;
    };

    const occupySlot = (d: DayOfWeek, p: number, cName: string, tName: string, vName: string) => {
      const slotKey = `${d}-${p}`;
      if (!occupiedClass.has(slotKey)) occupiedClass.set(slotKey, new Set());
      occupiedClass.get(slotKey)!.add(cName);

      if (tName && tName !== '未指派教師') {
        if (!occupiedTeacher.has(slotKey)) occupiedTeacher.set(slotKey, new Set());
        occupiedTeacher.get(slotKey)!.add(tName);
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
                  notes: item.notes || `實習連堂 (${blockSize}節)`,
                  errors: [],
                  warnings: [`💡 依開課清冊每週${item.hours}節自動排入`],
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
                  notes: item.notes || `實習連堂 (${aftBlock}節)`,
                  errors: [],
                  warnings: [`💡 依開課清冊每週${item.hours}節自動排入`],
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
                notes: item.notes,
                errors: [],
                warnings: [`💡 依開課清冊每週${item.hours}節自動排入`],
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
                  notes: item.notes,
                  errors: [],
                  warnings: [`💡 依開課清冊每週${item.hours}節自動排入`],
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
    const practicalVal = findField(['是否為實習', '實習課', '實習', '屬性', 'isPractical', '實作', '課程類別']);
    const notesVal = String(findField(['備註', '說明', 'Notes', 'notes'])).trim();

    const errors: string[] = [];
    const warnings: string[] = [];

    const dayOfWeek = parseDayOfWeek(dayVal);
    if (!dayOfWeek) {
      errors.push(`星期無效 (需為 1~5 或 週一~週五，目前值: "${dayVal}")`);
    }

    const period = parsePeriod(periodVal);
    if (!period) {
      errors.push(`節次無效 (需為 1~8 節，目前值: "${periodVal}")`);
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
      // Split co-teachers if any
      const subTeachers = teacherVal.split('/').map((s) => s.trim()).filter(Boolean);
      subTeachers.forEach((tName) => {
        if (tName && tName !== '未指派教師' && !teacherNameMap.has(tName)) {
          newTeachersSet.add(tName);
          warnings.push(`教師「${tName}」將自動註冊加入師資名冊`);
        }
      });
    }

    const finalVenue = venueVal || `${classVal} 原班普通教室`;
    if (!venueNameMap.has(finalVenue)) {
      newVenuesSet.add(finalVenue);
      warnings.push(`場地「${finalVenue}」將自動註冊加入教學場地清冊`);
    }

    const isPractical = inferIsPractical(subjectVal, finalVenue, practicalVal);
    if (isPractical) practicalCount++;

    const department: DepartmentType = deptVal
      ? (deptVal as DepartmentType)
      : guessDepartment(subjectVal + ' ' + finalVenue + ' ' + classVal);

    // Collision check inside the imported batch
    if (dayOfWeek && period) {
      const timeKey = `d${dayOfWeek}-p${period}`;
      
      // Teacher clash (skip unassigned, 合班/同科同時段, and duplicate rows)
      if (teacherVal && teacherVal !== '未指派教師') {
        const subTeachers = teacherVal.split('/').map((s) => s.trim()).filter(Boolean);
        subTeachers.forEach((tName) => {
          if (tName && tName !== '未指派教師') {
            const identity = teacherCodeRaw || tName;
            const teacherKey = `${timeKey}-t:${identity}`;
            const prev = teacherTimeSlot.get(teacherKey);
            if (prev) {
              if (isCombinedOrDuplicateTeacherSlot(prev, classVal, subjectVal, subjectCodeVal)) {
                return;
              }
              const msg = `第 ${rowNumber} 列與第 ${prev.rowNumber} 列衝突：教師「${tName}」在 週${dayOfWeek} 第${period}節 排定兩門課程`;
              warnings.push(msg);
              clashesInFile.push(msg);
            } else {
              teacherTimeSlot.set(teacherKey, {
                rowNumber,
                className: classVal,
                subjectName: subjectVal,
                subjectCode: subjectCodeVal,
              });
            }
          }
        });
      }

      // Class clash (allow split-group practical courses as warnings instead of blocking failures)
      if (classVal) {
        const classKey = `${timeKey}-c:${classVal}`;
        if (classTimeSlot.has(classKey)) {
          const prevRow = classTimeSlot.get(classKey);
          const msg = `第 ${rowNumber} 列與第 ${prevRow} 列提示：班級「${classVal}」在 週${dayOfWeek} 第${period}節 排有分組/實習連堂課`;
          warnings.push(msg);
        } else {
          classTimeSlot.set(classKey, rowNumber);
        }
      }

      // Venue clash (only for specialized workshop/lab venues)
      if (finalVenue && !finalVenue.includes('原班普通教室')) {
        const venueKey = `${timeKey}-v:${finalVenue}`;
        if (venueTimeSlot.has(venueKey)) {
          const prevRow = venueTimeSlot.get(venueKey);
          const msg = `第 ${rowNumber} 列與第 ${prevRow} 列衝堂：實習工場「${finalVenue}」在 週${dayOfWeek} 第${period}節 重複被借用`;
          warnings.push(msg);
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
      notes: notesVal || undefined,
      errors,
      warnings,
    };

    if (errors.length > 0) {
      invalidRows.push(parsedRow);
    } else {
      validRows.push(parsedRow);
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
    clashesInFile,
  };
};

/**
 * Generate sample Excel template for users to download and fill in
 */
export const generateTemplateExcel = () => {
  const wb = XLSX.utils.book_new();

  // 1. Template data sheet
  const sampleData = [
    {
      '星期 (1~5 或 週一~週五)': '週一',
      '節次 (1~8)': 1,
      '班級名稱': '電機二甲',
      '科目名稱': '電工機械實習',
      '授課教師姓名': '林建宏',
      '教師科別 (電機科/資訊科/機械科/餐飲管理科/廣告設計科/共同科目)': '電機科',
      '實習工場/教室名稱': '電機實習工場 A (室內配線)',
      '是否為實習實作課 (是/否)': '是',
      '備註說明 (選填)': '分組實習第1組',
    },
    {
      '星期 (1~5 或 週一~週五)': '週一',
      '節次 (1~8)': 2,
      '班級名稱': '電機二甲',
      '科目名稱': '電工機械實習',
      '授課教師姓名': '林建宏',
      '教師科別 (電機科/資訊科/機械科/餐飲管理科/廣告設計科/共同科目)': '電機科',
      '實習工場/教室名稱': '電機實習工場 A (室內配線)',
      '是否為實習實作課 (是/否)': '是',
      '備註說明 (選填)': '分組實習第1組',
    },
    {
      '星期 (1~5 或 週一~週五)': '週一',
      '節次 (1~8)': 3,
      '班級名稱': '資訊三乙',
      '科目名稱': '微處理機實習',
      '授課教師姓名': '張志強',
      '教師科別 (電機科/資訊科/機械科/餐飲管理科/廣告設計科/共同科目)': '資訊科',
      '實習工場/教室名稱': '微處理機與單晶片實習室',
      '是否為實習實作課 (是/否)': '是',
      '備註說明 (選填)': 'ARM 單晶片專題',
    },
    {
      '星期 (1~5 或 週一~週五)': '週二',
      '節次 (1~8)': 1,
      '班級名稱': '餐飲一甲',
      '科目名稱': '西點烘焙與實作',
      '授課教師姓名': '王美玲',
      '教師科別 (電機科/資訊科/機械科/餐飲管理科/廣告設計科/共同科目)': '餐飲管理科',
      '實習工場/教室名稱': '烘焙與西點專業教室',
      '是否為實習實作課 (是/否)': '是',
      '備註說明 (選填)': '乙級證照考照培訓',
    },
    {
      '星期 (1~5 或 週一~週五)': '週二',
      '節次 (1~8)': 5,
      '班級名稱': '機械三甲',
      '科目名稱': 'CNC 銑床加工實習',
      '授課教師姓名': '陳冠宇',
      '教師科別 (電機科/資訊科/機械科/餐飲管理科/廣告設計科/共同科目)': '機械科',
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
      '教師科別 (電機科/資訊科/機械科/餐飲管理科/廣告設計科/共同科目)': '共同科目',
      '實習工場/教室名稱': '普通教學大樓 301 教室',
      '是否為實習實作課 (是/否)': '否',
      '備註說明 (選填)': '一般部定必修學科',
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
    { wch: 20 }, // 備註
  ];

  XLSX.utils.book_append_sheet(wb, ws, '高職課表匯入範本');

  // 2. Add guide sheet
  const guideData = [
    ['技術型高級中等學校 (高職) 課表匯入說明指南'],
    [''],
    ['欄位名稱', '是否必填', '格式說明與範例'],
    ['星期', '必填', '支援 1~5 或 週一、週二、週三、週四、週五'],
    ['節次', '必填', '支援 1~8 節 (1~4 為上午，5~8 為下午與課輔)'],
    ['班級名稱', '必填', '如：電機二甲、資訊三乙、機械三甲、餐飲一甲'],
    ['科目名稱', '必填', '如：電工機械實習、數位邏輯、西餐烹調實習、CNC銑床加工'],
    ['授課教師姓名', '必填', '填寫教師全名。如系統中尚無該教師，系統將自動建檔並標記科別'],
    ['教師科別', '選填', '電機科 / 資訊科 / 機械科 / 餐飲管理科 / 廣告設計科 / 共同科目'],
    ['實習工場/教室名稱', '選填', '填寫實習工場或教室。未填寫時預設為「班級普通教室」'],
    ['是否為實習實作課', '選填', '填「是」或「否」。系統亦會自動依科目名稱判定實習工場課程'],
    ['備註說明', '選填', '如：分組教學、協同教學、課輔節數等備註'],
    [''],
    ['法規提醒：'],
    ['1. 實習工場請確認無同時間重複借用，以確保學生實作安全及工場容留人數限制。'],
    ['2. 匯入前系統會自動進行衝堂檢核（包含教師衝堂、班級衝堂與實習工場佔用）。'],
  ];
  const wsGuide = XLSX.utils.aoa_to_sheet(guideData);
  wsGuide['!cols'] = [{ wch: 22 }, { wch: 12 }, { wch: 60 }];
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
  semester: string = '1'
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
    [`國立技術型高級中等學校 ${academicYear} 學年度第 ${semester} 學期 全校課表總覽`],
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

  XLSX.writeFile(wb, `國立高職全校總課表_${academicYear}學年度第${semester}學期.xlsx`);
};
