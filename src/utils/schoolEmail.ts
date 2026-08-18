export const SCHOOL_EMAIL_DOMAIN = 'mail2.ccvs.kh.edu.tw';

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

export const defaultSchoolEmail = (name: string) =>
  `${localPartFromName(name)}@${SCHOOL_EMAIL_DOMAIN}`;

export const isPlaceholderSchoolEmail = (email?: string) => {
  if (!email?.trim()) return true;
  const domain = email.split('@')[1]?.toLowerCase() || '';
  return PLACEHOLDER_EMAIL_DOMAINS.includes(domain);
};

export const ensureSchoolEmail = (name: string, email?: string) =>
  isPlaceholderSchoolEmail(email) ? defaultSchoolEmail(name) : email!.trim();
