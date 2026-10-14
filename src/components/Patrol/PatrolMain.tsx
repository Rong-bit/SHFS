import React, { useEffect, useMemo, useState } from 'react';
import { CloudOff, RefreshCw } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { PatrolKind, PatrolNotifyRoles, PatrolRecord, PatrolRoom } from '../../types';
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
  EMPTY_PATROL_NOTIFY_ROLES,
  mergeNotifyRolesFromGroups,
  patrolReviewCaseId,
  resolveNotifyGroupsForRecord,
  resolvePatrolNotifyGroups,
  resolveReviewWhenIssueCleared,
  summarizeNotifyGroupRoles,
} from '../../utils/patrolReview';
import { loadLocalPatrolReviews, usePatrolReviews } from '../../utils/patrolReviewSync';
import { isPatrolMailConfigured, sendPatrolReviewNotify } from '../../utils/patrolMail';
import { ModalShell } from '../Common/ModalShell';
import {
  occupancySummary,
  patrolRecordHasIssue,
  PatrolRoomSheet,
  resolveHomeroomTutorNames,
} from './PatrolRoomSheet';

function notifyRolesFromExistingRecipients(
  recipients: { role: string }[]
): PatrolNotifyRoles {
  const roles: PatrolNotifyRoles = { ...EMPTY_PATROL_NOTIFY_ROLES };
  for (const r of recipients) {
    if (r.role in roles) roles[r.role as keyof PatrolNotifyRoles] = true;
  }
  return roles;
}

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
  /** 異常會辦：勾選要通知的群組 */
  const [groupPick, setGroupPick] = useState<{
    record: PatrolRecord;
    selectedIds: string[];
  } | null>(null);
  /** 寄信進行中的 recordId → 世代號；清案／重送時遞增以丟棄過期結果 */
  const notifyGenRef = React.useRef<Map<string, number>>(new Map());

  const notifyGroups = useMemo(
    () => resolvePatrolNotifyGroups(systemConfig.patrolMailConfig),
    [systemConfig.patrolMailConfig]
  );

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

  const tutorNamesForRoom = (room: PatrolRoom) => {
    const o = occupancy.get(room.id);
    const className = o?.here?.className ?? o?.away?.className ?? room.homeroomClass;
    return resolveHomeroomTutorNames(className, teachers);
  };

  const syncReviewForRecord = async (
    record: PatrolRecord,
    selectedGroupIds?: string[]
  ) => {
    // 以本機最新為準，避免 React state 尚未跟上導致重複寄信
    const existing =
      loadLocalPatrolReviews().find((c) => c.recordId === record.id) ||
      cases.find((c) => c.recordId === record.id) ||
      null;
    if (!patrolRecordHasIssue(record)) {
      // 遞增世代，讓進行中的寄信結果失效
      notifyGenRef.current.set(record.id, (notifyGenRef.current.get(record.id) || 0) + 1);
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
    const mailCfg = systemConfig.patrolMailConfig;
    const groups = resolvePatrolNotifyGroups(mailCfg);
    const notifyRoles =
      selectedGroupIds && selectedGroupIds.length > 0
        ? mergeNotifyRolesFromGroups(groups, selectedGroupIds)
        : existing?.notifiedAt
          ? notifyRolesFromExistingRecipients(existing.recipients)
          : mergeNotifyRolesFromGroups(
              groups,
              groups.map((g) => g.id)
            );
    const reviewCase = buildPatrolReviewCase({
      record,
      teachers,
      academicStaffList,
      existing,
      notifyRoles,
    });
    // 僅對尚未成功寄出的信箱重試，避免部分成功後重寄全體
    const needMail =
      isPatrolMailConfigured(mailCfg) &&
      (!reviewCase.notifiedAt ||
        reviewCase.recipients.some((r) => r.email && r.sentOk !== true));
    if (needMail && isPatrolMailConfigured(mailCfg)) {
      const gen = (notifyGenRef.current.get(record.id) || 0) + 1;
      notifyGenRef.current.set(record.id, gen);
      const retryOnly = reviewCase.notifiedAt
        ? [
            ...new Set(
              reviewCase.recipients.filter((r) => r.email && r.sentOk !== true).map((r) => r.email)
            ),
          ]
        : undefined;
      saveCase(reviewCase);
      setNotifyMsg('已儲存巡堂紀錄，正在寄送會辦通知…');
      try {
        const result = await sendPatrolReviewNotify({
          mailConfig: mailCfg!,
          reviewCase,
          schoolName: systemConfig.schoolName || '學校',
          onlyEmails: retryOnly,
        });
        if (notifyGenRef.current.get(record.id) !== gen) return;
        const latest = loadLocalPatrolReviews().find((c) => c.recordId === record.id);
        // 寄信期間若已刪除會辦案，勿再寫回
        if (!latest) {
          setNotifyMsg('會辦案已取消或不存在，未寄出通知');
          return;
        }
        const attempted = new Set(
          (retryOnly && retryOnly.length > 0
            ? retryOnly
            : reviewCase.recipients.map((r) => r.email).filter(Boolean)
          ).map((e) => e.toLowerCase())
        );
        const failedSet = new Set(result.failed.map((f) => f.email.toLowerCase()));
        // 以本次會辦算出的收件人為準（避免寄信期間本機被舊雲端覆蓋後漏掉新增收件人）
        const prevByKey = new Map(
          latest.recipients.map((r) => [
            `${r.role}:${r.personId || r.personName || ''}:${(r.email || '').trim().toLowerCase()}`,
            r,
          ])
        );
        const withNotify = {
          ...latest,
          issueSummary: reviewCase.issueSummary,
          note: reviewCase.note,
          recipients: reviewCase.recipients.map((r) => {
            const email = (r.email || '').trim();
            const prev =
              prevByKey.get(
                `${r.role}:${r.personId || r.personName || ''}:${email.toLowerCase()}`
              ) || latest.recipients.find(
                (p) =>
                  p.role === r.role &&
                  (p.personId || p.personName) === (r.personId || r.personName)
              );
            const base = prev ? { ...r, sentOk: prev.sentOk, sentError: prev.sentError } : r;
            if (!email) return { ...base, sentOk: false, sentError: '無信箱' };
            const key = email.toLowerCase();
            if (failedSet.has(key)) {
              const err = result.failed.find((f) => f.email.toLowerCase() === key)?.error;
              return { ...base, sentOk: false, sentError: err };
            }
            if (base.sentOk === true) return { ...base, sentOk: true, sentError: undefined };
            if (attempted.has(key) && !failedSet.has(key) && result.sent > 0) {
              return { ...base, sentOk: true, sentError: undefined };
            }
            return base;
          }),
          notifiedAt:
            result.sent > 0 ? new Date().toISOString() : latest.notifiedAt || reviewCase.notifiedAt,
          updatedAt: new Date().toISOString(),
        };
        saveCase(withNotify);
        const noMailNames = reviewCase.recipients
          .filter((r) => !(r.email || '').trim())
          .map((r) => r.personName)
          .filter(Boolean);
        const noMailHint =
          noMailNames.length > 0
            ? `；未寄：${noMailNames.slice(0, 3).join('、')}${
                noMailNames.length > 3 ? '等' : ''
              }（成員名冊／師資名冊無信箱）`
            : result.skippedNoEmail > 0
              ? `；${result.skippedNoEmail} 人無信箱未寄`
              : '';
        const wantedDean = Boolean(notifyRoles.dean_academic);
        const hasDean = reviewCase.recipients.some((r) => r.role === 'dean_academic');
        const deanHint =
          wantedDean && !hasDean
            ? '；成員名冊找不到教務主任（請確認職稱為「教務主任」且處室為教務處）'
            : '';
        if (result.ok) {
          setNotifyMsg(`已寄出異常會辦通知（${result.sent} 封）${noMailHint}${deanHint}`);
        } else if (result.sent > 0) {
          setNotifyMsg(
            `已寄出 ${result.sent} 封，部分失敗可於下次更新時重試${noMailHint}${deanHint}`
          );
        } else {
          setNotifyMsg('會辦案已建立，但寄信失敗');
        }
      } catch {
        if (notifyGenRef.current.get(record.id) === gen) {
          setNotifyMsg('會辦案已建立，但寄信發生錯誤');
        }
      }
    } else {
      saveCase(reviewCase);
      if (!isPatrolMailConfigured(mailCfg)) {
        setNotifyMsg('會辦案已建立（尚未設定 SMTP，信未寄出）');
      } else if (reviewCase.notifiedAt) {
        setNotifyMsg('會辦案已更新（先前已寄過通知）');
      } else {
        setNotifyMsg('會辦案已建立（本次未寄出新通知）');
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
    if (patrolRecordHasIssue(record)) {
      // 首次與後續增修異常：皆依「異常項目 → 通知群組」對應。
      // 已寄過信時若仍走舊收件人，新增異常會漏通知；故一律重算對應群組。
      if (notifyGroups.length > 0) {
        const { groupIds: mappedIds, fullyMapped } = resolveNotifyGroupsForRecord({
          record,
          mailConfig: systemConfig.patrolMailConfig,
        });
        if (fullyMapped && mappedIds.length > 0) {
          setOpenRoomId(null);
          setNotifyMsg('已儲存巡堂紀錄，正在處理會辦通知…');
          void syncReviewForRecord(record, mappedIds);
          return;
        }
        setNotifyMsg('已儲存巡堂紀錄，請選擇會辦通知群組');
        setGroupPick({
          record,
          selectedIds:
            mappedIds.length > 0 ? mappedIds : notifyGroups.map((g) => g.id),
        });
        setOpenRoomId(null);
        return;
      }
    } else {
      setNotifyMsg('已儲存巡堂紀錄（正常／無缺失）');
    }
    void syncReviewForRecord(record);
    setOpenRoomId(null);
  };

  const confirmGroupPick = () => {
    if (!groupPick) return;
    if (groupPick.selectedIds.length === 0) {
      alert('請至少勾選一個通知群組。');
      return;
    }
    const { record, selectedIds } = groupPick;
    setGroupPick(null);
    setNotifyMsg('正在建立會辦並寄送通知…');
    void syncReviewForRecord(record, selectedIds);
  };

  const cancelGroupPick = () => {
    setGroupPick(null);
    setNotifyMsg('已儲存巡堂紀錄；未建立會辦（未確認通知群組）');
  };

  const handleDelete = (record: PatrolRecord) => {
    // 遞增世代，避免進行中的寄信回寫把已刪會辦案救回
    notifyGenRef.current.set(record.id, (notifyGenRef.current.get(record.id) || 0) + 1);
    deleteRecord(record);
    const existing =
      loadLocalPatrolReviews().find((c) => c.recordId === record.id) ||
      cases.find((c) => c.recordId === record.id);
    if (existing) deleteCase(existing);
    else {
      const ghostId = patrolReviewCaseId(record.id);
      const ghost =
        loadLocalPatrolReviews().find((c) => c.id === ghostId) ||
        cases.find((c) => c.id === ghostId);
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
        <div
          role="status"
          className="fixed bottom-4 left-1/2 z-[80] w-[min(36rem,calc(100%-1.5rem))] -translate-x-1/2 rounded-2xl border border-indigo-300 bg-indigo-50 px-4 py-3 text-sm text-indigo-950 shadow-lg flex items-start justify-between gap-3"
        >
          <span className="font-semibold leading-snug whitespace-pre-wrap">{notifyMsg}</span>
          <button
            type="button"
            className="shrink-0 text-xs font-bold underline text-indigo-800"
            onClick={() => setNotifyMsg('')}
          >
            關閉
          </button>
        </div>
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
                        {(mode === 'class' || mode === 'exam') && (() => {
                          const tutors = tutorNamesForRoom(room);
                          if (tutors.length === 0) return null;
                          return (
                            <div className="text-[11px] font-bold text-slate-800 mt-0.5 leading-snug">
                              導師：{tutors.join('、')}
                            </div>
                          );
                        })()}
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
          tutorNames={tutorNamesForRoom(openRoom)}
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

      {groupPick && (
        <ModalShell panelClassName="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md">
          <div className="p-5 space-y-4">
            <div>
              <h3 className="text-base font-extrabold text-slate-900">選擇會辦通知群組</h3>
              <p className="text-xs text-slate-500 mt-1">
                巡堂紀錄已儲存。部分或全部異常項目尚未對應通知群組，請勾選要通知的群組；亦可至「系統維護 → 巡堂會辦寄信」為各項目指定群組（例如睡覺 → 學務線）。
              </p>
            </div>
            <div className="space-y-2">
              {notifyGroups.map((g) => {
                const checked = groupPick.selectedIds.includes(g.id);
                return (
                  <label
                    key={g.id}
                    className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 cursor-pointer transition ${
                      checked
                        ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500/20'
                        : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={checked}
                      onChange={(e) => {
                        setGroupPick((prev) => {
                          if (!prev) return prev;
                          const nextIds = e.target.checked
                            ? [...prev.selectedIds, g.id]
                            : prev.selectedIds.filter((id) => id !== g.id);
                          return { ...prev, selectedIds: nextIds };
                        });
                      }}
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-bold text-slate-900">{g.name}</span>
                      <span className="block text-[11px] text-slate-500 mt-0.5">
                        {summarizeNotifyGroupRoles(g.roles)}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={cancelGroupPick}
                className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50"
              >
                略過會辦
              </button>
              <button
                type="button"
                onClick={confirmGroupPick}
                className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-500"
              >
                確認建立會辦
              </button>
            </div>
          </div>
        </ModalShell>
      )}
    </div>
  );
};
