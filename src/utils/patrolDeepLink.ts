import { loadLocalPatrolReviews } from './patrolReviewSync';

const FOCUS_STORAGE_KEY = 'shfs_patrol_review_focus';

function readStoredFocusId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return sessionStorage.getItem(FOCUS_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredFocusId(id: string | null) {
  if (typeof window === 'undefined') return;
  try {
    if (id) sessionStorage.setItem(FOCUS_STORAGE_KEY, id);
    else sessionStorage.removeItem(FOCUS_STORAGE_KEY);
  } catch {
    /* ignore quota / private mode */
  }
}

/** 從網址或本機暫存讀取會辦深層連結 id（切換身分後仍保留） */
export function readPatrolReviewFocusId(): string | null {
  if (typeof window === 'undefined') return null;
  const fromUrl = new URLSearchParams(window.location.search).get('patrolReview');
  if (fromUrl) {
    writeStoredFocusId(fromUrl);
    return fromUrl;
  }
  return readStoredFocusId();
}

/** 依本機會辦案推估深層連結應開的預設角色（僅提示；實際仍由使用者登入） */
export function suggestRoleForPatrolReviewFocus(focusId: string | null):
  | 'teacher'
  | 'academic'
  | 'student_affairs'
  | 'principal'
  | null {
  if (!focusId) return null;
  const c = loadLocalPatrolReviews().find((x) => x.id === focusId);
  if (!c) return 'academic';
  // 有收件角色時優先引導行政會辦；無資料則開教學組會辦頁
  if (c.recipients.some((r) => r.role === 'principal')) return 'principal';
  if (c.recipients.some((r) => r.role === 'student_affairs' || r.role === 'dean_student')) {
    return 'student_affairs';
  }
  if (c.recipients.some((r) => r.role === 'academic' || r.role === 'dean_academic')) {
    return 'academic';
  }
  if (c.recipients.some((r) => r.role === 'homeroom' || r.role === 'subject_teacher')) {
    return 'teacher';
  }
  return 'academic';
}

export const PATROL_REVIEW_FOCUS_CLEARED_EVENT = 'shfs:patrol-review-focus-cleared';

/** 只清網址列參數，保留 session 焦點，避免切換身分後深層連結失效 */
export function clearPatrolReviewQueryParam() {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has('patrolReview')) return;
  url.searchParams.delete('patrolReview');
  const next = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState({}, '', next);
}

/** 完全解除深層連結焦點（核章完成或使用者關閉提示時） */
export function dismissPatrolReviewFocus() {
  if (typeof window === 'undefined') return;
  clearPatrolReviewQueryParam();
  writeStoredFocusId(null);
  window.dispatchEvent(new CustomEvent(PATROL_REVIEW_FOCUS_CLEARED_EVENT));
}
