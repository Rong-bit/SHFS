import React, { useState } from 'react';
import { ArrowRightLeft } from 'lucide-react';
import { Teacher } from '../../types';
import { ModalShell } from '../Common/ModalShell';
import { TeacherSearchCombobox } from '../Common/TeacherSearchCombobox';

type ClassLogTransferDialogProps = {
  detail: string;
  teachers: Teacher[];
  /** 不可轉給的教師（例如自己） */
  excludeIds?: string[];
  consecutivePeriods?: number[];
  onClose: () => void;
  onConfirm: (teacherId: string, note: string, applyConsecutive: boolean) => void;
};

/** 把這一節（或連續節）的教室日誌填寫責任轉給其他老師 */
export const ClassLogTransferDialog: React.FC<ClassLogTransferDialogProps> = ({
  detail,
  teachers,
  excludeIds = [],
  consecutivePeriods = [],
  onClose,
  onConfirm,
}) => {
  const [teacherId, setTeacherId] = useState('');
  const [note, setNote] = useState('');
  const [applyConsecutive, setApplyConsecutive] = useState(false);
  const [error, setError] = useState('');
  const choices = teachers.filter((t) => !excludeIds.includes(t.id));

  return (
    <ModalShell
      panelClassName="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg"
      scroll="body"
      maxHeightClassName="max-h-[min(90dvh,720px)]"
    >
      <div className="shrink-0 px-4 sm:px-5 pt-4 sm:pt-5 pb-3 border-b border-slate-100">
        <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
          <ArrowRightLeft className="w-4 h-4 text-indigo-600" />
          轉移教室日誌
        </h3>
        <p className="mt-1 text-xs text-slate-600">{detail}</p>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-5 py-4 space-y-4">
        <p className="text-xs text-slate-600 leading-relaxed">
          轉出後，這一節改由對方填寫與截章。請人代課、或教學組改派填寫老師時都用這裡。尚未送出的進度不會跟著過去；對方開啟後可自行填寫。
        </p>
        <label className="block text-[11px] font-semibold text-slate-600">
          轉給
          <div className="mt-1">
            <TeacherSearchCombobox
              teachers={choices}
              currentTeacherId={teacherId}
              onSelectTeacher={(id) => {
                setTeacherId(id);
                setError('');
              }}
              placeholder="輸入姓名或科別搜尋要轉給的老師"
              variant="light"
              fullWidth
              allowClear
              clearLabel="不指定（清除）"
            />
          </div>
        </label>
        <label className="block text-[11px] font-semibold text-slate-600">
          備註（選填）
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="例：本日請代課，日誌請一併填寫"
            className="mt-1 w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-base sm:text-sm text-slate-900"
          />
        </label>
        {consecutivePeriods.length > 1 && (
          <label className="flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-xs text-sky-950">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={applyConsecutive}
              onChange={(e) => setApplyConsecutive(e.target.checked)}
            />
            <span>
              一併轉移連續節次（第{consecutivePeriods.join('、')}節，同班同科目）
            </span>
          </label>
        )}
        {error && <p className="text-xs text-rose-700">{error}</p>}
      </div>
      <div className="relative z-20 shrink-0 px-4 sm:px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-slate-100 bg-white flex gap-2">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 sm:flex-none min-h-11 px-3 py-2.5 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50 touch-manipulation"
        >
          取消
        </button>
        <button
          type="button"
          onClick={() => {
            if (!teacherId) {
              setError('請先選擇要轉給的老師');
              return;
            }
            onConfirm(teacherId, note, applyConsecutive);
          }}
          className="flex-[2] sm:flex-none min-h-12 px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-500 active:bg-indigo-700 touch-manipulation"
        >
          確認轉移
        </button>
      </div>
    </ModalShell>
  );
};
