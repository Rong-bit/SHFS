import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Stamp } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { dateToIsoLocal } from '../../utils/holidays';
import { patrolKindLabel } from '../../utils/patrolExcel';
import {
  applySignOff,
  makeSignOff,
  PATROL_REVIEW_ROLE_LABELS,
  weekRangeContaining,
} from '../../utils/patrolReview';
import { usePatrolReviews } from '../../utils/patrolReviewSync';
import { ElectronicStamp } from '../Common/ElectronicStamp';

/** 校長每周彙整：勾選異常案、填指示、批次電子核章並留存教務處 */
export const PatrolPrincipalWeekly: React.FC = () => {
  const { systemConfig, currentAcademicStaff } = useApp();
  const { cases, loading, error, cloudReady, saveCase, refresh } = usePatrolReviews();
  const initial = weekRangeContaining(dateToIsoLocal(new Date()));
  const [dateFrom, setDateFrom] = useState(initial.from);
  const [dateTo, setDateTo] = useState(initial.to);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [instruction, setInstruction] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (dateFrom && dateTo && dateFrom <= dateTo) void refresh(dateFrom, dateTo);
  }, [dateFrom, dateTo, refresh]);

  const list = useMemo(
    () =>
      cases
        .filter(
          (c) =>
            c.date >= dateFrom &&
            c.date <= dateTo &&
            c.status !== 'closed' &&
            c.status !== 'archived'
        )
        .sort((a, b) => a.date.localeCompare(b.date) || a.roomName.localeCompare(b.roomName, 'zh-Hant')),
    [cases, dateFrom, dateTo]
  );

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === list.length) setSelected(new Set());
    else setSelected(new Set(list.map((c) => c.id)));
  };

  const applyBatch = () => {
    const personId = currentAcademicStaff?.id || 'principal';
    const personName = currentAcademicStaff?.name || '校長';
    for (const c of list) {
      if (!selected.has(c.id)) continue;
      const signOff = makeSignOff({
        role: 'principal',
        personId,
        personName,
        action: '校長核章',
        instruction: instruction.trim() || undefined,
        schoolName: systemConfig.schoolName,
      });
      saveCase(applySignOff(c, signOff, { archive: true, instruction: instruction.trim() || undefined }));
    }
    setSelected(new Set());
    setInstruction('');
    setConfirmOpen(false);
  };

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
        <p className="text-sm text-slate-600">
          每周彙整本週巡堂異常，勾選後可填寫指示用語並以校長電子戳章核章；核章後案件轉交教務處留存。
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-[11px] font-semibold text-slate-600">
            起日
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => e.target.value && setDateFrom(e.target.value)}
              className="mt-1 block bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 text-sm"
            />
          </label>
          <label className="text-[11px] font-semibold text-slate-600">
            迄日
            <input
              type="date"
              value={dateTo}
              onChange={(e) => e.target.value && setDateTo(e.target.value)}
              className="mt-1 block bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 text-sm"
            />
          </label>
          <button
            type="button"
            onClick={() => {
              const w = weekRangeContaining(dateToIsoLocal(new Date()));
              setDateFrom(w.from);
              setDateTo(w.to);
            }}
            className="px-3 py-2 rounded-lg border border-slate-300 text-xs font-semibold"
          >
            本週
          </button>
          {cloudReady && (
            <button
              type="button"
              onClick={() => void refresh(dateFrom, dateTo)}
              className="p-2 rounded-lg border border-slate-300"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
          {error}
        </p>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
          <label className="inline-flex items-center gap-2 text-sm font-bold text-slate-800">
            <input
              type="checkbox"
              checked={list.length > 0 && selected.size === list.length}
              onChange={toggleAll}
            />
            全選（{list.length} 案）
          </label>
          <button
            type="button"
            disabled={selected.size === 0}
            onClick={() => setConfirmOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold disabled:opacity-40"
          >
            <Stamp className="w-3.5 h-3.5" />
            批次校長核章（{selected.size}）
          </button>
        </div>
        {list.length === 0 ? (
          <p className="text-sm text-slate-500 px-4 py-8 text-center">本週無待校長彙整的異常會辦。</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {list.map((c) => (
              <li key={c.id} className="flex items-start gap-3 px-4 py-3">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={selected.has(c.id)}
                  onChange={() => toggle(c.id)}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-slate-900">
                    {c.date}
                    {c.period ? ` 第${c.period}節` : ''}・{patrolKindLabel(c.kind)}・
                    {c.className || c.roomName}
                  </div>
                  <div className="text-sm text-rose-800">{c.issueSummary}</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    已簽：
                    {c.signOffs.length
                      ? c.signOffs.map((s) => `${PATROL_REVIEW_ROLE_LABELS[s.role]}${s.action}`).join('、')
                      : '尚無'}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-5 space-y-4">
            <h3 className="text-lg font-extrabold">校長每周核章</h3>
            <p className="text-sm text-slate-600">將對 {selected.size} 案蓋校長核章並留存教務處。</p>
            <label className="block text-[11px] font-semibold text-slate-600">
              指示用語（選填，套用至勾選各案）
              <textarea
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                rows={3}
                className="mt-1 w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 text-sm font-normal"
                placeholder="例：請相關單位持續關懷並回報改善情形"
              />
            </label>
            <div className="flex justify-center">
              <ElectronicStamp
                officeLabel="校長室"
                titleLabel="核章"
                personName={currentAcademicStaff?.name || '校長'}
                size={200}
              />
              {/* 版面：左上處室、左下動作、右側姓名（仿實物紅框原子章） */}
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-300 text-sm font-bold"
              >
                取消
              </button>
              <button
                type="button"
                onClick={applyBatch}
                className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold"
              >
                確認蓋章留存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
