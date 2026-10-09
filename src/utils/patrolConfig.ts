import { PatrolCheckItem, PatrolRoom, SystemConfig } from '../types';

export const DEFAULT_PATROL_CHECK_ITEMS: PatrolCheckItem[] = [
  { id: 'lights', label: '燈已關' },
  { id: 'aircon', label: '冷氣已關' },
  { id: 'fans', label: '電扇已關' },
  { id: 'doors', label: '門窗已關鎖' },
  { id: 'screen', label: '教室大屏已關' },
];

export const DEFAULT_PATROL_OBSERVATION_ITEMS: PatrolCheckItem[] = [
  { id: 'sleeping', label: '學生睡覺' },
  { id: 'phone', label: '玩手機' },
  { id: 'eating', label: '吃東西' },
  { id: 'chatting', label: '聊天喧嘩' },
  { id: 'uniform', label: '未穿制服' },
  { id: 'teacher_absent', label: '教師未到' },
  { id: 'many_absent', label: '學生多數缺席' },
  { id: 'disorder', label: '秩序不佳' },
];

export const DEFAULT_OUTDOOR_VENUE_KEYWORDS = ['操場', '體育館', '球場', '運動場', '游泳池', '室外'];

export function resolvePatrolCheckItems(cfg?: Pick<SystemConfig, 'patrolCheckItems'> | null) {
  const items = cfg?.patrolCheckItems;
  return Array.isArray(items) ? items : DEFAULT_PATROL_CHECK_ITEMS;
}

export function resolvePatrolObservationItems(
  cfg?: Pick<SystemConfig, 'patrolObservationItems'> | null
) {
  const items = cfg?.patrolObservationItems;
  return Array.isArray(items) ? items : DEFAULT_PATROL_OBSERVATION_ITEMS;
}

export function resolveOutdoorVenueKeywords(cfg?: Pick<SystemConfig, 'outdoorVenueKeywords'> | null) {
  const items = cfg?.outdoorVenueKeywords;
  return Array.isArray(items) ? items : DEFAULT_OUTDOOR_VENUE_KEYWORDS;
}

/** 樓層排序值：B1 → -1、1F → 1；無法辨識排最後 */
export function floorSortValue(floor: string): number {
  const f = (floor || '').trim().toUpperCase();
  const basement = /^B(\d+)/.exec(f);
  if (basement) return -Number(basement[1]);
  const above = /^(\d+)\s*F?/.exec(f) || /(\d+)\s*樓/.exec(f);
  if (above) return Number(above[1]);
  return 999;
}

export function sortPatrolRooms(rooms: PatrolRoom[]): PatrolRoom[] {
  return [...rooms].sort(
    (a, b) =>
      a.building.localeCompare(b.building, 'zh-Hant') ||
      floorSortValue(b.floor) - floorSortValue(a.floor) ||
      a.order - b.order ||
      a.name.localeCompare(b.name, 'zh-Hant')
  );
}

export interface PatrolFloorGroup {
  floor: string;
  rooms: PatrolRoom[];
}

export interface PatrolBuildingGroup {
  building: string;
  floors: PatrolFloorGroup[];
}

/** 大樓 → 樓層（高樓層在上）→ 教室 */
export function groupPatrolRooms(rooms: PatrolRoom[]): PatrolBuildingGroup[] {
  const out: PatrolBuildingGroup[] = [];
  for (const room of sortPatrolRooms(rooms)) {
    let b = out.find((x) => x.building === room.building);
    if (!b) {
      b = { building: room.building, floors: [] };
      out.push(b);
    }
    let f = b.floors.find((x) => x.floor === room.floor);
    if (!f) {
      f = { floor: room.floor, rooms: [] };
      b.floors.push(f);
    }
    f.rooms.push(room);
  }
  return out;
}

export function newPatrolRoomId(): string {
  return `room-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

const DRAFT_BUILDING = '教學大樓（草稿，請核對）';
const DRAFT_UNSORTED = '待核對樓層';

/** 依 114 學年教室配置圖（PDF）整理的草稿；PDF 文字順序零散，樓層需管理員核對 */
const DRAFT_ROWS: { floor: string; names: string[] }[] = [
  {
    floor: '8F',
    names: ['汽二忠', '機一孝', '電一孝', '冷二孝', '資一孝', '控三忠', '普二忠', '機三孝', '德語文化村'],
  },
  {
    floor: '7F',
    names: ['圖一忠', '電一忠', '冷二忠', '資一忠', '資三忠', '普一忠', '服三忠', '汽三忠', '金二忠'],
  },
  {
    floor: '6F',
    names: ['圖二忠', '電二孝', '建二孝', '資二孝', '資三孝', '子三忠', '服二忠', '汽三孝', '金三忠'],
  },
  { floor: '5F', names: ['圖三忠', '電二忠', '建二忠', '資二忠'] },
  {
    floor: DRAFT_UNSORTED,
    names: [
      '冷三忠', '建三忠', '化二孝', '化二忠', '汽一孝', '機二孝', '化一孝', '建一孝', '冷一孝',
      '冷三孝', '建三孝', '化三忠', '電三忠', '汽一忠', '機二忠', '化一忠', '建一忠', '冷一忠',
      '控二忠', '普三忠', '化三孝', '電三孝', '金一忠', '汽二孝', '機一忠', '子一忠', '控一忠',
      '服一忠', '機三忠', '子二忠', '數位遠距多功能教室', '備用教室', '分組教室',
    ],
  },
];

const looksLikeClassName = (name: string) => /^[\u4e00-\u9fff]{1,2}[一二三][忠孝仁愛信義和平]$/.test(name);

export function buildDraftPatrolRooms(): PatrolRoom[] {
  const rooms: PatrolRoom[] = [];
  for (const row of DRAFT_ROWS) {
    row.names.forEach((name, i) => {
      rooms.push({
        id: newPatrolRoomId() + `-${rooms.length}`,
        building: DRAFT_BUILDING,
        floor: row.floor,
        name,
        homeroomClass: looksLikeClassName(name) ? name : undefined,
        order: i + 1,
      });
    });
  }
  return rooms;
}
