import React, { useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { SubstituteRequest } from '../../types';
import { PERIOD_DEFINITIONS } from '../../data/mockData';
import { formatLeaveDateLabel } from '../../utils/leaveDates';
import { formatDayPeriodSummary } from '../../utils/periodLabels';
import { formatTemporarySwapEffectLabel } from '../../utils/temporarySwap';
import { isActingHomeroomOnlyRequest } from '../../utils/actingHomeroomPayrollRegister';
import { 
  Printer, 
  Trash2, 
  CheckCircle2, 
  Clock, 
  XCircle, 
  FileText,
  ArrowLeftRight
} from 'lucide-react';

const requestGroupKey = (r: SubstituteRequest) =>
  r.batchGroupId || r.requestNumber || r.id;

export const TeacherRequestsList: React.FC = () => {
  const { currentTeacher, requests, cancelRequest, setPrintModalRequest, systemConfig } = useApp();
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const myRequests = useMemo(
    () => requests.filter((r) => r.applicantTeacherId === currentTeacher?.id),
    [requests, currentTeacher?.id]
  );

  const filteredRequests = useMemo(
    () =>
      myRequests.filter((r) => {
        if (statusFilter === 'all') return true;
        return r.status === statusFilter;
      }),
    [myRequests, statusFilter]
  );

  const groupedRows = useMemo(() => {
    const order: string[] = [];
    const seen = new Set<string>();
    for (const r of filteredRequests) {
      const key = requestGroupKey(r);
      if (seen.has(key)) continue;
      seen.add(key);
      order.push(key);
    }
    return order.map((key) => {
      const items = myRequests
        .filter((r) => requestGroupKey(r) === key)
        .sort(
          (a, b) =>
            (a.originalSession?.dayOfWeek || 0) - (b.originalSession?.dayOfWeek || 0) ||
            (a.originalSession?.period || 0) - (b.originalSession?.period || 0)
        );
      return { key, primary: items[0], items };
    }).filter((row) => {
      if (statusFilter === 'all') return true;
      if (statusFilter === 'pending') return row.items.some((r) => r.status === 'pending');
      return row.items.every((r) => r.status === statusFilter);
    });
  }, [filteredRequests, myRequests, statusFilter]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-300 rounded-full text-xs font-bold">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>已核准生效</span>
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-1 bg-rose-50 text-rose-700 border border-rose-300 rounded-full text-xs font-bold">
            <XCircle className="w-3.5 h-3.5" />
            <span>已駁回</span>
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-1 bg-slate-100 text-slate-600 border border-slate-300 rounded-full text-xs font-medium">
            <span>已撤回</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-300 rounded-full text-xs font-bold animate-pulse">
            <Clock className="w-3.5 h-3.5" />
            <span>待教學組審核</span>
          </span>
        );
    }
  };

  const dayNames = ['', '週一', '週二', '週三', '週四', '週五'];

  const getPeriodLabel = (pNum: number) => {
    const p = PERIOD_DEFINITIONS.find((def) => def.period === pNum);
    return p ? `${p.label}` : `第${pNum}節`;
  };

  const groupCount = useMemo(
    () => new Set(myRequests.map(requestGroupKey)).size,
    [myRequests]
  );

  return (
    <div className="space-y-4">
      
      {/* Filter Tabs & Header */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-2">
          <FileText className="w-5 h-5 text-indigo-600" />
          <h3 className="font-bold text-slate-900 text-base">
            我的調代課申請紀錄
          </h3>
          <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">
            共 {groupCount} 筆
          </span>
        </div>

        {/* Filter buttons */}
        <div className="flex items-center space-x-1.5 text-xs">
          {[
            { key: 'all', label: '全部' },
            { key: 'pending', label: '待審核' },
            { key: 'approved', label: '已核准' },
            { key: 'rejected', label: '已駁回' },
          ].map((f) => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              className={`px-3 py-1.5 rounded-lg font-medium transition ${
                statusFilter === f.key
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Requests List */}
      {groupedRows.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
          <FileText className="w-10 h-10 mx-auto text-slate-300 mb-2" />
          <p className="text-sm font-medium">目前暫無符合條件之調代課申請單據</p>
          <p className="text-xs text-slate-400 mt-1">您可隨時於課表或右上角點選「新增調代課申請」</p>
        </div>
      ) : (
        <div className="space-y-3">
          {groupedRows.map(({ key, primary: req, items }) => {
            const isPending = items.some((r) => r.status === 'pending');
            const displayStatus = isPending
              ? 'pending'
              : items.every((r) => r.status === 'approved')
                ? 'approved'
                : items.every((r) => r.status === 'rejected')
                  ? 'rejected'
                  : items.every((r) => r.status === 'cancelled')
                    ? 'cancelled'
                    : req.status;
            const periodSummary = formatDayPeriodSummary(
              items.map((r) => r.originalSession).filter(Boolean),
              dayNames
            );
            const classLabels = [
              ...new Set(
                items
                  .map((r) => {
                    const s = r.originalSession;
                    return s ? `${s.className} · 《${s.subjectName}》` : '';
                  })
                  .filter(Boolean)
              ),
            ];
            const subNames = [
              ...new Set(
                items
                  .filter((r) => !isActingHomeroomOnlyRequest(r))
                  .map((r) => r.substituteTeacherName)
                  .filter(Boolean)
              ),
            ] as string[];
            const actingNames = [
              ...new Set(items.map((r) => r.actingHomeroomTeacherName).filter(Boolean)),
            ] as string[];
            const canPrint =
              items.some((r) => r.status === 'approved' && !isActingHomeroomOnlyRequest(r));
            const printTarget =
              items.find((r) => r.status === 'approved' && !isActingHomeroomOnlyRequest(r)) || req;
            const canCancel = items.some((r) => r.status === 'pending');

            return (
            <div
              key={key}
              className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs hover:border-slate-300 transition"
            >
              <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-3">
                <div className="flex items-center space-x-2.5 flex-wrap">
                  <span className="font-mono font-bold text-xs bg-slate-100 text-slate-800 px-2 py-1 rounded border border-slate-200">
                    {req.requestNumber}
                  </span>
                  {items.length > 1 && (
                    <span className="text-[11px] text-slate-500 font-semibold">
                      {items.length} 節合併
                    </span>
                  )}
                  <span className="text-xs font-semibold text-slate-600">
                    {req.requestType === 'substitute'
                      ? '👤 請假派代'
                      : req.requestType === 'swap'
                      ? '🔄 同班對調'
                      : '⏱️ 自行移課'}
                  </span>
                  {items.every((r) => isActingHomeroomOnlyRequest(r)) ? (
                    <span className="text-[11px] px-2 py-0.5 bg-violet-50 text-violet-800 border border-violet-200 rounded font-semibold">
                      代導師費 ({systemConfig.actingHomeroomDailyRate ?? 404}元/日)
                    </span>
                  ) : req.paymentType === 'public' ? (
                    <span className="text-[11px] px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded font-semibold">
                      公費派代
                    </span>
                  ) : (
                    <span className="text-[11px] px-2 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 rounded font-semibold">
                      自費代課
                    </span>
                  )}
                </div>

                <div className="flex items-center space-x-3">
                  {getStatusBadge(displayStatus)}
                  <span className="text-xs text-slate-400">{req.createdAt}</span>
                </div>
              </div>

              {/* Course details */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-3 text-xs sm:text-sm">
                
                {/* Original Slot */}
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <div className="text-xs font-bold text-slate-500 mb-1">原課堂時段與科目</div>
                  {items.length === 1 ? (
                    <>
                      <div className="font-bold text-slate-800 text-sm">
                        {req.originalSession.className} · 《{req.originalSession.subjectName}》
                      </div>
                      <div className="text-xs text-slate-600 mt-1">
                        {dayNames[req.originalSession.dayOfWeek]} {getPeriodLabel(req.originalSession.period)} ｜ {req.originalSession.venueName}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="font-bold text-slate-800 text-sm leading-snug">
                        {classLabels.join('、')}
                      </div>
                      <div className="text-xs text-slate-600 mt-1">{periodSummary}</div>
                    </>
                  )}
                  {req.requestType === 'substitute' && (
                    <div className="text-xs text-amber-800 font-semibold mt-1">
                      請假日期：{formatLeaveDateLabel(req.leaveDateStart, req.leaveDateEnd)}
                    </div>
                  )}
                </div>

                {/* Arrow / Destination Slot */}
                <div className="bg-indigo-50/60 p-3 rounded-lg border border-indigo-200 md:col-span-2">
                  <div className="text-xs font-bold text-indigo-700 mb-1">調代課安排內容</div>
                  
                  {req.requestType === 'substitute' && (
                    <div className="space-y-1">
                      {items.every((r) => isActingHomeroomOnlyRequest(r)) ? (
                        <div className="flex items-center space-x-2 text-sm">
                          <span className="text-slate-600">代導師：</span>
                          <strong className="text-violet-900">
                            {actingNames.join('、') || '尚未指定'}
                          </strong>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center space-x-2 text-sm">
                            <span className="text-slate-600">代課教師：</span>
                            <strong className="text-indigo-900">
                              {subNames.join('、') || '由教學組媒合'}
                            </strong>
                          </div>
                          {actingNames.length > 0 && (
                            <div className="flex items-center space-x-2 text-sm">
                              <span className="text-slate-600">代導師：</span>
                              <strong className="text-violet-900">{actingNames.join('、')}</strong>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {req.requestType === 'reschedule' && req.targetReschedule && (
                    <div className="flex items-center space-x-2 text-sm">
                      <span className="text-slate-600">移至：</span>
                      <strong>
                        {dayNames[req.targetReschedule.dayOfWeek]} {getPeriodLabel(req.targetReschedule.period)}
                      </strong>
                      <span className="text-slate-500">（{req.targetReschedule.venueName}）</span>
                    </div>
                  )}

                  {req.requestType === 'swap' && (
                    <div className="space-y-1 text-sm">
                      <div className="flex items-center space-x-2">
                        <ArrowLeftRight className="w-3.5 h-3.5 text-indigo-600" />
                        <span className="text-slate-600">對調對象：</span>
                        <strong>{req.swapTargetTeacherName}</strong>
                      </div>
                      {req.effectiveDate && req.swapTargetSession && (
                        <div className="text-xs text-indigo-700">
                          {formatTemporarySwapEffectLabel(
                            req.effectiveDate,
                            req.originalSession.dayOfWeek,
                            req.swapTargetSession.dayOfWeek
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {req.reason && (
                    <div className="text-xs text-slate-500 mt-2 border-t border-indigo-100 pt-2">
                      事由：{req.reason}
                    </div>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                {canPrint && (
                  <button
                    type="button"
                    onClick={() => setPrintModalRequest(printTarget)}
                    className="flex items-center space-x-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-lg border border-indigo-200 transition"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>列印通知單</span>
                  </button>
                )}
                {canCancel && (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm('確定撤回此申請？（合併單將整批撤回）')) {
                        cancelRequest(req.id);
                      }
                    }}
                    className="flex items-center space-x-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold rounded-lg border border-rose-200 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>撤回申請</span>
                  </button>
                )}
              </div>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
