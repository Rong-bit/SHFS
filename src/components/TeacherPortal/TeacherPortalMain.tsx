import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { TeacherSchedule } from './TeacherSchedule';
import { TeacherRequestsList } from './TeacherRequestsList';
import { Calendar, FileText, Plus } from 'lucide-react';

export const TeacherPortalMain: React.FC = () => {
  const { requests, currentTeacher } = useApp();
  const [activeTab, setActiveTab] = useState<'schedule' | 'requests'>('schedule');

  const myPendingCount = requests.filter(
    (r) => r.applicantTeacherId === currentTeacher?.id && r.status === 'pending'
  ).length;

  return (
    <div className="space-y-6">
      
      {/* Top Tabs */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-3">
        <div className="flex items-center space-x-2">
          <button
            id="tab-teacher-schedule"
            onClick={() => setActiveTab('schedule')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-sm font-bold transition ${
              activeTab === 'schedule'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Calendar className="w-4 h-4 text-amber-400" />
            <span>📅 我的個人每週課表</span>
          </button>

          <button
            id="tab-teacher-requests"
            onClick={() => setActiveTab('requests')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-sm font-bold transition ${
              activeTab === 'requests'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <FileText className="w-4 h-4 text-indigo-400" />
            <span>📋 調代課申請紀錄與列印</span>
            {myPendingCount > 0 && (
              <span className="ml-1 px-1.5 py-0.2 bg-amber-500 text-slate-950 text-[11px] font-extrabold rounded-full">
                {myPendingCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Main Content */}
      {activeTab === 'schedule' ? <TeacherSchedule /> : <TeacherRequestsList />}

    </div>
  );
};
