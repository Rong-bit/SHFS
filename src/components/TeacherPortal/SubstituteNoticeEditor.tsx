import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle } from 'lucide-react';
import { SubstituteRequest } from '../../types';
import { useApp } from '../../context/AppContext';
import { ModalShell } from '../Common/ModalShell';
import {
  buildNoticeDocument,
  EMPTY_NOTICE_ROW,
  formatNoticeHoursDisplay,
  formatNoticeWeekdayLabel,
  type NoticeRow,
} from '../../utils/noticeDocument';

export type { NoticeRow };
export { formatNoticeHoursDisplay, formatNoticeWeekdayLabel };

export const MAX_NOTICE_TABLE_ROWS = 7;

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

export function chunkNoticeRows(rows: NoticeRow[], size: number): NoticeRow[][] {
  if (rows.length === 0) return [[]];
  const chunks: NoticeRow[][] = [];
  for (let i = 0; i < rows.length; i += size) {
    chunks.push(rows.slice(i, i + size));
  }
  return chunks;
}

export function useSubstituteNoticeEditor(request: SubstituteRequest) {
  const { sessions, requests, saveNoticeRows } = useApp();

  const noticeDoc = useMemo(
    () => buildNoticeDocument(request, requests, sessions),
    [request, requests, sessions]
  );
  const {
    liveRequest,
    printGroup,
    defaultRows,
    savedNoticeRows,
    displayRows,
    title,
    addressee,
    greeting,
  } = noticeDoc;

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

  const discardChanges = () => {
    setEditableRows(savedNoticeRows ?? defaultRows);
    setIsDirty(false);
  };

  return {
    liveRequest,
    printGroup,
    editableRows,
    displayRows,
    isDirty,
    defaultRows,
    title,
    addressee,
    greeting,
    onRowsChange: handleRowsChange,
    onReset: handleResetRows,
    onSave: persistNoticeRows,
    discardChanges,
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
  const [saveSuccessOpen, setSaveSuccessOpen] = useState(false);

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

  const handleSave = () => {
    onSave();
    setSaveSuccessOpen(true);
  };

  return (
    <>
    <div
      className={`rounded-xl border border-indigo-200 bg-indigo-50/80 space-y-2 ${
        compact ? 'p-2.5' : 'p-3'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-bold text-indigo-900">課程表格（可人工調整）</p>
          <p className="text-[10px] text-indigo-800 leading-snug mt-0.5">
            日期、星期、節次、班級、科目可手動輸入；鐘點欄兼課為「兼課」、基鐘留白。按「儲存表格」後，僅有修改的列改入代課清冊（基本鐘點）；未改的列仍依課表原邏輯（兼課走兼課轉移，基鐘走代課清冊）。請假人該節若為兼課仍應減；若為基鐘則照支原薪、不扣兼課。列印前請先儲存表格。
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
            onClick={handleSave}
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
                    placeholder="例 2026/8/25"
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
                  <select
                    value={row.hours === '兼課' ? '兼課' : ''}
                    onChange={(e) => updateRow(index, 'hours', e.target.value)}
                    className="w-full px-1 py-1 border border-slate-200 rounded text-xs text-center"
                  >
                    <option value="">—</option>
                    <option value="兼課">兼課</option>
                  </select>
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
    {saveSuccessOpen &&
      createPortal(
        <ModalShell
          zClassName="z-[80]"
          scroll="panel"
          backdropClassName="bg-slate-900/50 backdrop-blur-xs"
          panelClassName="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-slate-200"
        >
          <div className="p-6">
            <div className="flex items-center space-x-2 text-emerald-700 font-bold text-base">
              <CheckCircle className="w-6 h-6 shrink-0" />
              <span>課程表格已儲存</span>
            </div>
            <p className="text-sm text-slate-600 mt-3 leading-relaxed">
              已儲存。僅修改過的列改入代課清冊；未改的列仍依課表原邏輯。請假人該節若為兼課仍應減；若為基鐘則照支原薪、不扣兼課。
            </p>
            <div className="flex justify-end mt-5">
              <button
                type="button"
                onClick={() => setSaveSuccessOpen(false)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-xs transition"
              >
                確定
              </button>
            </div>
          </div>
        </ModalShell>,
        document.body
      )}
    </>
  );
};
