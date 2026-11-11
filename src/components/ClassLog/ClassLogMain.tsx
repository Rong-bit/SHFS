import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRightLeft, BookOpen, CloudOff, RefreshCw, Trash2, Undo2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { ClassLogEntry, ClassLogTransfer } from '../../types';
import { dateToIsoLocal } from '../../utils/holidays';
import { dateToDayOfWeek } from '../../utils/leaveDates';
import {
  canDeleteClassLogEntry,
  classLogEntryId,
  ClassLogSlot,
  findConsecutiveClassLogSlots,
  listClassLogSlotsForTeacher,
  resolveClassLogDisplayEntry,
  shouldDefaultApplyConsecutive,
} from '../../utils/classLogSlots';
import { useClassLogs } from '../../utils/classLogSync';
import { useClassLogTransfers } from '../../utils/classLogTransferSync';
import { ClassLogTransferDialog } from './ClassLogTransferDialog';
import { ModalShell } from '../Common/ModalShell';
import { ElectronicStamp, stampDisplayWidthPx } from '../Common/ElectronicStamp';

const DAY_LABELS = ['', '一', '二', '三', '四', '五'] as const;
const STAMP_CAPTION = '教師';

type DraftState = {
  slot: ClassLogSlot;
  progress: string;
  assessment: string;
  note: string;
  existing?: ClassLogEntry;
  /** 同班同科目連續節一併寫入 */
  applyConsecutive: boolean;
  consecutiveSlots: ClassLogSlot[];
};

const sameLogBody = (a: ClassLogEntry, b: ClassLogEntry) =>
  (a.progress || '') === (b.progress || '') &&
  (a.note || '') === (b.note || '') &&
  (a.assessment || '') === (b.assessment || '');

