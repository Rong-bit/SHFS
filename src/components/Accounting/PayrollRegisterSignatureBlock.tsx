import React from 'react';

/** 印領清冊末頁簽核欄（教學組長／教務主任多留一行簽名空間，線寬一致） */
export const PayrollRegisterSignatureBlock: React.FC<{ className?: string }> = ({
  className = '',
}) => (
  <div
    className={`payroll-register-print-signature payroll-register-print-footer mt-8 print:mt-2 text-xs text-slate-700 ${className}`}
  >
    <div className="grid grid-cols-4 gap-4 print:gap-2 text-center">
      <div>
        <div className="h-5 print:h-3" aria-hidden />
        <div className="border-t border-slate-400 pt-1">教學組長</div>
      </div>
      <div>
        <div className="border-t border-slate-400 pt-1 mt-10 print:mt-3">出納組</div>
      </div>
      <div>
        <div className="border-t border-slate-400 pt-1 mt-10 print:mt-3">會計室</div>
      </div>
      <div>
        <div className="border-t border-slate-400 pt-1 mt-10 print:mt-3">校長</div>
      </div>
    </div>
    <div className="mt-4 print:mt-2 grid grid-cols-4 gap-4 print:gap-2 text-center">
      <div>
        <div className="h-5 print:h-3" aria-hidden />
        <div className="border-t border-slate-400 pt-1">教務主任</div>
      </div>
    </div>
  </div>
);
