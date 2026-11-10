import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, CloudOff, RefreshCw, Trash2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { ClassLogEntry } from '../../types';
import { dateToIsoLocal } from '../../utils/holidays';
import { dateToDayOfWeek } from '../../utils/leaveDates';
import {
  canDeleteClassLogEntry,
  classLogEntryId,
  ClassLogSlot,
  findConsecutiveClassLogSlots,
  listClassLogSlotsForTeacher,
  resolveClassLogDisplayEntry,
} from '../../utils/classLogSlots';
import { useClassLogs } from '../../utils/classLogSync';
import { ModalShell } from '../Common/ModalShell';
import {
  ElectronicStamp,
  STAMP_REMARK_COL_PREVIEW_PX,
  stampDisplayWidthPx,
} from '../Common/ElectronicStamp';

const DAY_LABELS = ['', '一', '二', '三', '四', '五'] as const;
const STAMP_CAPTION = '教師';

type DraftState = {
  slot: ClassLogSlot;
  progress: string;
  note: string;
  existing?: ClassLogEntry;
  /** 同班同科目連續節一併寫入 */
  applyConsecutive: boolean;
  consecutiveSlots: ClassLogSlot[];
};

export const ClassLogMain: React.FC = () => {
  const { sessions, requests, currentTeacher } = useApp();
  const { entries, pendingCount, loading, error, cloudReady, saveEntry, deleteEntry, refresh } =
    useClassLogs();
  const [date, setDate] = useState(() => dateToIsoLocal(new Date()));
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    void refresh(date, date);
  }, [date, refresh]);

  const slots = useMemo(() => {
    if (!currentTeacher) return [];
    return listClassLogSlotsForTeacher({
      teacherId: currentTeacher.id,
      isoDate: date,
      sessions,
      requests,
    });
  }, [currentTeacher, date, sessions, requests]);

  const entriesById = useMemo(() => {
    const map = new Map<string, ClassLogEntry>();
    for (const e of entries) {
      if (e.date === date) map.set(e.id, e);
    }
    return map;
  }, [entries, date]);

  const filledCount = slots.filter((s) =>
    resolveClassLogDisplayEntry({ slot: s, date, slots, entriesById })
  ).length;

  const openSlot = (slot: ClassLogSlot) => {
    const id = classLogEntryId({ date, period: slot.period, sessionId: slot.sessionId });
    const existing = entriesById.get(id);
    const display =
      existing ||
      resolveClassLogDisplayEntry({ slot, date, slots, entriesById });
    const consecutiveSlots = findConsecutiveClassLogSlots(slots, slot);
    setFormError('');
    setConfirmDeleteId(null);
    setDraft({
      slot,
      progress: display?.progress || '',
      note: display?.note || '',
      existing,
      applyConsecutive: consecutiveSlots.length > 1,
      consecutiveSlots,
    });
  };

  const handleSave = () => {
    if (!draft || !currentTeacher) return;
    const progress = draft.progress.trim();
    if (!progress) {
      setFormError('請填寫教學進度');
      return;
    }
    const now = new Date().toISOString();
    const dow = dateToDayOfWeek(date) ?? draft.slot.dayOfWeek;
    const note = draft.note.trim() || undefined;
    const targets =
      draft.applyConsecutive && draft.consecutiveSlots.length > 1
        ? draft.consecutiveSlots
        : [draft.slot];

    for (const target of targets) {
      const id = classLogEntryId({
        date,
        period: target.period,
        sessionId: target.sessionId,
      });
      const prev = entriesById.get(id);
      const entry: ClassLogEntry = {
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
        note,
        stampedAt: now,
        stampCaption: STAMP_CAPTION,
        createdAt: prev?.createdAt || now,
        updatedAt: now,
      };
      saveEntry(entry);
    }
    setDraft(null);
    setFormError('');
  };

  const handleDelete = (entry: ClassLogEntry) => {
    if (!canDeleteClassLogEntry(entry, currentTeacher?.id)) return;
    if (confirmDeleteId !== entry.id) {
      setConfirmDeleteId(entry.id);
      return;
    }
    deleteEntry(entry);
    setConfirmDeleteId(null);
    setDraft(null);
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
          應填 <span className="font-bold text-slate-900">{slots.length}</span> 節 · 已填{' '}
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
      {error && (
        <p className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
          {error}
        </p>
      )}

      {slots.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl px-4 py-10 text-center text-sm text-slate-500">
          {dateToDayOfWeek(date) == null
            ? '週末無課表課堂，無需填寫教室日誌。'
            : '本日沒有您的授課或核准代課課堂。'}
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
            const mirrored = Boolean(display && !own);
            return (
              <button
                key={id}
                type="button"
                onClick={() => openSlot(slot)}
                className="w-full text-left bg-white border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/40 rounded-2xl px-4 py-3 transition"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 text-sm font-extrabold text-slate-900">
                        <BookOpen className="w-4 h-4 text-indigo-500" />
                        第{slot.period}節 · {slot.className} · {slot.subjectName}
                      </span>
                      {slot.isSubstituteFill && (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900">
                          代課（原：{slot.originalTeacherName}）
                        </span>
                      )}
                      {own ? (
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
                      )}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      星期{DAY_LABELS[slot.dayOfWeek] || '—'} · {slot.venueName || '未指定場地'}
                    </p>
                    {display && (
                      <p className="mt-1.5 text-sm text-slate-800 line-clamp-2">
                        {display.progress}
                      </p>
                    )}
                  </div>
                  {display && (
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
            );
          })}
        </div>
      )}

      {draft && (
        <ModalShell
          panelClassName="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg"
          scroll="body"
        >
          <div className="px-5 pt-5 pb-3 border-b border-slate-100">
            <h3 className="text-base font-extrabold text-slate-900">教室日誌</h3>
            <p className="mt-1 text-xs text-slate-600">
              {date} 第{draft.slot.period}節 · {draft.slot.className} · {draft.slot.subjectName}
              {draft.slot.isSubstituteFill && (
                <span className="ml-1 text-amber-800">
                  （代課，原任課：{draft.slot.originalTeacherName}）
                </span>
              )}
            </p>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            <label className="block text-[11px] font-semibold text-slate-600">
              教學進度（必填）
              <textarea
                value={draft.progress}
                onChange={(e) => {
                  setDraft({ ...draft, progress: e.target.value });
                  setFormError('');
                }}
                rows={4}
                placeholder="例：完成第三章第 2 節習題講解"
                className="mt-1 w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900"
              />
            </label>
            <label className="block text-[11px] font-semibold text-slate-600">
              備註（選填）
              <textarea
                value={draft.note}
                onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                rows={2}
                className="mt-1 w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-sm text-slate-900"
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
                    ? '：送出後各節皆寫入相同進度與截章'
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
                  size={stampDisplayWidthPx(STAMP_REMARK_COL_PREVIEW_PX)}
                />
              </div>
            </div>
            {formError && <p className="text-xs text-rose-700">{formError}</p>}
          </div>
          <div className="px-5 py-4 border-t border-slate-100 flex flex-wrap items-center gap-2">
            {draft.existing && canDeleteClassLogEntry(draft.existing, currentTeacher.id) && (
              <button
                type="button"
                onClick={() => handleDelete(draft.existing!)}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-rose-300 text-xs font-bold text-rose-700 hover:bg-rose-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {confirmDeleteId === draft.existing.id ? '再按一次確認刪除' : '刪除'}
              </button>
            )}
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setDraft(null);
                  setConfirmDeleteId(null);
                }}
                className="px-3 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-500"
              >
                {draft.existing ? '更新並截章' : '送出並截章'}
              </button>
            </div>
          </div>
        </ModalShell>
      )}
    </div>
  );
};
