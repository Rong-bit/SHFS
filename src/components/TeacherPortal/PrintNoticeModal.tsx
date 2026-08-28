import React, { useEffect, useMemo, useState } from 'react';
import { CourseSession, DayOfWeek, SubstituteNoticeRow, SubstituteRequest } from '../../types';
import { resolveOriginalSession } from '../../utils/resolveOriginalSession';
import { useApp } from '../../context/AppContext';
import { resolveLeaveDateEnd } from '../../utils/leaveDates';
import { leaveTypeRemarkShort } from '../../utils/leaveTypes';
import { dateToIsoLocal } from '../../utils/holidays';
import {
  isTemporarySwap,
  resolveTemporarySwapOccurrenceDates,
} from '../../utils/temporarySwap';
import { Printer, X } from 'lucide-react';
import { ModalShell } from '../Common/ModalShell';
import { printWithDocumentTitle } from '../../utils/printWithDocumentTitle';
import { parseNoticeRowDateToIso } from '../../utils/noticePayroll';
import teachingSectionStampUrl from '../../assets/teaching-section-stamp.png';

interface PrintNoticeModalProps {
  request: SubstituteRequest;
  onClose: () => void;
}

type NoticeRow = SubstituteNoticeRow;

const MAX_NOTICE_TABLE_ROWS = 7;

