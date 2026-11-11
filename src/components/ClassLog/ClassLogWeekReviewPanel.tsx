import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Mail, RefreshCw, Undo2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { ClassLogWeekDuty } from '../../utils/classLogReview';
import {
  applyClassLogWeekSignOff,
  buildClassLogReminderEmail,
  buildClassLogReturn,
  buildClassLogSignOff,
  canClassLogReview,
  classLogGapLabel,
  classLogReviewRole,
  CLASS_LOG_REVIEW_ROLE_LABEL,
  formatSchoolWeekLabel,
  groupClassLogWeekByClass,
  indexWeekReviews,
  listClassLogWeekDuties,
  listTeachersPendingClassLogStamp,
  schoolWeekOf,
  shiftSchoolWeek,
  weekStampState,
} from '../../utils/classLogReview';
import { useClassLogs } from '../../utils/classLogSync';
import { useClassLogTransfers } from '../../utils/classLogTransferSync';
import { useClassLogReturns, useClassLogWeekReviews } from '../../utils/classLogReviewSync';
import { dateToIsoLocal } from '../../utils/holidays';
import { dateToDayOfWeek } from '../../utils/leaveDates';
import { isPatrolMailConfigured, sendSchoolMail } from '../../utils/patrolMail';
import { normalizeSchoolName } from '../../utils/schoolName';
import { ElectronicStamp, stampDisplayWidthPx } from '../Common/ElectronicStamp';
import { ModalShell } from '../Common/ModalShell';

const DAY_LABELS = ['', '一', '二', '三', '四', '五'] as const;

const RETURN_PRESETS = [
  '尚未填寫教學內容，請補登並截章',
  '教學內容過短或不完整，請補寫實際進度後再送出',
];

const statusClass: Record<string, string> = {
  complete: 'bg-emerald-100 text-emerald-800',
  missing: 'bg-slate-200 text-slate-700',
  incomplete: 'bg-amber-100 text-amber-900',
  returned: 'bg-rose-100 text-rose-800',
};

