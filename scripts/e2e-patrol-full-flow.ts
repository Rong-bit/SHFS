/**
 * E2E：巡堂異常 → 會辦寄信（真實打 /api/patrol/notify + 本機 SMTP）
 * → 生輔組長／學務主任／教學組長／教務主任核章 → 校長核章留存
 *
 * 前置：dev server（:3000）與 smtp-capture-server（:2525）需已啟動。
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { AcademicStaff, PatrolMailConfig, PatrolRecord, Teacher } from '../src/types';
import {
  applySignOff,
  buildPatrolReviewCase,
  makeSignOff,
  PATROL_REVIEW_ROLE_LABELS,
  resolvePatrolReviewRecipients,
  viewerReviewRoles,
} from '../src/utils/patrolReview';
import { buildPatrolNotifyEmail, isPatrolMailConfigured } from '../src/utils/patrolMail';
import { patrolRecordHasIssue } from '../src/components/Patrol/PatrolRoomSheet';

const API = process.env.PATROL_E2E_API || 'http://127.0.0.1:3000';
const MAIL_DIR = process.env.PATROL_E2E_MAIL_DIR || '/tmp/patrol-e2e-mail';
const ARTIFACT_DIR = process.env.PATROL_E2E_ARTIFACTS || '/opt/cursor/artifacts';
const SMTP_PORT = Number(process.env.PATROL_E2E_SMTP_PORT || 2525);

const teachers: Teacher[] = [
  {
    id: 't-tutor',
    name: '王導師',
    title: '導師',
    department: '電機科',
    homeroomClass: '機二忠',
    basePeriods: 12,
    weeklyActualPeriods: 12,
    email: 'tutor@e2e.test',
    phone: '',
    certifications: [],
  },
  {
    id: 't-sub',
    name: '李任課',
    title: '專任教師',
    department: '電機科',
    basePeriods: 16,
    weeklyActualPeriods: 16,
    email: 'subject@e2e.test',
    phone: '',
    certifications: [],
  },
];

const staff: AcademicStaff[] = [
  {
    id: 'sa-leader',
    name: '周生輔',
    title: '生輔組長',
    badge: '巡堂會辦',
    email: 'sa-leader@e2e.test',
    phone: '',
    responsibleScope: '',
    group: 'student_affairs',
  },
  {
    id: 'sa-dean',
    name: '鄭學務',
    title: '學務主任',
    badge: '學務會辦',
    email: 'sa-dean@e2e.test',
    phone: '',
    responsibleScope: '',
    group: 'student_affairs',
  },
  {
    id: 'ac-leader',
    name: '陳教學',
    title: '教學組長',
    badge: '教學會辦',
    email: 'ac-leader@e2e.test',
    phone: '',
    responsibleScope: '',
    group: 'academic',
  },
  {
    id: 'ac-dean',
    name: '吳教務',
    title: '教務主任',
    badge: '教務會辦',
    email: 'ac-dean@e2e.test',
    phone: '',
    responsibleScope: '',
    group: 'academic',
  },
  {
    id: 'in-leader',
    name: '林實習',
    title: '實習組長',
    badge: '實習會辦',
    email: 'in-leader@e2e.test',
    phone: '',
    responsibleScope: '',
    group: 'academic',
  },
  {
    id: 'in-dean',
    name: '黃實習主',
    title: '實習主任',
    badge: '實習會辦',
    email: 'in-dean@e2e.test',
    phone: '',
    responsibleScope: '',
    group: 'academic',
  },
  {
    id: 'prin',
    name: '張校長',
    title: '校長',
    badge: '每周彙整',
    email: 'principal@e2e.test',
    phone: '',
    responsibleScope: '',
    group: 'principal',
  },
];

const mailConfig: PatrolMailConfig = {
  enabled: true,
  host: '127.0.0.1',
  port: SMTP_PORT,
  secure: false,
  user: '',
  pass: '',
  fromName: 'E2E測試高工',
  fromEmail: 'patrol-noreply@e2e.test',
  appBaseUrl: 'http://127.0.0.1:3000',
  notifyRoles: {
    student_affairs: true,
    dean_student: true,
    academic: true,
    dean_academic: true,
    homeroom: true,
    subject_teacher: true,
    internship: true,
    dean_internship: true,
    dean_general_affairs: false,
  },
};

const record: PatrolRecord = {
  id: `e2e_${Date.now()}`,
  date: new Date().toISOString().slice(0, 10),
  kind: 'class',
  period: 3,
  roomId: 'room-e2e',
  roomName: '機二忠',
  building: '忠孝',
  floor: '3F',
  className: '機二忠',
  subjectName: '電子學',
  teacherName: '李任課',
  observations: ['phone', 'sleeping'],
  checks: {},
  itemLabels: { phone: '玩手機', sleeping: '睡覺' },
  note: 'E2E 全流程測試',
  patrollerId: 'patroller-1',
  patrollerName: '王巡堂',
  createdAt: new Date().toISOString(),
};

function readMails() {
  const p = path.join(MAIL_DIR, 'index.json');
  if (!fs.existsSync(p)) return [];
  return JSON.parse(fs.readFileSync(p, 'utf8')) as Array<{
    to: string[];
    subject: string;
    text: string;
    html: string;
  }>;
}

async function sendViaApi(reviewCase: ReturnType<typeof buildPatrolReviewCase>) {
  assert.equal(isPatrolMailConfigured(mailConfig), true);
  const body = buildPatrolNotifyEmail({
    reviewCase,
    schoolName: 'E2E測試高工',
    appBaseUrl: mailConfig.appBaseUrl,
    notifyRoles: mailConfig.notifyRoles,
  });
  const to = [...new Set(reviewCase.recipients.map((r) => r.email.trim()).filter(Boolean))];
  const res = await fetch(`${API}/api/patrol/notify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      smtp: {
        host: mailConfig.host,
        port: mailConfig.port,
        secure: mailConfig.secure,
        fromName: mailConfig.fromName,
        fromEmail: mailConfig.fromEmail,
      },
      to,
      subject: body.subject,
      text: body.text,
      html: body.html,
    }),
  });
  const json = (await res.json()) as { ok: boolean; sent: number; failed: unknown[]; error?: string };
  return { httpStatus: res.status, json, to, emailBody: body };
}

async function main() {
  fs.mkdirSync(MAIL_DIR, { recursive: true });
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  fs.writeFileSync(path.join(MAIL_DIR, 'index.json'), '[]\n');

  const health = await fetch(`${API}/api/health`).then((r) => r.json());
  assert.equal(health.status, 'ok', 'dev server 未啟動');

  assert.equal(patrolRecordHasIssue(record), true, '應判定為異常');

  let review = buildPatrolReviewCase({
    record,
    teachers,
    academicStaffList: staff,
    notifyRoles: mailConfig.notifyRoles,
  });

  const expectedRoles = [
    'student_affairs',
    'dean_student',
    'academic',
    'dean_academic',
    'internship',
    'dean_internship',
    'homeroom',
    'subject_teacher',
  ] as const;
  for (const role of expectedRoles) {
    assert.ok(
      review.recipients.some((r) => r.role === role),
      `收件應含 ${PATROL_REVIEW_ROLE_LABELS[role]}`
    );
  }
  assert.equal(
    review.recipients.some((r) => r.role === 'principal'),
    false,
    '初發會辦不含校長（校長走每周彙整核章）'
  );

  // 確認各組長／主任可取得對應核章角色
  const stampPlan: Array<{
    id: string;
    name: string;
    group: string;
    title: string;
    role: (typeof expectedRoles)[number];
    action: '會畢' | '閱畢';
  }> = [
    { id: 'sa-leader', name: '周生輔', group: 'student_affairs', title: '生輔組長', role: 'student_affairs', action: '會畢' },
    { id: 'sa-dean', name: '鄭學務', group: 'student_affairs', title: '學務主任', role: 'dean_student', action: '閱畢' },
    { id: 'ac-leader', name: '陳教學', group: 'academic', title: '教學組長', role: 'academic', action: '會畢' },
    { id: 'ac-dean', name: '吳教務', group: 'academic', title: '教務主任', role: 'dean_academic', action: '閱畢' },
    { id: 'in-leader', name: '林實習', group: 'academic', title: '實習組長', role: 'internship', action: '會畢' },
    { id: 'in-dean', name: '黃實習主', group: 'academic', title: '實習主任', role: 'dean_internship', action: '閱畢' },
  ];

  for (const p of stampPlan) {
    const roles = viewerReviewRoles({
      reviewCase: review,
      viewer: {
        kind: 'staff',
        id: p.id,
        name: p.name,
        staffGroup: p.group,
        staffTitle: p.title,
      },
    });
    assert.ok(roles.includes(p.role), `${p.title} 應可核章角色 ${p.role}，實際=${roles.join(',')}`);
  }

  const before = readMails().length;
  const send = await sendViaApi(review);
  assert.equal(send.httpStatus, 200, `寄信 HTTP 失敗：${JSON.stringify(send.json)}`);
  assert.equal(send.json.ok, true, `寄信失敗：${send.json.error || JSON.stringify(send.json)}`);
  assert.equal(send.json.sent, send.to.length, `應寄出 ${send.to.length} 封`);
  assert.ok(send.to.includes('sa-leader@e2e.test'));
  assert.ok(send.to.includes('sa-dean@e2e.test'));
  assert.ok(send.to.includes('ac-leader@e2e.test'));
  assert.ok(send.to.includes('ac-dean@e2e.test'));
  assert.ok(send.to.includes('in-leader@e2e.test'));
  assert.ok(send.to.includes('in-dean@e2e.test'));
  assert.ok(send.to.includes('tutor@e2e.test'));
  assert.ok(send.to.includes('subject@e2e.test'));
  assert.equal(send.to.includes('principal@e2e.test'), false, '初發不寄校長');

  // 等 SMTP 寫檔
  let mails = readMails();
  for (let i = 0; i < 20 && mails.length < before + send.json.sent; i++) {
    await new Promise((r) => setTimeout(r, 100));
    mails = readMails();
  }
  assert.equal(mails.length, before + send.json.sent, `SMTP 攔截數不符：${mails.length}`);

  const sample = mails[mails.length - 1];
  assert.match(sample.subject, /巡堂異常會辦/);
  assert.match(sample.text, /生輔組長|學務主任|教學組長|教務主任|實習/);
  assert.match(sample.text, /玩手機|睡覺/);

  review = {
    ...review,
    notifiedAt: new Date().toISOString(),
    status: 'open',
  };

  // 依序：組長／主任會辦核章
  const flowLog: string[] = ['1. 巡堂登錄異常（玩手機、睡覺）', '2. 建立會辦案並 SMTP 寄信'];
  flowLog.push(`   寄出 ${send.json.sent} 封 → ${send.to.join(', ')}`);

  for (const p of stampPlan) {
    const stamp = makeSignOff({
      role: p.role,
      personId: p.id,
      personName: p.name,
      action: p.action,
      schoolName: 'E2E測試高工',
    });
    review = applySignOff(review, stamp);
    flowLog.push(`3. ${p.title} ${p.name} → ${p.action}（status=${review.status}）`);
  }
  assert.equal(review.status, 'reviewed', '各組核章後應為會辦中');
  assert.equal(review.signOffs.length, stampPlan.length);

  // 校長每周彙整核章 → 教務留存
  const principalStamp = makeSignOff({
    role: 'principal',
    personId: 'prin',
    personName: '張校長',
    action: '校長核章',
    instruction: '請持續關懷該班秩序',
    schoolName: 'E2E測試高工',
  });
  review = applySignOff(review, principalStamp, {
    archive: true,
    instruction: '請持續關懷該班秩序',
  });
  flowLog.push('4. 校長張校長 → 校長核章（指示：請持續關懷該班秩序）');
  flowLog.push(`5. 最終狀態：${review.status}（教務留存）`);

  assert.equal(review.status, 'archived');
  assert.ok(review.archivedAt);
  assert.equal(review.signOffs.at(-1)?.instruction, '請持續關懷該班秩序');
  assert.ok(review.signOffs.some((s) => s.role === 'principal' && s.action === '校長核章'));

  // 寫證據
  const report = {
    ok: true,
    testedAt: new Date().toISOString(),
    api: API,
    smtpPort: SMTP_PORT,
    recordId: record.id,
    reviewId: review.id,
    recipients: review.recipients.map((r) => ({
      role: PATROL_REVIEW_ROLE_LABELS[r.role] || r.role,
      name: r.personName,
      email: r.email,
    })),
    mailSent: send.json.sent,
    mailTo: send.to,
    mailSubject: send.emailBody.subject,
    capturedMails: mails.length,
    sampleMailTextPreview: sample.text.slice(0, 800),
    signOffs: review.signOffs.map((s) => ({
      role: PATROL_REVIEW_ROLE_LABELS[s.role] || s.role,
      name: s.personName,
      action: s.action,
      instruction: s.instruction || null,
    })),
    finalStatus: review.status,
    flow: flowLog,
  };

  const reportPath = path.join(ARTIFACT_DIR, 'patrol_full_flow_e2e_report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(
    path.join(ARTIFACT_DIR, 'patrol_full_flow_email_sample.txt'),
    `${send.emailBody.subject}\n\n${sample.text || send.emailBody.text}`
  );
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'patrol_full_flow_steps.txt'), flowLog.join('\n') + '\n');
  // 複製攔截信件索引
  fs.copyFileSync(path.join(MAIL_DIR, 'index.json'), path.join(ARTIFACT_DIR, 'patrol_full_flow_captured_mails.json'));

  console.log('e2e-patrol-full-flow: ok');
  console.log(JSON.stringify({ sent: send.json.sent, finalStatus: review.status, reportPath }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
