export const SCHOOL_EMAIL_DOMAIN = 'mail2.ccvs.kh.edu.tw';

/** 表單 placeholder 用範例 */
export const SCHOOL_EMAIL_EXAMPLE = `陳卉淩@${SCHOOL_EMAIL_DOMAIN}`;

const PLACEHOLDER_EMAIL_DOMAINS = [
  'school.edu.tw',
  'voc.edu.tw',
  'vschool.edu.tw',
  'ccvs.edu.tw',
];

const localPartFromName = (name: string) =>
  name
    .replace(/\s*(主任|老師|組長|組員|幹事|助理)$/g, '')
    .replace(/\s+/g, '')
    .trim() || 'teacher';

/** 依姓名推測信箱（僅供提示，不自動寫入） */
export const defaultSchoolEmail = (name: string) =>
  `${localPartFromName(name)}@${SCHOOL_EMAIL_DOMAIN}`;

export const isPlaceholderSchoolEmail = (email?: string) => {
  if (!email?.trim()) return true;
  const domain = email.split('@')[1]?.toLowerCase() || '';
  return PLACEHOLDER_EMAIL_DOMAINS.includes(domain);
};

/** 儲存用：允許空白；舊版示範網域視為未填 */
export const normalizeSchoolEmail = (email?: string): string => {
  const trimmed = email?.trim() || '';
  if (!trimmed) return '';
  const domain = trimmed.split('@')[1]?.toLowerCase() || '';
  if (PLACEHOLDER_EMAIL_DOMAINS.includes(domain)) return '';
  return trimmed;
};
