import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Search, X, Clock, MapPin, FileText, User } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { NonTeachingDay } from '../../types';
import { dateToIsoLocal } from '../../utils/holidays';
import {
  buildLeaveCalendarEvents,
  buildMonthCells,
  eventTimeRangeLabel,
  formatCalendarHeading,
  formatEventDateLabel,
  formatSubstitutePeriodLine,
  LeaveCalendarEvent,
  leaveCalendarColor,
  periodTimeRange,
  stripTeacherHonorific,
} from '../../utils/leaveCalendar';

const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六'];
const MAX_VISIBLE_EVENTS = 3;

type PopoverState =
  | { kind: 'event'; event: LeaveCalendarEvent; x: number; y: number }
  | { kind: 'day'; iso: string; x: number; y: number };

function clampPopover(x: number, y: number, width: number, height: number) {
  const pad = 12;
  const left = Math.min(Math.max(pad, x), window.innerWidth - width - pad);
  const top = Math.min(Math.max(pad, y), window.innerHeight - height - pad);
  return { left, top };
}

function holidayOn(iso: string, days: NonTeachingDay[] | undefined) {
  return (days || []).find((d) => d.date === iso);
}

export const TeacherLeaveCalendar: React.FC = () => {
  const { requests, systemConfig } = useApp();
  const todayIso = dateToIsoLocal(new Date());
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'approved' | 'pending'>('all');
  const [popover, setPopover] = useState<PopoverState | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const events = useMemo(() => {
    const all = buildLeaveCalendarEvents(requests);
    const q = query.trim();
    return all.filter((e) => {
      if (statusFilter !== 'all' && e.status !== statusFilter) return false;
      if (!q) return true;
      return (
        e.title.includes(q) ||
        e.teacherName.includes(q) ||
        stripTeacherHonorific(e.teacherName).includes(q) ||
        e.periodDetails.some(
          (d) =>
            (d.substituteTeacherName || '').includes(q) ||
            (d.className || '').includes(q) ||
            (d.subjectName || '').includes(q)
        )
      );
    });
  }, [requests, query, statusFilter]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, LeaveCalendarEvent[]>();
    for (const e of events) {
      const list = map.get(e.date) || [];
      list.push(e);
      map.set(e.date, list);
    }
    return map;
  }, [events]);

  const cells = useMemo(
    () => buildMonthCells(cursor.year, cursor.month, todayIso),
    [cursor.year, cursor.month, todayIso]
  );

  const goToday = () => {
    const now = new Date();
    setCursor({ year: now.getFullYear(), month: now.getMonth() });
    setPopover(null);
  };

  const shiftMonth = (delta: number) => {
    setPopover(null);
    setCursor((prev) => {
      const d = new Date(prev.year, prev.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  };

  const openEvent = (event: LeaveCalendarEvent, target: HTMLElement) => {
    const rect = target.getBoundingClientRect();
    setPopover({ kind: 'event', event, x: rect.left, y: rect.bottom + 6 });
  };

  const openDay = (iso: string, target: HTMLElement) => {
    const rect = target.getBoundingClientRect();
    setPopover({ kind: 'day', iso, x: rect.left, y: rect.bottom + 6 });
  };

  useEffect(() => {
    if (!popover) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPopover(null);
    };
    const onDown = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPopover(null);
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown);
    };
  }, [popover]);

  const monthLabel = formatCalendarHeading(cursor.year, cursor.month);
  const holidays = systemConfig.nonTeachingDays;

  return (
    <div className="space-y-4" id="academic-leave-calendar">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={goToday}
            className="px-3 py-1.5 text-sm font-bold rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          >
            今天
          </button>
          <button
            type="button"
            aria-label="上一個月"
            onClick={() => shiftMonth(-1)}
            className="p-1.5 rounded-full hover:bg-slate-200 text-slate-600"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            type="button"
            aria-label="下一個月"
            onClick={() => shiftMonth(1)}
            className="p-1.5 rounded-full hover:bg-slate-200 text-slate-600"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
          <h2 className="text-xl font-black text-slate-900 tracking-tight min-w-[8.5rem]">
            {monthLabel}
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜尋教師、班級、科目"
              className="pl-8 pr-3 py-1.5 text-sm rounded-lg border border-slate-300 bg-white w-52 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            />
          </div>
          <div className="flex rounded-lg border border-slate-300 overflow-hidden text-xs font-bold">
            {(
              [
                ['all', '全部'],
                ['approved', '已核准'],
                ['pending', '待審核'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setStatusFilter(key)}
                className={`px-3 py-1.5 ${
                  statusFilter === key
                    ? 'bg-slate-900 text-white'
                    : 'bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
        <span className="font-bold text-slate-600">假別顏色</span>
        {[
          ['official', '公假'],
          ['personal', '事假'],
          ['sick', '病假'],
          ['marriage', '婚假'],
          ['maternity', '產假'],
          ['wellness', '身心假'],
        ].map(([key, label]) => {
          const c = leaveCalendarColor(key as 'official');
          return (
            <span key={key} className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: c.bg }} />
              {label}
            </span>
          );
        })}
        <span className="text-slate-400">｜待審核以斜線標示</span>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
          {WEEKDAY_LABELS.map((label, i) => (
            <div
              key={label}
              className={`py-2 text-center text-xs font-bold ${
                i === 0 || i === 6 ? 'text-rose-500' : 'text-slate-500'
              }`}
            >
              {label}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {cells.map((cell) => {
            const dayEvents = eventsByDate.get(cell.iso) || [];
            const holiday = holidayOn(cell.iso, holidays);
            const visible = dayEvents.slice(0, MAX_VISIBLE_EVENTS);
            const overflow = dayEvents.length - visible.length;
            return (
              <div
                key={cell.iso}
                className={`min-h-[118px] border-r border-b border-slate-100 p-1.5 ${
                  cell.inMonth ? 'bg-white' : 'bg-slate-50/80'
                } ${cell.isToday ? 'bg-blue-50/40' : ''}`}
              >
                <div className="flex items-start justify-between gap-1 mb-1">
                  <button
                    type="button"
                    onClick={(e) => openDay(cell.iso, e.currentTarget)}
                    className={`h-7 min-w-[1.75rem] px-1 rounded-full text-sm font-bold leading-7 ${
                      cell.isToday
                        ? 'bg-[#1a73e8] text-white'
                        : cell.isWeekend || holiday
                          ? cell.inMonth
                            ? 'text-rose-500'
                            : 'text-rose-300'
                          : cell.inMonth
                            ? 'text-slate-700 hover:bg-slate-100'
                            : 'text-slate-300'
                    }`}
                    title="查看當日全部請假"
                  >
                    {cell.day}
                  </button>
                  {holiday && cell.inMonth && (
                    <span className="text-[10px] text-rose-500 font-bold truncate max-w-[4.5rem]" title={holiday.label}>
                      {holiday.label}
                    </span>
                  )}
                </div>

                <div className="space-y-0.5">
                  {visible.map((event) => {
                    const color = leaveCalendarColor(event.leaveType);
                    return (
                      <button
                        key={event.id}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEvent(event, e.currentTarget);
                        }}
                        className="w-full text-left truncate rounded px-1.5 py-[3px] text-[11px] font-bold leading-tight hover:brightness-95"
                        style={{
                          background:
                            event.status === 'pending'
                              ? `repeating-linear-gradient(135deg, ${color.bg}, ${color.bg} 6px, ${color.soft} 6px, ${color.soft} 10px)`
                              : color.bg,
                          color: event.status === 'pending' ? '#1e293b' : color.text,
                        }}
                        title={event.title}
                      >
                        {event.title}
                      </button>
                    );
                  })}
                  {overflow > 0 && (
                    <button
                      type="button"
                      onClick={(e) => openDay(cell.iso, e.currentTarget)}
                      className="w-full text-left px-1.5 py-0.5 text-[11px] font-bold text-slate-600 hover:bg-slate-100 rounded"
                    >
                      還有 {overflow} 則
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {events.length === 0 && (
        <p className="text-sm text-slate-500 text-center py-2">
          本月尚無符合條件的請假派代（需已填請假日期，且狀態為待審核或已核准）。
        </p>
      )}

      {popover && (
        <EventPopover
          popover={popover}
          events={popover.kind === 'day' ? eventsByDate.get(popover.iso) || [] : []}
          holiday={popover.kind === 'day' ? holidayOn(popover.iso, holidays) : undefined}
          onClose={() => setPopover(null)}
          onOpenEvent={(event, el) => openEvent(event, el)}
          popoverRef={popoverRef}
        />
      )}
    </div>
  );
};

const EventPopover: React.FC<{
  popover: PopoverState;
  events: LeaveCalendarEvent[];
  holiday?: NonTeachingDay;
  onClose: () => void;
  onOpenEvent: (event: LeaveCalendarEvent, el: HTMLElement) => void;
  popoverRef: React.RefObject<HTMLDivElement | null>;
}> = ({ popover, events, holiday, onClose, onOpenEvent, popoverRef }) => {
  const width = popover.kind === 'event' ? 360 : 320;
  const pos = clampPopover(popover.x, popover.y, width, 480);

  if (popover.kind === 'day') {
    return (
      <div
        ref={popoverRef}
        className="fixed z-50 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden"
        style={{ left: pos.left, top: pos.top, width }}
        role="dialog"
        aria-label="當日請假"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-4 pt-3 pb-2">
          <div>
            <div className="text-xs font-bold text-slate-500">{formatEventDateLabel(popover.iso)}</div>
            {holiday && <div className="text-xs text-rose-500 font-bold mt-0.5">{holiday.label}</div>}
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-full hover:bg-slate-100" aria-label="關閉">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>
        <div className="px-2 pb-3 max-h-[360px] overflow-y-auto">
          {events.length === 0 ? (
            <p className="px-2 py-6 text-sm text-slate-400 text-center">當日沒有教師請假</p>
          ) : (
            events.map((event) => {
              const color = leaveCalendarColor(event.leaveType);
              return (
                <button
                  key={event.id}
                  type="button"
                  onClick={(e) => onOpenEvent(event, e.currentTarget)}
                  className="w-full flex items-start gap-2 px-2 py-2 rounded-lg hover:bg-slate-50 text-left"
                >
                  <span className="mt-1.5 w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: color.bg }} />
                  <span>
                    <span className="block text-sm font-bold text-slate-800">{event.title}</span>
                    <span className="block text-xs text-slate-500">
                      {eventTimeRangeLabel(event.periods)}
                      {event.status === 'pending' ? ' · 待審核' : ''}
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    );
  }

  const event = popover.event;
  const color = leaveCalendarColor(event.leaveType);

  return (
    <div
      ref={popoverRef}
      className="fixed z-50 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden"
      style={{ left: pos.left, top: pos.top, width }}
      role="dialog"
      aria-label={event.title}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="h-2" style={{ background: color.bg }} />
      <div className="flex items-start justify-between px-4 pt-3">
        <h3 className="text-lg font-black text-slate-900 leading-snug pr-2">{event.title}</h3>
        <button type="button" onClick={onClose} className="p-1 rounded-full hover:bg-slate-100 shrink-0" aria-label="關閉">
          <X className="w-4 h-4 text-slate-500" />
        </button>
      </div>
      <div className="px-4 pb-4 pt-2 space-y-3 text-sm">
        <div className="flex items-start gap-2 text-slate-600">
          <Clock className="w-4 h-4 mt-0.5 text-slate-400 shrink-0" />
          <div>
            <div className="font-bold text-slate-800">{formatEventDateLabel(event.date)}</div>
            <div className="text-xs text-slate-500">
              {eventTimeRangeLabel(event.periods)}
              {event.status === 'pending' ? ' · 待審核' : ' · 已核准'}
            </div>
          </div>
        </div>

        <div>
          <div className="text-xs font-bold text-slate-500 mb-1.5">代課安排</div>
          {event.actingHomeroomOnly && (
            <p className="text-sm text-slate-700">當日僅辦代導師，無授課派代。</p>
          )}
          {event.periodDetails.length > 0 && (
            <ul className="space-y-1.5">
              {event.periodDetails.map((d) => (
                <li key={`${d.requestId}-${d.period}`} className="rounded-lg bg-slate-50 px-3 py-2">
                  <div className="font-black text-slate-900">
                    {formatSubstitutePeriodLine(d.period, d.substituteTeacherName)}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5 flex items-start gap-1">
                    <MapPin className="w-3 h-3 mt-0.5 shrink-0" />
                    <span>
                      {d.className}｜{d.subjectName}
                      {d.venueName ? `｜${d.venueName}` : ''}
                      {periodTimeRange(d.period) ? `｜${periodTimeRange(d.period)}` : ''}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {event.actingHomeroomTeacherName && (
          <div className="flex items-center gap-2 text-slate-700">
            <User className="w-4 h-4 text-slate-400" />
            <span>
              代導師：<b>{stripTeacherHonorific(event.actingHomeroomTeacherName)}</b>
            </span>
          </div>
        )}

        {event.reason && (
          <div className="flex items-start gap-2 text-slate-600">
            <FileText className="w-4 h-4 mt-0.5 text-slate-400 shrink-0" />
            <span>{event.reason}</span>
          </div>
        )}

        {event.requestNumbers.length > 0 && (
          <div className="text-[11px] text-slate-400">假單 {event.requestNumbers.join('、')}</div>
        )}
      </div>
    </div>
  );
};