export const ClassLogMain: React.FC = () => {
  const { sessions, requests, currentTeacher, teachers } = useApp();
  const {
    entries,
    pendingCount,
    loading,
    error,
    cloudReady,
    saveEntries,
    deleteEntries,
    refresh,
  } = useClassLogs();
  const {
    transfers,
    error: transferError,
    saveTransfers,
    deleteTransfers,
    refresh: refreshTransfers,
  } = useClassLogTransfers();
  const [date, setDate] = useState(() => dateToIsoLocal(new Date()));
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [transferSlot, setTransferSlot] = useState<ClassLogSlot | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmRecallId, setConfirmRecallId] = useState<string | null>(null);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void refresh(date, date);
    void refreshTransfers(date, date);
  }, [date, refresh, refreshTransfers]);

  const slots = useMemo(() => {
    if (!currentTeacher) return [];
    return listClassLogSlotsForTeacher({
      teacherId: currentTeacher.id,
      isoDate: date,
      sessions,
      requests,
      transfers,
    });
  }, [currentTeacher, date, sessions, requests, transfers]);

  const fillableSlots = useMemo(() => slots.filter((s) => !s.transferredOut), [slots]);

  const entriesById = useMemo(() => {
    const map = new Map<string, ClassLogEntry>();
    for (const e of entries) {
      if (e.date === date) map.set(e.id, e);
    }
    return map;
  }, [entries, date]);

  // 已填只計本節真實寫入，不含「同連續節內容」鏡射
  const filledCount = fillableSlots.filter((s) =>
    entriesById.has(classLogEntryId({ date, period: s.period, sessionId: s.sessionId }))
  ).length;

  const openSlot = (slot: ClassLogSlot) => {
    const id = classLogEntryId({ date, period: slot.period, sessionId: slot.sessionId });
    const existing = entriesById.get(id);
    const display =
      existing ||
      resolveClassLogDisplayEntry({ slot, date, slots, entriesById });
    if (slot.transferredOut) return;
    const consecutiveSlots = findConsecutiveClassLogSlots(fillableSlots, slot);
    const progress = display?.progress || '';
    const note = display?.note || '';
    const assessment = display?.assessment || '';
    setFormError('');
    setConfirmDeleteId(null);
    setDraft({
      slot,
      progress,
      assessment,
      note,
      existing,
      applyConsecutive: shouldDefaultApplyConsecutive({
        block: consecutiveSlots,
        center: slot,
        date,
        entriesById,
        displayProgress: progress,
        displayNote: note,
        displayAssessment: assessment,
      }),
      consecutiveSlots,
    });
  };

  const handleSave = () => {
    // 手機鍵盤收起，避免第一次點擊只關掉鍵盤、按鈕看似無反應
    if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    if (saving || !draft || !currentTeacher) return;
    const progress = draft.progress.trim();
    if (!progress) {
      setFormError('請填寫教學進度');
      return;
    }
    const now = new Date().toISOString();
    const dow = dateToDayOfWeek(date) ?? draft.slot.dayOfWeek;
    const note = draft.note.trim() || undefined;
    const assessment = draft.assessment.trim() || undefined;
    const targets =
      draft.applyConsecutive && draft.consecutiveSlots.length > 1
        ? draft.consecutiveSlots
        : [draft.slot];

    const batch: ClassLogEntry[] = targets.map((target) => {
      const id = classLogEntryId({
        date,
        period: target.period,
        sessionId: target.sessionId,
      });
      const prev = entriesById.get(id);
      return {
        id,
        date,
        period: target.period,
        dayOfWeek: dow,
        sessionId: target.sessionId,
        className: target.className,
        subjectName: target.subjectName,
        venueName: target.venueName,
        originalTeacherId: target.originalTeacherId,
        originalTeacherName: target.originalTeacherName,
        authorTeacherId: currentTeacher.id,
        authorTeacherName: currentTeacher.name,
        isSubstituteFill: target.isSubstituteFill,
        progress,
        assessment,
        note,
        stampedAt: now,
        stampCaption: STAMP_CAPTION,
        createdAt: prev?.createdAt || now,
        updatedAt: now,
      };
    });

    setSaving(true);
    try {
      saveEntries(batch);
      setDraft(null);
      setFormError('');
      setConfirmDeleteId(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '儲存失敗，請再試一次');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (entry: ClassLogEntry) => {
    if (!canDeleteClassLogEntry(entry, currentTeacher?.id)) return;
    if (confirmDeleteId !== entry.id) {
      setConfirmDeleteId(entry.id);
      return;
    }
    // 同作者連續節若內容相同一併刪，避免刪一節仍被鏡射顯示
    const centerSlot =
      draft?.slot ||
      slots.find((s) => s.period === entry.period && s.sessionId === entry.sessionId);
    const block = centerSlot
      ? findConsecutiveClassLogSlots(fillableSlots, centerSlot)
      : [];
    const toDelete: ClassLogEntry[] = [];
    for (const s of block) {
      const id = classLogEntryId({ date, period: s.period, sessionId: s.sessionId });
      const e = entriesById.get(id);
      if (!e || e.authorTeacherId !== entry.authorTeacherId) continue;
      if (e.id === entry.id || sameLogBody(e, entry)) {
        toDelete.push(e);
      }
    }
    if (toDelete.length === 0) toDelete.push(entry);
    try {
      deleteEntries(toDelete);
      setConfirmDeleteId(null);
      setDraft(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '刪除失敗，請再試一次');
    }
  };

  const buildTransfer = (target: ClassLogSlot, toId: string, toName: string, note: string, now: string): ClassLogTransfer => ({
    id: classLogEntryId({ date, period: target.period, sessionId: target.sessionId }),
    date,
    period: target.period,
    dayOfWeek: target.dayOfWeek,
    sessionId: target.sessionId,
    className: target.className,
    subjectName: target.subjectName,
    venueName: target.venueName,
    originalTeacherId: target.originalTeacherId,
    originalTeacherName: target.originalTeacherName,
    fromTeacherId: currentTeacher?.id || '',
    fromTeacherName: currentTeacher?.name || '',
    toTeacherId: toId,
    toTeacherName: toName,
    actorId: currentTeacher?.id || '',
    actorName: currentTeacher?.name || '',
    actorKind: 'teacher',
    note: note.trim() || undefined,
    createdAt: target.transfer?.createdAt || now,
    updatedAt: now,
  });

  const handleTransfer = (toId: string, note: string, applyConsecutive: boolean) => {
    if (!transferSlot || !currentTeacher) return;
    const to = teachers.find((t) => t.id === toId);
    if (!to || to.id === currentTeacher.id) {
      setFormError('請選擇其他老師');
      return;
    }
    const block = findConsecutiveClassLogSlots(fillableSlots, transferSlot);
    const targets = applyConsecutive && block.length > 1 ? block : [transferSlot];
    const now = new Date().toISOString();
    try {
      if (targets.every((target) => target.naturalHolderId === to.id)) {
        deleteTransfers(
          targets.flatMap((target) => (target.transfer ? [target.transfer] : []))
        );
        setTransferSlot(null);
        setFormError('');
        return;
      }
      saveTransfers(targets.map((target) => buildTransfer(target, to.id, to.name, note, now)));
      setTransferSlot(null);
      setFormError('');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '轉移失敗，請再試一次');
    }
  };

  const handleRecall = (slot: ClassLogSlot) => {
    if (!slot.transfer) return;
    if (confirmRecallId !== slot.transfer.id) {
      setConfirmRecallId(slot.transfer.id);
      return;
    }
    try {
      deleteTransfers([slot.transfer]);
      setConfirmRecallId(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '收回失敗，請再試一次');
    }
  };

  if (!currentTeacher) {
    return (
      <p className="text-sm text-slate-600 bg-white border border-slate-200 rounded-2xl px-4 py-6">
        請先在右上角選擇教師身分後再填寫教室日誌。
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-wrap items-end gap-3">
        <label className="text-[11px] font-semibold text-slate-600">
          日期
          <input
            type="date"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="mt-1 block bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 text-sm"
          />
        </label>
        <div className="text-xs text-slate-600 pb-2">
          應填 <span className="font-bold text-slate-900">{fillableSlots.length}</span> 節 · 已填{' '}
          <span className="font-bold text-emerald-700">{filledCount}</span>
          {pendingCount > 0 && (
            <span className="ml-2 text-amber-700">待上傳 {pendingCount} 筆</span>
          )}
        </div>
        <div className="ml-auto flex gap-2">
          {cloudReady && (
            <button
              type="button"
              onClick={() => void refresh(date, date)}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              重新載入
            </button>
          )}
        </div>
      </div>

      {!cloudReady && (
        <p className="flex items-center gap-2 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
          <CloudOff className="w-4 h-4 shrink-0" />
          這台電腦尚未加入學校同步，日誌只存在本機；教學組看不到。
        </p>
      )}
      {(error || transferError) && (
        <p className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
          {error || transferError}
        </p>
      )}

      {slots.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl px-4 py-10 text-center text-sm text-slate-500">
          {dateToDayOfWeek(date) == null
            ? '週末無課表課堂，無需填寫教室日誌。'
            : '本日沒有您的授課、代課或轉入的課堂。'}
        </div>
      ) : (
        <div className="space-y-2">
          {slots.map((slot) => {
            const id = classLogEntryId({
              date,
              period: slot.period,
              sessionId: slot.sessionId,
            });
            const own = entriesById.get(id);
            const display = resolveClassLogDisplayEntry({
              slot,
              date,
              slots,
              entriesById,
            });
            const mirrored = Boolean(display && !own && !slot.transferredOut);
            const recallLabel = slot.transferredIn ? '退回' : '收回';
            return (
              <div
                key={id}
                className={`bg-white border rounded-2xl ${
                  slot.transferredOut ? 'border-slate-200 bg-slate-50' : 'border-slate-200'
                }`}
              >
                <button
                  type="button"
                  onClick={() => openSlot(slot)}
                  disabled={slot.transferredOut}
                  className="w-full text-left px-4 py-3 transition disabled:cursor-default enabled:hover:bg-indigo-50/40 touch-manipulation"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1 text-sm font-extrabold text-slate-900">
                          <BookOpen className="w-4 h-4 text-indigo-500" />
                          第{slot.period}節 · {slot.className} · {slot.subjectName}
                        </span>
                        {slot.isSubstituteFill && !slot.transferredIn && (
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900">
                            代課（原：{slot.originalTeacherName}）
                          </span>
                        )}
                        {slot.transferredIn && (
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-900">
                            {slot.transfer?.actorKind === 'academic' ? '教學組轉入' : '同事轉入'}
                            （{slot.transfer?.fromTeacherName}）
                          </span>
                        )}
                        {slot.transferredOut && (
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                            已轉給 {slot.holderTeacherName}
                          </span>
                        )}
                        {!slot.transferredOut &&
                          (own ? (
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                              已填
                            </span>
                          ) : mirrored ? (
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-sky-100 text-sky-800">
                              同連續節內容
                            </span>
                          ) : (
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                              未填
                            </span>
                          ))}
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        星期{DAY_LABELS[slot.dayOfWeek] || '—'} · {slot.venueName || '未指定場地'}
                      </p>
                      {slot.transfer?.note && (
                        <p className="mt-1 text-xs text-slate-500">轉移備註：{slot.transfer.note}</p>
                      )}
                      {!slot.transferredOut && display && (
                        <p className="mt-1.5 text-sm text-slate-800 line-clamp-2">{display.progress}</p>
                      )}
                      {!slot.transferredOut && display?.assessment && (
                        <p className="mt-1 text-xs text-indigo-800 line-clamp-2">
                          測驗／作業：{display.assessment}
                        </p>
                      )}
                    </div>
                    {!slot.transferredOut && display && (
                      <div className="shrink-0 flex flex-col items-center gap-1">
                        <ElectronicStamp
                          stampCaption={display.stampCaption || STAMP_CAPTION}
                          personName={display.authorTeacherName}
                          size={stampDisplayWidthPx(120)}
                        />
                        <span className="text-[10px] text-slate-500">
                          {display.stampedAt.replace('T', ' ').slice(0, 16)}
                        </span>
                      </div>
                    )}
                  </div>
                </button>
                <div className="px-4 pb-3 flex flex-wrap gap-2">
                  {!slot.transferredOut && (
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmRecallId(null);
                        setTransferSlot(slot);
                      }}
                      className="inline-flex items-center justify-center gap-1 min-h-11 px-3 rounded-lg border border-indigo-200 text-xs font-bold text-indigo-800 hover:bg-indigo-50 touch-manipulation"
                    >
                      <ArrowRightLeft className="w-3.5 h-3.5" />
                      轉給其他老師
                    </button>
                  )}
                  {slot.transfer && (slot.transferredOut || slot.transferredIn) && (
                    <button
                      type="button"
                      onClick={() => handleRecall(slot)}
                      className="inline-flex items-center justify-center gap-1 min-h-11 px-3 rounded-lg border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-100 touch-manipulation"
                    >
                      <Undo2 className="w-3.5 h-3.5" />
                      {confirmRecallId === slot.transfer.id ? `再按一次${recallLabel}` : recallLabel}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {draft && (
        <ModalShell
          panelClassName="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg"
          scroll="body"
          maxHeightClassName="max-h-[min(90dvh,920px)]"
        >
          <div className="shrink-0 px-4 sm:px-5 pt-4 sm:pt-5 pb-3 border-b border-slate-100">
            <h3 className="text-base font-extrabold text-slate-900">教室日誌</h3>
            <p className="mt-1 text-xs text-slate-600">
              {date} 第{draft.slot.period}節 · {draft.slot.className} · {draft.slot.subjectName}
              {draft.slot.isSubstituteFill && (
                <span className="ml-1 text-amber-800">
                  （代課，原任課：{draft.slot.originalTeacherName}）
                </span>
              )}
              {draft.slot.transferredIn && (
                <span className="ml-1 text-indigo-800">
                  （由{draft.slot.transfer?.fromTeacherName}轉入）
                </span>
              )}
            </p>
          </div>
          {/* min-h-0：Safari 才會讓中間區收縮，底欄「更新並截章」才點得到 */}
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-5 py-4 space-y-4">
            <label className="block text-[11px] font-semibold text-slate-600">
              教學進度（必填）
              <textarea
                value={draft.progress}
                onChange={(e) => {
                  setDraft({ ...draft, progress: e.target.value });
                  setFormError('');
                }}
                rows={3}
                placeholder="例：完成第三章第 2 節習題講解"
                className="mt-1 w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-base sm:text-sm text-slate-900"
              />
            </label>
            <label className="block text-[11px] font-semibold text-slate-600">
              測驗或作業（選填）
              <textarea
                value={draft.assessment}
                onChange={(e) => setDraft({ ...draft, assessment: e.target.value })}
                rows={3}
                placeholder="例：小考第三章；習題 1～5，下週一繳交"
                className="mt-1 w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-base sm:text-sm text-slate-900"
              />
            </label>
            <label className="block text-[11px] font-semibold text-slate-600">
              備註（選填）
              <textarea
                value={draft.note}
                onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                rows={2}
                className="mt-1 w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-base sm:text-sm text-slate-900"
              />
            </label>
            {draft.consecutiveSlots.length > 1 && (
              <label className="flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-xs text-sky-950">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={draft.applyConsecutive}
                  onChange={(e) =>
                    setDraft({ ...draft, applyConsecutive: e.target.checked })
                  }
                />
                <span>
                  一併套用至連續節次（第
                  {draft.consecutiveSlots.map((s) => s.period).join('、')}節，同班同科目）
                  {draft.applyConsecutive
                    ? '：送出後各節皆寫入相同進度、測驗或作業與截章'
                    : '：僅寫入本節'}
                </span>
              </label>
            )}
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-[11px] font-semibold text-slate-600 mb-2">送出後電子截章預覽</p>
              <div className="flex justify-center">
                <ElectronicStamp
                  stampCaption={STAMP_CAPTION}
                  personName={currentTeacher.name}
                  size={stampDisplayWidthPx(120)}
                />
              </div>
            </div>
          </div>
          <div className="relative z-20 shrink-0 px-4 sm:px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-slate-100 bg-white space-y-2">
            {formError && <p className="text-xs text-rose-700">{formError}</p>}
            <div className="flex flex-col-reverse sm:flex-row sm:flex-wrap sm:items-center gap-2">
              {draft.existing && canDeleteClassLogEntry(draft.existing, currentTeacher.id) && (
                <button
                  type="button"
                  onClick={() => handleDelete(draft.existing!)}
                  className="inline-flex items-center justify-center gap-1 min-h-11 px-3 py-2.5 rounded-lg border border-rose-300 text-xs font-bold text-rose-700 hover:bg-rose-50 touch-manipulation"
                >
                  <Trash2 className="w-3.5 h-3.5 shrink-0" />
                  {confirmDeleteId === draft.existing.id
                    ? draft.consecutiveSlots.length > 1
                      ? '再按確認刪除（含連續節）'
                      : '再按一次確認刪除'
                    : '刪除'}
                </button>
              )}
              <div className="flex gap-2 w-full sm:w-auto sm:ml-auto">
                <button
                  type="button"
                  onClick={() => {
                    setDraft(null);
                    setConfirmDeleteId(null);
                  }}
                  className="flex-1 sm:flex-none min-h-11 px-3 py-2.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 touch-manipulation"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-[2] sm:flex-none min-h-12 px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-500 active:bg-indigo-700 touch-manipulation disabled:opacity-60"
                >
                  {saving
                    ? '儲存中…'
                    : draft.existing
                      ? '更新並截章'
                      : '送出並截章'}
                </button>
              </div>
            </div>
          </div>
        </ModalShell>
      )}

      {transferSlot && (
        <ClassLogTransferDialog
          detail={`${date} 第${transferSlot.period}節 · ${transferSlot.className} · ${transferSlot.subjectName}`}
          teachers={teachers}
          excludeIds={[currentTeacher.id]}
          consecutivePeriods={findConsecutiveClassLogSlots(fillableSlots, transferSlot).map(
            (s) => s.period
          )}
          onClose={() => setTransferSlot(null)}
          onConfirm={handleTransfer}
        />
      )}
    </div>
  );
};
