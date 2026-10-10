import { PatrolKind, PatrolMailConfig, PatrolReviewCase, PatrolReviewRole } from '../types';
import {
  PATROL_REVIEW_ROLE_LABELS,
  PATROL_REVIEW_ROLE_ORDER,
} from './patrolReview';
import { patrolKindLabel } from './patrolExcel';

export function isPatrolMailConfigured(cfg?: PatrolMailConfig | null): boolean {
  if (!cfg?.enabled) return false;
  return Boolean(cfg.host && cfg.fromEmail && (cfg.user || cfg.fromEmail));
}

/** 依巡堂類型說明應通知哪些身分（固定文案，必含學務／教務主任） */
export function patrolNotifyAudienceLine(kind: PatrolKind): string {
  if (kind === 'exam') {
    return '生輔組、學務主任、教學組、教務主任、該班導師（段考不含任課老師）';
  }
  return '生輔組、學務主任、教學組、教務主任、該班導師、任課老師';
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
}): { subject: string; text: string; html: string } {
  const { reviewCase: c, schoolName, appBaseUrl } = params;
  const period = c.period ? `第${c.period}節` : '';
  const classPart = c.className || c.roomName;
  const subject = `【巡堂異常會辦】${schoolName} ${c.date} ${classPart} ${patrolKindLabel(c.kind)}`;
  const link = appBaseUrl
    ? `${appBaseUrl.replace(/\/$/, '')}/?patrolReview=${encodeURIComponent(c.id)}`
    : '';
  const audience = patrolNotifyAudienceLine(c.kind);
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
    `尋堂：${c.patrollerName}`,
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
      <p style="margin:0 0 8px"><strong>尋堂</strong> ${c.patrollerName}</p>
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

export type PatrolNotifyResult = {
  ok: boolean;
  sent: number;
  failed: { email: string; error: string }[];
  skippedNoEmail: number;
  error?: string;
};

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
  });
  try {
    const res = await fetch('/api/patrol/notify', {
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
    const json = (await res.json()) as PatrolNotifyResult & { message?: string };
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
    return {
      ok: false,
      sent: 0,
      failed: unique.map((email) => ({ email, error: msg })),
      skippedNoEmail,
      error: msg,
    };
  }
}
