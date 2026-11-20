import React, { useEffect, useId, useMemo, useState } from 'react';
import { departmentOptionsForSelect } from '../../utils/schoolDepartments';
import type { SystemConfig } from '../../types';

type Props = {
  value: string;
  onChange: (next: string) => void;
  systemConfig: Pick<SystemConfig, 'schoolDepartments'> | null | undefined;
  className?: string;
  /** 場地用：可含「通用教室」，並可排除共同科目 */
  includeGeneralClassroom?: boolean;
  excludeCommonSubject?: boolean;
  required?: boolean;
  id?: string;
};

/**
 * 群科科別：可從清單選，也可直接輸入新名稱。
 * 新名稱由外層「儲存」寫入學校清單（勿在 blur 寫入，以免取消後仍留下）。
 */
export const DepartmentCombobox: React.FC<Props> = ({
  value,
  onChange,
  systemConfig,
  className,
  includeGeneralClassroom = false,
  excludeCommonSubject = false,
  required = false,
  id,
}) => {
  const listId = useId();
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const options = useMemo(() => {
    let list = departmentOptionsForSelect(systemConfig, value);
    if (excludeCommonSubject) list = list.filter((d) => d !== '共同科目');
    if (includeGeneralClassroom && !list.includes('通用教室')) {
      list = [...list, '通用教室'];
    }
    return list;
  }, [systemConfig, value, excludeCommonSubject, includeGeneralClassroom]);

  const trimCommit = (raw: string) => {
    const next = String(raw || '').trim();
    setDraft(next);
    onChange(next);
  };

  return (
    <>
      <input
        id={id}
        list={listId}
        value={draft}
        required={required}
        onChange={(e) => {
          setDraft(e.target.value);
          onChange(e.target.value);
        }}
        onBlur={(e) => trimCommit(e.target.value)}
        className={
          className ||
          'w-full bg-slate-50 border border-slate-300 rounded-xl p-2 font-bold'
        }
        placeholder="選清單或直接輸入新科別"
        autoComplete="off"
      />
      <datalist id={listId}>
        {options.map((d) => (
          <option key={d} value={d} />
        ))}
      </datalist>
      <p className="text-[10px] text-slate-500 mt-1">
        可點選建議，或自行輸入；儲存後新科別會加入學校清單
      </p>
    </>
  );
};
