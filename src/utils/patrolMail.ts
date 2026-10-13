import {
  PatrolKind,
  PatrolMailConfig,
  PatrolNotifyRoles,
  PatrolReviewCase,
  PatrolReviewRole,
} from '../types';
import {
  PATROL_REVIEW_ROLE_LABELS,
  PATROL_REVIEW_ROLE_ORDER,
  resolvePatrolNotifyRoles,
} from './patrolReview';
import { patrolKindLabel } from './patrolExcel';

export type PatrolNotifyResult = {
  ok: boolean;
  sent: number;
  failed: { email: string; error: string }[];
  skippedNoEmail: number;
  error?: string;
};

export function isPatrolMailConfigured(cfg?: PatrolMailConfig | null): boolean {
  if (!cfg?.enabled) return false;
  return Boolean(cfg.host && cfg.fromEmail && (cfg.user || cfg.fromEmail));
}

/** 解析巡堂寄信 API 完整 URL */
export function resolvePatrolNotifyApiUrl(
  mailConfig?: Pick<PatrolMailConfig, 'notifyApiBaseUrl'> | null
): string {
  const custom = (mailConfig?.notifyApiBaseUrl || '').trim().replace(/\/$/, '');
  if (custom) return `${custom}/api/patrol/notify`;
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/api/patrol/notify`;
  }
  return '/api/patrol/notify';
}

export function resolvePatrolHealthApiUrl(
  mailConfig?: Pick<PatrolMailConfig, 'notifyApiBaseUrl'> | null
): string {
  const custom = (mailConfig?.notifyApiBaseUrl || '').trim().replace(/\/$/, '');
  if (custom) return `${custom}/api/health`;
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/api/health`;
  }
  return '/api/health';
}

function explainNonJsonApiResponse(status: number, raw: string): string {
  const trimmed = raw.trim();
  const looksHtml = /^<!DOCTYPE/i.test(trimmed) || /^<html/i.test(trimmed);
  if (looksHtml || (trimmed.startsWith('<') && trimmed.includes('<head'))) {
    return (
      '寄信 API 未啟動或目前為 GitHub Pages 靜態站（無寄信功能）。' +
      '請在校內電腦執行「啟動寄信API.bat」或 npm start，並改開 http://那台IP:3000（API 根網址留空）。'
    );
  }
  if (!trimmed) return `寄信 API 無回應（HTTP ${status}）`;
  return `寄信 API 回應無法解析（HTTP ${status}）`;
}

async function readPatrolNotifyResponse(
  res: Response
): Promise<{ json: PatrolNotifyResult & { message?: string }; parseError?: string }> {
  const raw = await res.text();
  try {
    return { json: JSON.parse(raw) as PatrolNotifyResult & { message?: string } };
  } catch {
    return {
      json: {
        ok: false,
        sent: 0,
        failed: [],
        skippedNoEmail: 0,
        error: explainNonJsonApiResponse(res.status, raw),
      },
      parseError: explainNonJsonApiResponse(res.status, raw),
    };
  }
}

/** 依巡堂類型與選項勾選說明應通知哪些身分 */
export function patrolNotifyAudienceLine(
  kind: PatrolKind,
  notifyRoles?: Partial<PatrolNotifyRoles> | null
): string {
  const roles = resolvePatrolNotifyRoles(notifyRoles);
  const parts: string[] = [];
  if (roles.student_affairs) parts.push('生輔組');
  if (roles.dean_student) parts.push('學務主任');
  if (roles.academic) parts.push('教學組');
  if (roles.dean_academic) parts.push('教務主任');
  if (roles.internship) parts.push('實習組');
  if (roles.dean_internship) parts.push('實習主任');
  if (roles.dean_general_affairs) parts.push('總務主任');
  if (roles.homeroom) parts.push('該班導師');
  if (kind === 'exam') {
    const base = parts.length > 0 ? parts.join('、') : '（選項未勾選任何身分）';
    return `${base}（段考不含任課老師）`;
  }
  if (roles.subject_teacher) parts.push('任課老師');
  return parts.length > 0 ? parts.join('、') : '（選項未勾選任何身分）';
}

