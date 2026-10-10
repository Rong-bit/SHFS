import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Download,
  Edit2,
  FileSpreadsheet,
  MapPin,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { PatrolCheckItem, PatrolMailConfig, PatrolRoom, SystemConfig } from '../../types';
import {
  buildDraftPatrolRooms,
  groupPatrolRooms,
  newPatrolRoomId,
  resolveOutdoorVenueKeywords,
  resolvePatrolCheckItems,
  resolvePatrolObservationItems,
} from '../../utils/patrolConfig';
import {
  downloadPatrolRoomTemplate,
  exportPatrolRooms,
  parsePatrolRoomWorkbook,
  readPatrolWorkbook,
} from '../../utils/patrolExcel';
import { scheduleClassNames } from '../../utils/patrolSchedule';
import { ModalShell } from '../Common/ModalShell';

type ConfirmState = { title: string; message: string; onConfirm: () => void } | null;

const emptyForm = { building: '', floor: '', name: '', homeroomClass: '' };

const ItemListEditor: React.FC<{
  title: string;
  hint: string;
  items: PatrolCheckItem[];
  placeholder: string;
  onChange: (items: PatrolCheckItem[]) => void;
  onAskRemove: (label: string, onConfirm: () => void) => void;
}> = ({ title, hint, items, placeholder, onChange, onAskRemove }) => {
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

const emptyMailConfig = (): PatrolMailConfig => ({
  enabled: false,
  host: '',
  port: 587,
  secure: false,
  user: '',
  pass: '',
  fromName: '',
  fromEmail: '',
  appBaseUrl: typeof window !== 'undefined' ? window.location.origin : '',
});

const PatrolMailSettingsPanel: React.FC<{
  value?: PatrolMailConfig;
  onSave: (cfg: PatrolMailConfig) => void;
}> = ({ value, onSave }) => {
  const [draft, setDraft] = useState<PatrolMailConfig>(() => ({
    ...emptyMailConfig(),
    ...(value || {}),
  }));
  const [savedHint, setSavedHint] = useState('');

  React.useEffect(() => {
    setDraft({ ...emptyMailConfig(), ...(value || {}) });
  }, [value]);

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
      <div>
        <h3 className="text-sm font-extrabold text-slate-900">巡堂異常會辦寄信（SMTP）</h3>
        <p className="text-xs text-slate-500 mt-1">
          僅在巡堂有缺失時寄信通知生輔組、學務主任、教學組、教務主任、導師（及非段考之任課老師）。請使用學校信箱或第三方 SMTP；密碼請妥善保管。
        </p>
      </div>
      <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800">
        <input
          type="checkbox"
          checked={draft.enabled}
          onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
        />
        啟用異常會辦 email 通知
      </label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <label className="font-semibold text-slate-600">
          SMTP 主機
          <input
            value={draft.host}
            onChange={(e) => setDraft({ ...draft, host: e.target.value })}
            placeholder="smtp.example.edu.tw"
            className="mt-1 w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 text-sm"
          />
        </label>
        <label className="font-semibold text-slate-600">
          Port
          <input
            type="number"
            value={draft.port}
            onChange={(e) => setDraft({ ...draft, port: Number(e.target.value) || 587 })}
            className="mt-1 w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 text-sm"
          />
        </label>
        <label className="font-semibold text-slate-600">
          帳號
          <input
            value={draft.user}
            onChange={(e) => setDraft({ ...draft, user: e.target.value })}
            className="mt-1 w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 text-sm"
          />
        </label>
        <label className="font-semibold text-slate-600">
          密碼／應用程式密碼
          <input
            type="password"
            value={draft.pass}
            onChange={(e) => setDraft({ ...draft, pass: e.target.value })}
            placeholder={value?.pass ? '已設定，可覆寫' : ''}
            className="mt-1 w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 text-sm"
          />
        </label>
        <label className="font-semibold text-slate-600">
          寄件顯示名稱
          <input
            value={draft.fromName}
            onChange={(e) => setDraft({ ...draft, fromName: e.target.value })}
            placeholder="巡堂會辦通知"
            className="mt-1 w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 text-sm"
          />
        </label>
        <label className="font-semibold text-slate-600">
          寄件信箱
          <input
            type="email"
            value={draft.fromEmail}
            onChange={(e) => setDraft({ ...draft, fromEmail: e.target.value })}
            className="mt-1 w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 text-sm"
          />
        </label>
        <label className="font-semibold text-slate-600 sm:col-span-2">
          系統網址（信內深層連結）
          <input
            value={draft.appBaseUrl || ''}
            onChange={(e) => setDraft({ ...draft, appBaseUrl: e.target.value })}
            placeholder="https://your-school.example.com"
            className="mt-1 w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 text-sm"
          />
        </label>
        <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 sm:col-span-2">
          <input
            type="checkbox"
            checked={draft.secure}
            onChange={(e) => setDraft({ ...draft, secure: e.target.checked })}
          />
          使用 TLS／SSL（通常 Port 465 勾選；587 可不勾）
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            const next = {
              ...draft,
              pass: draft.pass.trim() || value?.pass || '',
            };
            onSave(next);
            setSavedHint('已儲存寄信設定');
            window.setTimeout(() => setSavedHint(''), 2500);
          }}
          className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-500"
        >
          儲存寄信設定
        </button>
        {savedHint && <span className="text-xs text-emerald-700 font-semibold">{savedHint}</span>}
      </div>
    </div>
  );
};

