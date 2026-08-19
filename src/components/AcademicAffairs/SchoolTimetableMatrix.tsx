import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { DayOfWeek, DepartmentType } from '../../types';
import { PERIOD_DEFINITIONS } from '../../data/mockData';
import { 
  Building2, 
  Users, 
  User, 
  Grid, 
  Layers, 
  Cpu, 
  Monitor, 
  Cog, 
  ChefHat, 
  BookOpen, 
  Search,
  Filter,
  Upload,
  Download
} from 'lucide-react';
import { exportScheduleToExcel } from '../../utils/scheduleImporter';
import { displayTeacherTitle, SCHOOL_DEPARTMENTS } from '../../utils/schoolDepartments';

export const SchoolTimetableMatrix: React.FC = () => {
  const { sessions, teachers, venues, systemConfig, setIsImportModalOpen } = useApp();

  type ViewDimension = 'venue' | 'class' | 'teacher' | 'department';
  const [dimension, setDimension] = useState<ViewDimension>('venue');
  
  // Selected filter targets
  const [selectedVenueId, setSelectedVenueId] = useState<string>(venues[0]?.id || '');
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>(teachers[0]?.id || '');
  const [selectedDepartment, setSelectedDepartment] = useState<DepartmentType>('電機科');
  
  // Available classes derived from sessions
  const allClasses = Array.from(new Set(sessions.map((s) => s.className))).sort();
  const [selectedClass, setSelectedClass] = useState<string>(allClasses[0] || '電機二甲');

  const days: { day: DayOfWeek; name: string }[] = [
    { day: 1, name: '週一' },
    { day: 2, name: '週二' },
    { day: 3, name: '週三' },
    { day: 4, name: '週四' },
    { day: 5, name: '週五' },
  ];

  // Filter sessions according to current dimension and selection
  const filteredSessions = sessions.filter((s) => {
    if (dimension === 'venue') return s.venueId === selectedVenueId;
    if (dimension === 'class') return s.className === selectedClass;
    if (dimension === 'teacher') return s.teacherId === selectedTeacherId;
    if (dimension === 'department') {
      const teacher = teachers.find((t) => t.id === s.teacherId);
      return teacher?.department === selectedDepartment;
    }
    return true;
  });

  const getSessionAt = (day: DayOfWeek, period: number) => {
    return filteredSessions.find((s) => s.dayOfWeek === day && s.period === period);
  };

  const currentVenueObj = venues.find((v) => v.id === selectedVenueId);
  const currentTeacherObj = teachers.find((t) => t.id === selectedTeacherId);

  return (
    <div className="space-y-6">
      
      {/* Dimension Switcher Controls */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center space-x-2">
              <Grid className="w-5 h-5 text-indigo-600" />
              <span>全校總課表與實習工場排課檢視矩陣</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              可隨時依【實習工場/專業教室】、【班級】、【教師】或【科別】進行多視角排課檢閱
            </p>
          </div>

          {/* Dimension Selector Buttons */}
          <div className="flex items-center space-x-1.5 bg-slate-100 p-1 rounded-xl text-xs font-semibold">
            {[
              { key: 'venue', label: '🏢 實習工場 / 教室', icon: <Building2 className="w-3.5 h-3.5" /> },
              { key: 'class', label: '🎓 班級課表', icon: <Users className="w-3.5 h-3.5" /> },
              { key: 'teacher', label: '👨‍🏫 教師課表', icon: <User className="w-3.5 h-3.5" /> },
              { key: 'department', label: '🏛️ 科別課表', icon: <Layers className="w-3.5 h-3.5" /> },
            ].map((dim) => (
              <button
                key={dim.key}
                onClick={() => setDimension(dim.key as ViewDimension)}
                className={`px-3 py-1.5 rounded-lg transition ${
                  dimension === dim.key
                    ? 'bg-white text-slate-900 shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {dim.label}
              </button>
            ))}
          </div>
        </div>

        {/* Secondary Dimension Selection Row */}
        <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-3">
          
          {/* If Venue Dimension */}
          {dimension === 'venue' && (
            <div className="flex flex-wrap items-center gap-2 w-full">
              <span className="text-xs font-bold text-slate-700">選擇實習工場/教室：</span>
              <select
                id="select-matrix-venue"
                value={selectedVenueId}
                onChange={(e) => setSelectedVenueId(e.target.value)}
                className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-800 focus:ring-1 focus:ring-amber-500"
              >
                {venues.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.code} ｜ {v.department} ｜ 容量:{v.capacity}人)
                  </option>
                ))}
              </select>

              {currentVenueObj && (
                <div className="text-xs text-slate-500 bg-amber-50/80 px-2.5 py-1 rounded-lg border border-amber-200">
                  <span className="font-semibold text-amber-900">設備配置：</span>
                  {currentVenueObj.equipmentNote}
                </div>
              )}
            </div>
          )}

          {/* If Class Dimension */}
          {dimension === 'class' && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-700">選擇檢視班級：</span>
              <div className="flex flex-wrap gap-1.5">
                {allClasses.map((cls) => (
                  <button
                    key={cls}
                    onClick={() => setSelectedClass(cls)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
                      selectedClass === cls
                        ? 'bg-indigo-600 text-white font-bold'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {cls}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* If Teacher Dimension */}
          {dimension === 'teacher' && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-slate-700">選擇授課教師：</span>
              <select
                id="select-matrix-teacher"
                value={selectedTeacherId}
                onChange={(e) => setSelectedTeacherId(e.target.value)}
                className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-800 focus:ring-1 focus:ring-indigo-500"
              >
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.department} · {displayTeacherTitle(t)} · 每週{t.weeklyActualPeriods}節)
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* If Department Dimension */}
          {dimension === 'department' && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-700">選擇高職科別：</span>
              <div className="flex flex-wrap gap-1.5">
                {SCHOOL_DEPARTMENTS.map((dept) => (
                  <button
                    key={dept}
                    onClick={() => setSelectedDepartment(dept)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                      selectedDepartment === dept
                        ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {dept}
                  </button>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Timetable Grid View */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        
        {/* Table Title Banner */}
        <div className="bg-slate-900 text-white px-6 py-3.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <Layers className="w-4 h-4 text-amber-400" />
            <span className="font-bold text-sm">
              {dimension === 'venue' && `🏢 ${currentVenueObj?.name || '指定工場'} 週課表`}
              {dimension === 'class' && `🎓 ${selectedClass} 班級週課表`}
              {dimension === 'teacher' && `👨‍🏫 ${currentTeacherObj?.name} 教師授課表`}
              {dimension === 'department' && `🏛️ ${selectedDepartment} 全科排課彙整`}
            </span>
          </div>
          
          <div className="flex items-center space-x-3 text-xs">
            <span className="text-slate-400">
              排定課堂數：<strong className="text-amber-400">{filteredSessions.length}</strong> 節
            </span>
            <button
              onClick={() => setIsImportModalOpen(true)}
              className="flex items-center space-x-1 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold text-xs shadow-xs transition"
            >
              <Upload className="w-3 h-3" />
              <span>匯入新課表</span>
            </button>
            <button
              onClick={() => exportScheduleToExcel(sessions, teachers, systemConfig.academicYear, systemConfig.semester, systemConfig.schoolName)}
              className="flex items-center space-x-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-semibold text-xs border border-slate-700 transition"
              title="匯出目前總課表為 Excel"
            >
              <Download className="w-3 h-3 text-amber-400" />
              <span>匯出 Excel</span>
            </button>
          </div>
        </div>

        {/* Matrix Grid */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead>
              <tr className="bg-slate-100 text-slate-700 text-xs font-bold divide-x divide-slate-200 border-b border-slate-200">
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
                    {isNoon && (
                      <tr className="bg-slate-100 text-slate-500 text-[11px] font-semibold text-center">
                        <td colSpan={6} className="py-1.5 border-y border-slate-200 bg-slate-100/90">
                          🍽️ 午餐與午休時段
                        </td>
                      </tr>
                    )}

                    <tr className="divide-x divide-slate-200 hover:bg-slate-50/50 transition">
                      <td className="p-2.5 text-center bg-slate-50/80">
                        <div className="font-bold text-slate-800">{pDef.label}</div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                          {pDef.timeRange}
                        </div>
                      </td>

                      {days.map((d) => {
                        const session = getSessionAt(d.day, pDef.period);
                        return (
                          <td key={d.day} className="p-2 align-top h-24">
                            {session ? (
                              <div
                                className={`h-full p-2 rounded-xl border flex flex-col justify-between ${
                                  session.isPractical
                                    ? 'bg-amber-50 border-amber-300 text-amber-950 ring-1 ring-amber-400/20'
                                    : session.isConcurrent
                                      ? 'bg-violet-50 border-violet-300 text-violet-950 ring-1 ring-violet-400/20'
                                      : 'bg-indigo-50/80 border-indigo-200 text-indigo-950'
                                }`}
                              >
                                <div>
                                  <div className="flex items-center justify-between font-bold text-xs gap-1">
                                    <span>{session.className}</span>
                                    <span className="flex items-center gap-0.5 shrink-0">
                                      {session.isConcurrent && (
                                        <span className="text-[10px] bg-violet-600 text-white px-1.5 py-0.2 rounded font-semibold">
                                          兼課
                                        </span>
                                      )}
                                      {session.isPractical && (
                                        <span className="text-[10px] bg-amber-500 text-white px-1.5 py-0.2 rounded font-semibold">
                                          實習
                                        </span>
                                      )}
                                    </span>
                                  </div>
                                  <div className="font-semibold text-xs mt-0.5 line-clamp-1">
                                    {session.subjectName}
                                  </div>
                                </div>

                                <div className="mt-1 pt-1 border-t border-slate-200/60 flex items-center justify-between text-[11px] text-slate-600">
                                  <span className="font-medium text-slate-800">
                                    {session.teacherName}
                                  </span>
                                  <span className="text-[10px] text-slate-500 truncate max-w-[80px]">
                                    {session.venueName.split(' ')[0]}
                                  </span>
                                </div>

                                {session.notes && (
                                  <div className="text-[10px] text-indigo-700 font-bold mt-0.5 truncate">
                                    {session.notes}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="h-full flex items-center justify-center text-slate-300 text-[11px]">
                                <span>空堂</span>
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

    </div>
  );
};
