import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRightLeft, CloudOff, Download, RefreshCw, Undo2 } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { ClassLogTransfer } from '../../types';
import { dateToIsoLocal } from '../../utils/holidays';
import { dateToDayOfWeek } from '../../utils/leaveDates';
import { exportClassLogEntries } from '../../utils/classLogExcel';
import {
  classLogEntryId,
  ClassLogDuty,
  findConsecutiveClassLogSlots,
  listClassLogDutiesForDate,
} from '../../utils/classLogSlots';
import { useClassLogs } from '../../utils/classLogSync';
import { useClassLogTransfers } from '../../utils/classLogTransferSync';
import { ClassLogTransferDialog } from './ClassLogTransferDialog';
import {
  ElectronicStamp,
  stampDisplayWidthPx,
} from '../Common/ElectronicStamp';

const firstOfMonth = () => {
  const d = new Date();
  return dateToIsoLocal(new Date(d.getFullYear(), d.getMonth(), 1));
};

export const ClassLogReport: React.FC = () => {
  const { teachers, sessions, requests, currentAcademicStaff } = useApp();
  const { entries, loading, error, cloudReady, refresh } = useClassLogs();
  const {
    transfers,
    error: transferError,
    saveTransfers,
    deleteTransfers,
    refresh: refreshTransfers,
  } = useClassLogTransfers();
  const [dateFrom, setDateFrom] = useState(firstOfMonth);
  const [dateTo, setDateTo] = useState(() => dateToIsoLocal(new Date()));
  const [dutyDate, setDutyDate] = useState(() => dateToIsoLocal(new Date()));
  const [teacherId, setTeacherId] = useState('all');
  const [classQuery, setClassQuery] = useState('');
  const [onlySubstitute, setOnlySubstitute] = useState(false);
  const [transferDuty, setTransferDuty] = useState<ClassLogDuty | null>(null);
  const [confirmRecallId, setConfirmRecallId] = useState<string | null>(null);

  useEffect(() => {
    if (!dateFrom || !dateTo || dateFrom > dateTo) return;
    const from = dutyDate < dateFrom ? dutyDate : dateFrom;
    const to = dutyDate > dateTo ? dutyDate : dateTo;
    void refresh(from, to);
    void refreshTransfers(from, to);
  }, [dateFrom, dateTo, dutyDate, refresh, refreshTransfers]);

  const teacherOptions = useMemo(
    () =>
      [...teachers].sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant')),
    [teachers]
  );

  const filtered = useMemo(() => {
    const q = classQuery.trim();
    return entries
      .filter((e) => e.date >= dateFrom && e.date <= dateTo)
      .filter(
        (e) =>
          teacherId === 'all' ||
          e.authorTeacherId === teacherId ||
          e.originalTeacherId === teacherId
      )
      .filter((e) => !q || e.className.includes(q) || e.subjectName.includes(q))
      .filter((e) => !onlySubstitute || e.isSubstituteFill)
      .sort(
        (a, b) =>
          b.date.localeCompare(a.date) ||
          b.period - a.period ||
          a.className.localeCompare(b.className, 'zh-Hant')
      );
  }, [entries, dateFrom, dateTo, teacherId, classQuery, onlySubstitute]);

  const substituteCount = filtered.filter((e) => e.isSubstituteFill).length;

  const duties = useMemo(() => {
    const q = classQuery.trim();
    return listClassLogDutiesForDate({
      isoDate: dutyDate,
      sessions,
      requests,
      transfers,
    }).filter(
      (d) =>
        teacherId === 'all' ||
        d.holderTeacherId === teacherId ||
        d.naturalHolderId === teacherId
    ).filter(
      (d) => !q || d.slot.className.includes(q) || d.slot.subjectName.includes(q)
    );
  }, [dutyDate, sessions, requests, transfers, teacherId, classQuery]);

  const recallDuty = (duty: ClassLogDuty) => {
    if (!duty.transfer) return;
    if (confirmRecallId !== duty.transfer.id) {
      setConfirmRecallId(duty.transfer.id);
      return;
    }
    deleteTransfers([duty.transfer]);
    setConfirmRecallId(null);
  };

  const confirmDutyTransfer = (toId: string, note: string, applyConsecutive: boolean) => {
    if (!transferDuty) return;
    const to = teachers.find((t) => t.id === toId);
    if (!to) return;
    const related = listClassLogDutiesForDate({
      isoDate: dutyDate,
      sessions,
      requests,
      transfers,
    }).filter((d) => d.naturalHolderId === transferDuty.naturalHolderId);
    const block = findConsecutiveClassLogSlots(
      related.map((d) => d.slot),
      transferDuty.slot
    );
    const targets =
      applyConsecutive && block.length > 1
        ? related.filter((d) =>
            block.some((s) => s.period === d.slot.period && s.sessionId === d.slot.sessionId)
          )
        : [transferDuty];
    const now = new Date().toISOString();
    if (targets.every((duty) => duty.naturalHolderId === to.id)) {
      deleteTransfers(targets.flatMap((duty) => (duty.transfer ? [duty.transfer] : [])));
      setTransferDuty(null);
      return;
    }
    const actorId = currentAcademicStaff?.id || 'academic';
    const actorName = currentAcademicStaff?.name || '教學組';
    const records: ClassLogTransfer[] = targets.map((duty) => ({
      id: classLogEntryId({
        date: dutyDate,
        period: duty.slot.period,
        sessionId: duty.slot.sessionId,
      }),
      date: dutyDate,
      period: duty.slot.period,
      dayOfWeek: duty.slot.dayOfWeek,
      sessionId: duty.slot.sessionId,
      className: duty.slot.className,
      subjectName: duty.slot.subjectName,
      venueName: duty.slot.venueName,
      originalTeacherId: duty.slot.originalTeacherId,
      originalTeacherName: duty.slot.originalTeacherName,
      fromTeacherId: duty.holderTeacherId,
      fromTeacherName: duty.holderTeacherName,
      toTeacherId: to.id,
      toTeacherName: to.name,
      actorId,
      actorName,
      actorKind: 'academic',
      note: note.trim() || undefined,
      createdAt: duty.transfer?.createdAt || now,
      updatedAt: now,
    }));
    saveTransfers(records);
    setTransferDuty(null);
  };

  return (
    <div className="space-y-5">
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
        <label className="text-[11px] font-semibold text-slate-600">
          教師
          <select
            value={teacherId}
            onChange={(e) => setTeacherId(e.target.value)}
            className="mt-1 block bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 text-sm min-w-[8rem]"
          >
            <option value="all">全部</option>
            {teacherOptions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[11px] font-semibold text-slate-600">
          班級／科目
          <input
            value={classQuery}
            onChange={(e) => setClassQuery(e.target.value)}
            placeholder="例：機二忠"
            className="mt-1 block w-32 bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 text-sm"
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-slate-700 pb-2">
          <input
            type="checkbox"
            checked={onlySubstitute}
            onChange={(e) => setOnlySubstitute(e.target.checked)}
          />
          只看代課填寫
        </label>
        <div className="ml-auto flex gap-2">
          {cloudReady && (
            <button
              type="button"
              onClick={() => void refresh(dateFrom, dateTo)}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              重新載入
            </button>
          )}
          <button
            type="button"
            disabled={filtered.length === 0}
            onClick={() =>
              exportClassLogEntries({
                entries: filtered,
                fileName: `教室日誌_${dateFrom}_${dateTo}.xlsx`,
              })
            }
            className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-500 disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            匯出 Excel
          </button>
        </div>
      </div>

      {!cloudReady && (
        <p className="flex items-center gap-2 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
          <CloudOff className="w-4 h-4 shrink-0" />
          這台電腦尚未加入學校同步，只看得到本機教室日誌。
        </p>
      )}
      {(error || transferError) && (
        <p className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
          {[error, transferError].filter((msg, i, arr) => msg && arr.indexOf(msg) === i).join(' ')}
        </p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <div className="text-xs text-slate-500">紀錄筆數</div>
          <div className="text-2xl font-extrabold text-slate-900">{filtered.length}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <div className="text-xs text-slate-500">代課填寫</div>
          <div className="text-2xl font-extrabold text-amber-700">{substituteCount}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <div className="text-xs text-slate-500">區間</div>
          <div className="text-sm font-bold text-slate-800 mt-1">
            {dateFrom} ～ {dateTo}
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-sm font-extrabold text-slate-900">轉移填寫責任</h3>
            <p className="mt-1 text-xs text-slate-500">
              老師請人代課、或要改由其他老師填日誌時，可把該節轉出去。對方登入後會在「教室日誌」看到這一節。
            </p>
          </div>
          <label className="text-[11px] font-semibold text-slate-600">
            上課日
            <input
              type="date"
              value={dutyDate}
              onChange={(e) => e.target.value && setDutyDate(e.target.value)}
              className="mt-1 block min-h-11 bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 text-base sm:text-sm"
            />
          </label>
        </div>
        {dateToDayOfWeek(dutyDate) == null ? (
          <p className="text-sm text-slate-500">週末沒有課表課堂。</p>
        ) : duties.length === 0 ? (
          <p className="text-sm text-slate-500">這一天沒有符合篩選的課堂。</p>
        ) : (
          <div className="max-h-[28rem] overflow-y-auto divide-y divide-slate-100 border border-slate-100 rounded-xl">
            {duties.map((duty) => {
              const moved = Boolean(duty.transfer);
              return (
                <div
                  key={`${duty.slot.period}-${duty.slot.sessionId}`}
                  className="px-3 py-3 flex flex-col sm:flex-row sm:items-center gap-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold text-slate-900">
                      第{duty.slot.period}節 · {duty.slot.className} · {duty.slot.subjectName}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      原任課 {duty.slot.originalTeacherName}
                      {duty.slot.isSubstituteFill ? ' · 已核准代課' : ''}
                      {' · '}
                      目前由 <span className="font-semibold text-slate-800">{duty.holderTeacherName}</span> 填寫
                    </div>
                    {duty.transfer?.note && (
                      <div className="text-xs text-slate-500 mt-0.5">備註：{duty.transfer.note}</div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setTransferDuty(duty)}
                      className="inline-flex items-center justify-center gap-1 min-h-11 px-3 rounded-lg border border-indigo-200 text-xs font-bold text-indigo-800 hover:bg-indigo-50 touch-manipulation"
                    >
                      <ArrowRightLeft className="w-3.5 h-3.5" />
                      {moved ? '改轉給其他人' : '轉給其他老師'}
                    </button>
                    {duty.transfer && (
                      <button
                        type="button"
                        onClick={() => recallDuty(duty)}
                        className="inline-flex items-center justify-center gap-1 min-h-11 px-3 rounded-lg border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 touch-manipulation"
                      >
                        <Undo2 className="w-3.5 h-3.5" />
                        {confirmRecallId === duty.transfer.id ? '再按一次收回' : '收回'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl px-4 py-10 text-center text-sm text-slate-500">
          此條件尚無教室日誌。
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-[11px] font-bold text-slate-600">
                <tr>
                  <th className="px-3 py-2.5">日期／節次</th>
                  <th className="px-3 py-2.5">班級／科目</th>
                  <th className="px-3 py-2.5">進度</th>
                  <th className="px-3 py-2.5">填寫者</th>
                  <th className="px-3 py-2.5">截章</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => (
                  <tr key={e.id} className="border-t border-slate-100 align-top">
                    <td className="px-3 py-3 whitespace-nowrap">
                      <div className="font-semibold text-slate-900">{e.date}</div>
                      <div className="text-xs text-slate-500">第{e.period}節</div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-semibold text-slate-900">{e.className}</div>
                      <div className="text-xs text-slate-600">{e.subjectName}</div>
                      {e.isSubstituteFill && (
                        <div className="mt-1 text-[11px] font-bold text-amber-800">
                          代課（原：{e.originalTeacherName}）
                        </div>
                      )}
                      {!e.isSubstituteFill && e.authorTeacherId !== e.originalTeacherId && (
                        <div className="mt-1 text-[11px] font-bold text-indigo-800">
                          代填（原：{e.originalTeacherName}）
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3 max-w-xs">
                      <p className="text-slate-800 whitespace-pre-wrap">{e.progress}</p>
                      {e.assessment && (
                        <p className="mt-1 text-xs text-indigo-800 whitespace-pre-wrap">
                          測驗／作業：{e.assessment}
                        </p>
                      )}
                      {e.note && (
                        <p className="mt-1 text-xs text-slate-500">備註：{e.note}</p>
                      )}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-slate-800">
                      {e.authorTeacherName}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-col items-center gap-1">
                        <ElectronicStamp
                          stampCaption={e.stampCaption || '教師'}
                          personName={e.authorTeacherName}
                          size={stampDisplayWidthPx(110)}
                        />
                        <span className="text-[10px] text-slate-500">
                          {e.stampedAt.replace('T', ' ').slice(0, 16)}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {transferDuty && (
        <ClassLogTransferDialog
          detail={`${dutyDate} 第${transferDuty.slot.period}節 · ${transferDuty.slot.className} · ${transferDuty.slot.subjectName}（目前由 ${transferDuty.holderTeacherName} 填寫）`}
          teachers={teachers}
          excludeIds={[transferDuty.holderTeacherId]}
          consecutivePeriods={findConsecutiveClassLogSlots(
            listClassLogDutiesForDate({
              isoDate: dutyDate,
              sessions,
              requests,
              transfers,
            })
              .filter((d) => d.naturalHolderId === transferDuty.naturalHolderId)
              .map((d) => d.slot),
            transferDuty.slot
          ).map((s) => s.period)}
          onClose={() => setTransferDuty(null)}
          onConfirm={confirmDutyTransfer}
        />
      )}
    </div>
  );
};
