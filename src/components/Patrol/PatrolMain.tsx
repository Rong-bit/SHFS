import React, { useEffect, useMemo, useState } from 'react';
import { CloudOff, RefreshCw } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { PatrolKind, PatrolRecord, PatrolRoom } from '../../types';
import { dateToIsoLocal } from '../../utils/holidays';
import { buildPeriodDefinitions } from '../../utils/periodConfig';
import {
  groupPatrolRooms,
  resolvePatrolCheckItems,
  resolvePatrolObservationItems,
} from '../../utils/patrolConfig';
import {
  computeRoomOccupancy,
  currentPeriod,
  PatrolRoomOccupancy,
} from '../../utils/patrolSchedule';
import { patrolRecordId, usePatrolRecords } from '../../utils/patrolSync';
import {
  buildPatrolReviewCase,
  patrolReviewCaseId,
  resolveReviewWhenIssueCleared,
} from '../../utils/patrolReview';
import { loadLocalPatrolReviews, usePatrolReviews } from '../../utils/patrolReviewSync';
import { isPatrolMailConfigured, sendPatrolReviewNotify } from '../../utils/patrolMail';
import { occupancySummary, patrolRecordHasIssue, PatrolRoomSheet } from './PatrolRoomSheet';

const MODES: { id: PatrolKind; label: string; hint: string }[] = [
  { id: 'class', label: '課間巡堂', hint: '依課表顯示各教室該節班級與老師，點教室登錄上課情況。' },
  { id: 'outdoor', label: '室外課巡查', hint: '只亮出該節原班外出（體育、實習等）或無課的空教室，檢查關電、門窗、大屏。' },
  { id: 'after_school', label: '放學巡查', hint: '逐間檢查關燈、冷氣、門窗、大屏。' },
  {
    id: 'exam',
    label: '段考巡堂',
    hint: '依教室配置逐間巡查（不依課表佔用）；有異常會通知導師與行政，不通知任課老師。',
  },
];