function sortedRecipientLines(c: PatrolReviewCase): string[] {
  const order = new Map(PATROL_REVIEW_ROLE_ORDER.map((r, i) => [r, i]));
  return [...c.recipients]
    .sort(
      (a, b) =>
        (order.get(a.role) ?? 99) - (order.get(b.role) ?? 99) ||
        a.personName.localeCompare(b.personName, 'zh-Hant')
    )
    .map((r) => {
      const role = PATROL_REVIEW_ROLE_LABELS[r.role as PatrolReviewRole] || r.role;
      const mail = r.email ? ` <${r.email}>` : '（無信箱）';
      return `・${role} ${r.personName}${mail}`;
    });
}

export function buildPatrolNotifyEmail(params: {
  reviewCase: PatrolReviewCase;
  schoolName: string;
  appBaseUrl?: string;
  /** 選項勾選的通知身分；未傳則依會辦案實際 recipients 推估 */
  notifyRoles?: Partial<PatrolNotifyRoles> | null;
}): { subject: string; text: string; html: string } {
  const { reviewCase: c, schoolName, appBaseUrl } = params;
  const period = c.period ? `第${c.period}節` : '';
  const classPart = c.className || c.roomName;
  const subject = `【巡堂異常會辦】${schoolName} ${c.date} ${classPart} ${patrolKindLabel(c.kind)}`;
  const link = appBaseUrl
    ? `${appBaseUrl.replace(/\/$/, '')}/?patrolReview=${encodeURIComponent(c.id)}`
    : '';
  const audienceRoles =
    params.notifyRoles ??
    ({
      student_affairs: c.recipients.some((r) => r.role === 'student_affairs'),
      dean_student: c.recipients.some((r) => r.role === 'dean_student'),
      academic: c.recipients.some((r) => r.role === 'academic'),
      dean_academic: c.recipients.some((r) => r.role === 'dean_academic'),
      internship: c.recipients.some((r) => r.role === 'internship'),
      dean_internship: c.recipients.some((r) => r.role === 'dean_internship'),
      dean_general_affairs: c.recipients.some((r) => r.role === 'dean_general_affairs'),
      homeroom: c.recipients.some((r) => r.role === 'homeroom'),
      subject_teacher:
        c.kind === 'exam' ? true : c.recipients.some((r) => r.role === 'subject_teacher'),
    } satisfies PatrolNotifyRoles);
  const audience = patrolNotifyAudienceLine(c.kind, audienceRoles);
  const recipientLines = sortedRecipientLines(c);
  const recipientBlock =
    recipientLines.length > 0
      ? recipientLines.join('\n')
      : '・（名冊尚無對應人員或未填信箱，請管理員於成員名冊補齊生輔組、學務主任、教學組、教務主任等）';

  const text = [
    `${schoolName} 巡堂異常會辦通知`,
    '',
    `日期：${c.date}${period ? ` ${period}` : ''}`,
    `類型：${patrolKindLabel(c.kind)}`,
    `地點：${c.building} ${c.floor} ${c.roomName}`,
    `班級：${c.className || '—'}`,
    c.subjectName ? `科目：${c.subjectName}` : '',
    c.teacherName ? `任課：${c.teacherName}` : '',
    `巡堂：${c.patrollerName}`,
    `異常：${c.issueSummary}`,
    '',
    '請登入系統於「巡堂會辦」以電子戳章勾選已會畢或已閱畢。',
    link ? `連結：${link}` : '',
    '',
    `應通知身分：${audience}`,
    '通知對象：',
    recipientBlock,
  ]
    .filter((line) => line !== '')
    .join('\n');

  const recipientHtml =
    recipientLines.length > 0
      ? `<ul style="margin:8px 0 0;padding-left:1.2em">${recipientLines
          .map((line) => `<li>${line.replace(/^・/, '')}</li>`)
          .join('')}</ul>`
      : `<p style="margin:8px 0 0;color:#64748b">名冊尚無對應人員或未填信箱，請管理員於成員名冊補齊<strong>生輔組、學務主任、教學組、教務主任</strong>等。</p>`;

  const html = `
    <div style="font-family:'Noto Sans TC',Arial,sans-serif;line-height:1.6;color:#0f172a">
      <h2 style="margin:0 0 12px">${schoolName} 巡堂異常會辦通知</h2>
      <p style="margin:0 0 8px"><strong>日期</strong> ${c.date}${period ? ` ${period}` : ''}</p>
      <p style="margin:0 0 8px"><strong>類型</strong> ${patrolKindLabel(c.kind)}</p>
      <p style="margin:0 0 8px"><strong>地點</strong> ${c.building} ${c.floor} ${c.roomName}</p>
      <p style="margin:0 0 8px"><strong>班級</strong> ${c.className || '—'}</p>
      ${c.subjectName ? `<p style="margin:0 0 8px"><strong>科目</strong> ${c.subjectName}</p>` : ''}
      ${c.teacherName ? `<p style="margin:0 0 8px"><strong>任課</strong> ${c.teacherName}</p>` : ''}
      <p style="margin:0 0 8px"><strong>巡堂</strong> ${c.patrollerName}</p>
      <p style="margin:0 0 16px;padding:10px 12px;background:#fff1f2;border-radius:8px"><strong>異常</strong> ${c.issueSummary}</p>
      <p>請登入系統於「巡堂會辦」以電子戳章勾選<strong>已會畢</strong>或<strong>已閱畢</strong>。</p>
      ${link ? `<p><a href="${link}">開啟會辦案</a></p>` : ''}
      <p style="margin:16px 0 0"><strong>應通知身分</strong> ${audience}</p>
      <p style="margin:8px 0 0"><strong>通知對象</strong></p>
      ${recipientHtml}
    </div>
  `;

  return { subject, text, html };
}

