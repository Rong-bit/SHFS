import React, { useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, Stamp } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  PatrolReviewCase,
  PatrolReviewRole,
  PatrolSignOffAction,
} from '../../types';
import { dateToIsoLocal } from '../../utils/holidays';
import { patrolKindLabel } from '../../utils/patrolExcel';
import {
  applySignOff,
  makeSignOff,
  PATROL_REVIEW_ROLE_LABELS,
  PATROL_REVIEW_STATUS_LABELS,
  stampOfficeAndTitle,
  viewerReviewRoles,
  weekRangeContaining,
} from '../../utils/patrolReview';
import { clearPatrolReviewQueryParam } from '../../utils/patrolDeepLink';
import { usePatrolReviews } from '../../utils/patrolReviewSync';
import { ElectronicStamp } from '../Common/ElectronicStamp';

type ViewerMode = 'teacher' | 'staff' | 'admin';

export const PatrolReviewInbox: React.FC<{
  mode: ViewerMode;
  /** 深層連結指定的會辦案 id */
  focusCaseId?: string | null;
  /** 是否顯示校長每周彙整入口（由父層切換） */
  showPrincipalTools?: boolean;
}> = ({ mode, focusCaseId, showPrincipalTools }) => {
  const {
    systemConfig,
    currentTeacher,
    currentAcademicStaff,
    currentRole,
  } = useApp();
  const { cases, loading, error, cloudReady, saveCase, refresh } = usePatrolReviews();
  const week = weekRangeContaining(dateToIsoLocal(new Date()));
  const [dateFrom, setDateFrom] = useState(week.from);
  const [dateTo, setDateTo] = useState(week.to);
  const [onlyPending, setOnlyPending] = useState(true);
  const [stampingId, setStampingId] = useState<string | null>(null);
  const [stampAction, setStampAction] = useState<PatrolSignOffAction>('閱畢');
  const [stampRole, setStampRole] = useState<PatrolReviewRole | null>(null);
  const [instruction, setInstruction] = useState('');
  const wideRefreshDoneRef = useRef(false);
  const focusRangeAppliedRef = useRef(false);

  // 深層連結：若本機尚無該案，先拉近 120 日一次；找到後對齊日期區間並清掉 query
  useEffect(() => {
    if (!focusCaseId) return;
    setOnlyPending(false);
    const focused = cases.find((c) => c.id === focusCaseId);
    if (focused) {
      if (!focusRangeAppliedRef.current) {
        focusRangeAppliedRef.current = true;
        if (focused.date < dateFrom) setDateFrom(focused.date);
        if (focused.date > dateTo) setDateTo(focused.date);
        clearPatrolReviewQueryParam();
      }
      return;
    }
    if (wideRefreshDoneRef.current || !cloudReady) return;
    wideRefreshDoneRef.current = true;
    const end = dateToIsoLocal(new Date());
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 120);
    void refresh(dateToIsoLocal(startDate), end);
  }, [focusCaseId, cases, dateFrom, dateTo, refresh, cloudReady]);

  useEffect(() => {
    if (dateFrom && dateTo && dateFrom <= dateTo) void refresh(dateFrom, dateTo);
  }, [dateFrom, dateTo, refresh]);

  const viewer =
    mode === 'teacher' && currentTeacher
      ? {
          kind: 'teacher' as const,
          id: currentTeacher.id,
          name: currentTeacher.name,
        }
      : mode === 'admin'
        ? {
            kind: 'staff' as const,
            id: currentAcademicStaff?.id || 'admin',
            name: currentAcademicStaff?.name || '管理員',
            staffGroup: currentAcademicStaff?.group,
            staffTitle: currentAcademicStaff?.title,
            isAdmin: true,
          }
        : currentAcademicStaff
          ? {
              kind: 'staff' as const,
              id: currentAcademicStaff.id,
              name: currentAcademicStaff.name,
              staffGroup: currentAcademicStaff.group || (currentRole === 'principal' ? 'principal' : currentRole === 'student_affairs' ? 'student_affairs' : 'academic'),
              staffTitle: currentAcademicStaff.title,
            }
          : null;

  const filtered = useMemo(() => {
    let list = cases.filter((c) => {
      const inRange = c.date >= dateFrom && c.date <= dateTo;
      const isFocus = focusCaseId != null && c.id === focusCaseId;
      if (!inRange && !isFocus) return false;
      if (c.status === 'closed' && !isFocus) return false;
      return true;
    });
    if (onlyPending) {
      list = list.filter((c) => c.status !== 'archived' || c.id === focusCaseId);
    }
    if (viewer?.kind === 'teacher') {
      list = list.filter(
        (c) =>
          c.id === focusCaseId ||
          c.recipients.some(
            (r) =>
              r.personId === viewer.id && (r.role === 'homeroom' || r.role === 'subject_teacher')
          )
      );
    }
    return [...list].sort((a, b) => {
      if (focusCaseId) {
        if (a.id === focusCaseId) return -1;
        if (b.id === focusCaseId) return 1;
      }
      return b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt);
    });
  }, [cases, dateFrom, dateTo, onlyPending, viewer, focusCaseId]);

  const openStamp = (c: PatrolReviewCase) => {
    if (!viewer) return;
    const roles = viewerReviewRoles({ reviewCase: c, viewer });
    if (roles.length === 0) return;
    const preferred =
      (showPrincipalTools && roles.includes('principal') ? 'principal' : null) ||
      roles[0];
    setStampingId(c.id);
    setStampRole(preferred);
    setStampAction(preferred === 'principal' ? '校長核章' : '閱畢');
    setInstruction('');
  };

  const confirmStamp = () => {
    if (!viewer || !stampingId || !stampRole) return;
    const c = cases.find((x) => x.id === stampingId);
    if (!c) return;
    const signOff = makeSignOff({
      role: stampRole,
      personId: viewer.id,
      personName: viewer.name,
      action: stampAction,
      instruction: stampAction === '校長核章' ? instruction.trim() || undefined : undefined,
      schoolName: systemConfig.schoolName,
    });
    const next = applySignOff(c, signOff, {
      archive: stampAction === '校長核章',
      instruction: instruction.trim() || undefined,
    });
    saveCase(next);
    setStampingId(null);
  };

  const stampingCase = cases.find((c) => c.id === stampingId);

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-wrap items-end gap-3">
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
        <label className="inline-flex items-center gap-2 text-sm text-slate-700 pb-2">
          <input
            type="checkbox"
            checked={onlyPending}
            onChange={(e) => setOnlyPending(e.target.checked)}
          />
          只看未留存
        </label>
        <button
          type="button"
          onClick={() => {
            const w = weekRangeContaining(dateToIsoLocal(new Date()));
            setDateFrom(w.from);
            setDateTo(w.to);
          }}
          className="px-3 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          本週
        </button>
        {cloudReady && (
          <button
            type="button"
            onClick={() => void refresh(dateFrom, dateTo)}
            className="ml-auto p-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50"
            title="重新載入"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>

      {error && (
        <p className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
          {error}
        </p>
      )}

      {filtered.length === 0 ? (
        <p className="text-sm text-slate-500 bg-white border border-slate-200 rounded-2xl px-4 py-8 text-center">
          此區間沒有待會辦的巡堂異常。
        </p>
      ) : (
        <div className="space-y-3">
          {filtered.map((c) => {
            const roles = viewer ? viewerReviewRoles({ reviewCase: c, viewer }) : [];
            const canStamp = roles.length > 0 && c.status !== 'archived' && c.status !== 'closed';
            return (
              <div
                key={c.id}
                className={`bg-white border rounded-2xl p-4 ${
                  focusCaseId === c.id ? 'border-indigo-400 ring-2 ring-indigo-100' : 'border-slate-200'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-extrabold text-slate-900">
                        {c.date}
                        {c.period ? `・第${c.period}節` : ''}
                      </span>
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                        {patrolKindLabel(c.kind)}
                      </span>
                      <span
                        className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                          c.status === 'archived'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-900'
                        }`}
                      >
                        {PATROL_REVIEW_STATUS_LABELS[c.status]}
                      </span>
                      {!c.notifiedAt && (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700">
                          尚未寄出
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-700">
                      {c.building} {c.floor} {c.roomName}
                      {c.className ? `・${c.className}` : ''}
                      {c.teacherName ? `・任課 ${c.teacherName}` : ''}
                    </p>
                    <p className="text-sm text-rose-800 font-semibold">{c.issueSummary}</p>
                    <p className="text-xs text-slate-500">尋堂：{c.patrollerName}</p>
                  </div>
                  {canStamp && (
                    <button
                      type="button"
                      onClick={() => openStamp(c)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-500"
                    >
                      <Stamp className="w-3.5 h-3.5" />
                      電子戳章
                    </button>
                  )}
                </div>

                {c.signOffs.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-3 border-t border-slate-100 pt-3">
                    {c.signOffs.map((s) => (
                      <div key={`${s.role}-${s.personId}-${s.stampedAt}`} className="flex items-center gap-2">
                        <ElectronicStamp
                          {...stampOfficeAndTitle(s.role, s.action)}
                          personName={s.personName}
                          size={140}
                        />
                        <div className="text-[11px] text-slate-600">
                          <div className="font-bold text-slate-800">{s.personName}</div>
                          <div>{s.action}</div>
                          {s.instruction && <div className="text-amber-800">指示：{s.instruction}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {stampingCase && stampRole && viewer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-5 space-y-4">
            <h3 className="text-lg font-extrabold text-slate-900">電子戳章核章</h3>
            <p className="text-sm text-slate-600">
              {stampingCase.date} {stampingCase.className || stampingCase.roomName}・
              {stampingCase.issueSummary}
            </p>
            <label className="block text-[11px] font-semibold text-slate-600">
              身分角色
              <select
                value={stampRole}
                onChange={(e) => {
                  const role = e.target.value as PatrolReviewRole;
                  setStampRole(role);
                  setStampAction(role === 'principal' ? '校長核章' : stampAction === '校長核章' ? '閱畢' : stampAction);
                }}
                className="mt-1 w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 text-sm"
              >
                {viewerReviewRoles({ reviewCase: stampingCase, viewer }).map((r) => (
                  <option key={r} value={r}>
                    {PATROL_REVIEW_ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </label>
            {stampRole !== 'principal' ? (
              <div className="flex gap-2">
                {(['會畢', '閱畢'] as PatrolSignOffAction[]).map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setStampAction(a)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-bold border ${
                      stampAction === a
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white text-slate-700 border-slate-300'
                    }`}
                  >
                    已{a}
                  </button>
                ))}
              </div>
            ) : (
              <label className="block text-[11px] font-semibold text-slate-600">
                指示用語（選填）
                <textarea
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  rows={2}
                  placeholder="例：請導師加強班規宣導"
                  className="mt-1 w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 text-sm font-normal"
                />
              </label>
            )}
            <div className="flex justify-center py-2">
              <ElectronicStamp
                {...stampOfficeAndTitle(stampRole, stampRole === 'principal' ? '核章' : stampAction)}
                personName={viewer.name}
                size={200}
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setStampingId(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 text-sm font-bold text-slate-700"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmStamp}
                className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-500"
              >
                確認蓋章
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