export const PatrolMain: React.FC = () => {
  const { systemConfig, sessions, requests, currentTeacher, teachers, academicStaffList } = useApp();
  const { records, pendingCount, loading, error, cloudReady, saveRecord, deleteRecord, refresh } =
    usePatrolRecords();
  const { cases, saveCase, deleteCase, refresh: refreshReviews } = usePatrolReviews();
  const periodDefs = useMemo(() => buildPeriodDefinitions(systemConfig), [systemConfig]);
  const [mode, setMode] = useState<PatrolKind>('class');
  const [date, setDate] = useState(() => dateToIsoLocal(new Date()));
  const [period, setPeriod] = useState<number>(() => currentPeriod(new Date(), periodDefs) ?? 1);
  const [buildingIdx, setBuildingIdx] = useState(0);
  const [openRoomId, setOpenRoomId] = useState<string | null>(null);
  const [notifyMsg, setNotifyMsg] = useState('');
  const notifyingIdsRef = React.useRef<Set<string>>(new Set());

  const rooms = systemConfig.patrolRooms || [];
  const grouped = useMemo(() => groupPatrolRooms(rooms), [rooms]);
  const building = grouped[Math.min(buildingIdx, Math.max(0, grouped.length - 1))];
  const checkItems = resolvePatrolCheckItems(systemConfig);
  const observationItems = resolvePatrolObservationItems(systemConfig);
  const usesPeriod = mode !== 'after_school';
  const usesOccupancy = mode === 'class' || mode === 'outdoor';

  useEffect(() => {
    void refresh(date, date);
    void refreshReviews(date, date);
  }, [date, refresh, refreshReviews]);

  useEffect(() => {
    if (periodDefs.length > 0 && !periodDefs.some((p) => p.period === period)) setPeriod(1);
  }, [periodDefs, period]);

  const occupancy = useMemo(() => {
    if (!usesOccupancy) return new Map<string, PatrolRoomOccupancy>();
    const list = computeRoomOccupancy({ rooms, sessions, requests, config: systemConfig, isoDate: date, period });
    return new Map(list.map((o) => [o.room.id, o]));
  }, [usesOccupancy, rooms, sessions, requests, systemConfig, date, period]);

  const slotRecords = useMemo(
    () =>
      records.filter(
        (r) => r.date === date && r.kind === mode && (!usesPeriod || r.period === period)
      ),
    [records, date, mode, usesPeriod, period]
  );
  const recordsByRoom = useMemo(() => {
    const map = new Map<string, PatrolRecord[]>();
    for (const r of slotRecords) map.set(r.roomId, [...(map.get(r.roomId) || []), r]);
    return map;
  }, [slotRecords]);

  /** 該模式下需要巡的教室 */
  const isTarget = (room: PatrolRoom) => {
    if (mode === 'after_school' || mode === 'exam') return true;
    const o = occupancy.get(room.id);
    if (!o || o.status === 'closed') return false;
    if (mode === 'class') return o.status === 'in_class';
    return Boolean(room.homeroomClass) && (o.status === 'away' || o.status === 'free');
  };
  const targets = rooms.filter(isTarget);
  const doneCount = targets.filter((r) => (recordsByRoom.get(r.id) || []).length > 0).length;

  const openRoom = rooms.find((r) => r.id === openRoomId);
  const myRecordFor = (roomId: string) =>
    (recordsByRoom.get(roomId) || []).find((r) => r.patrollerId === currentTeacher?.id);

  const syncReviewForRecord = async (record: PatrolRecord) => {
    // 以本機最新為準，避免 React state 尚未跟上導致重複寄信
    const existing =
      loadLocalPatrolReviews().find((c) => c.recordId === record.id) ||
      cases.find((c) => c.recordId === record.id) ||
      null;
    if (!patrolRecordHasIssue(record)) {
      if (existing && existing.status !== 'closed') {
        saveCase(resolveReviewWhenIssueCleared(existing));
        setNotifyMsg(
          existing.notifiedAt || existing.signOffs.length
            ? '異常已更正；會辦案保留供核章者閱覽'
            : '已改為正常，會辦案已結案'
        );
      }
      return;
    }
    if (notifyingIdsRef.current.has(record.id)) return;
    const reviewCase = buildPatrolReviewCase({
      record,
      teachers,
      academicStaffList,
      existing,
    });
    const mailCfg = systemConfig.patrolMailConfig;
    if (isPatrolMailConfigured(mailCfg) && !reviewCase.notifiedAt) {
      notifyingIdsRef.current.add(record.id);
      try {
        const result = await sendPatrolReviewNotify({
          mailConfig: mailCfg!,
          reviewCase,
          schoolName: systemConfig.schoolName || '學校',
        });
        const withNotify = {
          ...reviewCase,
          notifiedAt: result.ok ? new Date().toISOString() : reviewCase.notifiedAt,
          recipients: reviewCase.recipients.map((r) => {
            if (!r.email) return { ...r, sentOk: false, sentError: '無信箱' };
            const fail = result.failed.find((f) => f.email === r.email);
            if (fail) return { ...r, sentOk: false, sentError: fail.error };
            return { ...r, sentOk: result.ok, sentError: result.ok ? undefined : result.error };
          }),
          updatedAt: new Date().toISOString(),
        };
        saveCase(withNotify);
        if (result.ok) {
          setNotifyMsg(`已寄出異常會辦通知（${result.sent} 封）`);
        } else {
          setNotifyMsg(`會辦案已建立，但寄信失敗：${result.error || '未知錯誤'}`);
        }
      } finally {
        notifyingIdsRef.current.delete(record.id);
      }
    } else {
      saveCase(reviewCase);
      if (!isPatrolMailConfigured(mailCfg)) {
        setNotifyMsg('會辦案已建立（尚未設定 SMTP，信未寄出）');
      } else if (reviewCase.notifiedAt) {
        setNotifyMsg('會辦案已更新（先前已寄過通知）');
      }
    }
  };

  const handleSave = (room: PatrolRoom, draft: Pick<PatrolRecord, 'observations' | 'checks' | 'note'>) => {
    if (!currentTeacher) return;
    const o = occupancy.get(room.id);
    const info = o?.here ?? o?.away ?? null;
    const itemLabels: Record<string, string> = {};
    for (const id of draft.observations) {
      itemLabels[id] = observationItems.find((i) => i.id === id)?.label || id;
    }
    for (const id of Object.keys(draft.checks)) {
      itemLabels[id] = checkItems.find((i) => i.id === id)?.label || id;
    }
    const recPeriod = usesPeriod ? period : undefined;
    const existing = myRecordFor(room.id);
    const record: PatrolRecord = {
      id: patrolRecordId({ date, kind: mode, period: recPeriod, roomId: room.id, patrollerId: currentTeacher.id }),
      date,
      kind: mode,
      period: recPeriod,
      roomId: room.id,
      roomName: room.name,
      building: room.building,
      floor: room.floor,
      className: info?.className ?? room.homeroomClass,
      subjectName: mode === 'after_school' || mode === 'exam' ? undefined : info?.subjectName,
      teacherName: mode === 'class' ? info?.teacherNames.join('、') : undefined,
      observations: draft.observations,
      checks: draft.checks,
      itemLabels,
      note: draft.note,
      patrollerId: currentTeacher.id,
      patrollerName: currentTeacher.name,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };
    saveRecord(record);
    void syncReviewForRecord(record);
    setOpenRoomId(null);
  };

  const handleDelete = (record: PatrolRecord) => {
    deleteRecord(record);
    const existing = cases.find((c) => c.recordId === record.id);
    if (existing) deleteCase(existing);
    else {
      const ghost = cases.find((c) => c.id === patrolReviewCaseId(record.id));
      if (ghost) deleteCase(ghost);
    }
    setOpenRoomId(null);
  };

  if (!currentTeacher) {
    return <p className="text-sm text-slate-500">請先在上方選擇教師身分。</p>;
  }

  if (rooms.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-6 text-sm text-slate-600">
        尚未設定巡堂教室。請管理員到「系統管理員 → 場地維護 → 巡堂教室配置」建立大樓、樓層與教室。
      </div>
    );
  }

  const tileClass = (room: PatrolRoom) => {
    const recs = recordsByRoom.get(room.id) || [];
    const target = isTarget(room);
    if (recs.some((r) => patrolRecordHasIssue(r))) return 'bg-rose-50 border-rose-400 text-rose-950';
    if (recs.length > 0) return 'bg-emerald-50 border-emerald-400 text-emerald-950';
    if (!target) return 'bg-slate-50 border-slate-200 text-slate-400';
    return 'bg-white border-slate-300 text-slate-900 shadow-xs';
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMode(m.id)}
            className={`px-4 py-2 rounded-xl text-sm font-bold transition ${
              mode === m.id ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 border border-slate-200'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-slate-500">{MODES.find((m) => m.id === mode)?.hint}</p>

      <div className="flex flex-wrap items-end gap-3 bg-white border border-slate-200 rounded-2xl p-3">
        <label className="text-[11px] font-semibold text-slate-600">
          日期
          <input
            type="date"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="mt-1 block bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 text-sm"
          />
        </label>
        {usesPeriod && (
          <label className="text-[11px] font-semibold text-slate-600">
            節次
            <select
              value={period}
              onChange={(e) => setPeriod(Number(e.target.value))}
              className="mt-1 block bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 text-sm"
            >
              {periodDefs.map((p) => (
                <option key={p.period} value={p.period}>
                  {p.label}（{p.timeRange}）
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          type="button"
          onClick={() => {
            const now = new Date();
            setDate(dateToIsoLocal(now));
            setPeriod(currentPeriod(now, periodDefs) ?? period);
          }}
          className="px-3 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          回到現在
        </button>
        <div className="ml-auto text-right text-xs text-slate-600 space-y-0.5">
          <div>
            已巡 <strong className="text-slate-900">{doneCount}</strong> / 應巡{' '}
            <strong className="text-slate-900">{targets.length}</strong> 間
          </div>
          {pendingCount > 0 && <div className="text-amber-700">待上傳 {pendingCount} 筆</div>}
        </div>
        {cloudReady && (
          <button
            type="button"
            title="重新載入其他人的紀錄"
            onClick={() => void refresh(date, date)}
            className="p-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        )}
      </div>

      {!cloudReady && (
        <p className="flex items-center gap-2 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
          <CloudOff className="w-4 h-4 shrink-0" />
          這台裝置尚未加入學校同步，紀錄只存在本機，教學組看不到。請先在「我的個人每週課表」上方加入同步。
        </p>
      )}
      {error && (
        <p className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{error}</p>
      )}
      {notifyMsg && (
        <p className="text-xs text-indigo-900 bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-2 flex justify-between gap-2">
          <span>{notifyMsg}</span>
          <button type="button" className="font-bold underline" onClick={() => setNotifyMsg('')}>
            關閉
          </button>
        </p>
      )}

      {grouped.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {grouped.map((b, i) => (
            <button
              key={b.building}
              type="button"
              onClick={() => setBuildingIdx(i)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold border ${
                building?.building === b.building
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-600 border-slate-200'
              }`}
            >
              {b.building}
            </button>
          ))}
        </div>
      )}

      {building && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="bg-slate-900 text-white text-sm font-bold px-4 py-2">{building.building}</div>
          <div className="divide-y divide-slate-100">
            {building.floors.map((f) => (
              <div key={f.floor} className="flex gap-2 p-2 sm:p-3">
                <div className="w-12 shrink-0 text-sm font-extrabold text-slate-500 pt-2">{f.floor}</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 flex-1">
                  {f.rooms.map((room) => {
                    const o = occupancy.get(room.id);
                    const recs = recordsByRoom.get(room.id) || [];
                    const target = isTarget(room);
                    return (
                      <button
                        key={room.id}
                        type="button"
                        onClick={() => setOpenRoomId(room.id)}
                        className={`text-left rounded-xl border-2 px-2.5 py-2 min-h-[64px] transition active:scale-[0.98] ${tileClass(room)}`}
                      >
                        <div className="text-sm font-extrabold leading-tight">{room.name}</div>
                        {usesOccupancy && (
                          <div className="text-[11px] leading-snug mt-0.5 line-clamp-2">
                            {occupancySummary(o)}
                            {o?.away?.isOutdoor ? '（室外）' : ''}
                          </div>
                        )}
                        {mode === 'exam' && room.homeroomClass && (
                          <div className="text-[11px] leading-snug mt-0.5">{room.homeroomClass}</div>
                        )}
                        {recs.length > 0 && (
                          <div className="text-[10px] font-bold mt-0.5">
                            {recs.some((r) => patrolRecordHasIssue(r)) ? '有缺失' : '已巡・正常'}
                            {recs.length > 1 ? `（${recs.length} 筆）` : ''}
                          </div>
                        )}
                        {!target && recs.length === 0 && usesOccupancy && (
                          <div className="text-[10px] mt-0.5">非巡查目標</div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {openRoom && (
        <PatrolRoomSheet
          key={`${openRoom.id}-${mode}-${date}-${period}`}
          kind={mode}
          period={usesPeriod ? period : undefined}
          occupancy={occupancy.get(openRoom.id)}
          roomLabel={`${openRoom.building} ${openRoom.floor}・${openRoom.name}`}
          checkItems={checkItems}
          observationItems={observationItems}
          myRecord={myRecordFor(openRoom.id)}
          othersRecords={(recordsByRoom.get(openRoom.id) || []).filter(
            (r) => r.patrollerId !== currentTeacher.id
          )}
          onSave={(draft) => handleSave(openRoom, draft)}
          onDelete={handleDelete}
          onClose={() => setOpenRoomId(null)}
        />
      )}
    </div>
  );
};
