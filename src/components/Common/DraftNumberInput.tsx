import React, { useEffect, useRef, useState } from 'react';

export interface DraftNumberInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  value: number;
  onChange: (value: number) => void;
  /** 輸入有效數字時立即回寫（名冊 inline 編輯用）；預設失焦才儲存 */
  immediate?: boolean;
}

function clampNumber(n: number, min?: number, max?: number): number {
  let v = n;
  if (min !== undefined) v = Math.max(min, v);
  if (max !== undefined) v = Math.min(max, v);
  return v;
}

/** 數字欄位：刪除內容時可留白，不會立刻變成 0 */
export const DraftNumberInput: React.FC<DraftNumberInputProps> = ({
  value,
  onChange,
  immediate = false,
  min,
  max,
  className,
  id,
  required,
  disabled,
  ...rest
}) => {
  const [text, setText] = useState(() => String(value));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) {
      setText(String(value));
    }
  }, [value]);

  const commit = (raw: string) => {
    const trimmed = raw.trim();
    if (trimmed === '') {
      setText(String(value));
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      setText(String(value));
      return;
    }
    const next = clampNumber(parsed, min, max);
    onChange(next);
    setText(String(next));
  };

  return (
    <input
      {...rest}
      id={id}
      type="number"
      min={min}
      max={max}
      required={required}
      disabled={disabled}
      className={className}
      value={text}
      onFocus={() => {
        focused.current = true;
      }}
      onBlur={(e) => {
        focused.current = false;
        commit(e.target.value);
      }}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        if (!immediate || raw.trim() === '') return;
        const parsed = Number(raw);
        if (!Number.isFinite(parsed)) return;
        onChange(clampNumber(parsed, min, max));
      }}
    />
  );
};
