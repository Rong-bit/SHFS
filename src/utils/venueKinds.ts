/** 場地用途分類：原班教室 ≠ 實習工場 */

export type VenueKind = 'homeroom' | 'workshop' | 'classroom';

export function classifyVenueKind(name: string): VenueKind {
  const n = (name || '').trim();
  if (!n) return 'classroom';
  if (/原班|普通教室/.test(n)) return 'homeroom';
  if (/工場|實習室|實習教室|實驗室/.test(n)) return 'workshop';
  return 'classroom';
}

export function venueKindLabel(kind: VenueKind): string {
  switch (kind) {
    case 'homeroom':
      return '原班教室';
    case 'workshop':
      return '實習工場';
    default:
      return '一般教室';
  }
}

export function venueKindBadgeClass(kind: VenueKind): string {
  switch (kind) {
    case 'homeroom':
      return 'bg-slate-100 text-slate-700 border-slate-300';
    case 'workshop':
      return 'bg-amber-50 text-amber-800 border-amber-300';
    default:
      return 'bg-sky-50 text-sky-800 border-sky-200';
  }
}

/** 依班級名稱組出原班教室 */
export function defaultHomeroomVenueName(className: string): string {
  const c = (className || '').trim() || '未指定班級';
  return `${c} 原班普通教室`;
}

/** 依科別組出科別實習工場（例：機械科實習工場） */
export function defaultDepartmentWorkshopName(department: string): string {
  const d = (department || '').trim();
  if (!d || d === '共同科目' || d === '通用教室') return '共同科目實習工場';
  if (d.endsWith('科') || d.endsWith('組')) return `${d}實習工場`;
  return `${d}科實習工場`;
}

/**
 * 匯入時場地預設規則：
 * - 有填名稱 → 用填寫值
 * - 實習課未填 → xx科實習工場
 * - 學科未填 → 班級 原班普通教室
 */
export function resolveImportVenueName(params: {
  venueVal?: string;
  isPractical: boolean;
  className: string;
  department: string;
}): string {
  const filled = (params.venueVal || '').trim();
  if (filled) return filled;
  if (params.isPractical) return defaultDepartmentWorkshopName(params.department);
  return defaultHomeroomVenueName(params.className);
}

/** 匯入自動建檔時的說明文字 */
export function autoVenueEquipmentNote(name: string): string {
  const kind = classifyVenueKind(name);
  if (kind === 'homeroom') {
    return '匯入課表未填教室時，依班級自動建立之原班教室（非實習工場）';
  }
  if (/科實習工場$/.test(name) || name === '共同科目實習工場') {
    return '匯入實習課未填工場時，依科別自動建立之科別實習工場（建議再細分為配線／電工等具體工場名稱）';
  }
  if (kind === 'workshop') {
    return '匯入課表時依工場／實習室名稱自動登記';
  }
  return '匯入課表時自動登記建立之教學場地';
}

/** 匯入自動建檔時的代碼前綴 */
export function autoVenueCodePrefix(name: string): string {
  const kind = classifyVenueKind(name);
  if (kind === 'homeroom') return 'CLS';
  if (kind === 'workshop') return 'WS';
  return 'RM';
}

export function practicalVenueMissingWarn(workshopName: string): string {
  return `實習／實作課未填「實習工場／教室」，將暫用「${workshopName}」。建議改填具體工場（如配線實習工場、電工實習工場）後再匯入。`;
}
