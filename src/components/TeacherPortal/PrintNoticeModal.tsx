import React from 'react';
import { CourseSession, SubstituteRequest } from '../../types';
import { PERIOD_DEFINITIONS } from '../../data/mockData';
import { resolveOriginalSession } from '../../utils/resolveOriginalSession';
import { useApp } from '../../context/AppContext';
import { formatLeaveDateLabel } from '../../utils/leaveDates';
import { leaveTypeLabel } from '../../utils/leaveTypes';
import { formatPeriodsLabel } from '../../utils/periodLabels';
import { formatTemporarySwapEffectLabel } from '../../utils/temporarySwap';
import { Printer, X, CheckCircle2, ShieldAlert } from 'lucide-react';
import { ModalShell } from '../Common/ModalShell';

interface PrintNoticeModalProps {
  request: SubstituteRequest;
  onClose: () => void;
}

/** 連續且同班／同科目／同場地的節次合併顯示 */
function collapseConsecutiveSessions(sessions: CourseSession[]): Array<{
  periodStart: number;
  periodEnd: number;
  className: string;
  subjectName: string;
  venueName: string;
  isPractical?: boolean;
  isConcurrent?: boolean;
}> {
  const sorted = [...sessions].sort((a, b) => a.period - b.period);
  const blocks: Array<{
    periodStart: number;
    periodEnd: number;
    className: string;
    subjectName: string;
    venueName: string;
    isPractical?: boolean;
    isConcurrent?: boolean;
  }> = [];

  for (const s of sorted) {
    const last = blocks[blocks.length - 1];
    const sameCourse =
      last &&
      last.className === s.className &&
      last.subjectName === s.subjectName &&
      last.venueName === s.venueName &&
      last.periodEnd + 1 === s.period;

    if (sameCourse) {
      last.periodEnd = s.period;
      last.isPractical = last.isPractical || s.isPractical;
      last.isConcurrent = last.isConcurrent || s.isConcurrent;
    } else {
      blocks.push({
        periodStart: s.period,
        periodEnd: s.period,
        className: s.className,
        subjectName: s.subjectName,
        venueName: s.venueName,
        isPractical: s.isPractical,
        isConcurrent: s.isConcurrent,
      });
    }
  }

  return blocks;
}

function formatPeriodBlockLabel(start: number, end: number): string {
  return start === end ? `第${start}節` : `第${start}節～第${end}節`;
}

