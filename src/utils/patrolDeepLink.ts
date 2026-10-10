import { loadLocalPatrolReviews } from './patrolReviewSync';

/** 從網址讀取會辦深層連結 id */
export function readPatrolReviewFocusId(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('patrolReview');
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

export function clearPatrolReviewQueryParam() {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has('patrolReview')) return;
  url.searchParams.delete('patrolReview');
  const next = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState({}, '', next);
}
