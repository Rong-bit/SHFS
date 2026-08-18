import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { TeacherSchedule } from './TeacherSchedule';
import { TeacherRequestsList } from './TeacherRequestsList';
import { RequestModal } from './RequestModal';
import { Calendar, FileText, Plus } from 'lucide-react';

export const TeacherPortalMain: React.FC = () => {
  const { requests, currentTeacher, requestTeacherActionAuth } = useApp();
  const [activeTab, setActiveTab] = useState<'schedule' | 'requests'>('schedule');
  const [isTopRequestModalOpen, setIsTopRequestModalOpen] = useState(false);

  const myPendingCount = requests.filter(
    (r) => r.applicantTeacherId === currentTeacher?.id && r.status === 'pending'
  ).length;

  return (
    <div className="space-y-6">
      
      {/* Top Tabs */}
      <div className="flex flex-wrap items-center justify-between border-b border-slate-200 pb-3 gap-2">
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

        {currentTeacher && (
          <button
            id="btn-teacher-top-add-request"
            onClick={() => {
              requestTeacherActionAuth(
                currentTeacher.id,
                () => {
                  setIsTopRequestModalOpen(true);
                },
                '+ 新增調代課申請'
              );
            }}
            className="flex items-center space-x-1.5 px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-xs transition active:scale-95 cursor-pointer"
          >
            <Plus className="w-4 h-4 text-slate-950" />
            <span>+ 新增調代課申請</span>
          </button>
        )}
      </div>

      {/* Main Content */}
      {activeTab === 'schedule' ? <TeacherSchedule /> : <TeacherRequestsList />}

      {/* Top Level Request Modal */}
      {isTopRequestModalOpen && (
        <RequestModal
          onClose={() => setIsTopRequestModalOpen(false)}
        />
      )}

    </div>
  );
};
