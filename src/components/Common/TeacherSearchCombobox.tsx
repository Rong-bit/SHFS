import React, { useState, useRef, useEffect } from 'react';
import { Search, User, Check, ChevronDown, X } from 'lucide-react';
import { Teacher } from '../../types';
import { displayTeacherTitle } from '../../utils/schoolDepartments';

interface TeacherSearchComboboxProps {
  teachers: Teacher[];
  currentTeacherId: string;
  onSelectTeacher: (teacherId: string) => void;
  className?: string;
  placeholder?: string;
  compact?: boolean;
}

export const TeacherSearchCombobox: React.FC<TeacherSearchComboboxProps> = ({
  teachers,
  currentTeacherId,
  onSelectTeacher,
  className = '',
  placeholder = '輸入教師姓名或科別搜尋...',
  compact = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

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

  return (
    <div ref={containerRef} className={`relative inline-block ${className}`}>
      {/* Input / Trigger Area */}
      <div className="relative flex items-center">
        <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
          <Search className="w-3.5 h-3.5" />
        </div>

        <input
          ref={inputRef}
          type="text"
          value={isOpen ? query : (currentTeacher ? `${currentTeacher.name} (${currentTeacher.department})` : '')}
          placeholder={isOpen ? placeholder : (currentTeacher ? currentTeacher.name : '選擇或輸入教師姓名')}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onFocus={() => {
            setIsOpen(true);
            setQuery('');
          }}
          onKeyDown={handleKeyDown}
          className={`w-full pl-8 pr-7 py-1 rounded-lg text-xs font-semibold bg-slate-900 text-amber-300 placeholder:text-slate-500 border border-slate-700 focus:outline-none focus:ring-1 focus:ring-amber-500 transition shadow-inner ${
            compact ? 'min-w-[160px] max-w-[220px]' : 'min-w-[200px] max-w-[280px]'
          }`}
          title="可直接輸入教師姓名快速搜尋與切換身分"
        />

        {isOpen && query ? (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-0.5"
          >
            <X className="w-3 h-3" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              setIsOpen((prev) => !prev);
              if (!isOpen) {
                setTimeout(() => inputRef.current?.focus(), 50);
              }
            }}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-amber-400 p-1"
          >
            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-150 ${isOpen ? 'rotate-180 text-amber-400' : ''}`} />
          </button>
        )}
      </div>

      {/* Floating Suggestions Dropdown */}
      {isOpen && (
        <div className="absolute left-0 z-50 mt-1 w-72 max-h-72 overflow-y-auto bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
          <div className="px-3 py-1.5 bg-slate-800/90 text-[10px] font-bold text-slate-400 border-b border-slate-700 flex items-center justify-between">
            <span>🔍 輸入關鍵字即時比對（共 {filteredTeachers.length} 位）</span>
            <span className="text-[9px] text-slate-500">按 ↑↓ 選擇，Enter 確認</span>
          </div>

          {filteredTeachers.length === 0 ? (
            <div className="p-4 text-center text-xs text-slate-400 space-y-1">
              <p className="font-semibold text-slate-300">找不到名為「{query}」的教師</p>
              <p className="text-[11px] text-slate-500">請確認是否已在 Excel 課表中匯入此教師</p>
            </div>
          ) : (
            <ul ref={listRef} className="divide-y divide-slate-800/80 py-1">
              {filteredTeachers.map((teacher, index) => {
                const isSelected = teacher.id === currentTeacherId;
                const isHighlighted = index === highlightedIndex;

                return (
                  <li
                    key={teacher.id}
                    onClick={() => handleSelect(teacher.id)}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    className={`px-3 py-2 text-xs flex items-center justify-between cursor-pointer transition ${
                      isHighlighted
                        ? 'bg-slate-800 text-amber-300'
                        : isSelected
                        ? 'bg-slate-800/40 text-amber-300'
                        : 'text-slate-200 hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-center space-x-2 truncate">
                      <div className="w-6 h-6 rounded-md bg-amber-500/20 text-amber-400 font-bold text-[11px] flex items-center justify-center shrink-0">
                        {teacher.name.slice(0, 1)}
                      </div>
                      <div className="truncate">
                        <div className="font-bold flex items-center gap-1.5">
                          <span>{teacher.name}</span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700 font-normal">
                            {displayTeacherTitle(teacher)}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 truncate">
                          {teacher.department} · 基本 {teacher.basePeriods} 節
                        </div>
                      </div>
                    </div>

                    {isSelected && (
                      <div className="shrink-0 text-amber-400 pl-2">
                        <Check className="w-4 h-4" />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};
