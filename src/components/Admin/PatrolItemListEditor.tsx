import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { PatrolCheckItem } from '../../types';

type PatrolItemListEditorProps = {
  title: string;
  hint: string;
  items: PatrolCheckItem[];
  placeholder: string;
  onChange: (items: PatrolCheckItem[]) => void;
  onAskRemove: (label: string, onConfirm: () => void) => void;
};

/** 巡堂觀察／檢查／關鍵字清單編輯（立即儲存由呼叫端處理） */
export const PatrolItemListEditor: React.FC<PatrolItemListEditorProps> = ({
  title,
  hint,
  items,
  placeholder,
  onChange,
  onAskRemove,
}) => {
  const [draft, setDraft] = useState('');
  const add = () => {
    const label = draft.trim();
    if (!label) return;
    if (items.some((i) => i.label === label)) {
      alert('已有相同項目');
      return;
    }
    onChange([...items, { id: `item-${Date.now().toString(36)}`, label }]);
    setDraft('');
  };
  return (
    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
      <div>
        <h4 className="font-bold text-slate-900 text-sm">{title}</h4>
        <p className="text-[11px] text-slate-500 mt-0.5">{hint}</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.length === 0 ? (
          <span className="text-xs text-slate-400">尚無項目</span>
        ) : (
          items.map((item) => (
            <span
              key={item.id}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 border border-slate-200 text-xs text-slate-800"
            >
              {item.label}
              <button
                type="button"
                title="移除"
                onClick={() =>
                  onAskRemove(item.label, () => onChange(items.filter((x) => x.id !== item.id)))
                }
                className="text-slate-400 hover:text-rose-600"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))
        )}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          className="flex-1 bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm"
        />
        <button
          type="button"
          onClick={add}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-bold hover:bg-slate-700"
        >
          <Plus className="w-3.5 h-3.5" />
          新增
        </button>
      </div>
    </div>
  );
};
