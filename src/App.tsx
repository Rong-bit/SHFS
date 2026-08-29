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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-wrap justify-between items-center gap-2">
          <div>
            高職調代課與鐘點費管理系統 · 版權 © 2026 Huang Jun-rong
          </div>
          <div className="flex items-center space-x-4 text-slate-500 text-[11px]">
            <span>教育部技術型高中部定授課標準</span>
            <span>公立學校鐘點費基準 (505元/節)</span>
            <span>實習工場防護安全管理</span>
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
