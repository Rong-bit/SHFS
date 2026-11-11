import React, { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { TeacherSchedule } from './TeacherSchedule';
import { TeacherRequestsList } from './TeacherRequestsList';
import { RequestModal } from './RequestModal';
import { BookOpen, Calendar, ClipboardList, FileText, Plus, Cloud, MapPin } from 'lucide-react';
import { MobileDock } from '../Common/MobileDock';
import { CloudSyncJoinModal } from '../Common/CloudSyncJoinModal';
import { PatrolMain } from '../Patrol/PatrolMain';
import { PatrolReviewInbox } from '../Patrol/PatrolReviewInbox';
import { ClassLogMain } from '../ClassLog/ClassLogMain';
import { readPatrolReviewFocusId } from '../../utils/patrolDeepLink';
import { canAccessPatrolPortal } from '../../utils/patrolConfig';

export const TeacherPortalMain: React.FC = () => {
  const { requests, currentTeacher, requestTeacherActionAuth, cloudSyncStatus } = useApp();
  const focusCaseId = readPatrolReviewFocusId();
  const [activeTab, setActiveTab] = useState<
    'schedule' | 'requests' | 'patrol' | 'patrol-review' | 'class-log'
  >(() => (focusCaseId ? 'patrol-review' : 'schedule'));
  const [isTopRequestModalOpen, setIsTopRequestModalOpen] = useState(false);
  const [isSyncJoinOpen, setIsSyncJoinOpen] = useState(false);

  // 巡堂／教室日誌記在登入教師名下；切換身分須重新驗證
  useEffect(() => {
    setActiveTab((tab) => {
      if (tab === 'patrol' || tab === 'class-log') return 'schedule';
      if (tab === 'patrol-review' && focusCaseId) return 'patrol-review';
      if (tab === 'patrol-review') return 'schedule';
      return tab;
    });
  }, [currentTeacher?.id, focusCaseId]);

  useEffect(() => {
    if (focusCaseId) setActiveTab('patrol-review');
  }, [focusCaseId]);

  const myPendingCount = requests.filter(
    (r) => r.applicantTeacherId === currentTeacher?.id && r.status === 'pending'
  ).length;

  return (
    <div className="space-y-6 max-w-full min-w-0 overflow-x-clip">
      {cloudSyncStatus === 'off' && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-sky-200 bg-sky-50 px-3 py-2.5 sm:px-4 sm:py-3">
          <p className="text-sm text-sky-950 leading-snug">
            <span className="sm:hidden">尚未加入學校同步。輸入同步密碼即可看到同一份課表。</span>
            <span className="hidden sm:inline">
              這台電腦尚未加入學校同步。輸入教學組給的<strong>同步密碼</strong>即可看到同一份課表，不必用管理員帳號。
            </span>
          </p>
          <button
            type="button"
            onClick={() => setIsSyncJoinOpen(true)}
            className="shrink-0 inline-flex items-center justify-center gap-1.5 rounded-xl bg-sky-600 px-3.5 py-2 min-h-11 text-sm font-bold text-white hover:bg-sky-500 touch-manipulation"
          >
            <Cloud className="w-4 h-4" />
            加入同步
          </button>
        </div>
      )}

      {currentTeacher && (activeTab === 'schedule' || activeTab === 'requests') && (
        <button
          type="button"
          onClick={() => {
            requestTeacherActionAuth(
              currentTeacher.id,
              () => {
                setIsTopRequestModalOpen(true);
              },
              '新增調代課申請'
            );
          }}
          className="md:hidden w-full min-h-12 flex items-center justify-center gap-1.5 px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm rounded-xl shadow-xs transition active:scale-[0.99] touch-manipulation"
        >
          <Plus className="w-4 h-4 text-slate-950" />
          <span>新增調代課申請</span>
        </button>
      )}

      {/* Top Tabs：手機改由底部功能列操作 */}
      <div className="hidden md:flex flex-wrap items-center justify-between border-b border-slate-200 pb-3 gap-2">
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
            <span>我的個人每週課表</span>
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
            <span>調代課申請紀錄與列印</span>
            {myPendingCount > 0 && (
              <span className="ml-1 px-1.5 py-0.2 bg-amber-500 text-slate-950 text-[11px] font-extrabold rounded-full">
                {myPendingCount}
              </span>
            )}
          </button>

          <button
            id="tab-teacher-patrol"
            onClick={() => {
              if (activeTab === 'patrol') return;
              if (!currentTeacher) {
                setActiveTab('patrol');
                return;
              }
              if (!canAccessPatrolPortal(currentTeacher)) {
                window.alert('請先選擇教師身分。');
                return;
              }
              requestTeacherActionAuth(currentTeacher.id, () => setActiveTab('patrol'), '巡堂登錄');
            }}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-sm font-bold transition ${
              activeTab === 'patrol'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
            title="一般巡堂僅組長／主任；一般教師可於段考日做段考巡堂"
          >
            <MapPin className="w-4 h-4 text-emerald-400" />
            <span>巡堂</span>
          </button>

          <button
            id="tab-teacher-patrol-review"
            onClick={() => setActiveTab('patrol-review')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-sm font-bold transition ${
              activeTab === 'patrol-review'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <ClipboardList className="w-4 h-4 text-rose-400" />
            <span>巡堂會辦</span>
          </button>

          <button
            id="tab-teacher-class-log"
            onClick={() => {
              if (activeTab === 'class-log') return;
              if (!currentTeacher) {
                setActiveTab('class-log');
                return;
              }
              requestTeacherActionAuth(
                currentTeacher.id,
                () => setActiveTab('class-log'),
                '教室日誌'
              );
            }}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-sm font-bold transition ${
              activeTab === 'class-log'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <BookOpen className="w-4 h-4 text-sky-400" />
            <span>教室日誌</span>
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
                '新增調代課申請'
              );
            }}
            className="flex items-center space-x-1.5 px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-xs transition active:scale-95 cursor-pointer"
          >
            <Plus className="w-4 h-4 text-slate-950" />
            <span>新增調代課申請</span>
          </button>
        )}
      </div>

      {/* Main Content */}
      {activeTab === 'schedule' && <TeacherSchedule />}
      {activeTab === 'requests' && <TeacherRequestsList />}
      {activeTab === 'patrol' && <PatrolMain />}
      {activeTab === 'patrol-review' && (
        <PatrolReviewInbox mode="teacher" focusCaseId={focusCaseId} />
      )}
      {activeTab === 'class-log' && <ClassLogMain />}

      <MobileDock
        items={[
          {
            id: 'schedule',
            label: '課表',
            icon: <Calendar className="w-4 h-4" />,
            active: activeTab === 'schedule',
            onClick: () => setActiveTab('schedule'),
          },
          {
            id: 'requests',
            label: '申請',
            icon: <FileText className="w-4 h-4" />,
            active: activeTab === 'requests',
            onClick: () => setActiveTab('requests'),
            badge: myPendingCount,
          },
          {
            id: 'patrol',
            label: '巡堂',
            icon: <MapPin className="w-4 h-4" />,
            active: activeTab === 'patrol',
            onClick: () => {
              if (activeTab === 'patrol') return;
              if (!currentTeacher) {
                setActiveTab('patrol');
                return;
              }
              if (!canAccessPatrolPortal(currentTeacher)) {
                window.alert('請先選擇教師身分。');
                return;
              }
              requestTeacherActionAuth(currentTeacher.id, () => setActiveTab('patrol'), '巡堂登錄');
            },
          },
          {
            id: 'patrol-review',
            label: '會辦',
            icon: <ClipboardList className="w-4 h-4" />,
            active: activeTab === 'patrol-review',
            onClick: () => setActiveTab('patrol-review'),
          },
          {
            id: 'class-log',
            label: '日誌',
            icon: <BookOpen className="w-4 h-4" />,
            active: activeTab === 'class-log',
            onClick: () => {
              if (activeTab === 'class-log') return;
              if (!currentTeacher) {
                setActiveTab('class-log');
                return;
              }
              requestTeacherActionAuth(
                currentTeacher.id,
                () => setActiveTab('class-log'),
                '教室日誌'
              );
            },
          },
        ]}
      />

      {/* Top Level Request Modal */}
      {isTopRequestModalOpen && (
        <RequestModal
          onClose={() => setIsTopRequestModalOpen(false)}
        />
      )}

      <CloudSyncJoinModal isOpen={isSyncJoinOpen} onClose={() => setIsSyncJoinOpen(false)} />
    </div>
  );
};
