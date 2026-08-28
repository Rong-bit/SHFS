import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { SubstituteRequest } from '../../types';
import { PERIOD_DEFINITIONS } from '../../data/mockData';
import { formatLeaveDateLabel } from '../../utils/leaveDates';
import { formatTemporarySwapEffectLabel } from '../../utils/temporarySwap';
import { isActingHomeroomOnlyRequest } from '../../utils/actingHomeroomPayrollRegister';
import { 
  Printer, 
  Trash2, 
  CheckCircle2, 
  Clock, 
  XCircle, 
  AlertCircle,
  FileText,
  Filter,
  ArrowRight,
  UserCheck,
  ArrowLeftRight
} from 'lucide-react';

export const TeacherRequestsList: React.FC = () => {
  const { currentTeacher, requests, cancelRequest, setPrintModalRequest, systemConfig } = useApp();
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const myRequests = requests.filter((r) => r.applicantTeacherId === currentTeacher?.id);

  const filteredRequests = myRequests.filter((r) => {
    if (statusFilter === 'all') return true;
    return r.status === statusFilter;
  });

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
            共 {myRequests.length} 筆
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
      {filteredRequests.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
          <FileText className="w-10 h-10 mx-auto text-slate-300 mb-2" />
          <p className="text-sm font-medium">目前暫無符合條件之調代課申請單據</p>
          <p className="text-xs text-slate-400 mt-1">您可隨時於課表或右上角點選「新增調代課申請」</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredRequests.map((req) => (
            <div
              key={req.id}
              className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs hover:border-slate-300 transition"
            >
              <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-3">
                <div className="flex items-center space-x-2.5">
                  <span className="font-mono font-bold text-xs bg-slate-100 text-slate-800 px-2 py-1 rounded border border-slate-200">
                    {req.requestNumber}
                  </span>
                  <span className="text-xs font-semibold text-slate-600">
                    {req.requestType === 'substitute'
                      ? '👤 請假派代'
                      : req.requestType === 'swap'
                      ? '🔄 同班對調'
                      : '⏱️ 自行移課'}
                  </span>
                  {isActingHomeroomOnlyRequest(req) ? (
                    <span className="text-[11px] px-2 py-0.5 bg-violet-50 text-violet-800 border border-violet-200 rounded font-semibold">
                      代導師費 ({systemConfig.actingHomeroomDailyRate ?? 404}元/日)
                    </span>
                  ) : req.paymentType === 'public' ? (
                    <span className="text-[11px] px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded font-semibold">
                      公費派代 ({req.originalSession?.period === 8 ? systemConfig.nightHourlyRate : systemConfig.dayHourlyRate}元/節)
                    </span>
                  ) : (
                    <span className="text-[11px] px-2 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 rounded font-semibold">
                      自費代課 ({req.originalSession?.period === 8 ? systemConfig.nightHourlyRate : systemConfig.dayHourlyRate}元/節)
                    </span>
                  )}
                </div>

                <div className="flex items-center space-x-3">
                  {getStatusBadge(req.status)}
                  <span className="text-xs text-slate-400">{req.createdAt}</span>
                </div>
              </div>

              {/* Course details */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-3 text-xs sm:text-sm">
                
                {/* Original Slot */}
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <div className="text-xs font-bold text-slate-500 mb-1">原課堂時段與科目</div>
                  <div className="font-bold text-slate-800 text-sm">
                    {req.originalSession.className} · 《{req.originalSession.subjectName}》
                  </div>
                  <div className="text-xs text-slate-600 mt-1">
                    {dayNames[req.originalSession.dayOfWeek]} {getPeriodLabel(req.originalSession.period)} ｜ {req.originalSession.venueName}
                  </div>
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
                    <div className="text-slate-800">
                      {isActingHomeroomOnlyRequest(req) ? (
                        <>
                          <span>代導師：</span>
                          <strong className="text-violet-900 font-bold text-sm ml-1">
                            {req.actingHomeroomTeacherName || '尚未指定'}
                          </strong>
                          <span className="text-xs text-slate-500 ml-2">（當日無排課）</span>
                        </>
                      ) : (
                        <>
                          <span>指派代課教師：</span>
                          <strong className="text-indigo-900 font-bold text-sm ml-1">
                            {req.substituteTeacherName || '由教學組媒合無課教師'}
                          </strong>
                          <span className="text-xs text-slate-500 ml-2">
                            ({req.paymentType === 'public' ? '公費支給' : '個人代扣支付'})
                          </span>
                          {req.actingHomeroomTeacherName && (
                            <div className="text-xs text-violet-800 mt-1">
                              代導師：{req.actingHomeroomTeacherName}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {req.requestType === 'reschedule' && req.targetReschedule && (
                    <div className="text-slate-800">
                      <span>移至時段：</span>
                      <strong className="text-indigo-900 font-bold ml-1">
                        {dayNames[req.targetReschedule.dayOfWeek]} {getPeriodLabel(req.targetReschedule.period)}
                      </strong>
                      <span className="ml-2 text-slate-600">@ {req.targetReschedule.venueName}</span>
                    </div>
                  )}

                  {req.requestType === 'swap' && req.swapTargetSession && (
                    <div className="text-slate-800">
                      <span>
                        與 <strong>{req.swapTargetTeacherName}</strong> 同班對調
                        （{req.swapMode === 'permanent' || (!req.swapMode && !req.effectiveDate) ? '永久' : '暫時'}）：
                      </span>
                      <span className="ml-1 text-slate-700">
                        {req.swapTargetSession.className} 《{req.swapTargetSession.subjectName}》
                        （{dayNames[req.swapTargetSession.dayOfWeek]} {getPeriodLabel(req.swapTargetSession.period)}）
                      </span>
                      {req.effectiveDate && (
                        <div className="text-xs text-indigo-700 mt-0.5">
                          {formatTemporarySwapEffectLabel(
                            req.effectiveDate,
                            req.originalSession.dayOfWeek,
                            req.swapTargetSession.dayOfWeek
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="text-xs text-slate-600 mt-1">
                    事由：<span className="text-slate-800">{req.reason}</span>
                  </div>
                </div>

              </div>

              {/* Rejection reason if rejected */}
              {req.status === 'rejected' && req.rejectReason && (
                <div className="bg-rose-50 border border-rose-200 rounded-lg p-2.5 text-xs text-rose-800 flex items-start space-x-2 my-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">教務處駁回原因：</span>
                    <span>{req.rejectReason}</span>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
                {/* Print button (enabled if approved) */}
                {req.status === 'approved' && !isActingHomeroomOnlyRequest(req) && (
                  <button
                    id={`btn-print-${req.id}`}
                    onClick={() => setPrintModalRequest(req)}
                    className="flex items-center space-x-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-lg shadow transition"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>列印調代課通知單</span>
                  </button>
                )}

                {/* Cancel button if pending */}
                {req.status === 'pending' && (
                  <button
                    onClick={() => {
                      const pendingCount = req.batchGroupId
                        ? requests.filter(
                            (r) =>
                              r.batchGroupId === req.batchGroupId &&
                              r.status === 'pending' &&
                              r.applicantTeacherId === currentTeacher?.id
                          ).length
                        : 1;
                      const msg =
                        pendingCount > 1
                          ? `此為連續節次申請（共 ${pendingCount} 節待審），將整批一次撤回。確定？`
                          : '確定要撤回此調代課申請嗎？';
                      if (window.confirm(msg)) {
                        cancelRequest(req.id);
                      }
                    }}
                    className="flex items-center space-x-1 px-3 py-1.5 bg-slate-100 hover:bg-rose-50 hover:text-rose-700 text-slate-600 text-xs font-semibold rounded-lg transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>
                      {req.batchGroupId &&
                      requests.filter(
                        (r) =>
                          r.batchGroupId === req.batchGroupId &&
                          r.status === 'pending' &&
                          r.applicantTeacherId === currentTeacher?.id
                      ).length > 1
                        ? '整批撤回'
                        : '撤回申請'}
                    </span>
                  </button>
                )}
              </div>

            </div>
          ))}
        </div>
      )}

    </div>
  );
};
