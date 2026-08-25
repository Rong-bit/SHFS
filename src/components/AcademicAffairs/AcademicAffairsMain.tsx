import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { PendingApprovals } from './PendingApprovals';
import { SchoolTimetableMatrix } from './SchoolTimetableMatrix';
import { StaffDispatchWorkbench } from './StaffDispatchWorkbench';
import { ClipboardCheck, Grid, UserCheck } from 'lucide-react';

export const AcademicAffairsMain: React.FC = () => {
  const { requests } = useApp();
  const [activeTab, setActiveTab] = useState<'dispatch' | 'approvals' | 'matrix'>('dispatch');

  const pendingCount = requests.filter((r) => r.status === 'pending').length;

  return (
    <div className="space-y-6">
      
      {/* Tab Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          
          <button
            id="tab-academic-dispatch"
            onClick={() => setActiveTab('dispatch')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-sm font-bold transition ${
              activeTab === 'dispatch'
                ? 'bg-indigo-600 text-white shadow-sm ring-2 ring-indigo-500/20'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <UserCheck className="w-4 h-4 text-amber-300" />
            <span>教學組經辦派代工作台</span>
          </button>

          <button
            id="tab-academic-approvals"
            onClick={() => setActiveTab('approvals')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-sm font-bold transition ${
              activeTab === 'approvals'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <ClipboardCheck className="w-4 h-4 text-amber-400" />
            <span>調代課線上審核 (衝堂防呆)</span>
            {pendingCount > 0 && (
              <span className="ml-1.5 px-2 py-0.5 bg-amber-500 text-slate-950 text-xs font-black rounded-full">
                {pendingCount}
              </span>
            )}
          </button>

          <button
            id="tab-academic-matrix"
            onClick={() => setActiveTab('matrix')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-sm font-bold transition ${
              activeTab === 'matrix'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Grid className="w-4 h-4 text-indigo-400" />
            <span>全校總課表與實習工場檢視</span>
          </button>
        </div>
      </div>

      {activeTab === 'dispatch' && <StaffDispatchWorkbench />}
      {activeTab === 'approvals' && <PendingApprovals />}
      {activeTab === 'matrix' && <SchoolTimetableMatrix />}

    </div>
  );
};
