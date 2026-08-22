import React from 'react';

/** 印領清冊末頁簽核欄（教學組長／教務主任多留一行簽名空間，線寬一致） */
export const PayrollRegisterSignatureBlock: React.FC<{ className?: string }> = ({
  className = '',
}) => (
  <div className={`payroll-register-print-signature mt-8 print:mt-8 text-xs text-slate-700 ${className}`}>
    <div className="grid grid-cols-4 gap-4 text-center">
      <div>
        <div className="h-5 print:h-[1.2em]" aria-hidden />
        <div className="border-t border-slate-400 pt-1">教學組長</div>
      </div>
      <div>
        <div className="border-t border-slate-400 pt-1 mt-10">出納組</div>
      </div>
      <div>
        <div className="border-t border-slate-400 pt-1 mt-10">會計室</div>
      </div>
      <div>
        <div className="border-t border-slate-400 pt-1 mt-10">校長</div>
      </div>
    </div>
    <div className="mt-4 print:mt-6 grid grid-cols-4 gap-4 text-center">
      <div>
        <div className="h-5 print:h-[1.2em]" aria-hidden />
        <div className="border-t border-slate-400 pt-1">教務主任</div>
      </div>
    </div>
  </div>
);
