import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { SubstituteRequest } from '../../types';
import { PERIOD_DEFINITIONS } from '../../data/mockData';
import { formatLeaveDateLabel } from '../../utils/leaveDates';
import { formatTemporarySwapEffectLabel } from '../../utils/temporarySwap';
import { isActingHomeroomOnlyRequest, displayClashStatus } from '../../utils/actingHomeroomPayrollRegister';
import { ModalShell } from '../Common/ModalShell';
import { 
  ClipboardCheck, 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  Clock, 
  Building2, 
  ArrowRight,
  Filter,
  Check,
  X,
  UserCheck,
  Trash2,
  RotateCcw
} from 'lucide-react';

export const PendingApprovals: React.FC = () => {
  const { 
    requests, 
    approveRequest, 
    rejectRequest, 
    deleteRequest, 
    clearAllRequests, 
    setPrintModalRequest, 
    currentAcademicStaff, 
    academicStaffList,
    systemConfig,
  } = useApp();
  const [filter, setFilter] = useState<'pending' | 'all' | 'approved' | 'rejected'>('pending');
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<string>('時段衝堂或請假附件不全');
  const [isClearAllConfirmOpen, setIsClearAllConfirmOpen] = useState(false);
  const [deletingRequestId, setDeletingRequestId] = useState<string | null>(null);

  const activeStaff =
    (currentAcademicStaff && (currentAcademicStaff.group || 'academic') === 'academic'
      ? currentAcademicStaff
      : undefined) ||
    academicStaffList.find((s) => (s.group || 'academic') === 'academic') ||
    academicStaffList[0];
  const reviewerSignature = (() => {
    if (!activeStaff) return '教學組長';
    if ((activeStaff.group || 'academic') !== 'academic') return '教學組長';
    const t = activeStaff.title;
    const m = t.match(/^(.+?組).*?\((.+?)\)$/);
    const stamp = m ? `${m[1]}${m[2]}` : t;
    return `${activeStaff.name}(${stamp})`;
  })();

  const pendingRequests = requests.filter((r) => r.status === 'pending');
  
  const displayRequests = requests.filter((r) => {
    if (filter === 'all') return true;
    return r.status === filter;
  });

  const dayNames = ['', '週一', '週二', '週三', '週四', '週五'];

  const getPeriodLabel = (pNum: number) => {
    const p = PERIOD_DEFINITIONS.find((def) => def.period === pNum);
    return p ? `${p.label} (${p.timeRange})` : `第${pNum}節`;
  };

  const handleApprove = (req: SubstituteRequest) => {
    const pendingCount = req.batchGroupId
      ? requests.filter((r) => r.batchGroupId === req.batchGroupId && r.status === 'pending').length
      : 1;
    if (pendingCount > 1) {
      const ok = window.confirm(
        `此為連續節次申請（共 ${pendingCount} 節待簽核），將整批一次核准（與刪除／取消相同）。確定？`
      );
      if (!ok) return;
    }
    approveRequest(req.id, reviewerSignature);
  };

  const handleConfirmReject = () => {
    if (!rejectingId) return;
    const target = requests.find((r) => r.id === rejectingId);
    const relatedCount =
      target?.batchGroupId
        ? requests.filter((r) => r.batchGroupId === target.batchGroupId).length
        : 1;
    if (relatedCount > 1) {
      const ok = window.confirm(
        `此為連續節次申請（共 ${relatedCount} 筆將一併駁回，含已核准單會回滾課表），確定？`
      );
      if (!ok) return;
    }
    rejectRequest(rejectingId, rejectReason, reviewerSignature);
    setRejectingId(null);
  };

  return (
    <div className="space-y-6">
      
      {/* Header Bar */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <ClipboardCheck className="w-6 h-6 text-amber-500" />
            <h2 className="text-lg font-bold text-slate-900">教務處教學組 · 調代課線上審核作業</h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            即時檢核全校各科專業科目、實習工場設備無衝突與法規兼代課上限
          </p>
        </div>

        {/* Filter Pills and Actions */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="flex items-center space-x-1.5 bg-slate-100 p-1 rounded-xl">
            {[
              { key: 'pending', label: `待簽核 (${pendingRequests.length})`, isPending: true },
              { key: 'all', label: `全部案件 (${requests.length})` },
              { key: 'approved', label: '已核准' },
              { key: 'rejected', label: '已駁回' },
            ].map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key as any)}
                className={`px-3 py-1.5 rounded-lg font-semibold transition ${
                  filter === f.key
                    ? f.isPending && pendingRequests.length > 0
                      ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                      : 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {requests.length > 0 && (
            <button
              onClick={() => setIsClearAllConfirmOpen(true)}
              title="清空目前所有調代課申請單據（包含系統預設的示範資料）"
              className="flex items-center space-x-1 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded-lg border border-rose-200 transition"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>清空單據</span>
            </button>
          )}
        </div>
      </div>

      {/* Case Cards List */}
      {displayRequests.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400">
          <CheckCircle className="w-12 h-12 mx-auto text-emerald-500/60 mb-2" />
          <p className="text-base font-bold text-slate-700">目前無待簽核之調代課申請</p>
          <p className="text-xs text-slate-400 mt-1">全校各科授課與實習工場排課均正常運作中</p>
        </div>
      ) : (
        <div className="space-y-4">
          {displayRequests.map((req) => {
            const clash = displayClashStatus(req);
            const hasClash = clash.hasClash;
            const isActingOnly = isActingHomeroomOnlyRequest(req);

            return (
              <div
                key={req.id}
                className={`bg-white rounded-2xl border p-5 shadow-xs transition-all ${
                  req.status === 'pending'
                    ? hasClash
                      ? 'border-rose-300 ring-2 ring-rose-500/10'
                      : 'border-amber-300 ring-2 ring-amber-500/10'
                    : 'border-slate-200 opacity-90'
                }`}
              >
                {/* Top status bar */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div className="flex items-center space-x-2.5">
                    <span className="font-mono font-bold text-xs bg-slate-900 text-amber-400 px-2 py-0.5 rounded">
                      {req.requestNumber}
                    </span>
                    <span className="font-bold text-slate-800 text-sm">
                      {req.applicantTeacherName} ({req.applicantDepartment})
                    </span>
                    <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-700 rounded font-medium">
                      {req.requestType === 'substitute'
                        ? '👤 請假派代'
                        : req.requestType === 'swap'
                        ? '🔄 同班對調'
                        : '⏱️ 自行移課'}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded font-semibold ${
                        isActingOnly
                          ? 'bg-violet-50 text-violet-800 border border-violet-200'
                          : req.paymentType === 'public'
                          ? 'bg-blue-50 text-blue-700 border border-blue-200'
                          : 'bg-amber-50 text-amber-800 border border-amber-200'
                      }`}
                    >
                      {isActingOnly
                        ? `代導師費 (${systemConfig.actingHomeroomDailyRate ?? 404}元/日)`
                        : req.paymentType === 'public'
                        ? `公費派代 (${req.originalSession?.period === 8 ? systemConfig.nightHourlyRate : systemConfig.dayHourlyRate}元)`
                        : `自費代課 (${req.originalSession?.period === 8 ? systemConfig.nightHourlyRate : systemConfig.dayHourlyRate}元)`}
                    </span>
                  </div>

                  <div className="flex items-center space-x-3 text-xs">
                    <span className="text-slate-400">送出時間：{req.createdAt}</span>
                    {req.status === 'approved' && (
                      <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-300 rounded-full font-bold">
                        ✓ 已核准生效
                      </span>
                    )}
                    {req.status === 'rejected' && (
                      <span className="px-2.5 py-1 bg-rose-50 text-rose-700 border border-rose-300 rounded-full font-bold">
                        ✕ 已駁回
                      </span>
                    )}
                    {req.status === 'pending' && (
                      <span className="px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-300 rounded-full font-bold animate-pulse">
                        ⏳ 待簽核
                      </span>
                    )}
                  </div>
                </div>

                {/* Details layout */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 my-3 text-xs sm:text-sm">
                  
                  {/* Left: Original Course */}
                  <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                    <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                      原授課堂
                    </div>
                    <div className="font-bold text-slate-900 text-sm">
                      {req.originalSession.className} ｜ 《{req.originalSession.subjectName}》
                    </div>
                    <div className="text-slate-600 mt-1">
                      {dayNames[req.originalSession.dayOfWeek]} {getPeriodLabel(req.originalSession.period)}
                    </div>
                    {req.requestType === 'substitute' && (
                      <div className="text-amber-800 font-semibold mt-1">
                        請假日期：{formatLeaveDateLabel(req.leaveDateStart, req.leaveDateEnd)}
                      </div>
                    )}
                    <div className="text-slate-500 flex items-center gap-1 mt-1 font-mono text-xs">
                      <Building2 className="w-3.5 h-3.5 text-slate-400" />
                      {req.originalSession.venueName}
                      {req.originalSession.isPractical && (
                        <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded font-medium">
                          實習工場
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Middle: Replacement Details */}
                  <div className="bg-indigo-50/70 p-3.5 rounded-xl border border-indigo-200 lg:col-span-2">
                    <div className="text-xs font-bold text-indigo-800 uppercase tracking-wider mb-1">
                      調代課安排內容與事由
                    </div>
                    
                    {req.requestType === 'substitute' && (
                      <div className="text-slate-900 font-medium">
                        {isActingOnly ? (
                          <>
                            <span>代導師：</span>
                            <strong className="text-violet-900 text-base ml-1">
                              {req.actingHomeroomTeacherName || '尚未指定'}
                            </strong>
                            <span className="text-xs text-slate-600 ml-2">
                              （當日無排課，僅辦代導師）
                            </span>
                          </>
                        ) : (
                          <>
                            <span>代課教師：</span>
                            <strong className="text-indigo-900 text-base ml-1">
                              {req.substituteTeacherName || '未指定（由教學組媒合）'}
                            </strong>
                            <span className="text-xs text-slate-600 ml-2">
                              ({req.paymentType === 'public'
                                ? `公費派代 ${req.originalSession?.period === 8 ? systemConfig.nightHourlyRate : systemConfig.dayHourlyRate}元/節`
                                : `自費代課 ${req.originalSession?.period === 8 ? systemConfig.nightHourlyRate : systemConfig.dayHourlyRate}元/節`})
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
                      <div className="text-slate-900 font-medium">
                        <span>移至時段：</span>
                        <strong className="text-indigo-900 ml-1">
                          {dayNames[req.targetReschedule.dayOfWeek]} {getPeriodLabel(req.targetReschedule.period)}
                        </strong>
                        <span className="ml-3 text-slate-600">場地：</span>
                        <strong className="text-slate-800">{req.targetReschedule.venueName}</strong>
                      </div>
                    )}

                    {req.requestType === 'swap' && req.swapTargetSession && (
                      <div className="text-slate-900 font-medium">
                        <span>
                          同班對調（{req.swapMode === 'permanent' || (!req.swapMode && !req.effectiveDate) ? '永久' : '暫時'}）對象：
                        </span>
                        <strong className="text-indigo-900 ml-1">{req.swapTargetTeacherName}</strong>
                        <span className="ml-2 text-slate-700">
                          {req.swapTargetSession.className} 《{req.swapTargetSession.subjectName}》
                          （{dayNames[req.swapTargetSession.dayOfWeek]} {getPeriodLabel(req.swapTargetSession.period)}）
                        </span>
                        {req.effectiveDate && (
                          <div className="text-xs text-indigo-700 mt-1">
                            {formatTemporarySwapEffectLabel(
                              req.effectiveDate,
                              req.originalSession.dayOfWeek,
                              req.swapTargetSession.dayOfWeek
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="text-xs text-slate-600 mt-2 bg-white/80 p-2 rounded border border-indigo-100">
                      <strong>申請事由：</strong>
                      {req.reason}
                    </div>
                  </div>
                </div>

                {/* Clash Status Warning / Success Box */}
                <div
                  className={`p-3 rounded-xl border flex items-start space-x-2.5 text-xs ${
                    hasClash
                      ? 'bg-rose-50 border-rose-300 text-rose-900'
                      : clash.severity === 'warning'
                      ? 'bg-amber-50 border-amber-300 text-amber-900'
                      : 'bg-emerald-50 border-emerald-300 text-emerald-900'
                  }`}
                >
                  {hasClash ? (
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  ) : clash.severity === 'warning' ? (
                    <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  ) : (
                    <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  )}
                  <div className="space-y-0.5">
                    <span className="font-bold">
                      {hasClash
                        ? '🚫 衝堂衝突警示：'
                        : clash.severity === 'warning'
                        ? '⚠️ 系統提醒：'
                        : '✅ 系統檢核通過：'}
                    </span>
                    {clash.messages.map((m, idx) => (
                      <span key={idx} className="block">
                        {m}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Bottom Actions */}
                <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                  
                  {/* Operational Buttons */}
                  <div className="flex items-center space-x-2">
                    {req.status === 'pending' && (
                      <>
                        <button
                          id={`btn-reject-${req.id}`}
                          onClick={() => {
                            setRejectingId(req.id);
                            setRejectReason(
                              hasClash
                                ? clash.messages[0] || '該時段已排有正課衝堂'
                                : '事由不合規定或請假公文未齊全'
                            );
                          }}
                          className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 font-bold text-xs rounded-lg transition"
                        >
                          ✕ 駁回申請
                        </button>
                        <button
                          id={`btn-approve-${req.id}`}
                          onClick={() => handleApprove(req)}
                          className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg shadow-sm transition active:scale-95 flex items-center space-x-1"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>
                            {req.batchGroupId &&
                            requests.filter(
                              (r) => r.batchGroupId === req.batchGroupId && r.status === 'pending'
                            ).length > 1
                              ? '整批核准'
                              : '核准生效'}
                          </span>
                        </button>
                      </>
                    )}

                    {req.status === 'approved' && !isActingOnly && (
                      <button
                        onClick={() => setPrintModalRequest(req)}
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg shadow transition"
                      >
                        列印調代課通知單
                      </button>
                    )}

                    {/* Delete single request */}
                    <button
                      onClick={() => setDeletingRequestId(req.id)}
                      title="刪除此單據（做錯可刪）"
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

              </div>
            );
          })}
        </div>
      )}

      {deletingRequestId && (
        <ModalShell
          scroll="panel"
          backdropClassName="bg-slate-900/60 backdrop-blur-xs"
          panelClassName="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-slate-200"
        >
          <div className="p-6">
            <div className="flex items-center space-x-2 text-rose-600 font-bold text-base">
              <AlertTriangle className="w-5 h-5" />
              <span>確認刪除此調代課申請單？</span>
            </div>
            <p className="text-xs text-slate-600 mt-2 leading-relaxed">
              即將刪除{' '}
              <strong className="text-slate-900">
                {(() => {
                  const t = requests.find((r) => r.id === deletingRequestId);
                  if (!t) return '此單';
                  if (!t.batchGroupId) return t.requestNumber || '此單';
                  const n = requests.filter((r) => r.batchGroupId === t.batchGroupId).length;
                  return `${t.requestNumber || '此單'}（含同批連續節次共 ${n} 筆）`;
                })()}
              </strong>
              。刪除後無法復原，也不再計入鐘點費結算；已核准者會一併回滾課表代課覆蓋。若只是填錯，刪除後可重新登錄。
            </p>
            <div className="flex justify-end space-x-2 mt-5">
              <button
                type="button"
                onClick={() => setDeletingRequestId(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteRequest(deletingRequestId);
                  setDeletingRequestId(null);
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl shadow-xs transition"
              >
                確認刪除
              </button>
            </div>
          </div>
        </ModalShell>
      )}

      {/* Clear All Confirmation Modal */}
      {isClearAllConfirmOpen && (
        <ModalShell
          scroll="panel"
          backdropClassName="bg-slate-900/60 backdrop-blur-xs"
          panelClassName="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-slate-200 animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="p-6">
            <div className="flex items-center space-x-2 text-rose-600 font-bold text-base">
              <AlertTriangle className="w-5 h-5" />
              <span>確認清空所有調代課申請單據？</span>
            </div>
            <p className="text-xs text-slate-600 mt-2 leading-relaxed">
              將清空目前清單共 {requests.length} 筆申請。已核准的移課／互調／代課會先由新到舊嘗試還原課表；若課堂之後又有異動則略過該筆回滾，以免覆寫較新狀態。
            </p>
            <div className="flex justify-end space-x-2 mt-5">
              <button
                type="button"
                onClick={() => setIsClearAllConfirmOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  clearAllRequests();
                  setIsClearAllConfirmOpen(false);
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl shadow-xs transition"
              >
                確認清空
              </button>
            </div>
          </div>
        </ModalShell>
      )}

      {/* Reject Reason Modal */}
      {rejectingId && (
        <ModalShell
          scroll="panel"
          backdropClassName="bg-slate-900/60 backdrop-blur-xs"
          panelClassName="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-slate-200"
        >
          <div className="p-6">
            <h3 className="text-base font-bold text-slate-900 flex items-center space-x-2">
              <XCircle className="w-5 h-5 text-rose-600" />
              <span>請填寫駁回原因</span>
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              駁回原因將同步顯示於申請教師之調代課清單中。
              {(() => {
                const t = requests.find((r) => r.id === rejectingId);
                if (!t?.batchGroupId) return null;
                const n = requests.filter(
                  (r) => r.batchGroupId === t.batchGroupId && r.status === 'pending'
                ).length;
                if (n <= 1) return null;
                return (
                  <span className="block mt-1 text-amber-700 font-semibold">
                    注意：此為連續節次，確定後將整批駁回共 {n} 筆。
                  </span>
                );
              })()}
            </p>
            <textarea
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full mt-3 p-2.5 border border-slate-300 rounded-lg text-xs sm:text-sm focus:ring-2 focus:ring-rose-500 focus:outline-none"
              placeholder="請輸入具體駁回理由（如衝堂、無課照等）..."
            />
            <div className="flex justify-end space-x-2 mt-4">
              <button
                onClick={() => setRejectingId(null)}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg"
              >
                取消
              </button>
              <button
                onClick={handleConfirmReject}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-lg shadow"
              >
                確定駁回
              </button>
            </div>
          </div>
        </ModalShell>
      )}

    </div>
  );
};
