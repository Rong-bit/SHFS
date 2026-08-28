import React from 'react';
import { CourseSession, DayOfWeek, SubstituteRequest } from '../../types';
import { resolveOriginalSession } from '../../utils/resolveOriginalSession';
import { useApp } from '../../context/AppContext';
import { resolveLeaveDateEnd } from '../../utils/leaveDates';
import { leaveTypeRemarkShort, isInvigilationLeaveRequest } from '../../utils/leaveTypes';
import { dateToIsoLocal } from '../../utils/holidays';
import {
  isTemporarySwap,
  resolveTemporarySwapOccurrenceDates,
} from '../../utils/temporarySwap';
import { Printer, X } from 'lucide-react';
import { ModalShell } from '../Common/ModalShell';
import { printWithDocumentTitle } from '../../utils/printWithDocumentTitle';

interface PrintNoticeModalProps {
  request: SubstituteRequest;
  onClose: () => void;
}

type NoticeRow = {
  date: string;
  weekday: string;
  period: string;
  className: string;
  subjectName: string;
};

const MAX_NOTICE_TABLE_ROWS = 7;

const EMPTY_NOTICE_ROW: NoticeRow = {
  date: '',
  weekday: '',
  period: '',
  className: '',
  subjectName: '',
};

function normalizeNoticeRows(rows: NoticeRow[]): NoticeRow[] {
  const padded = [...rows];
  while (padded.length < MAX_NOTICE_TABLE_ROWS) {
    padded.push({ ...EMPTY_NOTICE_ROW });
  }
  return padded;
}

