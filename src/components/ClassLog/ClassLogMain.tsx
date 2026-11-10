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
  listClassLogSlotsForTeacher,
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
    entriesById.has(classLogEntryId({ date, period: s.period, sessionId: s.sessionId }))
  ).length;

  const openSlot = (slot: ClassLogSlot) => {
    const id = classLogEntryId({ date, period: slot.period, sessionId: slot.sessionId });
    const existing = entriesById.get(id);
    setFormError('');
    setConfirmDeleteId(null);
    setDraft({
      slot,
      progress: existing?.progress || '',
      note: existing?.note || '',
      existing,
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
    const id = classLogEntryId({
      date,
      period: draft.slot.period,
      sessionId: draft.slot.sessionId,
    });
    const dow = dateToDayOfWeek(date) ?? draft.slot.dayOfWeek;
    const entry: ClassLogEntry = {
      id,
      date,
      period: draft.slot.period,
      dayOfWeek: dow,
      sessionId: draft.slot.sessionId,
      className: draft.slot.className,
      subjectName: draft.slot.subjectName,
      venueName: draft.slot.venueName,
      originalTeacherId: draft.slot.originalTeacherId,
      originalTeacherName: draft.slot.originalTeacherName,
      authorTeacherId: currentTeacher.id,
      authorTeacherName: currentTeacher.name,
      isSubstituteFill: draft.slot.isSubstituteFill,
      progress,
      note: draft.note.trim() || undefined,
      stampedAt: now,
      stampCaption: STAMP_CAPTION,
      createdAt: draft.existing?.createdAt || now,
      updatedAt: now,
    };
    saveEntry(entry);
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
            const entry = entriesById.get(id);
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
                      {entry ? (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                          已填
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
                    {entry && (
                      <p className="mt-1.5 text-sm text-slate-800 line-clamp-2">
                        {entry.progress}
                      </p>
                    )}
                  </div>
                  {entry && (
                    <div className="shrink-0 flex flex-col items-center gap-1">
                      <ElectronicStamp
                        stampCaption={entry.stampCaption || STAMP_CAPTION}
                        personName={entry.authorTeacherName}
                        size={stampDisplayWidthPx(120)}
                      />
                      <span className="text-[10px] text-slate-500">
                        {entry.stampedAt.replace('T', ' ').slice(0, 16)}
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
