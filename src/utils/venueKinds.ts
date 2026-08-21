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

/** 匯入自動建檔時的說明文字 */
export function autoVenueEquipmentNote(name: string): string {
  const kind = classifyVenueKind(name);
  if (kind === 'homeroom') {
    return '匯入課表未填教室時，依班級自動建立之原班教室（非實習工場）';
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

export const PRACTICAL_VENUE_MISSING_WARN =
  '實習／實作課未填「實習工場／教室」，將暫用「班級 原班普通教室」（非真正工場）。建議之後在 Excel 補上工場名稱再匯入，或於系統管理調整場地。';
