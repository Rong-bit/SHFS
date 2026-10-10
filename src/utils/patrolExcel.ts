import * as XLSX from 'xlsx';
import { PatrolCheckItem, PatrolRecord, PatrolReviewCase, PatrolRoom } from '../types';
import { newPatrolRoomId, sortPatrolRooms } from './patrolConfig';

const ROOM_HEADERS = ['大樓', '樓層', '教室名稱', '原班級'];

const normalizeHeader = (h: unknown) => String(h ?? '').replace(/\s/g, '');

export async function readPatrolWorkbook(file: File): Promise<XLSX.WorkBook> {
  return XLSX.read(await file.arrayBuffer(), { type: 'array' });
}

export function downloadPatrolRoomTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([
    ROOM_HEADERS,
    ['忠孝大樓', '3F', '機二忠', '機二忠'],
    ['忠孝大樓', '3F', '分組教室', ''],
  ]);
  ws['!cols'] = [{ wch: 14 }, { wch: 8 }, { wch: 18 }, { wch: 12 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '巡堂教室');
  XLSX.writeFile(wb, '巡堂教室配置範本.xlsx');
}

export function exportPatrolRooms(rooms: PatrolRoom[]) {
  const ws = XLSX.utils.aoa_to_sheet([
    ROOM_HEADERS,
    ...sortPatrolRooms(rooms).map((r) => [r.building, r.floor, r.name, r.homeroomClass || '']),
  ]);
  ws['!cols'] = [{ wch: 14 }, { wch: 8 }, { wch: 18 }, { wch: 12 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '巡堂教室');
  XLSX.writeFile(wb, '巡堂教室配置.xlsx');
}

/** 欄位：大樓、樓層、教室名稱、原班級（選填） */
export function parsePatrolRoomWorkbook(workbook: XLSX.WorkBook): PatrolRoom[] {
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
  if (rows.length < 2) throw new Error('檔案沒有資料列');
  const headers = (rows[0] || []).map(normalizeHeader);
  const col = (keys: string[]) => headers.findIndex((h) => keys.some((k) => h.includes(k)));
  const buildingCol = col(['大樓', '館別', '建築']);
  const floorCol = col(['樓層']);
  const nameCol = col(['教室名稱', '教室', '名稱']);
  const classCol = col(['原班級', '班級']);
  if (buildingCol < 0 || floorCol < 0 || nameCol < 0) {
    throw new Error('找不到必要欄位：請確認檔案含「大樓」「樓層」「教室名稱」欄');
  }
  const orderByFloor = new Map<string, number>();
  const rooms: PatrolRoom[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const building = String(row[buildingCol] ?? '').trim();
    const floor = String(row[floorCol] ?? '').trim().toUpperCase();
    const name = String(row[nameCol] ?? '').trim();
    if (!building || !floor || !name) continue;
    const key = `${building}|${floor}`;
    const order = (orderByFloor.get(key) || 0) + 1;
    orderByFloor.set(key, order);
    const homeroomClass = classCol >= 0 ? String(row[classCol] ?? '').trim() : '';
    rooms.push({
      id: `${newPatrolRoomId()}-${i}`,
      building,
      floor,
      name,
      homeroomClass: homeroomClass || undefined,
      order,
    });
  }
  if (rooms.length === 0) throw new Error('沒有有效的教室資料列');
  return rooms;
}

const KIND_LABELS: Record<PatrolRecord['kind'], string> = {
  class: '課間巡堂',
  outdoor: '室外課巡查',
  after_school: '放學巡查',
  exam: '段考巡堂',
};

export function patrolKindLabel(kind: PatrolRecord['kind']) {
  return KIND_LABELS[kind];
}

export function exportPatrolRecords(params: {
  records: PatrolRecord[];
  checkItems: PatrolCheckItem[];
  observationItems: PatrolCheckItem[];
  fileName: string;
  reviewCases?: PatrolReviewCase[];
}) {
  const { records, checkItems, observationItems, fileName, reviewCases } = params;
  const obsLabel = new Map(observationItems.map((o) => [o.id, o.label]));
  const sorted = [...records].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (a.period ?? 99) - (b.period ?? 99) ||
      a.building.localeCompare(b.building, 'zh-Hant') ||
      a.roomName.localeCompare(b.roomName, 'zh-Hant')
  );
  const reviewByRecord = new Map((reviewCases || []).map((c) => [c.recordId, c]));
  const header = [
    '日期',
    '類型',
    '節次',
    '大樓',
    '樓層',
    '教室',
    '班級',
    '科目',
    '任課教師',
    '觀察項目',
    ...checkItems.map((c) => c.label),
    '結果',
    '備註',
    '巡堂者',
    '登錄時間',
    '會辦狀態',
    '會辦簽核',
    '校長指示',
  ];
  const rows = sorted.map((r) => {
    const failedChecks = checkItems.filter((c) => r.checks[c.id] === false);
    const usesObs = r.kind === 'class' || r.kind === 'exam';
    const hasIssue = usesObs ? r.observations.length > 0 : failedChecks.length > 0;
    const review = reviewByRecord.get(r.id);
    const signText = (review?.signOffs || [])
      .map((s) => `${s.personName}${s.action}${s.stampedAt.slice(0, 10)}`)
      .join('；');
    const instruction = (review?.signOffs || [])
      .filter((s) => s.instruction)
      .map((s) => `${s.personName}：${s.instruction}`)
      .join('；');
    return [
      r.date,
      KIND_LABELS[r.kind],
      r.period ? `第${r.period}節` : '',
      r.building,
      r.floor,
      r.roomName,
      r.className || '',
      r.subjectName || '',
      r.teacherName || '',
      r.observations.map((id) => r.itemLabels?.[id] || obsLabel.get(id) || id).join('、'),
      ...checkItems.map((c) =>
        usesObs ? '' : r.checks[c.id] === false ? '未合格' : r.checks[c.id] ? '合格' : ''
      ),
      hasIssue ? '有缺失' : '正常',
      r.note,
      r.patrollerName,
      r.createdAt.replace('T', ' ').slice(0, 16),
      review?.status || '',
      signText,
      instruction,
    ];
  });
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  ws['!cols'] = header.map((h) => ({ wch: Math.max(8, h.length * 2 + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '巡堂紀錄');
  XLSX.writeFile(wb, fileName);
}
