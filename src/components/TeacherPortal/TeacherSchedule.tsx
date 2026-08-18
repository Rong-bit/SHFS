import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { CourseSession, DayOfWeek } from '../../types';
import { PERIOD_DEFINITIONS } from '../../data/mockData';
import { RequestModal } from './RequestModal';
import { 
  Calendar, 
  Clock, 
  Wrench, 
  BookOpen, 
  Plus, 
  ArrowLeftRight, 
  Sparkles,
  AlertCircle,
  Coins,
  CheckCircle,
  Cpu,
  ChefHat,
  Cog,
  Monitor,
  Building2,
  Upload,
  Download
} from 'lucide-react';
import { exportScheduleToExcel } from '../../utils/scheduleImporter';

export const TeacherSchedule: React.FC = () => {
  const { currentTeacher, sessions, teachers, systemConfig, requests, setIsImportModalOpen } = useApp();
  const [selectedSessionForModal, setSelectedSessionForModal] = useState<CourseSession | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  if (!currentTeacher) {
    return <div className="p-8 text-center text-slate-500">請先選擇教師身分</div>;
  }

  // Teacher sessions
  const teacherSessions = sessions.filter((s) => s.teacherId === currentTeacher.id);
  const weeklyActual = teacherSessions.length;
  const basePeriods = currentTeacher.basePeriods;
  const overloadPeriods = Math.max(0, weeklyActual - basePeriods);
  const monthlyOverloadAmount = overloadPeriods * systemConfig.weeksInMonth * systemConfig.dayHourlyRate;
  const isOverNineHours = overloadPeriods >= systemConfig.maxWeeklyOverloadPeriods;

  const days: { day: DayOfWeek; name: string }[] = [
    { day: 1, name: '週一' },
    { day: 2, name: '週二' },
    { day: 3, name: '週三' },
    { day: 4, name: '週四' },
    { day: 5, name: '週五' },
  ];

  // Helper to find session in specific day and period
  const getSessionAt = (day: DayOfWeek, period: number) => {
    return teacherSessions.find((s) => s.dayOfWeek === day && s.period === period);
  };

  const handleCellClick = (session?: CourseSession) => {
    if (session) {
      setSelectedSessionForModal(session);
      setIsModalOpen(true);
    } else {
      setSelectedSessionForModal(teacherSessions[0] || null);
      setIsModalOpen(true);
    }
  };

  const getDeptIcon = (dept: string) => {
    switch (dept) {
      case '電機科':
        return <Cpu className="w-3.5 h-3.5 text-amber-500" />;
      case '資訊科':
        return <Monitor className="w-3.5 h-3.5 text-blue-500" />;
      case '機械科':
        return <Cog className="w-3.5 h-3.5 text-purple-500" />;
      case '餐飲管理科':
        return <ChefHat className="w-3.5 h-3.5 text-emerald-500" />;
      default:
        return <BookOpen className="w-3.5 h-3.5 text-indigo-500" />;
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Teacher Profile & Workload Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        
        {/* Profile Card */}
        <div className="md:col-span-2 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-2xl p-5 text-white shadow-sm border border-slate-700/60 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${currentTeacher.avatarBg || 'from-amber-500 to-amber-700'} flex items-center justify-center font-bold text-lg text-white shadow`}>
                  {currentTeacher.name.slice(0, 1)}
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h2 className="text-lg font-bold text-slate-100">{currentTeacher.name}</h2>
                    <span className="px-2 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded text-xs font-semibold">
                      {currentTeacher.title}
                    </span>
                    <span className="px-2 py-0.5 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded text-xs">
                      {currentTeacher.department}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    聯絡分機：{currentTeacher.phone} ｜ {currentTeacher.email}
                  </p>
                </div>
              </div>
            </div>

            {/* Certifications badges */}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {currentTeacher.certifications.map((cert, i) => (
                <span key={i} className="inline-flex items-center space-x-1 text-[11px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-slate-700">
                  <Wrench className="w-3 h-3 text-amber-400" />
                  <span>{cert}</span>
                </span>
              ))}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-700/80 flex items-center justify-between">
            <span className="text-xs text-slate-400">
              點選課表任一課堂可即時發起【調課 / 移課 / 請假派代】
            </span>
            <button
              id="btn-add-request-hero"
              onClick={() => handleCellClick(teacherSessions[0])}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg shadow transition active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>+ 新增調代課申請</span>
            </button>
          </div>
        </div>

        {/* Periods Stat Card */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              本學期每週授課節數
            </div>
            <div className="flex items-baseline space-x-2 mt-2">
              <span className="text-3xl font-extrabold text-slate-900">{weeklyActual}</span>
              <span className="text-sm font-semibold text-slate-500">/ 基本 {basePeriods} 節</span>
            </div>
            <div className="mt-2 text-xs text-slate-600 space-y-1">
              <div className="flex justify-between">
                <span>每週基本標準：</span>
                <span className="font-semibold text-slate-800">{basePeriods} 節/週</span>
              </div>
              <div className="flex justify-between">
                <span>每週超鐘點：</span>
                <span className={`font-bold ${overloadPeriods > 0 ? 'text-amber-600' : 'text-slate-700'}`}>
                  +{overloadPeriods} 節/週
                </span>
              </div>
            </div>
          </div>

          {/* 9 period warning status */}
          <div className="mt-3 pt-2 border-t border-slate-100">
            {isOverNineHours ? (
              <div className="flex items-center space-x-1.5 text-xs text-rose-600 font-bold bg-rose-50 px-2 py-1 rounded">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>超額警示：已達法定兼代課上限</span>
              </div>
            ) : (
              <div className="flex items-center space-x-1.5 text-xs text-emerald-700 font-medium bg-emerald-50 px-2 py-1 rounded">
                <CheckCircle className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                <span>兼代課節數符合教育部法規</span>
              </div>
            )}
          </div>
        </div>

        {/* Overload Amount Stat Card */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
              <span>每月預估超鐘點費</span>
              <Coins className="w-4 h-4 text-amber-500" />
            </div>
            <div className="flex items-baseline space-x-1 mt-2">
              <span className="text-3xl font-extrabold text-amber-600">
                ${monthlyOverloadAmount.toLocaleString()}
              </span>
              <span className="text-xs text-slate-500 font-medium">元/月</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-2">
              計算公式：{overloadPeriods} 節 × {systemConfig.weeksInMonth} 週 × {systemConfig.dayHourlyRate} 元/節 (日間部標準)
            </p>
          </div>

          <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>標準費率：</span>
            <span className="font-semibold text-slate-800">{systemConfig.dayHourlyRate} 元/節</span>
          </div>
        </div>

      </div>

      {/* Weekly Schedule Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        
        {/* Table Header / Title */}
        <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <Calendar className="w-5 h-5 text-amber-600" />
            <h3 className="font-bold text-base text-slate-900">
              {currentTeacher.name} - 每週課堂總表
            </h3>
            <span className="text-xs text-slate-500">
              (點選課堂直接發起調代課申請)
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="flex items-center space-x-1 text-slate-600">
              <span className="w-3 h-3 rounded bg-amber-100 border border-amber-400"></span>
              <span>專業實習工場課</span>
            </span>
            <span className="flex items-center space-x-1 text-slate-600">
              <span className="w-3 h-3 rounded bg-blue-50 border border-blue-200"></span>
              <span>一般學科課堂</span>
            </span>
            <button
              onClick={() => setIsImportModalOpen(true)}
              className="flex items-center space-x-1 px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg font-semibold border border-indigo-200 transition"
              title="匯入課表檔案"
            >
              <Upload className="w-3 h-3" />
              <span>匯入課表</span>
            </button>
            <button
              onClick={() => exportScheduleToExcel(sessions, teachers, systemConfig.academicYear, systemConfig.semester)}
              className="flex items-center space-x-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold border border-slate-200 transition"
              title="匯出全校課表 Excel"
            >
              <Download className="w-3 h-3" />
              <span>匯出 Excel</span>
            </button>
          </div>
        </div>

        {/* Timetable Matrix */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead>
              <tr className="bg-slate-100/80 text-slate-700 text-xs font-bold divide-x divide-slate-200 border-b border-slate-200">
                <th className="p-3 w-28 text-center bg-slate-200/60">節次 / 時間</th>
                {days.map((d) => (
                  <th key={d.day} className="p-3 text-center w-1/5">
                    {d.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs">
              {PERIOD_DEFINITIONS.map((pDef) => {
                const isNoon = pDef.period === 5;
                return (
                  <React.Fragment key={pDef.period}>
                    {/* Lunch Break Divider */}
                    {isNoon && (
                      <tr className="bg-slate-100 text-slate-500 text-[11px] font-semibold text-center tracking-wider">
                        <td colSpan={6} className="py-1.5 border-y border-slate-200 bg-slate-100/90">
                          🍽️ 午餐與午休時段 (12:00 - 13:10)
                        </td>
                      </tr>
                    )}

                    <tr className="divide-x divide-slate-200 hover:bg-slate-50/50 transition">
                      {/* Period Header Column */}
                      <td className="p-2.5 text-center bg-slate-50/80">
                        <div className="font-bold text-slate-800">{pDef.label}</div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                          {pDef.timeRange}
                        </div>
                      </td>

                      {/* Day Columns 1 to 5 */}
                      {days.map((d) => {
                        const session = getSessionAt(d.day, pDef.period);
                        return (
                          <td
                            key={d.day}
                            onClick={() => handleCellClick(session)}
                            className="p-2 align-top h-24 transition relative group cursor-pointer hover:bg-amber-50/40"
                          >
                            {session ? (
                              <div
                                className={`h-full p-2.5 rounded-xl border flex flex-col justify-between transition-all group-hover:shadow-sm ${
                                  session.isPractical
                                    ? 'bg-amber-50/90 border-amber-300 text-amber-950 ring-1 ring-amber-400/30'
                                    : 'bg-blue-50/70 border-blue-200 text-slate-900'
                                }`}
                              >
                                <div>
                                  <div className="flex items-center justify-between font-bold text-xs">
                                    <span className="text-slate-900">{session.className}</span>
                                    {session.isPractical ? (
                                      <span className="text-[10px] px-1.5 py-0.2 bg-amber-500 text-white rounded font-medium">
                                        實習工場
                                      </span>
                                    ) : (
                                      <span className="text-[10px] text-slate-500 font-normal">正課</span>
                                    )}
                                  </div>
                                  <div className="font-semibold text-xs text-slate-800 mt-1 line-clamp-1">
                                    {session.subjectName}
                                  </div>
                                </div>

                                <div className="mt-1.5 pt-1 border-t border-slate-200/60 flex items-center justify-between text-[11px] text-slate-600">
                                  <span className="truncate flex items-center gap-1 font-mono">
                                    <Building2 className="w-3 h-3 text-slate-400 shrink-0" />
                                    {session.venueName.split(' ')[0]}
                                  </span>
                                  <span className="text-amber-700 opacity-0 group-hover:opacity-100 font-bold text-[10px] transition shrink-0">
                                    調課 ➔
                                  </span>
                                </div>
                              </div>
                            ) : (
                              <div className="h-full flex items-center justify-center text-slate-300 group-hover:text-amber-500 text-[11px] transition">
                                <span className="opacity-0 group-hover:opacity-100 font-medium">
                                  + 空堂 (可移入)
                                </span>
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Request Modal */}
      {isModalOpen && (
        <RequestModal
          initialSession={selectedSessionForModal || undefined}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedSessionForModal(null);
          }}
        />
      )}

    </div>
  );
};