/** 呼叫本機 server 以 SMTP 寄出會辦通知 */
export async function sendPatrolReviewNotify(params: {
  mailConfig: PatrolMailConfig;
  reviewCase: PatrolReviewCase;
  schoolName: string;
  /** 若指定則只寄這些信箱（用於部分失敗重試） */
  onlyEmails?: string[];
}): Promise<PatrolNotifyResult> {
  const { mailConfig, reviewCase, schoolName, onlyEmails } = params;
  if (!isPatrolMailConfigured(mailConfig)) {
    return { ok: false, sent: 0, failed: [], skippedNoEmail: 0, error: '尚未啟用或設定 SMTP' };
  }
  const allEmails = reviewCase.recipients.map((r) => r.email.trim()).filter(Boolean);
  const pool = onlyEmails?.length
    ? onlyEmails.map((e) => e.trim()).filter(Boolean)
    : allEmails;
  const unique = [...new Set(pool)];
  const skippedNoEmail = reviewCase.recipients.filter((r) => !r.email.trim()).length;
  if (unique.length === 0) {
    return { ok: false, sent: 0, failed: [], skippedNoEmail, error: '收件人皆無信箱' };
  }
  const body = buildPatrolNotifyEmail({
    reviewCase,
    schoolName,
    appBaseUrl: mailConfig.appBaseUrl || (typeof window !== 'undefined' ? window.location.origin : ''),
    notifyRoles: mailConfig.notifyRoles,
  });
  try {
    const res = await fetch(resolvePatrolNotifyApiUrl(mailConfig), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        smtp: {
          host: mailConfig.host,
          port: mailConfig.port,
          secure: mailConfig.secure,
          user: mailConfig.user,
          pass: mailConfig.pass,
          fromName: mailConfig.fromName || schoolName,
          fromEmail: mailConfig.fromEmail,
        },
        to: unique,
        subject: body.subject,
        text: body.text,
        html: body.html,
      }),
    });
    const { json, parseError } = await readPatrolNotifyResponse(res);
    if (parseError) {
      return {
        ok: false,
        sent: 0,
        failed: unique.map((email) => ({ email, error: parseError })),
        skippedNoEmail,
        error: parseError,
      };
    }
    if (!res.ok) {
      return {
        ok: false,
        sent: 0,
        failed: unique.map((email) => ({ email, error: json.error || json.message || `HTTP ${res.status}` })),
        skippedNoEmail,
        error: json.error || json.message || `HTTP ${res.status}`,
      };
    }
    return { ...json, skippedNoEmail: json.skippedNoEmail ?? skippedNoEmail };
  } catch (err) {
    const msg = err instanceof Error ? err.message : '寄信失敗';
    const hint =
      /Failed to fetch|NetworkError|Load failed/i.test(msg)
        ? `${msg}（請確認寄信 API 根網址可連線，且伺服器已允許跨域）`
        : msg;
    return {
      ok: false,
      sent: 0,
      failed: unique.map((email) => ({ email, error: hint })),
      skippedNoEmail,
      error: hint,
    };
  }
}