export const PatrolLayoutSettings: React.FC = () => {
  const { systemConfig, updateSystemConfig, sessions } = useApp();
  const rooms = systemConfig.patrolRooms || [];
  const checkItems = resolvePatrolCheckItems(systemConfig);
  const observationItems = resolvePatrolObservationItems(systemConfig);
  const outdoorKeywords = resolveOutdoorVenueKeywords(systemConfig);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [notice, setNotice] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const classNames = useMemo(() => scheduleClassNames(sessions), [sessions]);
  const buildings = useMemo(
    () =>
      Array.from(new Set<string>(rooms.map((r) => r.building))).sort((a, b) =>
        a.localeCompare(b, 'zh-Hant')
      ),
    [rooms]
  );
  const grouped = useMemo(() => groupPatrolRooms(rooms), [rooms]);
  const unmatchedClasses = useMemo(() => {
    if (classNames.length === 0) return [];
    const known = new Set(classNames);
    return rooms.filter((r) => r.homeroomClass && !known.has(r.homeroomClass));
  }, [rooms, classNames]);

  const saveRooms = (next: PatrolRoom[]) => updateSystemConfig({ patrolRooms: next });
  const save = (patch: Partial<SystemConfig>) => updateSystemConfig(patch);
  const ask = (title: string, message: string, onConfirm: () => void) =>
    setConfirm({ title, message, onConfirm });

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const submitRoom = () => {
    const building = form.building.trim();
    const floor = form.floor.trim().toUpperCase();
    const name = form.name.trim();
    if (!building || !floor || !name) {
      alert('請填寫大樓、樓層與教室名稱');
      return;
    }
    const homeroomClass = form.homeroomClass.trim() || undefined;
    const duplicate = rooms.find(
      (r) => r.id !== editingId && r.building === building && r.floor === floor && r.name === name
    );
    if (duplicate) {
      alert('同大樓同樓層已有相同名稱的教室');
      return;
    }
    if (editingId) {
      saveRooms(
        rooms.map((r) => {
          if (r.id !== editingId) return r;
          const moved = r.building !== building || r.floor !== floor;
          const order = moved
            ? Math.max(0, ...rooms.filter((x) => x.building === building && x.floor === floor).map((x) => x.order)) + 1
            : r.order;
          return { ...r, building, floor, name, homeroomClass, order };
        })
      );
    } else {
      const order =
        Math.max(0, ...rooms.filter((x) => x.building === building && x.floor === floor).map((x) => x.order)) + 1;
      saveRooms([...rooms, { id: newPatrolRoomId(), building, floor, name, homeroomClass, order }]);
    }
    setForm({ ...emptyForm, building, floor });
    setEditingId(null);
  };

  const moveRoom = (room: PatrolRoom, dir: -1 | 1) => {
    const siblings = rooms
      .filter((r) => r.building === room.building && r.floor === room.floor)
      .sort((a, b) => a.order - b.order);
    const idx = siblings.findIndex((r) => r.id === room.id);
    const swapWith = siblings[idx + dir];
    if (!swapWith) return;
    const reordered = [...siblings];
    reordered[idx] = swapWith;
    reordered[idx + dir] = room;
    const orderById = new Map(reordered.map((r, i) => [r.id, i + 1]));
    saveRooms(rooms.map((r) => (orderById.has(r.id) ? { ...r, order: orderById.get(r.id)! } : r)));
  };

  const handleImport = async (file: File) => {
    try {
      const imported = parsePatrolRoomWorkbook(await readPatrolWorkbook(file));
      const apply = () => {
        saveRooms(imported);
        setNotice(`已匯入 ${imported.length} 間教室。`);
      };
      if (rooms.length > 0) {
        ask(
          '以匯入檔取代教室配置？',
          `目前有 ${rooms.length} 間教室，將全部改為匯入檔的 ${imported.length} 間。已登錄的巡堂紀錄不受影響。`,
          apply
        );
      } else {
        apply();
      }
    } catch (err) {
      setNotice(err instanceof Error ? err.message : '匯入失敗');
    }
  };

  const loadDraft = () => {
    const apply = () => {
      const draft = buildDraftPatrolRooms();
      saveRooms(draft);
      setNotice(`已帶入 ${draft.length} 間教室草稿，請逐一核對大樓、樓層與原班級。`);
    };
    if (rooms.length > 0) {
      ask('以 114 學年配置圖草稿取代？', `目前的 ${rooms.length} 間教室會被草稿取代。`, apply);
    } else {
      apply();
    }
  };

  return (
    <div className="space-y-6">
      <p className="text-xs text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 leading-relaxed">
        本頁的新增、修改、刪除都會<strong>立即儲存</strong>並同步給全校。教師在「巡堂」分頁依此配置顯示各樓層教室；
        「原班級」需與課表班級名稱一致，系統才能帶出該節的科目與老師、判斷原班是否外出上課。
      </p>

      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
            <MapPin className="w-4 h-4 text-indigo-500" />
            巡堂教室配置（{rooms.length} 間）
          </h3>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={loadDraft}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-800 text-xs font-bold hover:bg-indigo-100"
            >
              <Sparkles className="w-3.5 h-3.5" />
              帶入 114 學年配置圖草稿
            </button>
            <button
              type="button"
              onClick={downloadPatrolRoomTemplate}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              下載範本
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50"
            >
              <Upload className="w-3.5 h-3.5" />
              匯入 Excel
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void handleImport(file);
              }}
            />
            <button
              type="button"
              disabled={rooms.length === 0}
              onClick={() => exportPatrolRooms(rooms)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              匯出
            </button>
            <button
              type="button"
              disabled={rooms.length === 0}
              onClick={() =>
                ask('清除全部教室配置？', `將刪除 ${rooms.length} 間教室，巡堂頁面會變成空白。已登錄的巡堂紀錄不受影響。`, () =>
                  saveRooms([])
                )
              }
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-rose-200 bg-white text-rose-700 text-xs font-semibold hover:bg-rose-50 disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              清除全部
            </button>
          </div>
        </div>

        {notice && (
          <p className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">{notice}</p>
        )}

        {unmatchedClasses.length > 0 && (
          <div className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
            <span>
              以下 {unmatchedClasses.length} 間教室的原班級在課表找不到，巡堂時無法帶出課程：
              {unmatchedClasses.slice(0, 20).map((r) => r.homeroomClass).join('、')}
              {unmatchedClasses.length > 20 ? '…' : ''}。請改成與課表相同的班級名稱。
            </span>
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-end">
          <label className="text-[11px] font-semibold text-slate-600">
            大樓
            <input
              list="patrol-buildings"
              value={form.building}
              onChange={(e) => setForm({ ...form, building: e.target.value })}
              placeholder="例：忠孝大樓"
              className="mt-1 w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 text-sm font-normal"
            />
            <datalist id="patrol-buildings">
              {buildings.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
          </label>
          <label className="text-[11px] font-semibold text-slate-600">
            樓層
            <input
              value={form.floor}
              onChange={(e) => setForm({ ...form, floor: e.target.value })}
              placeholder="例：3F、B1"
              className="mt-1 w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 text-sm font-normal"
            />
          </label>
          <label className="text-[11px] font-semibold text-slate-600">
            教室名稱
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="例：機二忠、分組教室"
              className="mt-1 w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 text-sm font-normal"
            />
          </label>
          <label className="text-[11px] font-semibold text-slate-600">
            原班級（選填）
            <input
              list="patrol-classes"
              value={form.homeroomClass}
              onChange={(e) => setForm({ ...form, homeroomClass: e.target.value })}
              placeholder="與課表班級相同"
              className="mt-1 w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 text-sm font-normal"
            />
            <datalist id="patrol-classes">
              {classNames.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={submitRoom}
              className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-500"
            >
              {editingId ? <Edit2 className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
              {editingId ? '更新教室' : '新增教室'}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="px-3 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-600"
              >
                取消
              </button>
            )}
          </div>
        </div>

        {grouped.length === 0 ? (
          <p className="text-xs text-slate-400 p-3 border border-dashed border-slate-200 rounded-xl">
            尚未設定教室。可帶入配置圖草稿、匯入 Excel，或逐間新增。
          </p>
        ) : (
          <div className="space-y-4">
            {grouped.map((b) => (
              <div key={b.building} className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="bg-slate-900 text-white text-xs font-bold px-3 py-2">{b.building}</div>
                <div className="divide-y divide-slate-100">
                  {b.floors.map((f) => (
                    <div key={f.floor} className="flex gap-2 px-3 py-2">
                      <span className="w-16 shrink-0 text-xs font-extrabold text-slate-500 pt-1.5">{f.floor}</span>
                      <div className="flex flex-wrap gap-1.5">
                        {f.rooms.map((room, idx) => (
                          <div
                            key={room.id}
                            className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-xs ${
                              editingId === room.id
                                ? 'border-indigo-400 bg-indigo-50'
                                : 'border-slate-200 bg-white'
                            }`}
                          >
                            <span className="font-bold text-slate-800">{room.name}</span>
                            {room.homeroomClass && room.homeroomClass !== room.name && (
                              <span className="text-slate-500">（{room.homeroomClass}）</span>
                            )}
                            <button
                              type="button"
                              title="往前"
                              disabled={idx === 0}
                              onClick={() => moveRoom(room, -1)}
                              className="text-slate-400 hover:text-slate-800 disabled:opacity-30"
                            >
                              <ArrowUp className="w-3 h-3 -rotate-90" />
                            </button>
                            <button
                              type="button"
                              title="往後"
                              disabled={idx === f.rooms.length - 1}
                              onClick={() => moveRoom(room, 1)}
                              className="text-slate-400 hover:text-slate-800 disabled:opacity-30"
                            >
                              <ArrowDown className="w-3 h-3 -rotate-90" />
                            </button>
                            <button
                              type="button"
                              title="編輯"
                              onClick={() => {
                                setEditingId(room.id);
                                setForm({
                                  building: room.building,
                                  floor: room.floor,
                                  name: room.name,
                                  homeroomClass: room.homeroomClass || '',
                                });
                              }}
                              className="text-slate-400 hover:text-indigo-600"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              title="刪除"
                              onClick={() =>
                                ask('刪除教室？', `將刪除 ${room.building} ${room.floor}「${room.name}」。`, () => {
                                  saveRooms(rooms.filter((r) => r.id !== room.id));
                                  if (editingId === room.id) resetForm();
                                })
                              }
                              className="text-slate-400 hover:text-rose-600"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ItemListEditor
          title="課間／段考觀察項目"
          hint="課間與段考巡堂可複選，只記有無；未勾任何項目即為「正常」。"
          items={observationItems}
          placeholder="例：學生睡覺"
          onChange={(items) => save({ patrolObservationItems: items })}
          onAskRemove={(label, onConfirm) =>
            ask('移除觀察項目？', `將移除「${label}」，之後的巡堂不再出現此項；已登錄的紀錄不受影響。`, onConfirm)
          }
        />
        <ItemListEditor
          title="放學／室外課檢查項目"
          hint="巡查空教室時逐項勾選；任一項未合格即列為有缺失。"
          items={checkItems}
          placeholder="例：教室大屏已關"
          onChange={(items) => save({ patrolCheckItems: items })}
          onAskRemove={(label, onConfirm) =>
            ask('移除檢查項目？', `將移除「${label}」，之後的巡查不再出現此項。`, onConfirm)
          }
        />
        <ItemListEditor
          title="室外場地關鍵字"
          hint="課表場地名稱含這些字時，標示為室外課（如體育課在操場）。"
          items={outdoorKeywords.map((k) => ({ id: k, label: k }))}
          placeholder="例：操場"
          onChange={(items) => save({ outdoorVenueKeywords: items.map((i) => i.label) })}
          onAskRemove={(label, onConfirm) => ask('移除關鍵字？', `將移除「${label}」。`, onConfirm)}
        />
      </div>

      <PatrolMailSettingsPanel
        value={systemConfig.patrolMailConfig}
        onSave={(patrolMailConfig) => save({ patrolMailConfig })}
      />

      {confirm && (
        <ModalShell panelClassName="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md">
          <div className="p-5 space-y-3">
            <h4 className="font-bold text-slate-900">{confirm.title}</h4>
            <p className="text-sm text-slate-600 leading-relaxed">{confirm.message}</p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirm(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 text-sm font-semibold text-slate-700"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  confirm.onConfirm();
                  setConfirm(null);
                }}
                className="px-4 py-2 rounded-xl bg-rose-600 text-white text-sm font-bold hover:bg-rose-500"
              >
                確定
              </button>
            </div>
          </div>
        </ModalShell>
      )}
    </div>
  );
};
