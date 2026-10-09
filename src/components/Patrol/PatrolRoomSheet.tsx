import React, { useState } from 'react';
import { Check, Trash2, X } from 'lucide-react';
import { PatrolCheckItem, PatrolKind, PatrolRecord } from '../../types';
import { PatrolRoomOccupancy } from '../../utils/patrolSchedule';
import { ModalShell } from '../Common/ModalShell';

export type PatrolRecordDraft = Pick<PatrolRecord, 'observations' | 'checks' | 'note'>;

export const patrolRecordHasIssue = (r: Pick<PatrolRecord, 'kind' | 'observations' | 'checks'>) =>
  r.kind === 'class' ? r.observations.length > 0 : Object.values(r.checks).some((v) => v === false);

export const occupancySummary = (o: PatrolRoomOccupancy | undefined): string => {
  if (!o) return '';
  if (o.status === 'closed') return o.reason || '停課';
  if (o.here) {
    const sub =
      o.here.teacherNames.join('、') !== o.here.originalTeacherNames.join('、')
        ? `（代 ${o.here.originalTeacherNames.join('、')}）`
        : '';
    return `${o.here.className} ${o.here.subjectName}｜${o.here.teacherNames.join('、')}${sub}`;
  }
  if (o.away) return `外出：${o.away.subjectName}（${o.away.venueName || '其他場地'}）`;
  return '本節無課';
};

export const PatrolRoomSheet: React.FC<{
  kind: PatrolKind;
  period?: number;
  occupancy?: PatrolRoomOccupancy;
  roomLabel: string;
  checkItems: PatrolCheckItem[];
  observationItems: PatrolCheckItem[];
  myRecord?: PatrolRecord;
  othersRecords: PatrolRecord[];
  onSave: (draft: PatrolRecordDraft) => void;
  onDelete: (record: PatrolRecord) => void;
  onClose: () => void;
}> = ({
  kind,
  period,
  occupancy,
  roomLabel,
  checkItems,
  observationItems,
  myRecord,
  othersRecords,
  onSave,
  onDelete,
  onClose,
}) => {
  const [observations, setObservations] = useState<string[]>(myRecord?.observations ?? []);
  const [checks, setChecks] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const c of checkItems) init[c.id] = myRecord?.checks[c.id] ?? true;
    return init;
  });
  const [note, setNote] = useState(myRecord?.note ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const labelOf = (r: PatrolRecord, id: string, items: PatrolCheckItem[]) =>
    r.itemLabels?.[id] || items.find((i) => i.id === id)?.label || id;

  const toggleObservation = (id: string) =>
    setObservations((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <ModalShell panelClassName="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg">
      <div className="p-4 sm:p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-extrabold text-slate-900">{roomLabel}</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {kind === 'class' ? `課間巡堂・第${period}節` : kind === 'outdoor' ? `室外課巡查・第${period}節` : '放學巡查'}
            </p>
            {occupancy && kind !== 'after_school' && (
              <p className="text-sm text-slate-700 mt-1">{occupancySummary(occupancy)}</p>
            )}
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100" title="關閉">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {kind === 'class' ? (
          <>
            <button
              type="button"
              onClick={() => onSave({ observations: [], checks: {}, note: note.trim() })}
              className="w-full py-3.5 rounded-xl bg-emerald-600 text-white text-base font-extrabold hover:bg-emerald-500 active:scale-[0.99] flex items-center justify-center gap-2"
            >
              <Check className="w-5 h-5" />
              正常（無異狀）
            </button>
            <div>
              <p className="text-xs font-bold text-slate-600 mb-2">有狀況請勾選（可複選）：</p>
              <div className="grid grid-cols-2 gap-2">
                {observationItems.map((item) => {
                  const on = observations.includes(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => toggleObservation(item.id)}
                      className={`py-3 rounded-xl border text-sm font-bold transition ${
                        on
                          ? 'bg-rose-600 text-white border-rose-600'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-slate-600">點選切換合格／未合格：</p>
              <button
                type="button"
                onClick={() =>
                  onSave({
                    observations: [],
                    checks: Object.fromEntries(checkItems.map((c) => [c.id, true])),
                    note: note.trim(),
                  })
                }
                className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-500"
              >
                全部合格送出
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {checkItems.map((item) => {
                const ok = checks[item.id] !== false;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setChecks((prev) => ({ ...prev, [item.id]: !ok }))}
                    className={`py-3 px-3 rounded-xl border text-sm font-bold text-left flex items-center justify-between ${
                      ok
                        ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                        : 'bg-rose-600 text-white border-rose-600'
                    }`}
                  >
                    <span>{item.label}</span>
                    <span className="text-xs">{ok ? '合格' : '未合格'}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <label className="block text-xs font-bold text-slate-600">
          備註（選填）
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="例：後門未鎖已代為上鎖"
            className="mt-1 w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 text-sm font-normal"
          />
        </label>

        <div className="flex items-center justify-between gap-2">
          {myRecord ? (
            <button
              type="button"
              onClick={() => (confirmDelete ? onDelete(myRecord) : setConfirmDelete(true))}
              className={`inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold ${
                confirmDelete
                  ? 'bg-rose-600 text-white hover:bg-rose-500'
                  : 'border border-rose-200 text-rose-700 hover:bg-rose-50'
              }`}
            >
              <Trash2 className="w-3.5 h-3.5" />
              {confirmDelete ? '確定刪除？再按一次' : '刪除我的紀錄'}
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={() =>
              onSave({
                observations: kind === 'class' ? observations : [],
                checks: kind === 'class' ? {} : checks,
                note: note.trim(),
              })
            }
            className="px-5 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-slate-700"
          >
            {myRecord ? '更新紀錄' : '送出'}
          </button>
        </div>

        {othersRecords.length > 0 && (
          <div className="border-t border-slate-100 pt-3 space-y-1.5">
            <p className="text-[11px] font-bold text-slate-500">其他人的紀錄</p>
            {othersRecords.map((r) => (
              <div key={r.id} className="text-xs text-slate-600">
                <strong>{r.patrollerName}</strong>（{r.createdAt.slice(11, 16)}）：
                {r.kind === 'class'
                  ? r.observations.length === 0
                    ? '正常'
                    : r.observations.map((id) => labelOf(r, id, observationItems)).join('、')
                  : patrolRecordHasIssue(r)
                    ? `未合格：${Object.entries(r.checks)
                        .filter(([, v]) => v === false)
                        .map(([id]) => labelOf(r, id, checkItems))
                        .join('、')}`
                    : '全部合格'}
                {r.note ? `；${r.note}` : ''}
              </div>
            ))}
          </div>
        )}
      </div>
    </ModalShell>
  );
};
