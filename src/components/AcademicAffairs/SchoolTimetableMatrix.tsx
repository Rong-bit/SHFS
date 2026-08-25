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
} from 'lucide-react';
import { displayTeacherTitle, gradeYearFromClassName, isPracticalSession, SCHOOL_DEPARTMENTS } from '../../utils/schoolDepartments';
import { classifyVenueKind, venueKindLabel } from '../../utils/venueKinds';
import { SessionVenueSelect } from '../Common/SessionVenueSelect';
import { sessionNotesForCurrentWeekDisplay } from '../../utils/leaveDates';

export const SchoolTimetableMatrix: React.FC = () => {
  const { sessions, teachers, venues, requests } = useApp();

  type ViewDimension = 'venue' | 'class' | 'teacher' | 'department';
  type VenueListGroup = 'workshop' | 'classroom';
  type DeptGradeFilter = 'all' | 1 | 2 | 3;
  const [dimension, setDimension] = useState<ViewDimension>('venue');
  
  // Selected filter targets
  const [selectedVenueId, setSelectedVenueId] = useState<string>(venues[0]?.id || '');
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>(teachers[0]?.id || '');
  const [selectedDepartment, setSelectedDepartment] = useState<DepartmentType>('電機科');
  const [deptGradeFilter, setDeptGradeFilter] = useState<DeptGradeFilter>('all');
  const [venueListGroup, setVenueListGroup] = useState<VenueListGroup>(() => {
    const first = venues[0];
    return first && classifyVenueKind(first.name) === 'workshop' ? 'workshop' : 'classroom';
  });
  
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

  const workshopVenues = venues
    .filter((v) => classifyVenueKind(v.name) === 'workshop')
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
  const classroomVenues = venues
    .filter((v) => classifyVenueKind(v.name) !== 'workshop')
    .sort((a, b) => {
      const ka = classifyVenueKind(a.name);
      const kb = classifyVenueKind(b.name);
      if (ka !== kb) return ka === 'homeroom' ? -1 : 1;
      return a.name.localeCompare(b.name, 'zh-Hant');
    });
  const venuesInGroup = venueListGroup === 'workshop' ? workshopVenues : classroomVenues;

  const selectVenueGroup = (group: VenueListGroup) => {
    setVenueListGroup(group);
    const list = group === 'workshop' ? workshopVenues : classroomVenues;
    if (list.length === 0) {
      setSelectedVenueId('');
      return;
    }
    const stillInGroup = list.some((v) => v.id === selectedVenueId);
    if (!stillInGroup) setSelectedVenueId(list[0].id);
  };

  // Filter sessions according to current dimension and selection
  const filteredSessions = sessions.filter((s) => {
    if (dimension === 'venue') return s.venueId === selectedVenueId;
    if (dimension === 'class') return s.className === selectedClass;
    if (dimension === 'teacher') return s.teacherId === selectedTeacherId;
    if (dimension === 'department') {
      const teacher = teachers.find((t) => t.id === s.teacherId);
      if (teacher?.department !== selectedDepartment) return false;
      if (deptGradeFilter === 'all') return true;
      return gradeYearFromClassName(s.className) === deptGradeFilter;
    }
    return true;
  });

  const deptGradeLabel =
    deptGradeFilter === 'all'
      ? '全年級'
      : deptGradeFilter === 1
        ? '一年級'
        : deptGradeFilter === 2
          ? '二年級'
          : '三年級';

  const getSessionsAt = (day: DayOfWeek, period: number) => {
    return filteredSessions
      .filter((s) => s.dayOfWeek === day && s.period === period)
      .sort((a, b) => a.className.localeCompare(b.className, 'zh-Hant'));
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
              可依工場／班級／教師／科別檢視；格子內工場名稱可下拉改選（同科標 ★）。課表匯入／匯出請至系統管理員。
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
              <span className="text-xs font-bold text-slate-700">選擇場地：</span>
              <div className="flex items-center space-x-1 bg-slate-100 p-0.5 rounded-lg text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => selectVenueGroup('workshop')}
                  className={`px-2.5 py-1 rounded-md transition ${
                    venueListGroup === 'workshop'
                      ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  實習工場 ({workshopVenues.length})
                </button>
                <button
                  type="button"
                  onClick={() => selectVenueGroup('classroom')}
                  className={`px-2.5 py-1 rounded-md transition ${
                    venueListGroup === 'classroom'
                      ? 'bg-sky-600 text-white font-bold shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  教室 ({classroomVenues.length})
                </button>
              </div>
              <select
                id="select-matrix-venue"
                value={venuesInGroup.some((v) => v.id === selectedVenueId) ? selectedVenueId : ''}
                onChange={(e) => setSelectedVenueId(e.target.value)}
                disabled={venuesInGroup.length === 0}
                className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-800 focus:ring-1 focus:ring-amber-500 disabled:opacity-50"
              >
                {venuesInGroup.length === 0 ? (
                  <option value="">
                    {venueListGroup === 'workshop' ? '尚無實習工場' : '尚無教室'}
                  </option>
                ) : venueListGroup === 'workshop' ? (
                  workshopVenues.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name} ({v.code} ｜ {v.department} ｜ 容量:{v.capacity}人)
                    </option>
                  ))
                ) : (
                  <>
                    {classroomVenues.some((v) => classifyVenueKind(v.name) === 'homeroom') && (
                      <optgroup label="原班教室">
                        {classroomVenues
                          .filter((v) => classifyVenueKind(v.name) === 'homeroom')
                          .map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.name} ({v.code} ｜ {v.department} ｜ 容量:{v.capacity}人)
                            </option>
                          ))}
                      </optgroup>
                    )}
                    {classroomVenues.some((v) => classifyVenueKind(v.name) === 'classroom') && (
                      <optgroup label="一般教室">
                        {classroomVenues
                          .filter((v) => classifyVenueKind(v.name) === 'classroom')
                          .map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.name} ({v.code} ｜ {v.department} ｜ 容量:{v.capacity}人)
                            </option>
                          ))}
                      </optgroup>
                    )}
                  </>
                )}
              </select>

              {currentVenueObj && (
                <div
                  className={`text-xs px-2.5 py-1 rounded-lg border ${
                    classifyVenueKind(currentVenueObj.name) === 'workshop'
                      ? 'text-slate-600 bg-amber-50/80 border-amber-200'
                      : 'text-slate-600 bg-sky-50/80 border-sky-200'
                  }`}
                >
                  <span
                    className={`font-semibold ${
                      classifyVenueKind(currentVenueObj.name) === 'workshop'
                        ? 'text-amber-900'
                        : 'text-sky-900'
                    }`}
                  >
                    {venueKindLabel(classifyVenueKind(currentVenueObj.name))}｜設備配置：
                  </span>
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
            <div className="flex flex-wrap items-center gap-3 w-full">
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
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-700">年級：</span>
                <div className="flex items-center space-x-1 bg-slate-100 p-0.5 rounded-lg text-xs font-semibold">
                  {(
                    [
                      { key: 'all' as const, label: '全部' },
                      { key: 1 as const, label: '一年級' },
                      { key: 2 as const, label: '二年級' },
                      { key: 3 as const, label: '三年級' },
                    ] as const
                  ).map((g) => (
                    <button
                      key={String(g.key)}
                      type="button"
                      onClick={() => setDeptGradeFilter(g.key)}
                      className={`px-2.5 py-1 rounded-md transition ${
                        deptGradeFilter === g.key
                          ? 'bg-indigo-600 text-white font-bold shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
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
              {dimension === 'department' &&
                `🏛️ ${selectedDepartment} ${deptGradeLabel}排課彙整（同節並行班級會一併列出）`}
            </span>
          </div>
          
          <div className="flex items-center space-x-3 text-xs">
            <span className="text-slate-400">
              排定課堂數：<strong className="text-amber-400">{filteredSessions.length}</strong> 節
            </span>
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
                        const cellSessions = getSessionsAt(d.day, pDef.period);
                        const isStacked = cellSessions.length > 1;
                        return (
                          <td
                            key={d.day}
                            className={`p-2 align-top ${isStacked ? 'min-h-24' : 'h-24'}`}
                          >
                            {cellSessions.length > 0 ? (
                              <div className={isStacked ? 'flex flex-col gap-1.5' : 'h-full'}>
                                {cellSessions.map((session) => (
                                  <div
                                    key={session.id}
                                    className={`${isStacked ? '' : 'h-full'} p-2 rounded-xl border flex flex-col justify-between ${
                                      isPracticalSession(session)
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
                                          {isPracticalSession(session) && (
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

                                    <div className="mt-1 pt-1 border-t border-slate-200/60 space-y-1 text-[11px] text-slate-600">
                                      <div className="font-medium text-slate-800 truncate">
                                        {session.teacherName}
                                      </div>
                                      <SessionVenueSelect session={session} />
                                    </div>

                                    {(() => {
                                      const notes = sessionNotesForCurrentWeekDisplay(
                                        session,
                                        requests
                                      );
                                      return notes ? (
                                        <div className="text-[10px] text-indigo-700 font-bold mt-0.5 truncate">
                                          {notes}
                                        </div>
                                      ) : null;
                                    })()}
                                  </div>
                                ))}
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
