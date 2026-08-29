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

export type NoticeRow = SubstituteNoticeRow;

const EMPTY_NOTICE_ROW: NoticeRow = {
  date: '',
  weekday: '',
  period: '',
  className: '',
  subjectName: '',
  hours: '',
};

function formatNoticeDate(iso?: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso.replace(/-/g, '/');
  return `${Number(y)}/${Number(m)}/${Number(d)}`;
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

function sessionRow(session: CourseSession, dateIso?: string): NoticeRow {
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

function stripTeacherTitle(name?: string): string {
  return (name || '')
    .replace(/\s+/g, '')
    .replace(/(科主任|主任|組長|導師|老師)$/g, '');
}

function teacherLabel(name?: string, fallback = '代課'): string {
  const n = stripTeacherTitle(name);
  return n ? `${n}老師` : `${fallback}老師`;
}

export function useSubstituteNoticeEditor(request: SubstituteRequest) {
  const { sessions, requests, saveNoticeRows } = useApp();

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

  const defaultRows = noticeMeta.defaultRows;

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

  useEffect(() => {
    if (savedNoticeRows) return;
    setEditableRows(defaultRows);
    setIsDirty(false);
  }, [defaultRows, savedNoticeRows]);

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
    setIsDirty(
      !rowsEqual(defaultRows, savedNoticeRows ?? defaultRows) ||
        Boolean(liveRequest.noticeRowsCustomized)
    );
  };

  return {
    liveRequest,
    printGroup,
    editableRows,
    isDirty,
    defaultRows,
    title: noticeMeta.title,
    addressee: noticeMeta.addressee,
    greeting: noticeMeta.greeting,
    onRowsChange: handleRowsChange,
    onReset: handleResetRows,
    onSave: persistNoticeRows,
  };
}

const WEEKDAY_OPTIONS = [
  { value: '1', label: '一' },
  { value: '2', label: '二' },
  { value: '3', label: '三' },
  { value: '4', label: '四' },
  { value: '5', label: '五' },
];

export const NoticeTableEditor: React.FC<{
  rows: NoticeRow[];
  onChange: (rows: NoticeRow[]) => void;
  onReset: () => void;
  onSave: () => void;
  compact?: boolean;
}> = ({ rows, onChange, onReset, onSave, compact = false }) => {
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
    <div
      className={`rounded-xl border border-indigo-200 bg-indigo-50/80 space-y-2 ${
        compact ? 'p-2.5' : 'p-3'
      }`}
    >
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
