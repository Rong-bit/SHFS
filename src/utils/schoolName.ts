/** 通知單戳章上弧校名上限（字元數，含中文） */
export const SCHOOL_NAME_MAX_LENGTH = 8;

const LEGACY_DEFAULT_SCHOOL_NAME = '國立技術型高級中等學校';
export const DEFAULT_SCHOOL_NAME = '高雄市立中正高工';

/** 輸入時截斷為最多 8 字（允許暫時空白） */
export function clipSchoolName(name: string | undefined | null): string {
  return Array.from(name ?? '')
    .slice(0, SCHOOL_NAME_MAX_LENGTH)
    .join('');
}

/** 載入／儲存時正規化：舊版長預設改為目前預設，並限 8 字 */
export function normalizeSchoolName(name: string | undefined | null): string {
  const raw = (name ?? '').trim();
  if (!raw || raw === LEGACY_DEFAULT_SCHOOL_NAME) {
    return DEFAULT_SCHOOL_NAME;
  }
  return clipSchoolName(raw);
}
