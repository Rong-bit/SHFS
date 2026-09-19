import React, { useState, useRef, useEffect } from 'react';
import { Search, Check, ChevronDown, X } from 'lucide-react';
import { Teacher } from '../../types';
import { displayTeacherTitle } from '../../utils/schoolDepartments';

interface TeacherSearchComboboxProps {
  teachers: Teacher[];
  currentTeacherId: string;
  onSelectTeacher: (teacherId: string) => void;
  className?: string;
  placeholder?: string;
  compact?: boolean;
  /** dark：側欄／深色區；light：表單白底 */
  variant?: 'dark' | 'light';
  /** 撐滿容器寬度（表單用） */
  fullWidth?: boolean;
  /** 允許清空已選教師（選填欄位：代導師等） */
  allowClear?: boolean;
  /** 下拉清單「不指定」列文字 */
  clearLabel?: string;
}

export const TeacherSearchCombobox: React.FC<TeacherSearchComboboxProps> = ({
  teachers,
  currentTeacherId,
  onSelectTeacher,
  className = '',
  placeholder = '輸入教師姓名或科別搜尋...',
  compact = false,
  variant = 'dark',
  fullWidth = false,
  allowClear = false,
  clearLabel = '不指定（清除）',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const isLight = variant === 'light';
  const currentTeacher = teachers.find((t) => t.id === currentTeacherId);

  // Filter teachers based on query
  const filteredTeachers = teachers.filter((t) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase().trim();
    return (
      t.name.toLowerCase().includes(q) ||
      (t.department && t.department.toLowerCase().includes(q)) ||
      (t.title && t.title.toLowerCase().includes(q)) ||
      (t.homeroomClass && t.homeroomClass.toLowerCase().includes(q))
    );
  });

  // Handle clicking outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Reset highlight when filtered list changes
  useEffect(() => {
    setHighlightedIndex(0);
  }, [filteredTeachers.length, query]);

  // Scroll active item into view
  useEffect(() => {
    if (isOpen && listRef.current && listRef.current.children[highlightedIndex]) {
      const activeEl = listRef.current.children[highlightedIndex] as HTMLElement;
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex, isOpen]);

  const handleSelect = (teacherId: string) => {
    onSelectTeacher(teacherId);
    setIsOpen(false);
    setQuery('');
  };

  const handleClear = () => {
    onSelectTeacher('');
    setIsOpen(false);
    setQuery('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setIsOpen(true);
        e.preventDefault();
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev < filteredTeachers.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : filteredTeachers.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredTeachers[highlightedIndex]) {
        handleSelect(filteredTeachers[highlightedIndex].id);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setQuery('');
    }
  };

  const displayClosed = currentTeacher
    ? isLight
      ? `${currentTeacher.name}（${currentTeacher.department} · ${displayTeacherTitle(currentTeacher)}）`
      : `${currentTeacher.name} (${currentTeacher.department})`
    : '';

  const showSelectionClear = allowClear && Boolean(currentTeacher) && !(isOpen && query);
  const rightPad = showSelectionClear
    ? isLight
      ? 'pr-16'
      : 'pr-14'
    : isLight
      ? 'pr-8'
      : 'pr-7';

  const inputClass = isLight
    ? `w-full pl-9 ${rightPad} py-2.5 rounded-xl text-xs sm:text-sm font-medium bg-slate-50 text-slate-900 placeholder:text-slate-400 border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition ${
        fullWidth ? '' : compact ? 'min-w-[160px] max-w-[220px]' : 'min-w-[200px] max-w-[280px]'
      }`
    : `w-full pl-8 ${rightPad} py-1 rounded-lg text-xs font-semibold bg-slate-900 text-amber-300 placeholder:text-slate-500 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-amber-500 transition shadow-inner ${
        fullWidth ? '' : compact ? 'min-w-[160px] max-w-[220px]' : 'min-w-[200px] max-w-[280px]'
      }`;

  return (
    <div
      ref={containerRef}
      className={`relative ${fullWidth ? 'block w-full' : 'inline-block'} ${className}`}
    >
      <div className="relative flex items-center">
        <div
          className={`absolute ${isLight ? 'left-3' : 'left-2.5'} top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none`}
        >
          <Search className={isLight ? 'w-4 h-4' : 'w-3.5 h-3.5'} />
        </div>

        <input
          ref={inputRef}
          type="text"
          value={isOpen ? query : displayClosed}
          placeholder={
            isOpen ? placeholder : currentTeacher ? currentTeacher.name : '選擇或輸入教師姓名'
          }
          onChange={(e) => {
            setQuery(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={() => {
            setIsOpen(true);
            setQuery('');
          }}
          onKeyDown={handleKeyDown}
          className={inputClass}
          title="可直接輸入教師姓名快速搜尋，或點下拉選擇"
          autoComplete="off"
        />

        {isOpen && query ? (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
            className={`absolute right-2 top-1/2 -translate-y-1/2 p-0.5 ${
              isLight ? 'text-slate-400 hover:text-slate-700' : 'text-slate-400 hover:text-white'
            }`}
            title="清除搜尋"
          >
            <X className="w-3 h-3" />
          </button>
        ) : (
          <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center">
            {showSelectionClear && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleClear();
                }}
                className={`p-1 ${
                  isLight
                    ? 'text-slate-400 hover:text-rose-600'
                    : 'text-slate-400 hover:text-rose-300'
                }`}
                title={clearLabel}
                aria-label={clearLabel}
              >
                <X className={isLight ? 'w-3.5 h-3.5' : 'w-3 h-3'} />
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setIsOpen((prev) => !prev);
                if (!isOpen) {
                  setTimeout(() => inputRef.current?.focus(), 50);
                }
              }}
              className={`p-1 ${
                isLight
                  ? 'text-slate-400 hover:text-indigo-600'
                  : 'text-slate-400 hover:text-amber-400'
              }`}
            >
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform duration-150 ${
                  isOpen ? `rotate-180 ${isLight ? 'text-indigo-600' : 'text-amber-400'}` : ''
                }`}
              />
            </button>
          </div>
        )}
      </div>

      {isOpen && (
        <div
          className={`absolute left-0 z-50 mt-1 ${
            fullWidth ? 'w-full' : 'w-72'
          } max-h-72 overflow-y-auto rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100 ${
            isLight
              ? 'bg-white border border-slate-200'
              : 'bg-slate-900 border border-slate-700'
          }`}
        >
          <div
            className={`px-3 py-1.5 text-[10px] font-bold border-b flex items-center justify-between ${
              isLight
                ? 'bg-slate-50 text-slate-500 border-slate-100'
                : 'bg-slate-800/90 text-slate-400 border-slate-700'
            }`}
          >
            <span>輸入關鍵字即時比對（共 {filteredTeachers.length} 位）</span>
            <span className={isLight ? 'text-slate-400' : 'text-slate-500'}>
              ↑↓ 選擇，Enter 確認
            </span>
          </div>

          {filteredTeachers.length === 0 ? (
            <div
              className={`p-4 text-center text-xs space-y-2 ${
                isLight ? 'text-slate-500' : 'text-slate-400'
              }`}
            >
              <p className={`font-semibold ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                找不到名為「{query}」的教師
              </p>
              <p className="text-[11px]">請確認是否已在 Excel 課表中匯入此教師</p>
              {allowClear && currentTeacher && (
                <button
                  type="button"
                  onClick={() => handleClear()}
                  className={`text-xs font-semibold ${
                    isLight ? 'text-rose-600 hover:underline' : 'text-rose-300 hover:underline'
                  }`}
                >
                  {clearLabel}
                </button>
              )}
            </div>
          ) : (
            <>
              {allowClear && (
                <button
                  type="button"
                  onClick={() => handleClear()}
                  className={`w-full text-left px-3 py-2 text-xs font-semibold border-b ${
                    isLight
                      ? 'text-rose-700 hover:bg-rose-50 border-slate-100'
                      : 'text-rose-300 hover:bg-slate-800/60 border-slate-800/80'
                  }`}
                >
                  {clearLabel}
                </button>
              )}
              <ul ref={listRef} className={`divide-y py-1 ${isLight ? 'divide-slate-100' : 'divide-slate-800/80'}`}>
              {filteredTeachers.map((teacher, index) => {
                const isSelected = teacher.id === currentTeacherId;
                const isHighlighted = index === highlightedIndex;

                return (
                  <li
                    key={teacher.id}
                    onClick={() => handleSelect(teacher.id)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    className={`px-3 py-2 text-xs flex items-center justify-between cursor-pointer transition ${
                      isLight
                        ? isHighlighted
                          ? 'bg-indigo-50 text-indigo-900'
                          : isSelected
                            ? 'bg-indigo-50/60 text-indigo-800'
                            : 'text-slate-800 hover:bg-slate-50'
                        : isHighlighted
                          ? 'bg-slate-800 text-amber-300'
                          : isSelected
                            ? 'bg-slate-800/40 text-amber-300'
                            : 'text-slate-200 hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-center space-x-2 truncate">
                      <div
                        className={`w-6 h-6 rounded-md font-bold text-[11px] flex items-center justify-center shrink-0 ${
                          isLight
                            ? 'bg-indigo-100 text-indigo-700'
                            : 'bg-amber-500/20 text-amber-400'
                        }`}
                      >
                        {teacher.name.slice(0, 1)}
                      </div>
                      <div className="truncate">
                        <div className="font-bold flex items-center gap-1.5">
                          <span>{teacher.name}</span>
                          <span
                            className={`text-[10px] px-1.5 py-0.2 rounded font-normal border ${
                              isLight
                                ? 'bg-slate-100 text-slate-600 border-slate-200'
                                : 'bg-slate-800 text-slate-400 border-slate-700'
                            }`}
                          >
                            {displayTeacherTitle(teacher)}
                          </span>
                        </div>
                        <div
                          className={`text-[10px] truncate ${
                            isLight ? 'text-slate-500' : 'text-slate-400'
                          }`}
                        >
                          {teacher.department} · 減授 {teacher.dutyReductionPeriods ?? 0} · 基本{' '}
                          {teacher.basePeriods} 節
                          {isLight ? ` · 現排 ${teacher.weeklyActualPeriods} 節` : ''}
                        </div>
                      </div>
                    </div>

                    {isSelected && (
                      <div
                        className={`shrink-0 pl-2 ${
                          isLight ? 'text-indigo-600' : 'text-amber-400'
                        }`}
                      >
                        <Check className="w-4 h-4" />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
};