export const ClassLogWeekReviewPanel: React.FC = () => {
  const { teachers, sessions, requests, currentAcademicStaff, systemConfig } = useApp();
  const { entries, refresh: refreshEntries, loading: entriesLoading } = useClassLogs();
  const { transfers, refresh: refreshTransfers } = useClassLogTransfers();
  const {
    records: reviews,
    error: reviewError,
    loading: reviewLoading,
    saveRecords: saveReviews,
    refresh: refreshReviews,
  } = useClassLogWeekReviews();
  const {
    records: returns,
    error: returnErrorSync,
    saveRecords: saveReturns,
    deleteRecords: deleteReturns,
    refresh: refreshReturns,
  } = useClassLogReturns();

  const [week, setWeek] = useState(() => schoolWeekOf(dateToIsoLocal(new Date())));
  const [onlyPending, setOnlyPending] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [returning, setReturning] = useState<ClassLogWeekDuty | null>(null);
  const [reason, setReason] = useState('');
  const [returnError, setReturnError] = useState('');
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [mailNote, setMailNote] = useState('');
  const [sending, setSending] = useState(false);

  const { weekStart, weekEnd } = week;
  const role = classLogReviewRole(currentAcademicStaff);
  const canReview = canClassLogReview(currentAcademicStaff);
  const mailReady = isPatrolMailConfigured(systemConfig.patrolMailConfig);

  useEffect(() => {
    void refreshEntries(weekStart, weekEnd);
    void refreshTransfers(weekStart, weekEnd);
    void refreshReviews(weekStart, weekEnd);
    void refreshReturns(weekStart, weekEnd);
  }, [
    weekStart,
    weekEnd,
    refreshEntries,
    refreshTransfers,
    refreshReviews,
    refreshReturns,
  ]);

  const rows = useMemo(
    () =>
      listClassLogWeekDuties({
        weekStart,
        weekEnd,
        sessions,
        requests,
        transfers,
        entries,
        returns,
      }),
    [weekStart, weekEnd, sessions, requests, transfers, entries, returns]
  );
  const classes = useMemo(() => groupClassLogWeekByClass(rows), [rows]);
  const pendingTeachers = useMemo(
    () => listTeachersPendingClassLogStamp(rows, teachers),
    [rows, teachers]
  );
  const reviewMap = useMemo(
    () => indexWeekReviews(reviews, weekStart),
    [reviews, weekStart]
  );
  const pendingKey = pendingTeachers.map((t) => t.teacherId).join('|');

  useEffect(() => {
    setSelectedIds(pendingTeachers.map((t) => t.teacherId));
    // 週次或未完成名單變了就重選，避免寄到上一週的人
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingKey, weekStart]);

  const visibleClasses = onlyPending
    ? classes.filter((c) => c.pendingCount > 0)
    : classes;

  const reload = () => {
    void refreshEntries(weekStart, weekEnd);
    void refreshTransfers(weekStart, weekEnd);
    void refreshReviews(weekStart, weekEnd);
    void refreshReturns(weekStart, weekEnd);
  };

  const stampClass = (className: string) => {
    if (!currentAcademicStaff || !role) return;
    const now = new Date().toISOString();
    const signOff = buildClassLogSignOff(currentAcademicStaff, role, now);
    const next = applyClassLogWeekSignOff(reviewMap.get(className), signOff, {
      weekStart,
      weekEnd,
      className,
      now,
    });
    try {
      saveReviews([next]);
      setActionError('');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '核章失敗，請再試一次');
    }
  };

  const stampReadyClasses = () => {
    if (!currentAcademicStaff || !role) return;
    const now = new Date().toISOString();
    const targets = visibleClasses.filter((c) => {
      if (c.pendingCount > 0) return false;
      const state = weekStampState(reviewMap.get(c.className));
      return role === 'teaching_leader' ? !state.leader : !state.dean;
    });
    if (targets.length === 0) return;
    const signOff = buildClassLogSignOff(currentAcademicStaff, role, now);
    const next = targets.map((c) =>
      applyClassLogWeekSignOff(reviewMap.get(c.className), signOff, {
        weekStart,
        weekEnd,
        className: c.className,
        now,
      })
    );
    try {
      saveReviews(next);
      setActionError('');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '核章失敗，請再試一次');
    }
  };

  const openReturn = (row: ClassLogWeekDuty) => {
    const preset =
      row.status === 'missing'
        ? RETURN_PRESETS[0]
        : row.status === 'incomplete'
          ? RETURN_PRESETS[1]
          : row.returned?.reason || '';
    setReason(preset);
    setReturnError('');
    setReturning(row);
  };

  const submitReturn = () => {
    if (!returning || !currentAcademicStaff || !role) return;
    const text = reason.trim();
    if (!text) {
      setReturnError('請填寫退回原因');
      return;
    }
    const now = new Date().toISOString();
    const record = buildClassLogReturn({
      row: returning,
      reason: text,
      staff: currentAcademicStaff,
      role,
      now,
      previous: returning.returned,
    });
    try {
      saveReturns([record]);
      setReturning(null);
      setActionError('');
    } catch (err) {
      setReturnError(err instanceof Error ? err.message : '退回失敗，請再試一次');
    }
  };

  const cancelReturn = (row: ClassLogWeekDuty) => {
    if (!row.returned) return;
    if (confirmCancelId !== row.returned.id) {
      setConfirmCancelId(row.returned.id);
      return;
    }
    try {
      deleteReturns([row.returned]);
      setConfirmCancelId(null);
      setActionError('');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : '取消退回失敗，請再試一次');
    }
  };

  const sendReminders = async () => {
    if (!mailReady || sending) return;
    const targets = pendingTeachers.filter((t) => selectedIds.includes(t.teacherId));
    if (targets.length === 0) {
      setMailNote('請先勾選要通知的老師');
      return;
    }
    const schoolName = normalizeSchoolName(systemConfig.schoolName);
    const mailConfig = systemConfig.patrolMailConfig;
    if (!mailConfig) return;
    setSending(true);
    setMailNote('');
    let sent = 0;
    let failed = 0;
    let skipped = 0;
    const errors: string[] = [];
    for (const teacher of targets) {
      if (!teacher.email.includes('@')) {
        skipped += 1;
        continue;
      }
      const body = buildClassLogReminderEmail({
        schoolName,
        weekStart,
        weekEnd,
        teacherName: teacher.teacherName,
        gaps: teacher.gaps,
      });
      const result = await sendSchoolMail({
        mailConfig,
        to: [teacher.email],
        subject: body.subject,
        text: body.text,
        html: body.html,
        schoolName,
      });
      sent += result.sent;
      if (!result.ok) {
        failed += 1;
        if (result.error) errors.push(`${teacher.teacherName}：${result.error}`);
      }
    }
    setSending(false);
    const parts = [`已寄出 ${sent} 封`];
    if (skipped) parts.push(`${skipped} 位沒有信箱`);
    if (failed) parts.push(`${failed} 位失敗`);
    setMailNote(`${parts.join('，')}。${errors[0] || ''}`);
  };

  const myLabel = role ? CLASS_LOG_REVIEW_ROLE_LABEL[role] : '';
  const readyToBatch = visibleClasses.filter((c) => {
    if (c.pendingCount > 0 || !role) return false;
    const state = weekStampState(reviewMap.get(c.className));
    return role === 'teaching_leader' ? !state.leader : !state.dean;
  }).length;

  return (
    <section id="class-log-week-review" className="bg-white border border-slate-200 rounded-2xl p-4 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-extrabold text-slate-900">本週班級彙整核章</h3>
          <p className="mt-1 text-xs text-slate-500 max-w-2xl">
            以班級彙整週一至週五的教室日誌。教學組長與教務主任可各自核章；內容未填或寫得不完整時，兩種身分都可以退回。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-label="上一週"
            onClick={() => setWeek(shiftSchoolWeek(weekStart, -1))}
            className="inline-flex items-center justify-center min-h-11 min-w-11 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <label className="text-[11px] font-semibold text-slate-600">
            週次
            <input
              type="date"
              aria-label="選擇週次"
              value={weekStart}
              onChange={(e) => e.target.value && setWeek(schoolWeekOf(e.target.value))}
              className="mt-1 block bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 text-sm"
            />
          </label>
          <button
            type="button"
            aria-label="下一週"
            onClick={() => setWeek(shiftSchoolWeek(weekStart, 1))}
            className="inline-flex items-center justify-center min-h-11 min-w-11 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={reload}
            className="inline-flex items-center gap-1 min-h-11 px-3 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${entriesLoading || reviewLoading ? 'animate-spin' : ''}`} />
            重新載入
          </button>
        </div>
      </div>

      <p className="text-sm font-bold text-slate-800">
        {formatSchoolWeekLabel(weekStart, weekEnd)}
        <span className="ml-2 text-xs font-semibold text-slate-500">
          {classes.length} 班 · 未完成 {pendingTeachers.length} 位老師
        </span>
      </p>

      {!canReview && (
        <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
          目前身分只能查看彙整。核章、退回與寄通知請改以教學組長或教務主任登入。
        </p>
      )}
      {(reviewError || returnErrorSync || actionError) && (
        <p className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
          {[reviewError, returnErrorSync, actionError].filter(Boolean).join(' ')}
        </p>
      )}

      <div id="class-log-pending-teachers" className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h4 className="text-sm font-extrabold text-slate-900">尚未完成核章的老師</h4>
            <p className="mt-1 text-xs text-slate-500">
              含本週未填寫、內容不完整，或已被退回、尚未改寫重送的應填老師。
            </p>
          </div>
          <label className="flex items-center gap-1.5 text-xs text-slate-700">
            <input
              id="class-log-only-pending"
              type="checkbox"
              checked={onlyPending}
              onChange={(e) => setOnlyPending(e.target.checked)}
            />
            班級彙整只看這些老師的課
          </label>
        </div>
        {pendingTeachers.length === 0 ? (
          <p className="text-sm text-slate-500">本週應填課堂都已完成。</p>
        ) : (
          <ul className="space-y-2">
            {pendingTeachers.map((teacher) => (
              <li key={teacher.teacherId} className="bg-white rounded-lg border border-slate-200 px-3 py-2">
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={selectedIds.includes(teacher.teacherId)}
                    onChange={(e) =>
                      setSelectedIds((prev) =>
                        e.target.checked
                          ? [...prev, teacher.teacherId]
                          : prev.filter((id) => id !== teacher.teacherId)
                      )
                    }
                  />
                  <span>
                    <span className="font-bold text-slate-900">{teacher.teacherName}</span>
                    <span className="ml-2 text-xs text-slate-500">
                      {teacher.gaps.length} 節
                      {teacher.email ? ` · ${teacher.email}` : ' · 名冊沒有信箱'}
                    </span>
                    <span className="block text-xs text-slate-600 mt-0.5">
                      {teacher.gaps
                        .slice(0, 3)
                        .map(
                          (g) =>
                            `${g.date.slice(5)} 第${g.duty.slot.period}節 ${g.duty.slot.className}（${classLogGapLabel(g.status)}）`
                        )
                        .join('、')}
                      {teacher.gaps.length > 3 ? ` 等 ${teacher.gaps.length} 節` : ''}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            id="class-log-send-reminder"
            disabled={!canReview || !mailReady || sending || pendingTeachers.length === 0}
            onClick={() => void sendReminders()}
            className="inline-flex items-center gap-1 min-h-11 px-3 rounded-lg bg-indigo-700 text-white text-xs font-bold hover:bg-indigo-600 disabled:opacity-50"
          >
            <Mail className="w-3.5 h-3.5" />
            {sending ? '寄送中…' : '寄通知給勾選的老師'}
          </button>
          {!mailReady && (
            <span className="text-xs text-slate-500">尚未啟用巡堂寄信 SMTP，無法寄通知。</span>
          )}
          {mailNote && <span className="text-xs text-slate-700">{mailNote}</span>}
        </div>
      </div>

      {canReview && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            id="class-log-batch-stamp"
            disabled={readyToBatch === 0}
            onClick={stampReadyClasses}
            className="inline-flex items-center min-h-11 px-3 rounded-lg bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 disabled:opacity-50"
          >
            以{myLabel}一次核章（已填齊 {readyToBatch} 班）
          </button>
          <span className="text-xs text-slate-500">還有缺漏的班級請逐班核章，或先退回。</span>
        </div>
      )}

      {visibleClasses.length === 0 ? (
        <p className="text-sm text-slate-500">
          {classes.length === 0 ? '這一週沒有課表課堂。' : '目前篩選沒有未完成的班級。'}
        </p>
      ) : (
        <div className="space-y-3">
          {visibleClasses.map((klass) => {
            const review = reviewMap.get(klass.className);
            const stamps = weekStampState(review);
            const shown = onlyPending
              ? klass.rows.filter((r) => r.status !== 'complete')
              : klass.rows;
            const mineStamped =
              role === 'teaching_leader' ? Boolean(stamps.leader) : role === 'academic_dean' ? Boolean(stamps.dean) : false;
            return (
              <details key={klass.className} className="rounded-xl border border-slate-200">
                <summary className="cursor-pointer px-3 py-3 text-sm font-bold text-slate-900">
                  {klass.className}
                  <span className="ml-2 text-xs font-semibold text-slate-500">
                    已完成 {klass.rows.length - klass.pendingCount}/{klass.rows.length}
                    {' · '}
                    教學組長{stamps.leader ? '已核' : '未核'}
                    {' · '}
                    教務主任{stamps.dean ? '已核' : '未核'}
                  </span>
                </summary>
                <div className="px-3 pb-3 space-y-3">
                  <div className="flex flex-wrap items-end gap-4">
                    <StampBox
                      label="教學組長"
                      signOff={stamps.leader}
                      canStamp={role === 'teaching_leader'}
                      stamped={Boolean(stamps.leader)}
                      onStamp={() => stampClass(klass.className)}
                    />
                    <StampBox
                      label="教務主任"
                      signOff={stamps.dean}
                      canStamp={role === 'academic_dean'}
                      stamped={Boolean(stamps.dean)}
                      onStamp={() => stampClass(klass.className)}
                    />
                    {canReview && mineStamped && (
                      <button
                        type="button"
                        onClick={() => stampClass(klass.className)}
                        className="text-xs font-bold text-slate-600 underline min-h-11"
                      >
                        更新我的核章時間
                      </button>
                    )}
                  </div>
                  <ul className="divide-y divide-slate-100 border border-slate-100 rounded-xl">
                    {shown.map((row) => {
                      const dow = dateToDayOfWeek(row.date);
                      const returnId = row.returned?.id;
                      return (
                        <li
                          key={`${row.date}-${row.duty.slot.period}-${row.duty.slot.sessionId}`}
                          className="px-3 py-3 flex flex-col sm:flex-row sm:items-start gap-2"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-bold text-slate-900">
                              {row.date.slice(5)}
                              {dow ? `（${DAY_LABELS[dow]}）` : ''} 第{row.duty.slot.period}節 ·{' '}
                              {row.duty.slot.subjectName}
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5">
                              應填 {row.duty.holderTeacherName}
                              {row.entry ? ` · 填寫 ${row.entry.authorTeacherName}` : ''}
                            </div>
                            {row.entry?.progress && (
                              <p className="mt-1 text-sm text-slate-800 whitespace-pre-wrap">
                                {row.entry.progress}
                              </p>
                            )}
                            {row.status === 'returned' && row.returned && (
                              <p className="mt-1 text-xs text-rose-800">
                                {CLASS_LOG_REVIEW_ROLE_LABEL[row.returned.actorRole]}{' '}
                                {row.returned.actorName} 退回：{row.returned.reason}
                              </p>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${statusClass[row.status]}`}
                            >
                              {classLogGapLabel(row.status)}
                            </span>
                            {canReview && (
                              <button
                                type="button"
                                onClick={() => openReturn(row)}
                                className="inline-flex items-center justify-center min-h-11 px-3 rounded-lg border border-rose-200 text-xs font-bold text-rose-800 hover:bg-rose-50"
                              >
                                {row.returned ? '修改退回' : '退回'}
                              </button>
                            )}
                            {canReview && row.returned && (
                              <button
                                type="button"
                                onClick={() => cancelReturn(row)}
                                className="inline-flex items-center justify-center gap-1 min-h-11 px-3 rounded-lg border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50"
                              >
                                <Undo2 className="w-3.5 h-3.5" />
                                {confirmCancelId === returnId ? '再按一次取消退回' : '取消退回'}
                              </button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </details>
            );
          })}
        </div>
      )}

      {returning && (
        <ModalShell
          panelClassName="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg"
          scroll="body"
        >
          <div className="shrink-0 px-4 sm:px-5 pt-4 pb-3 border-b border-slate-100">
            <h3 className="text-base font-extrabold text-slate-900">退回教學內容</h3>
            <p className="mt-1 text-xs text-slate-500">
              {returning.date} 第{returning.duty.slot.period}節 · {returning.duty.slot.className} ·{' '}
              {returning.duty.slot.subjectName}（{returning.duty.holderTeacherName}）
            </p>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-5 py-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              {RETURN_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setReason(preset)}
                  className="text-xs font-semibold px-2.5 py-1.5 rounded-full border border-slate-300 text-slate-700 hover:bg-slate-50"
                >
                  {preset}
                </button>
              ))}
            </div>
            <label className="block text-[11px] font-semibold text-slate-600">
              退回原因
              <textarea
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  setReturnError('');
                }}
                rows={3}
                className="mt-1 w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-base sm:text-sm"
              />
            </label>
            {returnError && <p className="text-xs text-rose-700">{returnError}</p>}
          </div>
          <div className="shrink-0 px-4 sm:px-5 py-3 border-t border-slate-100 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setReturning(null)}
              className="min-h-11 px-3 rounded-lg border border-slate-300 text-xs font-bold text-slate-700"
            >
              取消
            </button>
            <button
              type="button"
              onClick={submitReturn}
              className="min-h-11 px-3 rounded-lg bg-rose-700 text-white text-xs font-bold"
            >
              確認退回
            </button>
          </div>
        </ModalShell>
      )}
    </section>
  );
};

const StampBox: React.FC<{
  label: string;
  signOff?: { stampCaption: string; personName: string; stampedAt: string };
  canStamp: boolean;
  stamped: boolean;
  onStamp: () => void;
}> = ({ label, signOff, canStamp, stamped, onStamp }) => (
  <div className="flex flex-col items-center gap-1 min-w-[8.5rem]">
    <div className="text-[11px] font-bold text-slate-500">{label}</div>
    {signOff ? (
      <>
        <ElectronicStamp
          stampCaption={signOff.stampCaption}
          personName={signOff.personName}
          size={stampDisplayWidthPx(120)}
        />
        <span className="text-[10px] text-slate-500">
          {signOff.stampedAt.replace('T', ' ').slice(0, 16)}
        </span>
      </>
    ) : canStamp ? (
      <button
        type="button"
        onClick={onStamp}
        className="min-h-11 px-3 rounded-lg border border-slate-900 text-xs font-bold text-slate-900 hover:bg-slate-50"
      >
        {stamped ? '重新核章' : `以${label}核章`}
      </button>
    ) : (
      <span className="text-xs text-slate-400 py-2">尚未核章</span>
    )}
  </div>
);