export const PrintNoticeModal: React.FC<PrintNoticeModalProps> = ({ request, onClose }) => {
  const { currentAcademicStaff, academicStaffList, systemConfig, sessions, requests } = useApp();
  
  // Resolve reviewer staff
  const reviewerStaff = currentAcademicStaff || academicStaffList[0];
  const formatStampTitle = (title: string) => {
    const m = title.match(/^(.+?組).*?\((.+?)\)$/);
    if (m) return `${m[1]}${m[2]}`;
    return title;
  };
  const parseReviewerStamp = (raw?: string): { name: string; title?: string; note?: string } => {
    const autoNote = '[教務處逕行派代]';
    let rest = (raw || '').trim();
    let note: string | undefined;

    if (rest.endsWith(autoNote)) {
      note = autoNote;
      rest = rest.slice(0, -autoNote.length).trim();
    }

    if (!rest) {
      if (!reviewerStaff) return { name: '教學組長', note };
      return {
        name: reviewerStaff.name,
        title: `(${formatStampTitle(reviewerStaff.title)})`,
        note,
      };
    }

    const nested = rest.match(/^(.+?)\s*\((.+?組).*?\((.+?)\)\)\s*$/);
    if (nested) {
      return { name: nested[1].trim(), title: `(${nested[2]}${nested[3]})`, note };
    }

    const titled = rest.match(/^(.+?)\s*\((.+?)\)$/);
    if (titled) {
      return {
        name: titled[1].replace(/\s+/g, ''),
        title: `(${formatStampTitle(titled[2])})`,
        note,
      };
    }

    return { name: rest.replace(/\s+/g, ''), note };
  };
  const reviewerStamp = parseReviewerStamp(request.reviewedBy);

  const getPeriodLabel = (periodNum: number) => {
    const p = PERIOD_DEFINITIONS.find((def) => def.period === periodNum);
    return p ? `${p.label} (${p.timeRange})` : `第${periodNum}節`;
  };

  const dayNames = ['', '週一', '週二', '週三', '週四', '週五'];

  const getTypeName = (type: string) => {
    if (type === 'swap') return '同班對調';
    if (type === 'reschedule') return '自行移課';
    return '請假派代';
  };

  /** 連續節次：僅合併同批「已核准」節次；pending 不進通知單 */
  const printGroup =
    request.status === 'approved' && request.batchGroupId
      ? requests
          .filter(
            (r) => r.batchGroupId === request.batchGroupId && r.status === 'approved'
          )
          .sort(
            (a, b) =>
              a.originalSession.dayOfWeek - b.originalSession.dayOfWeek ||
              a.originalSession.period - b.originalSession.period
          )
      : [request];
  const isMergedBatch = printGroup.length > 1;
  const groupedSessions = printGroup.map((r) => resolveOriginalSession(r, sessions));
  const originalSession = groupedSessions[0] || resolveOriginalSession(request, sessions);
  const courseBlocks = collapseConsecutiveSessions(groupedSessions);
  const periodRangeLabel = isMergedBatch
    ? `${dayNames[originalSession.dayOfWeek]} ${formatPeriodsLabel(
        groupedSessions.map((s) => s.period)
      )}（共 ${groupedSessions.length} 節）`
    : `${dayNames[originalSession.dayOfWeek]} ${getPeriodLabel(originalSession.period)}`;
  const requestNumberLabel = isMergedBatch
    ? `${printGroup[0].requestNumber}～${printGroup[printGroup.length - 1].requestNumber}（合併 ${printGroup.length} 節）`
    : request.requestNumber;

  const getLeaveTypeName = (leave?: string) =>
    leaveTypeLabel(leave as SubstituteRequest['leaveType']);

  const handlePrint = () => {
    window.print();
  };

  return (
    <ModalShell
      scroll="none"
      panelClassName="bg-white rounded-xl shadow-2xl max-w-3xl w-full border border-slate-200 overflow-hidden my-2"
      backdropClassName="bg-slate-900/70 backdrop-blur-xs"
    >
        
        {/* Top bar (Hidden when printing) */}
        <div className="print:hidden bg-slate-800 text-white px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Printer className="w-5 h-5 text-amber-400" />
            <span className="font-semibold text-sm">
              正式調代課通知單列印預覽
              {isMergedBatch ? `（連續 ${groupedSessions.length} 節合併）` : ' (高職標準格式)'}
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <button
              id="btn-trigger-print"
              onClick={handlePrint}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded shadow transition"
            >
              <Printer className="w-4 h-4" />
              <span>立即列印 / 存為 PDF</span>
            </button>
            <button
              id="btn-close-print-modal"
              onClick={onClose}
              className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-700 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Official High School Form */}
        <div className="p-8 text-slate-800 print:p-6 font-sans">
          
          {/* Header */}
          <div className="text-center border-b-2 border-slate-800 pb-3 mb-4">
            <h1 className="text-xl sm:text-2xl font-bold tracking-wider text-slate-900">
              {systemConfig.schoolName || '國立技術型高級中等學校'}
            </h1>
            <h2 className="text-lg font-semibold text-slate-700 tracking-wide mt-0.5">
              教師調課 · 代課 · 補課聯絡通知單
            </h2>
            <div className="flex justify-between items-center text-xs text-slate-500 mt-2">
              <span>單據編號：<strong className="text-slate-800">{requestNumberLabel}</strong></span>
              <span>申請日期：{request.createdAt}</span>
              <span>核定狀態：<strong className="text-emerald-700 font-bold">【已核准生效】</strong></span>
            </div>
          </div>

          {/* Form Content Grid */}
          <div className="border border-slate-400 text-xs sm:text-sm divide-y divide-slate-300">
            
            {/* Row 1: Applicant info */}
            <div className="grid grid-cols-4 divide-x divide-slate-300 bg-slate-50">
              <div className="p-2 font-bold text-slate-700 bg-slate-100 flex items-center justify-center">
                申請教師
              </div>
              <div className="p-2 font-semibold text-slate-900">
                {request.applicantTeacherName}
              </div>
              <div className="p-2 font-bold text-slate-700 bg-slate-100 flex items-center justify-center">
                科別 / 職務
              </div>
              <div className="p-2 text-slate-800">
                {request.applicantDepartment}
              </div>
            </div>

            {/* Row 2: Type & Payment */}
            <div className="grid grid-cols-4 divide-x divide-slate-300">
              <div className="p-2 font-bold text-slate-700 bg-slate-100 flex items-center justify-center">
                調代課類別
              </div>
              <div className="p-2 font-medium text-slate-900">
                {getTypeName(request.requestType)}
                {isMergedBatch ? '（連續節次合併）' : ''}
              </div>
              <div className="p-2 font-bold text-slate-700 bg-slate-100 flex items-center justify-center">
                課點鐘點費支給
              </div>
              <div className="p-2 font-medium">
                {(() => {
                  const periods = groupedSessions.map((s) => s.period);
                  const hasCounseling = periods.some((p) => p === 8);
                  const hasDay = periods.some((p) => p !== 8);
                  const rateLabel =
                    hasCounseling && hasDay
                      ? `日間 ${systemConfig.dayHourlyRate}／課輔 ${systemConfig.nightHourlyRate}元/節`
                      : hasCounseling
                        ? `${systemConfig.nightHourlyRate}元/節（第八節課輔）`
                        : `${systemConfig.dayHourlyRate}元/節`;
                  return request.paymentType === 'public' ? (
                    <span className="text-blue-700 font-bold">
                      公費派代 (學校公款支領 {rateLabel}
                      {isMergedBatch ? ` × ${groupedSessions.length}節` : ''})
                    </span>
                  ) : (
                    <span className="text-amber-800 font-bold">
                      自費代課 (申請教師自付 {rateLabel}
                      {isMergedBatch ? ` × ${groupedSessions.length}節` : ''})
                    </span>
                  );
                })()}
              </div>
            </div>

            {/* Row 3: Reason & Leave Type */}
            <div className="grid grid-cols-4 divide-x divide-slate-300 bg-slate-50">
              <div className="p-2 font-bold text-slate-700 bg-slate-100 flex items-center justify-center">
                事由與假別
              </div>
              <div className="p-2 col-span-3 text-slate-800">
                {request.leaveType && (
                  <span className="font-semibold text-slate-900 mr-2">
                    【{getLeaveTypeName(request.leaveType)}】
                  </span>
                )}
                {request.reason}
              </div>
            </div>

            {/* Row 4: Original Session Info */}
            <div className="grid grid-cols-4 divide-x divide-slate-300">
              <div className="p-2 font-bold text-slate-700 bg-slate-100 flex items-center justify-center">
                原排定授課堂
              </div>
              <div className="p-2 col-span-3 text-slate-900">
                {isMergedBatch ? (
                  <>
                    <div className="font-medium text-slate-800 mb-1.5">
                      時段：<strong>{periodRangeLabel}</strong>
                      {request.requestType === 'substitute' && (
                        <span className="ml-3">
                          請假日期：
                          <strong>
                            {formatLeaveDateLabel(request.leaveDateStart, request.leaveDateEnd)}
                          </strong>
                        </span>
                      )}
                    </div>
                    <div className="space-y-2">
                      {courseBlocks.map((block, idx) => (
                        <div
                          key={`${block.className}-${block.subjectName}-${block.periodStart}-${idx}`}
                          className="leading-relaxed"
                        >
                          <div className="font-bold text-indigo-900">
                            {formatPeriodBlockLabel(block.periodStart, block.periodEnd)}
                          </div>
                          <div>
                            {block.className}《{block.subjectName}》
                            {block.isPractical ? (
                              <span className="ml-1.5 px-1.5 py-0.5 bg-amber-100 text-amber-800 text-[11px] rounded font-medium">
                                專業實習
                              </span>
                            ) : null}
                            {block.isConcurrent ? (
                              <span className="ml-1.5 px-1.5 py-0.5 bg-violet-100 text-violet-800 text-[11px] rounded font-medium">
                                兼課
                              </span>
                            ) : null}
                          </div>
                          <div className="text-slate-600">@ {block.venueName}</div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="font-medium">
                      班級：<strong>{originalSession.className}</strong> ｜ 科目：
                      <strong>{originalSession.subjectName}</strong>
                    </div>
                    <div className="text-slate-600 mt-0.5">
                      時段：{periodRangeLabel} ｜ 上課地點：
                      <strong className="text-slate-800">{originalSession.venueName}</strong>
                      {originalSession.isConcurrent && (
                        <span className="ml-2 px-1.5 py-0.5 bg-violet-100 text-violet-800 text-[11px] rounded font-medium">
                          兼課
                        </span>
                      )}
                      {originalSession.isPractical && (
                        <span className="ml-2 px-1.5 py-0.5 bg-amber-100 text-amber-800 text-[11px] rounded font-medium">
                          專業實習工場課程
                        </span>
                      )}
                    </div>
                    {request.requestType === 'substitute' && (
                      <div className="text-slate-800 mt-1 font-medium">
                        請假日期：
                        <strong className="ml-1">
                          {formatLeaveDateLabel(request.leaveDateStart, request.leaveDateEnd)}
                        </strong>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Row 5: Adjustment Particulars */}
            <div className="grid grid-cols-4 divide-x divide-slate-300 bg-slate-50">
              <div className="p-2 font-bold text-slate-700 bg-slate-100 flex items-center justify-center">
                調代課安排內容
              </div>
              <div className="p-2 col-span-3 text-slate-900">
                {request.requestType === 'substitute' && (
                  <div>
                    <span className="text-slate-600">指派代課教師：</span>
                    <strong className="text-indigo-800 text-base ml-1">
                      {request.substituteTeacherName || '由教學組指派'}
                    </strong>
                    <span className="text-xs text-slate-500 ml-2">
                      (具高職同科合格教師證或實習工場操作資格
                      {isMergedBatch ? `；連續 ${groupedSessions.length} 節同一代課` : ''})
                    </span>
                  </div>
                )}

                {request.requestType === 'reschedule' && request.targetReschedule && (
                  <div>
                    <span className="text-slate-600">移至補課時段：</span>
                    <strong className="text-indigo-800 ml-1">
                      {dayNames[request.targetReschedule.dayOfWeek]} {getPeriodLabel(request.targetReschedule.period)}
                    </strong>
                    <span className="ml-3 text-slate-600">移至場地：</span>
                    <strong className="text-slate-800">{request.targetReschedule.venueName}</strong>
                  </div>
                )}

                {request.requestType === 'swap' && request.swapTargetSession && (
                  <div>
                    <div>
                      <span className="text-slate-600">
                        同班對調（{request.swapMode === 'permanent' || (!request.swapMode && !request.effectiveDate) ? '永久' : '暫時'}）對象：
                      </span>
                      <strong className="text-indigo-800">{request.swapTargetTeacherName}</strong>
                    </div>
                    <div className="text-xs text-slate-600 mt-1">
                      對調課堂：{request.swapTargetSession.className} 《{request.swapTargetSession.subjectName}》
                      （{dayNames[request.swapTargetSession.dayOfWeek]} {getPeriodLabel(request.swapTargetSession.period)} @ {request.swapTargetSession.venueName}）
                    </div>
                    {request.effectiveDate && (
                      <div className="text-xs text-indigo-800 mt-1 font-medium">
                        生效：
                        {formatTemporarySwapEffectLabel(
                          request.effectiveDate,
                          request.originalSession.dayOfWeek,
                          request.swapTargetSession.dayOfWeek
                        )}
                        （不改週課表模板）
                      </div>
                    )}
                    {(request.swapMode === 'permanent' || (!request.swapMode && !request.effectiveDate)) && (
                      <div className="text-xs text-emerald-800 mt-1 font-medium">
                        永久對調：已／將改寫週課表模板
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Row 6: Notice Requirements */}
            <div className="p-2.5 text-xs text-slate-600 bg-amber-50/50 space-y-1">
              <p className="font-semibold text-slate-700">注意事項與法規依據：</p>
              <p>1. 本單據依據《高級中等學校教師每週授課節數標準》及《技術型高中實習工場安全衛生管理規範》辦理。</p>
              <p>2. 實習工場課程調代課請代課/授課教師務必於課前落實設備點交與工場安全防護宣導。</p>
              <p>3. 請於課堂前將本單影本送交「班級學藝股長」與「實習工場管理員」備查，正本由教務處教學組存查核發鐘點費。</p>
            </div>
          </div>

          {/* Official Signatures Grid */}
          <div className="mt-6 border border-slate-400 divide-x divide-slate-300 grid grid-cols-4 text-center text-xs">
            
            {/* Applicant Stamp */}
            <div className="p-3">
              <div className="text-slate-600 font-bold mb-6">申請任課教師</div>
              <div className="inline-block border border-red-400 text-red-600 px-3 py-1 font-serif text-sm rounded">
                {request.applicantTeacherName.split(' ')[0]} 簽章
              </div>
              <div className="text-[10px] text-slate-400 mt-2">{request.createdAt.slice(0, 10)}</div>
            </div>

            {/* Substitute / Target Stamp */}
            <div className="p-3">
              <div className="text-slate-600 font-bold mb-6">代課 / 對調教師</div>
              <div className="inline-block border border-red-400 text-red-600 px-3 py-1 font-serif text-sm rounded">
                {(request.substituteTeacherName || request.swapTargetTeacherName || '本人移課').split(' ')[0]} 簽章
              </div>
              <div className="text-[10px] text-slate-400 mt-2">{request.createdAt.slice(0, 10)}</div>
            </div>

            {/* Academic Affairs Section Chief */}
            <div className="p-3">
              <div className="text-slate-600 font-bold mb-4">教務處經辦 / 組長</div>
              <div className="inline-flex flex-col items-center">
                <div className="w-[5.75rem] border-2 border-red-500 text-red-700 px-2 py-1.5 font-serif font-bold text-sm rounded leading-tight space-y-0.5">
                  <span className="flex w-full justify-between">
                    {Array.from(reviewerStamp.name).map((ch, i) => (
                      <span key={`n-${ch}-${i}`}>{ch}</span>
                    ))}
                  </span>
                  {reviewerStamp.title && (
                    <span className="flex w-full justify-between text-[11px] font-semibold">
                      {Array.from(reviewerStamp.title).map((ch, i) => (
                        <span key={`t-${ch}-${i}`}>{ch}</span>
                      ))}
                    </span>
                  )}
                </div>
                {reviewerStamp.note && (
                  <div className="mt-1 text-[10px] text-red-700 font-bold text-center tracking-tight">
                    {reviewerStamp.note}
                  </div>
                )}
              </div>
              <div className="text-[10px] text-emerald-700 font-semibold mt-2">
                {request.reviewedAt || '—'} 核准
              </div>
            </div>

            {/* Dean of Academic Affairs / Principal */}
            <div className="p-3">
              <div className="text-slate-600 font-bold mb-6">教務主任 / 校長</div>
              <div className="inline-block border-2 border-red-600 text-red-800 px-4 py-1 font-serif font-bold text-sm rounded">
                教務處 決行
              </div>
              <div className="text-[10px] text-slate-400 mt-2">存查建檔</div>
            </div>
          </div>

          {/* Student Class & Workshop Check Footer */}
          <div className="mt-3 flex justify-between items-center text-xs text-slate-500 border-t border-slate-200 pt-2">
            <span>班級學藝股長簽收：__________________</span>
            <span>實習工場管理員備查：__________________</span>
            <span>主計室出納課點費核銷勾稽欄：[ ✓ ]</span>
          </div>
        </div>

        {/* Modal Footer (Hidden when printing) */}
        <div className="print:hidden bg-slate-100 px-6 py-3 border-t border-slate-200 flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-semibold rounded-lg transition"
          >
            關閉視窗
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center space-x-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-lg shadow transition"
          >
            <Printer className="w-4 h-4" />
            <span>列印通知單</span>
          </button>
        </div>

    </ModalShell>
  );
};