const EMPTY_NOTICE_ROW: NoticeRow = {
  date: '',
  weekday: '',
  period: '',
  className: '',
  subjectName: '',
  hours: '',
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

function rowsEqual(a: NoticeRow[], b: NoticeRow[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((row, i) => {
    const other = b[i];
    return (
      row.date === other.date &&
      row.weekday === other.weekday &&
      row.period === other.period &&
      row.className === other.className &&
      row.subjectName === other.subjectName &&
      row.hours === other.hours
    );
  });
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
  position: relative;
}
.substitute-notice-page-stamp {
  position: absolute;
  right: 1cm;
  bottom: 0.5cm;
  width: 37.5mm;
  aspect-ratio: 200 / 205;
  pointer-events: none;
  z-index: 5;
}
.substitute-notice-page-stamp-base {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}
.substitute-notice-page-stamp-date-mask {
  position: absolute;
  left: 8%;
  right: 8%;
  top: 45%;
  height: 18%;
  background: #fff;
}
.substitute-notice-page-stamp-date {
  position: absolute;
  left: 50%;
  top: 53%;
  transform: translate(-50%, -50%);
  font-family: "DFKai-SB", "DFKaiShu-SB-Estd-BF", "標楷體", "KaiTi", "STKaiti", "BiauKai", serif;
  font-size: 17pt;
  line-height: 1;
  color: #2a4f9c;
  letter-spacing: 0.04em;
  white-space: nowrap;
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
    position: relative !important;
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
  }
  .substitute-notice-page-stamp {
    position: absolute !important;
    right: 1cm !important;
    bottom: 0.5cm !important;
    width: 37.5mm !important;
    aspect-ratio: 200 / 205 !important;
    height: auto !important;
    opacity: 1 !important;
    pointer-events: none !important;
    z-index: 5 !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .substitute-notice-page-stamp-date-mask {
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

/** 戳章日期格式，例 115. 8. 28 */
function formatStampRocDate(date: Date = new Date()): string {
  const roc = date.getFullYear() - 1911;
  return `${roc}. ${date.getMonth() + 1}. ${date.getDate()}`;
}

function resolveStampDateLabel(pageRows: NoticeRow[]): string {
  for (const row of pageRows) {
    const iso = parseNoticeRowDateToIso(row.date);
    if (!iso) continue;
    const [y, m, d] = iso.split('-').map(Number);
    if (!y || !m || !d) continue;
    return formatStampRocDate(new Date(y, m - 1, d));
  }
  return formatStampRocDate();
}

const NoticePageStamp: React.FC<{ dateLabel: string }> = ({ dateLabel }) => (
  <div className="substitute-notice-page-stamp" aria-hidden>
    <img src={teachingSectionStampUrl} alt="" className="substitute-notice-page-stamp-base" />
    <div className="substitute-notice-page-stamp-date-mask" />
    <span className="substitute-notice-page-stamp-date">{dateLabel}</span>
  </div>
);

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
    hours: '',
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
            <td>{row.hours || '\u00A0'}</td>
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

  </div>
  );
};

const WEEKDAY_OPTIONS = [
  { value: '1', label: '一' },
  { value: '2', label: '二' },
  { value: '3', label: '三' },
  { value: '4', label: '四' },
  { value: '5', label: '五' },
];

const NoticeTableEditor: React.FC<{
  rows: NoticeRow[];
  onChange: (rows: NoticeRow[]) => void;
  onReset: () => void;
  onSave: () => void;
}> = ({ rows, onChange, onReset, onSave }) => {
  const updateRow = (index: number, field: keyof NoticeRow, value: string) => {
    onChange(rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  };

  const addRow = () => {
    onChange([...rows, { ...EMPTY_NOTICE_ROW }]);
  };

  const removeRow = (index: number) => {
    if (rows.length <= 1) return;
    onChange(rows.filter((_, i) => i !== index));
  };

  return (
    <div className="print:hidden mb-4 rounded-xl border border-indigo-200 bg-indigo-50/80 p-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-bold text-indigo-900">課程表格（可人工調整）</p>
          <p className="text-[10px] text-indigo-800 leading-snug mt-0.5">
            日期、星期、節次、班級、科目、鐘點可手動輸入；按「儲存表格」後，代課清冊會依此表格以基本鐘點計算。未儲存修改者，清冊仍依課表原邏輯。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onReset}
            className="px-2.5 py-1 text-[11px] font-semibold rounded-lg border border-indigo-300 bg-white text-indigo-800 hover:bg-indigo-100"
          >
            還原課表
          </button>
          <button
            type="button"
            onClick={addRow}
            className="px-2.5 py-1 text-[11px] font-semibold rounded-lg border border-indigo-300 bg-white text-indigo-800 hover:bg-indigo-100"
          >
            新增一列
          </button>
          <button
            type="button"
            onClick={onSave}
            className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-indigo-600 text-white hover:bg-indigo-500"
          >
            儲存表格
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse bg-white">
          <thead>
            <tr className="bg-indigo-100 text-indigo-900">
              <th className="border border-indigo-200 px-2 py-1.5 font-semibold">日期</th>
              <th className="border border-indigo-200 px-2 py-1.5 font-semibold w-16">星期</th>
              <th className="border border-indigo-200 px-2 py-1.5 font-semibold w-16">節次</th>
              <th className="border border-indigo-200 px-2 py-1.5 font-semibold">班級</th>
              <th className="border border-indigo-200 px-2 py-1.5 font-semibold">科目</th>
              <th className="border border-indigo-200 px-2 py-1.5 font-semibold w-16">鐘點</th>
              <th className="border border-indigo-200 px-2 py-1.5 font-semibold w-14">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`notice-edit-${index}`}>
                <td className="border border-indigo-200 p-1">
                  <input
                    type="text"
                    value={row.date}
                    onChange={(e) => updateRow(index, 'date', e.target.value)}
                    placeholder="例 115/6/17"
                    className="w-full min-w-[7rem] px-2 py-1 border border-slate-200 rounded text-xs"
                  />
                </td>
                <td className="border border-indigo-200 p-1">
                  <select
                    value={row.weekday}
                    onChange={(e) => updateRow(index, 'weekday', e.target.value)}
                    className="w-full px-1 py-1 border border-slate-200 rounded text-xs"
                  >
                    <option value="">—</option>
                    {WEEKDAY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="border border-indigo-200 p-1">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={row.period}
                    onChange={(e) => updateRow(index, 'period', e.target.value)}
                    placeholder="1-8"
                    className="w-full px-2 py-1 border border-slate-200 rounded text-xs text-center"
                  />
                </td>
                <td className="border border-indigo-200 p-1">
                  <input
                    type="text"
                    value={row.className}
                    onChange={(e) => updateRow(index, 'className', e.target.value)}
                    placeholder="班級"
                    className="w-full min-w-[5rem] px-2 py-1 border border-slate-200 rounded text-xs"
                  />
                </td>
                <td className="border border-indigo-200 p-1">
                  <input
                    type="text"
                    value={row.subjectName}
                    onChange={(e) => updateRow(index, 'subjectName', e.target.value)}
                    placeholder="科目"
                    className="w-full min-w-[5rem] px-2 py-1 border border-slate-200 rounded text-xs"
                  />
                </td>
                <td className="border border-indigo-200 p-1">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={row.hours}
                    onChange={(e) => updateRow(index, 'hours', e.target.value)}
                    placeholder="鐘點"
                    className="w-full px-2 py-1 border border-slate-200 rounded text-xs text-center"
                  />
                </td>
                <td className="border border-indigo-200 p-1 text-center">
                  <button
                    type="button"
                    onClick={() => removeRow(index)}
                    disabled={rows.length <= 1}
                    className="text-[10px] text-rose-700 disabled:text-slate-300 font-semibold"
                  >
                    刪除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export const PrintNoticeModal: React.FC<PrintNoticeModalProps> = ({ request, onClose }) => {
  const { systemConfig, sessions, requests, saveNoticeRows } = useApp();

  const liveRequest = useMemo(
    () => requests.find((r) => r.id === request.id) ?? request,
    [requests, request]
  );

  const printGroup = useMemo(
    () =>
      liveRequest.status === 'approved' && liveRequest.batchGroupId
        ? requests
            .filter(
              (r) => r.batchGroupId === liveRequest.batchGroupId && r.status === 'approved'
            )
            .sort(
              (a, b) =>
                a.originalSession.dayOfWeek - b.originalSession.dayOfWeek ||
                a.originalSession.period - b.originalSession.period
            )
        : [liveRequest],
    [liveRequest, requests]
  );
  const groupedSessions = useMemo(
    () => printGroup.map((r) => resolveOriginalSession(r, sessions)),
    [printGroup, sessions]
  );
  const originalSession = groupedSessions[0] || resolveOriginalSession(liveRequest, sessions);
  const requestNumberLabel =
    printGroup.length > 1
      ? printGroup[0].requestNumber === printGroup[printGroup.length - 1].requestNumber
        ? printGroup[0].requestNumber
        : `${printGroup[0].requestNumber}～${printGroup[printGroup.length - 1].requestNumber}`
      : liveRequest.requestNumber;

  const leaveShort = leaveTypeRemarkShort(liveRequest.leaveType, liveRequest.reason);
  const leaveStart = liveRequest.leaveDateStart || '';
  const leaveEnd = resolveLeaveDateEnd(leaveStart, liveRequest.leaveDateEnd) || leaveStart;

  const noticeMeta = useMemo(() => {
    if (liveRequest.requestType === 'reschedule') {
      const target = liveRequest.targetReschedule;
      return {
        title: '調課通知單',
        addressee: teacherLabel(liveRequest.applicantTeacherName, '申請'),
        greeting: `您好！您申請自行移課如下，請依新時段授課，`,
        defaultRows: groupedSessions.map((sess) =>
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
        ),
      };
    }

    if (liveRequest.requestType === 'swap' && liveRequest.swapTargetSession) {
      let applicantDate: string | undefined;
      let partnerDate: string | undefined;
      if (isTemporarySwap(liveRequest) && liveRequest.effectiveDate) {
        const occ = resolveTemporarySwapOccurrenceDates(
          liveRequest.effectiveDate,
          originalSession.dayOfWeek,
          liveRequest.swapTargetSession.dayOfWeek
        );
        applicantDate = occ.applicantDate;
        partnerDate = occ.partnerDate;
      }
      return {
        title: '調課通知單',
        addressee: teacherLabel(liveRequest.swapTargetTeacherName, '對調'),
        greeting: `您好！${teacherLabel(liveRequest.applicantTeacherName, '申請')}申請同班對調如下，請依對調時段授課，`,
        defaultRows: [
          sessionRow(originalSession, applicantDate),
          sessionRow(liveRequest.swapTargetSession, partnerDate),
        ],
      };
    }

    return {
      title: '代課通知單',
      addressee: teacherLabel(liveRequest.substituteTeacherName),
      greeting: `您好！${teacherLabel(liveRequest.applicantTeacherName, '申請')}因${leaveShort}請您代理以下課程，`,
      defaultRows: buildLeaveRangeNoticeRows(groupedSessions, leaveStart, leaveEnd),
    };
  }, [liveRequest, groupedSessions, originalSession, leaveShort, leaveStart, leaveEnd]);

  const { title, addressee, greeting, defaultRows } = noticeMeta;

  const savedNoticeRows = useMemo(() => {
    if (liveRequest.noticeRowsCustomized && liveRequest.noticeRows?.length) {
      return liveRequest.noticeRows;
    }
    const batchSaved = printGroup.find(
      (r) => r.noticeRowsCustomized && r.noticeRows?.length
    );
    return batchSaved?.noticeRows ?? null;
  }, [liveRequest.noticeRows, liveRequest.noticeRowsCustomized, printGroup]);

  const [editableRows, setEditableRows] = useState<NoticeRow[]>(defaultRows);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    setEditableRows(savedNoticeRows ?? defaultRows);
    setIsDirty(false);
  }, [request.id]);

  useEffect(() => {
    if (!liveRequest.noticeRowsCustomized || !savedNoticeRows) return;
    setEditableRows(savedNoticeRows);
    setIsDirty(false);
  }, [liveRequest.noticeRowsCustomized, savedNoticeRows]);

  const rows = editableRows;

  const persistNoticeRows = () => {
    if (rowsEqual(editableRows, defaultRows)) {
      saveNoticeRows(liveRequest.id, null);
      setIsDirty(false);
      return;
    }
    saveNoticeRows(liveRequest.id, editableRows);
    setIsDirty(false);
  };

  const handleRowsChange = (next: NoticeRow[]) => {
    setEditableRows(next);
    setIsDirty(true);
  };

  const handleResetRows = () => {
    setEditableRows(defaultRows);
    setIsDirty(!rowsEqual(defaultRows, savedNoticeRows ?? defaultRows) || Boolean(liveRequest.noticeRowsCustomized));
  };

  const rowPages = chunkNoticeRows(rows, MAX_NOTICE_TABLE_ROWS);
  const multiPage = rowPages.length > 1;
  const previewLabel = `${title}列印預覽（校內格式 · 一頁兩聯 · 上聯留存${multiPage ? ` · 共 ${rowPages.length} 張` : ''}）`;
  const issueDateLabel = formatNoticeIssueRocDate();

  const handlePrint = () => {
    if (isDirty) persistNoticeRows();
    const school = systemConfig.schoolName || '學校';
    printWithDocumentTitle(`${school}_${title}_${liveRequest.requestNumber}`);
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
        <NoticeTableEditor
          rows={editableRows}
          onChange={handleRowsChange}
          onReset={handleResetRows}
          onSave={persistNoticeRows}
        />
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
              <NoticePageStamp dateLabel={resolveStampDateLabel(pageRows)} />
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
            <span>{isDirty ? '儲存並列印通知單' : '列印通知單'}</span>
        </button>
      </div>
    </ModalShell>
  );
};