function sortNoticeRows(rows: NoticeRow[]): NoticeRow[] {
  return [...rows].sort((a, b) => {
    const dateA = a.date.replace(/\//g, '-');
    const dateB = b.date.replace(/\//g, '-');
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    const periodA = Number(a.period) || 0;
    const periodB = Number(b.period) || 0;
    if (periodA !== periodB) return periodA - periodB;
    return a.className.localeCompare(b.className, 'zh-Hant');
  });
}

function buildLeaveRangeNoticeRows(
  groupedSessions: CourseSession[],
  leaveStart: string,
  leaveEnd: string
): NoticeRow[] {
  const rows = groupedSessions.flatMap((sess) => {
    const dates =
      leaveStart && leaveEnd && sess.dayOfWeek
        ? listDatesMatchingWeekday(leaveStart, leaveEnd, sess.dayOfWeek)
        : leaveStart
          ? [leaveStart]
          : [''];
    const dateList = dates.length ? dates : [leaveStart || ''];
    return dateList.map((iso) => sessionRow(sess, iso || undefined));
  });
  return sortNoticeRows(rows);
}

function chunkNoticeRows(rows: NoticeRow[], size: number): NoticeRow[][] {
  if (rows.length === 0) return [[]];
  const chunks: NoticeRow[][] = [];
  for (let i = 0; i < rows.length; i += size) {
    chunks.push(rows.slice(i, i + size));
  }
  return chunks;
}

const NOTICE_PRINT_CSS = `
.substitute-notice-print-root {
  font-family: "DFKai-SB", "DFKaiShu-SB-Estd-BF", "標楷體", "KaiTi", "STKaiti", "BiauKai", serif;
  color: #000;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}
.substitute-notice-print-page {
  display: flex;
  flex-direction: column;
}
.substitute-notice-copy {
  color: #000;
  max-height: 138.5mm;
  overflow: hidden;
  box-sizing: border-box;
}
.substitute-notice-title {
  font-size: 16pt;
  line-height: 1.2;
  text-align: center;
  letter-spacing: 0.12em;
}
.substitute-notice-title span {
  display: inline-block;
  border-bottom: 1px solid #000;
  padding: 0 0.15em 1px;
}
.substitute-notice-no {
  font-size: 12pt;
  letter-spacing: 0;
  text-align: right;
  white-space: nowrap;
}
.substitute-notice-body {
  font-size: 16pt;
  line-height: 1.35;
}
.substitute-notice-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 16pt;
  line-height: 1.2;
}
.substitute-notice-table th,
.substitute-notice-table td {
  border: 1px solid #000;
  padding: 2px 4px;
  text-align: center;
  vertical-align: middle;
  font-weight: normal;
  height: 1.35em;
}
.substitute-notice-fold {
  flex: 0 0 0;
  border-top: 1px dashed #666;
  margin: 0;
  height: 0;
}
.substitute-notice-copy-lower {
  padding-top: 0.5cm;
  box-sizing: border-box;
  position: relative;
}
.substitute-notice-copy-stamp {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 28mm;
  height: auto;
  pointer-events: none;
  z-index: 2;
  opacity: 0.95;
}
.substitute-notice-table col.col-date { width: 18%; }
.substitute-notice-table col.col-week { width: 9%; }
.substitute-notice-table col.col-period { width: 9%; }
.substitute-notice-table col.col-class { width: 16.5%; }
.substitute-notice-table col.col-subject { width: 35.5%; }
.substitute-notice-table col.col-hours { width: 12%; }
.substitute-notice-sign {
  font-size: 16pt;
  line-height: 1.35;
  margin-top: 0.35em;
}
.substitute-notice-issue-date {
  font-size: 16pt;
  line-height: 1.35;
  text-align: right;
  margin-top: 0.35em;
}
@media print {
  @page {
    size: A4 portrait;
    margin: 0;
  }
  html, body {
    width: auto !important;
    height: auto !important;
    margin: 0 !important;
    padding: 0 !important;
    background: white !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  body *:not(style):not(:has(.substitute-notice-print-root)):not(.substitute-notice-print-root):not(.substitute-notice-print-root *) {
    display: none !important;
  }
  body *:has(.substitute-notice-print-root) {
    min-height: 0 !important;
    height: auto !important;
    max-height: none !important;
    overflow: visible !important;
    display: block !important;
    padding: 0 !important;
    margin: 0 !important;
    border: none !important;
    background: transparent !important;
    box-shadow: none !important;
    position: static !important;
  }
  .substitute-notice-print-root {
    width: 100% !important;
    height: auto !important;
    max-height: none !important;
    overflow: visible !important;
    display: block !important;
    padding: 0 !important;
    box-sizing: border-box !important;
    gap: 0 !important;
  }
  .substitute-notice-print-page {
    width: 100% !important;
    height: 297mm !important;
    max-height: 297mm !important;
    overflow: hidden !important;
    display: flex !important;
    flex-direction: column !important;
    padding: 8mm 12mm !important;
    box-sizing: border-box !important;
    page-break-after: always;
  }
  .substitute-notice-print-page:last-child {
    page-break-after: auto;
  }
  .substitute-notice-copy {
    flex: 0 0 50%;
    height: 50%;
    max-height: 50%;
    min-height: 0;
    overflow: hidden;
    box-sizing: border-box;
    page-break-inside: avoid;
    padding-bottom: 1mm;
  }
  .substitute-notice-copy-lower {
    padding-top: 0.5cm;
    position: relative;
  }
  .substitute-notice-copy-stamp {
    position: absolute !important;
    right: 0 !important;
    bottom: 0 !important;
    width: 28mm !important;
    height: auto !important;
    opacity: 1 !important;
    pointer-events: none !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .substitute-notice-fold {
    flex: 0 0 0;
    border-top: 1px dashed #666;
    height: 0;
    margin: 0;
  }
}
`;

function stripTeacherTitle(name?: string): string {
  return (name || '')
    .replace(/\s+/g, '')
    .replace(/(科主任|主任|組長|導師|老師)$/g, '');
}

function teacherLabel(name?: string, fallback = '代課'): string {
  const n = stripTeacherTitle(name);
  return n ? `${n}老師` : `${fallback}老師`;
}

function formatNoticeDate(iso?: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso.replace(/-/g, '/');
  return `${Number(y)}/${Number(m)}/${Number(d)}`;
}

/** 開立通知單日期，例 115.8.28 */
function formatNoticeIssueRocDate(date: Date = new Date()): string {
  const roc = date.getFullYear() - 1911;
  return `${roc}.${date.getMonth() + 1}.${date.getDate()}`;
}

function weekdayFromIso(iso?: string): number | null {
  if (!iso) return null;
  const d = new Date(iso.replace(/-/g, '/') + ' 12:00:00');
  if (Number.isNaN(d.getTime())) return null;
  const js = d.getDay();
  if (js < 1 || js > 5) return null;
  return js;
}

function listDatesMatchingWeekday(
  start: string,
  end: string,
  dayOfWeek: DayOfWeek
): string[] {
  const s = new Date(start.replace(/-/g, '/') + ' 12:00:00');
  const e = new Date(end.replace(/-/g, '/') + ' 12:00:00');
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) {
    return start ? [start] : [];
  }
  const dates: string[] = [];
  for (let cur = new Date(s); cur <= e; cur.setDate(cur.getDate() + 1)) {
    if (cur.getDay() === dayOfWeek) dates.push(dateToIsoLocal(cur));
  }
  return dates;
}

function sessionRow(
  session: CourseSession,
  dateIso?: string
): NoticeRow {
  const weekday = weekdayFromIso(dateIso) ?? session.dayOfWeek;
  return {
    date: formatNoticeDate(dateIso),
    weekday: String(weekday),
    period: String(session.period),
    className: session.className || '',
    subjectName: session.subjectName || '',
  };
}

const NoticeCopy: React.FC<{
  title: string;
  requestNumber: string;
  addressee: string;
  greeting: string;
  rows: NoticeRow[];
  issueDateLabel: string;
  showSignatureBlock?: boolean;
  isLowerCopy?: boolean;
}> = ({ title, requestNumber, addressee, greeting, rows, issueDateLabel, showSignatureBlock = true, isLowerCopy = false }) => {
  const tableRows = normalizeNoticeRows(rows);

  return (
  <div className={`substitute-notice-copy${isLowerCopy ? ' substitute-notice-copy-lower' : ''}`}>
    <div className="mb-2 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1.2fr)] items-end gap-2">
      <div />
      <div className="substitute-notice-title">
        <span>{title}</span>
      </div>
      <div className="substitute-notice-no">假單編號：{requestNumber}</div>
    </div>

    <div className="substitute-notice-body">
      <div>{addressee}：</div>
      <div className="mt-0.5">
        <span className="inline-block w-[2em]" aria-hidden>
          {'\u3000\u3000'}
        </span>
        {greeting}
      </div>
      <div className="mt-0.5 relative pr-[5.5em]">
        <span>並請學生記載於教學日誌內。謝謝。</span>
        <span className="absolute right-0 top-0 whitespace-nowrap">教務處　啟</span>
      </div>
    </div>

    <table className="substitute-notice-table mt-1">
      <colgroup>
        <col className="col-date" />
        <col className="col-week" />
        <col className="col-period" />
        <col className="col-class" />
        <col className="col-subject" />
        <col className="col-hours" />
      </colgroup>
      <thead>
        <tr>
          <th>日期</th>
          <th>星期</th>
          <th>節次</th>
          <th>班級</th>
          <th>科目</th>
          <th>鐘點</th>
        </tr>
      </thead>
      <tbody>
        {tableRows.map((row, idx) => (
          <tr key={`${row.date}-${row.period}-${row.className}-${idx}`}>
            <td>{row.date || '\u00A0'}</td>
            <td>{row.weekday || '\u00A0'}</td>
            <td>{row.period || '\u00A0'}</td>
            <td>{row.className || '\u00A0'}</td>
            <td>{row.subjectName || '\u00A0'}</td>
            <td>{'\u00A0'}</td>
          </tr>
        ))}
      </tbody>
    </table>

    {!isLowerCopy && (
      <div className="substitute-notice-issue-date">{issueDateLabel}</div>
    )}

    {showSignatureBlock && (
    <div className="substitute-notice-sign">
      <div className="flex">
        <div className="w-[34%]">承辦人：</div>
        <div className="w-[33%]">人事室：</div>
        <div className="flex-1">校長：</div>
      </div>
      <div className="mt-1">教學組長：</div>
      <div className="mt-1">教務主任：</div>
    </div>
    )}

    {isLowerCopy && (
      <img
        src="/teaching-section-stamp.png"
        alt=""
        className="substitute-notice-copy-stamp"
        aria-hidden
      />
    )}
  </div>
  );
};

export const PrintNoticeModal: React.FC<PrintNoticeModalProps> = ({ request, onClose }) => {
  const { systemConfig, sessions, requests } = useApp();

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
  const groupedSessions = printGroup.map((r) => resolveOriginalSession(r, sessions));
  const originalSession = groupedSessions[0] || resolveOriginalSession(request, sessions);
  const requestNumberLabel =
    printGroup.length > 1
      ? printGroup[0].requestNumber === printGroup[printGroup.length - 1].requestNumber
        ? printGroup[0].requestNumber
        : `${printGroup[0].requestNumber}～${printGroup[printGroup.length - 1].requestNumber}`
      : request.requestNumber;

  const leaveShort = leaveTypeRemarkShort(request.leaveType, request.reason);
  const leaveStart = request.leaveDateStart;
  const leaveEnd = resolveLeaveDateEnd(leaveStart, request.leaveDateEnd) || leaveStart;

  let title = '代課通知單';
  let addressee = teacherLabel(request.substituteTeacherName);
  let greeting = `您好！${teacherLabel(request.applicantTeacherName, '申請')}因${leaveShort}請您代理以下課程，`;
  let rows: NoticeRow[] = [];

  const isInvigilation = isInvigilationLeaveRequest(request);

  if (request.requestType === 'reschedule') {
    title = '調課通知單';
    addressee = teacherLabel(request.applicantTeacherName, '申請');
    greeting = `您好！您申請自行移課如下，請依新時段授課，`;
    const target = request.targetReschedule;
    rows = groupedSessions.map((sess) =>
      sessionRow(
        target
          ? {
              ...sess,
              dayOfWeek: target.dayOfWeek,
              period: target.period,
              venueId: target.venueId,
              venueName: target.venueName,
            }
          : sess
      )
    );
  } else if (request.requestType === 'swap' && request.swapTargetSession) {
    title = '調課通知單';
    addressee = teacherLabel(request.swapTargetTeacherName, '對調');
    greeting = `您好！${teacherLabel(request.applicantTeacherName, '申請')}申請同班對調如下，請依對調時段授課，`;
    let applicantDate: string | undefined;
    let partnerDate: string | undefined;
    if (isTemporarySwap(request) && request.effectiveDate) {
      const occ = resolveTemporarySwapOccurrenceDates(
        request.effectiveDate,
        originalSession.dayOfWeek,
        request.swapTargetSession.dayOfWeek
      );
      applicantDate = occ.applicantDate;
      partnerDate = occ.partnerDate;
    }
    rows = [
      sessionRow(originalSession, applicantDate),
      sessionRow(request.swapTargetSession, partnerDate),
    ];
  } else if (isInvigilation) {
    title = '監考通知單';
    addressee = teacherLabel(request.applicantTeacherName, '申請');
    greeting = `因${leaveShort}任務，以下原授課時段無法親自授課（本單無指定代課教師，監考教師領基本鐘點），`;
    rows = buildLeaveRangeNoticeRows(groupedSessions, leaveStart, leaveEnd);
  } else {
    rows = buildLeaveRangeNoticeRows(groupedSessions, leaveStart, leaveEnd);
  }

  const rowPages = chunkNoticeRows(rows, MAX_NOTICE_TABLE_ROWS);
  const multiPage = rowPages.length > 1;
  const previewLabel = `${title}列印預覽（校內格式 · 一頁兩聯 · 上聯留存${multiPage ? ` · 共 ${rowPages.length} 張` : ''}）`;
  const issueDateLabel = formatNoticeIssueRocDate();

  const handlePrint = () => {
    const school = systemConfig.schoolName || '學校';
    printWithDocumentTitle(`${school}_${title}_${request.requestNumber}`);
  };

  return (
    <ModalShell
      scroll="none"
      panelClassName="bg-white rounded-xl shadow-2xl max-w-3xl w-full border border-slate-200 overflow-hidden my-2 print:shadow-none print:rounded-none print:max-w-none print:w-full print:border-0 print:my-0 print:overflow-visible"
      backdropClassName="bg-slate-900/70 backdrop-blur-xs"
    >
      <style>{NOTICE_PRINT_CSS}</style>

      <div className="print:hidden bg-slate-800 text-white px-5 py-3.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center space-x-2 min-w-0">
            <Printer className="w-5 h-5 text-amber-400 shrink-0" />
            <span className="font-semibold text-sm truncate">{previewLabel}</span>
          </div>
          <div className="flex items-center space-x-2 shrink-0">
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
        <p className="print:hidden text-[10px] text-slate-400 mt-2 leading-snug">
          列印對話框請關閉「頁首與頁尾」，避免出現網址或頁碼。
        </p>
      </div>

      <div className="substitute-notice-print-root bg-white px-6 py-5 print:p-0">
        {multiPage && (
          <p className="print:hidden mb-3 text-xs text-indigo-800 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2">
            課程共 {rows.length} 列，已自動分成 {rowPages.length} 張通知單（每張最多 {MAX_NOTICE_TABLE_ROWS} 列）；列印時每張為獨立一頁。
          </p>
        )}
        {rowPages.map((pageRows, pageIdx) => {
          const pageRequestNumber = multiPage
            ? `${requestNumberLabel}（${pageIdx + 1}/${rowPages.length}）`
            : requestNumberLabel;
          return (
            <div key={pageIdx} className="substitute-notice-print-page">
              <NoticeCopy
                title={title}
                requestNumber={pageRequestNumber}
                addressee={addressee}
                greeting={greeting}
                rows={pageRows}
                issueDateLabel={issueDateLabel}
                showSignatureBlock
              />
              <div className="substitute-notice-fold" aria-hidden />
              <NoticeCopy
                title={title}
                requestNumber={pageRequestNumber}
                addressee={addressee}
                greeting={greeting}
                rows={pageRows}
                issueDateLabel={issueDateLabel}
                showSignatureBlock={false}
                isLowerCopy
              />
            </div>
          );
        })}
      </div>

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
