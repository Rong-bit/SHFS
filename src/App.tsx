import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Header } from './components/Header';
import { TeacherPortalMain } from './components/TeacherPortal/TeacherPortalMain';
import { AcademicAffairsMain } from './components/AcademicAffairs/AcademicAffairsMain';
import { AccountingSettlement } from './components/Accounting/AccountingSettlement';
import { AdminSettings } from './components/Admin/AdminSettings';
import { PrintNoticeModal } from './components/TeacherPortal/PrintNoticeModal';
import { ScheduleImportModal } from './components/ScheduleImport/ScheduleImportModal';
import { LoginAuthModal } from './components/Common/LoginAuthModal';
import { isActingHomeroomOnlyRequest } from './utils/actingHomeroomPayrollRegister';

const AppContent: React.FC = () => {
  const { 
    currentRole, 
    printModalRequest, 
    setPrintModalRequest, 
    isImportModalOpen, 
    setIsImportModalOpen,
    isLoginAuthOpen,
    setIsLoginAuthOpen,
    loginAuthTarget
  } = useApp();

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col font-sans selection:bg-amber-500 selection:text-slate-950">
      
      {/* Universal Top Bar & Role Navigation */}
      <Header />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {currentRole === 'teacher' && <TeacherPortalMain />}
        {currentRole === 'academic' && <AcademicAffairsMain />}
        {currentRole === 'accounting' && <AccountingSettlement />}
        {currentRole === 'admin' && <AdminSettings />}
      </main>

      {/* Footer */}
      <footer className="bg-slate-900 border-t border-slate-800 text-slate-400 text-xs py-4 print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 sm:grid-cols-3 items-center gap-2 text-center sm:text-left">
          <div className="sm:justify-self-start">高職調代課與鐘點費管理系統</div>
          <div className="text-slate-500 sm:justify-self-center sm:text-center">
            Copyright © 2026 Huang Jun-rong
          </div>
          <div className="text-slate-500 text-[11px] sm:justify-self-end sm:text-right">
            教育部技術型高中部定授課標準
          </div>
        </div>
      </footer>

      {/* Timetable Excel / CSV Import Wizard Modal */}
      {isImportModalOpen && (
        <ScheduleImportModal
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
        />
      )}

      {/* 校內代課／調課通知單；僅代導師不列印通知單 */}
      {printModalRequest && !isActingHomeroomOnlyRequest(printModalRequest) && (
        <PrintNoticeModal
          request={printModalRequest}
          onClose={() => setPrintModalRequest(null)}
        />
      )}

      {/* Identity Login Password Authentication Modal */}
      <LoginAuthModal
        isOpen={isLoginAuthOpen}
        target={loginAuthTarget}
        onClose={() => setIsLoginAuthOpen(false)}
      />

    </div>
  );
};

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