/** 探測寄信 API 是否可用（/api/health） */
export async function probePatrolNotifyApi(
  mailConfig?: Pick<PatrolMailConfig, 'notifyApiBaseUrl'> | null
): Promise<{ ok: boolean; message: string }> {
  const url = resolvePatrolHealthApiUrl(mailConfig);
  const base = (mailConfig?.notifyApiBaseUrl || '').toLowerCase();
  const renderWarn = base.includes('onrender.com')
    ? ' ※注意：Render 免費方案封鎖 SMTP，API 正常仍可能寄不出；請改校內 npm start。'
    : '';
  if (typeof window !== 'undefined' && /github\.io$/i.test(window.location.hostname) && !base) {
    return {
      ok: false,
      message:
        '目前在 GitHub Pages，未填外掛 API 時無法寄信。請改開校內 http://IP:3000（API 根網址留空）。',
    };
  }
  try {
    const res = await fetch(url, { method: 'GET' });
    const raw = await res.text();
    try {
      const json = JSON.parse(raw) as { status?: string };
      if (res.ok && json.status === 'ok') {
        return { ok: true, message: `寄信 API 正常（${url}）${renderWarn}` };
      }
      return { ok: false, message: `寄信 API 異常（HTTP ${res.status}）` };
    } catch {
      return { ok: false, message: explainNonJsonApiResponse(res.status, raw) };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : '連線失敗';
    return { ok: false, message: `${msg}（${url}）` };
  }
}

/** 以目前 SMTP 設定寄一封測試信 */
export async function sendPatrolMailTest(params: {
  mailConfig: PatrolMailConfig;
  to: string;
  schoolName: string;
}): Promise<PatrolNotifyResult> {
  const { mailConfig, to, schoolName } = params;
  if (!isPatrolMailConfigured(mailConfig)) {
    return { ok: false, sent: 0, failed: [], skippedNoEmail: 0, error: '尚未啟用或設定 SMTP' };
  }
  const email = to.trim();
  if (!email.includes('@')) {
    return { ok: false, sent: 0, failed: [], skippedNoEmail: 0, error: '請填有效測試收件信箱' };
  }
  try {
    const res = await fetch(resolvePatrolNotifyApiUrl(mailConfig), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        smtp: {
          host: mailConfig.host,
          port: mailConfig.port,
          secure: mailConfig.secure,
          user: mailConfig.user,
          pass: mailConfig.pass,
          fromName: mailConfig.fromName || schoolName,
          fromEmail: mailConfig.fromEmail,
        },
        to: [email],
        subject: `【巡堂寄信測試】${schoolName}`,
        text: `${schoolName} 巡堂 SMTP 測試信\n時間：${new Date().toLocaleString('zh-TW')}\n若收到此信，表示寄信 API 與 SMTP 設定正常。`,
        html: `<p>${schoolName} 巡堂 SMTP 測試信</p><p>時間：${new Date().toLocaleString('zh-TW')}</p><p>若收到此信，表示寄信 API 與 SMTP 設定正常。</p>`,
      }),
    });
    const { json, parseError } = await readPatrolNotifyResponse(res);
    if (parseError) {
      return { ok: false, sent: 0, failed: [{ email, error: parseError }], skippedNoEmail: 0, error: parseError };
    }
    if (!res.ok) {
      const err = json.error || json.message || `HTTP ${res.status}`;
      return { ok: false, sent: 0, failed: [{ email, error: err }], skippedNoEmail: 0, error: err };
    }
    return { ...json, skippedNoEmail: 0 };
  } catch (err) {
    const msg = err instanceof Error ? err.message : '寄信失敗';
    const onPages =
      typeof window !== 'undefined' && /github\.io$/i.test(window.location.hostname);
    const hint = /Failed to fetch|NetworkError|Load failed/i.test(msg)
      ? onPages
        ? `${msg}（目前在 GitHub Pages，無法寄信。請改開校內 http://IP:3000）`
        : `${msg}（請確認校內已執行 npm start，且寄信 API 根網址留空或填正確 https 位址）`
      : msg;
    return { ok: false, sent: 0, failed: [{ email, error: hint }], skippedNoEmail: 0, error: hint };
  }
}
