import React, { useEffect, useRef } from 'react';

export type MobileDockItem = {
  id: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
  badge?: number;
};

/** 手機底部功能列：大觸控區、目前項目會捲到可視範圍。桌面不顯示。 */
export const MobileDock: React.FC<{ items: MobileDockItem[] }> = ({ items }) => {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const activeId = items.find((item) => item.active)?.id;

  useEffect(() => {
    const root = scrollerRef.current;
    if (!root || !activeId) return;
    const el = root.querySelector<HTMLElement>(`[data-dock-id="${activeId}"]`);
    el?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [activeId]);

  if (items.length < 2) return null;

  return (
    <nav
      className="md:hidden print:hidden fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur-md shadow-[0_-6px_20px_rgba(15,23,42,0.08)]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="功能選單"
    >
      <div
        ref={scrollerRef}
        className="flex overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            data-dock-id={item.id}
            onClick={item.onClick}
            aria-current={item.active ? 'page' : undefined}
            className={`relative flex min-h-14 min-w-0 flex-1 basis-0 flex-col items-center justify-center gap-0.5 px-1.5 py-1.5 text-[11px] font-bold touch-manipulation active:bg-slate-100 ${
              item.active ? 'text-slate-950' : 'text-slate-500'
            }`}
          >
            <span
              className={`flex h-7 w-7 items-center justify-center rounded-full ${
                item.active ? 'bg-amber-400 text-slate-950' : ''
              }`}
            >
              {item.icon}
            </span>
            <span className="max-w-full truncate leading-none">{item.label}</span>
            {item.badge != null && item.badge > 0 && (
              <span className="absolute right-1.5 top-1 min-w-4 rounded-full bg-rose-500 px-1 text-center text-[10px] font-bold leading-4 text-white">
                {item.badge > 99 ? '99+' : item.badge}
              </span>
            )}
          </button>
        ))}
      </div>
    </nav>
  );
};
