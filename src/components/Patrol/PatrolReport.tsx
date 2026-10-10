import React, { useEffect, useMemo, useState } from 'react';
import { CloudOff, Download, RefreshCw } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { PatrolKind, PatrolRecord } from '../../types';
import { dateToIsoLocal } from '../../utils/holidays';
import { resolvePatrolCheckItems, resolvePatrolObservationItems } from '../../utils/patrolConfig';
import { exportPatrolRecords, patrolKindLabel } from '../../utils/patrolExcel';
import { usePatrolRecords } from '../../utils/patrolSync';
import { usePatrolReviews } from '../../utils/patrolReviewSync';
import { patrolRecordHasIssue } from './PatrolRoomSheet';

const REVIEW_STATUS_LABEL: Record<string, string> = {
  open: '待會辦',
  reviewed: '會辦中',
  principal_done: '校長已核',
  archived: '教務留存',
  closed: '已結案',
};

const firstOfMonth = () => {
  const d = new Date();
  return dateToIsoLocal(new Date(d.getFullYear(), d.getMonth(), 1));
};

const topEntries = (counts: Map<string, number>, limit: number) =>
  Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);

export const PatrolReport: React.FC = () => {
  const { systemConfig } = useApp();
  const { records, loading, error, cloudReady, refresh } = usePatrolRecords();
  const { cases: reviewCases, refresh: refreshReviews } = usePatrolReviews();
  const checkItems = resolvePatrolCheckItems(systemConfig);
  const observationItems = resolvePatrolObservationItems(systemConfig);
  const [dateFrom, setDateFrom] = useState(firstOfMonth);
  const [dateTo, setDateTo] = useState(() => dateToIsoLocal(new Date()));
  const [kind, setKind] = useState<'all' | PatrolKind>('all');
  const [building, setBuilding] = useState('all');
  const [classQuery, setClassQuery] = useState('');
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [onlyArchived, setOnlyArchived] = useState(false);

  useEffect(() => {
    if (dateFrom && dateTo && dateFrom <= dateTo) {
      void refresh(dateFrom, dateTo);
      void refreshReviews(dateFrom, dateTo);
    }
  }, [dateFrom, dateTo, refresh, refreshReviews]);

  const reviewByRecord = useMemo(
    () => new Map(reviewCases.map((c) => [c.recordId, c])),
    [reviewCases]
  );

  const inRange = useMemo(
    () => records.filter((r) => r.date >= dateFrom && r.date <= dateTo),
    [records, dateFrom, dateTo]
  );
  const buildings = useMemo(
    () => Array.from(new Set<string>(inRange.map((r) => r.building))).sort((a, b) => a.localeCompare(b, 'zh-Hant')),
    [inRange]
  );
  const filtered = useMemo(() => {
    const q = classQuery.trim();
    return inRange
      .filter((r) => kind === 'all' || r.kind === kind)
      .filter((r) => building === 'all' || r.building === building)
      .filter((r) => !q || (r.className || '').includes(q) || r.roomName.includes(q))
      .filter((r) => !onlyIssues || patrolRecordHasIssue(r))
      .filter((r) => {
        if (!onlyArchived) return true;
        return reviewByRecord.get(r.id)?.status === 'archived';
      })
      .sort(
        (a, b) =>
          b.date.localeCompare(a.date) ||
          (b.period ?? 0) - (a.period ?? 0) ||
          b.createdAt.localeCompare(a.createdAt)
      );
  }, [inRange, kind, building, classQuery, onlyIssues, onlyArchived, reviewByRecord]);

  const labelOf = (r: PatrolRecord, id: string) =>
    r.itemLabels?.[id] ||
    observationItems.find((i) => i.id === id)?.label ||
    checkItems.find((i) => i.id === id)?.label ||
    id;

  /** 課間：各班觀察項目次數與常見節次科目 */
  const classStats = useMemo(() => {
    const byClass = new Map<
      string,
      { total: number; issues: number; obs: Map<string, number>; slots: Map<string, number> }
    >();
    for (const r of filtered) {
      if (r.kind !== 'class' && r.kind !== 'exam') continue;
      const key = r.className || r.roomName;
      const row = byClass.get(key) || { total: 0, issues: 0, obs: new Map(), slots: new Map() };
      row.total += 1;
      if (r.observations.length > 0) {
        row.issues += 1;
        for (const id of r.observations) {
          const label = labelOf(r, id);
          row.obs.set(label, (row.obs.get(label) || 0) + 1);
        }
        const slot = `第${r.period}節${r.subjectName ? ` ${r.subjectName}` : ''}`;
        row.slots.set(slot, (row.slots.get(slot) || 0) + 1);
      }
      byClass.set(key, row);
    }
    return Array.from(byClass.entries())
      .map(([name, row]) => ({ name, ...row }))
      .sort((a, b) => b.issues - a.issues || a.name.localeCompare(b.name, 'zh-Hant'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered]);

  const obsColumns = useMemo(() => {
    const labels = new Set<string>(observationItems.map((i) => i.label));
    for (const row of classStats) row.obs.forEach((_, label) => labels.add(label));
    return Array.from(labels);
  }, [classStats, observationItems]);

  /** 室外課／放學：各檢查項目未合格次數、缺失最多的教室 */
  const checkStats = useMemo(() => {
    const byItem = new Map<string, number>();
    const byRoom = new Map<string, number>();
    let total = 0;
    for (const r of filtered) {
      if (r.kind === 'class' || r.kind === 'exam') continue;
      total += 1;
      const failed = Object.entries(r.checks).filter(([, v]) => v === false);
      if (failed.length === 0) continue;
      byRoom.set(`${r.building} ${r.roomName}`, (byRoom.get(`${r.building} ${r.roomName}`) || 0) + 1);
      for (const [id] of failed) {
        const label = labelOf(r, id);
        byItem.set(label, (byItem.get(label) || 0) + 1);
      }
    }
    return { total, byItem: topEntries(byItem, 20), byRoom: topEntries(byRoom, 10) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered]);

  const issueCount = filtered.filter((r) => patrolRecordHasIssue(r)).length;

  const describe = (r: PatrolRecord) => {
    if (r.kind === 'class' || r.kind === 'exam') {
      return r.observations.length === 0 ? '正常' : r.observations.map((id) => labelOf(r, id)).join('、');
    }
    const failed = Object.entries(r.checks).filter(([, v]) => v === false);
    return failed.length === 0 ? '全部合格' : `未合格：${failed.map(([id]) => labelOf(r, id)).join('、')}`;
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
          類型
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as 'all' | PatrolKind)}
            className="mt-1 block bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 text-sm"
          >
            <option value="all">全部</option>
            <option value="class">課間巡堂</option>
            <option value="outdoor">室外課巡查</option>
            <option value="after_school">放學巡查</option>
            <option value="exam">段考巡堂</option>
          </select>
        </label>
        <label className="text-[11px] font-semibold text-slate-600">
          大樓
          <select
            value={building}
            onChange={(e) => setBuilding(e.target.value)}
            className="mt-1 block bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 text-sm"
          >
            <option value="all">全部</option>
            {buildings.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </label>
        <label className="text-[11px] font-semibold text-slate-600">
          班級／教室
          <input
            value={classQuery}
            onChange={(e) => setClassQuery(e.target.value)}
            placeholder="例：機二忠"
            className="mt-1 block w-32 bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 text-sm"
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-slate-700 pb-2">
          <input type="checkbox" checked={onlyIssues} onChange={(e) => setOnlyIssues(e.target.checked)} />
          只看有缺失
        </label>
        <label className="flex items-center gap-1.5 text-xs text-slate-700 pb-2">
          <input type="checkbox" checked={onlyArchived} onChange={(e) => setOnlyArchived(e.target.checked)} />
          只看教務留存
        </label>
        <div className="ml-auto flex gap-2">
          {cloudReady && (
            <button
              type="button"
              onClick={() => {
                void refresh(dateFrom, dateTo);
                void refreshReviews(dateFrom, dateTo);
              }}
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
              exportPatrolRecords({
                records: filtered,
                checkItems,
                observationItems,
                reviewCases,
                fileName: `巡堂紀錄_${dateFrom}_${dateTo}.xlsx`,
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
          這台電腦尚未加入學校同步，只看得到本機登錄的紀錄。
        </p>
      )}
      {error && (
        <p className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{error}</p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <div className="text-xs text-slate-500">紀錄筆數</div>
          <div className="text-2xl font-extrabold text-slate-900">{filtered.length}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <div className="text-xs text-slate-500">有缺失</div>
          <div className="text-2xl font-extrabold text-rose-600">{issueCount}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <div className="text-xs text-slate-500">課間巡堂</div>
          <div className="text-2xl font-extrabold text-slate-900">
            {filtered.filter((r) => r.kind === 'class').length}
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-4">
          <div className="text-xs text-slate-500">空教室／放學巡查</div>
          <div className="text-2xl font-extrabold text-slate-900">{checkStats.total}</div>
        </div>
      </div>

      {classStats.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2">
          <h3 className="font-bold text-slate-900 text-sm">課間／段考巡堂：各班觀察項目次數</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500 border-b border-slate-200">
                  <th className="text-left py-1.5 pr-2">班級</th>
                  <th className="text-right px-2">巡堂</th>
                  <th className="text-right px-2">有狀況</th>
                  {obsColumns.map((label) => (
                    <th key={label} className="text-right px-2 whitespace-nowrap">
                      {label}
                    </th>
                  ))}
                  <th className="text-left pl-2">常見節次／科目</th>
                </tr>
              </thead>
              <tbody>
                {classStats.map((row) => (
                  <tr key={row.name} className="border-b border-slate-100">
                    <td className="py-1.5 pr-2 font-bold text-slate-800">{row.name}</td>
                    <td className="text-right px-2">{row.total}</td>
                    <td className={`text-right px-2 font-bold ${row.issues > 0 ? 'text-rose-600' : ''}`}>
                      {row.issues}
                    </td>
                    {obsColumns.map((label) => (
                      <td key={label} className="text-right px-2">
                        {row.obs.get(label) || ''}
                      </td>
                    ))}
                    <td className="pl-2 text-slate-600">
                      {topEntries(row.slots, 3)
                        .map(([slot, n]) => `${slot}（${n}）`)
                        .join('、')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {checkStats.total > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-4">
            <h3 className="font-bold text-slate-900 text-sm mb-2">檢查項目未合格次數</h3>
            {checkStats.byItem.length === 0 ? (
              <p className="text-xs text-slate-400">全部合格</p>
            ) : (
              <ul className="text-xs space-y-1">
                {checkStats.byItem.map(([label, n]) => (
                  <li key={label} className="flex justify-between">
                    <span>{label}</span>
                    <strong className="text-rose-600">{n}</strong>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-4">
            <h3 className="font-bold text-slate-900 text-sm mb-2">空教室檢查缺失最多的教室</h3>
            {checkStats.byRoom.length === 0 ? (
              <p className="text-xs text-slate-400">無</p>
            ) : (
              <ul className="text-xs space-y-1">
                {checkStats.byRoom.map(([label, n]) => (
                  <li key={label} className="flex justify-between">
                    <span>{label}</span>
                    <strong className="text-rose-600">{n}</strong>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2">
        <h3 className="font-bold text-slate-900 text-sm">明細（{filtered.length} 筆）</h3>
        {filtered.length === 0 ? (
          <p className="text-xs text-slate-400">此區間沒有符合條件的巡堂紀錄。</p>
        ) : (
          <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-white">
                <tr className="text-slate-500 border-b border-slate-200">
                  <th className="text-left py-1.5 pr-2">日期</th>
                  <th className="text-left px-2">類型</th>
                  <th className="text-left px-2">節次</th>
                  <th className="text-left px-2">教室</th>
                  <th className="text-left px-2">班級／科目／老師</th>
                  <th className="text-left px-2">結果</th>
                  <th className="text-left px-2">會辦</th>
                  <th className="text-left px-2">備註</th>
                  <th className="text-left pl-2">巡堂者</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 500).map((r) => {
                  const review = reviewByRecord.get(r.id);
                  const instruction = (review?.signOffs || [])
                    .filter((s) => s.instruction)
                    .map((s) => s.instruction)
                    .join('；');
                  return (
                  <tr key={r.id} className="border-b border-slate-100 align-top">
                    <td className="py-1.5 pr-2 whitespace-nowrap">{r.date}</td>
                    <td className="px-2 whitespace-nowrap">{patrolKindLabel(r.kind)}</td>
                    <td className="px-2 whitespace-nowrap">{r.period ? `第${r.period}節` : ''}</td>
                    <td className="px-2 whitespace-nowrap">
                      {r.building} {r.floor} {r.roomName}
                    </td>
                    <td className="px-2">
                      {[r.className, r.subjectName, r.teacherName].filter(Boolean).join('／')}
                    </td>
                    <td className={`px-2 ${patrolRecordHasIssue(r) ? 'text-rose-700 font-bold' : 'text-emerald-700'}`}>
                      {describe(r)}
                    </td>
                    <td className="px-2 text-slate-600">
                      {review
                        ? `${REVIEW_STATUS_LABEL[review.status] || review.status}${
                            instruction ? `／${instruction}` : ''
                          }`
                        : '—'}
                    </td>
                    <td className="px-2 text-slate-600">{r.note}</td>
                    <td className="pl-2 whitespace-nowrap">{r.patrollerName}</td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length > 500 && (
              <p className="text-[11px] text-slate-500 mt-2">只顯示前 500 筆，完整資料請匯出 Excel。</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
