import React, { useEffect, useMemo, useState } from 'react';
import { ClipboardList, Stamp } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { readPatrolReviewFocusId } from '../../utils/patrolDeepLink';
import { PatrolPrincipalWeekly } from './PatrolPrincipalWeekly';
import { PatrolReviewInbox } from './PatrolReviewInbox';

/** 生輔組／校長專用：巡堂會辦與（校長）每周彙整 */
export const PatrolAffairsMain: React.FC = () => {
  const { currentRole } = useApp();
  const isPrincipal = currentRole === 'principal';
  const focusCaseId = useMemo(() => readPatrolReviewFocusId(), []);
  const [tab, setTab] = useState<'inbox' | 'weekly'>(() =>
    focusCaseId || !isPrincipal ? 'inbox' : 'weekly'
  );

  // 角色切換時重設分頁，避免校長 weekly 殘留導致生輔組空白
  useEffect(() => {
    if (focusCaseId) setTab('inbox');
    else setTab(isPrincipal ? 'weekly' : 'inbox');
  }, [currentRole, isPrincipal, focusCaseId]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
        <button
          type="button"
          onClick={() => setTab('inbox')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-sm font-bold transition ${
            tab === 'inbox'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <ClipboardList className="w-4 h-4 text-amber-300" />
          <span>巡堂會辦</span>
        </button>
        {isPrincipal && (
          <button
            type="button"
            onClick={() => setTab('weekly')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-sm font-bold transition ${
              tab === 'weekly'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Stamp className="w-4 h-4 text-indigo-300" />
            <span>校長每周彙整核章</span>
          </button>
        )}
      </div>

      {tab === 'inbox' && (
        <PatrolReviewInbox
          mode="staff"
          focusCaseId={focusCaseId}
          showPrincipalTools={isPrincipal}
        />
      )}
      {tab === 'weekly' && isPrincipal && <PatrolPrincipalWeekly />}
    </div>
  );
};
