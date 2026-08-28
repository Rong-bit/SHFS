import { AlertTriangle } from 'lucide-react';
import {
  WELLNESS_HOURS_PER_LEAVE_DAY,
  WELLNESS_LEAVE_LEGAL_NOTE,
} from '../../utils/leaveTypes';
import type { WellnessLeaveHoursStatus } from '../../utils/leavePayrollPolicy';

type Props = {
  status: WellnessLeaveHoursStatus | null;
  /** 尚未選請假日期時不顯示用量列 */
  showUsage?: boolean;
};

export function WellnessLeaveHoursAlert({ status, showUsage = true }: Props) {
  return (
    <div className="mt-1.5 space-y-1.5">
      <p className="text-[10px] text-teal-800 leading-snug bg-teal-50 border border-teal-200 rounded-lg px-2 py-1.5">
        {WELLNESS_LEAVE_LEGAL_NOTE}
      </p>
      {showUsage && status && (status.usedHours > 0 || status.draftDays > 0) && (
        <p className="text-[10px] text-slate-700 leading-snug bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5">
          本學年已用 <strong>{status.usedHours}</strong>／{status.limit} 小時
          {status.draftDays > 0 && (
            <>
              ，本次 <strong>{status.draftHours}</strong> 小時
              {status.exceeded ? (
                <>
                  ，合計 <strong className="text-rose-700">{status.totalHours}</strong> 小時
                </>
              ) : (
                <>
                  ，送出後剩餘 <strong>{Math.max(0, status.remainingAfterDraft)}</strong> 小時
                </>
              )}
            </>
          )}
          <span className="text-slate-500">
            （一天 {WELLNESS_HOURS_PER_LEAVE_DAY} 小時
            {status.draftDays > 0 && <> · 本次 {status.draftDays} 日</>}
            {status.usedDays > 0 && status.draftDays === 0 && <> · 已請 {status.usedDays} 日</>}
            ）
          </span>
        </p>
      )}
      {status?.exceeded && status.warningMessage && (
        <div
          role="alert"
          className="flex gap-2 text-[10px] sm:text-xs text-rose-900 leading-snug bg-rose-50 border border-rose-300 rounded-lg px-2.5 py-2 font-semibold"
        >
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
          <span>{status.warningMessage}</span>
        </div>
      )}
    </div>
  );
}
