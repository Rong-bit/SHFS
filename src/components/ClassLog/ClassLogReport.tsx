import React, { useEffect, useMemo, useState } from 'react';
import { CloudOff, Download, RefreshCw } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { dateToIsoLocal } from '../../utils/holidays';
import { exportClassLogEntries } from '../../utils/classLogExcel';
import { useClassLogs } from '../../utils/classLogSync';
import {
  ElectronicStamp,
  stampDisplayWidthPx,
} from '../Common/ElectronicStamp';

const firstOfMonth = () => {
  const d = new Date();
  return dateToIsoLocal(new Date(d.getFullYear(), d.getMonth(), 1));
};

export const ClassLogReport: React.FC = () => {
  const { teachers } = useApp();
  const { entries, loading, error, cloudReady, refresh } = useClassLogs();
  const [dateFrom, setDateFrom] = useState(firstOfMonth);
  const [dateTo, setDateTo] = useState(() => dateToIsoLocal(new Date()));
  const [teacherId, setTeacherId] = useState('all');
  const [classQuery, setClassQuery] = useState('');
  const [onlySubstitute, setOnlySubstitute] = useState(false);

  useEffect(() => {
    if (dateFrom && dateTo && dateFrom <= dateTo) {
      void refresh(dateFrom, dateTo);
    }
  }, [dateFrom, dateTo, refresh]);

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
      {error && (
        <p className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
          {error}
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
                    </td>
                    <td className="px-3 py-3 max-w-xs">
                      <p className="text-slate-800 whitespace-pre-wrap">{e.progress}</p>
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
    </div>
  );
};
