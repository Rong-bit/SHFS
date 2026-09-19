import React from 'react';
import { CourseSession } from '../../types';
import { departmentFromClassName } from '../../utils/schoolDepartments';
import { venuesForSessionEdit } from '../../utils/venueKinds';
import { useApp } from '../../context/AppContext';

type Props = {
  session: CourseSession;
  className?: string;
  /** 緊湊模式（課表格內） */
  compact?: boolean;
};

/** 匯入後於課表上改選工場／教室（同科優先） */
export const SessionVenueSelect: React.FC<Props> = ({
  session,
  className = '',
  compact = true,
}) => {
  const { venues, updateSessionVenue } = useApp();
  const dept = departmentFromClassName(session.className);
  const options = venuesForSessionEdit(session, venues, dept);

  // 若目前 venueId 對不到清冊，仍保留顯示
  const hasCurrent = options.some(
    (v) => v.id === session.venueId || v.name === session.venueName
  );
  const value =
    options.find((v) => v.id === session.venueId)?.id ||
    options.find((v) => v.name === session.venueName)?.id ||
    session.venueId ||
    '';

  return (
    <select
      value={value}
      title="改選工場／教室（同科工場優先；不會開啟調課）"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onChange={(e) => {
        e.stopPropagation();
        updateSessionVenue(session.id, e.target.value);
      }}
      className={
        className ||
        (compact
          ? 'w-full max-w-[9.5rem] bg-white/90 border border-slate-300/80 rounded px-1 py-0.5 text-[10px] text-slate-700 font-medium truncate focus:ring-1 focus:ring-amber-500'
          : 'w-full bg-white border border-slate-300 rounded-lg px-2 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-amber-500')
      }
    >
      {!hasCurrent && session.venueName && (
        <option value={session.venueId || ''}>{session.venueName}（未在清冊）</option>
      )}
      {options.map((v) => {
        const star = dept && v.department === dept ? '★ ' : '';
        return (
          <option key={v.id} value={v.id}>
            {star}
            {v.name}
          </option>
        );
      })}
    </select>
  );
};
