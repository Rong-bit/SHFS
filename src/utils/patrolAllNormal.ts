import { PatrolRecord, PatrolRoom } from '../types';
import { patrolRecordHasIssue } from '../components/Patrol/PatrolRoomSheet';

/** 沒有缺失、也沒有備註的正常紀錄，才可由「取消一切正常」整批移除 */
export function isBlankNormalRecord(record: Pick<PatrolRecord, 'kind' | 'observations' | 'checks' | 'note'>): boolean {
  if ((record.note || '').trim()) return false;
  return !patrolRecordHasIssue(record);
}

export type AllNormalRoomPlan = {
  /** 尚無任何紀錄，可一次標成正常 */
  toMark: PatrolRoom[];
  /** 已有缺失，不覆寫 */
  skippedIssue: PatrolRoom[];
  /** 已有正常紀錄 */
  alreadyNormal: PatrolRoom[];
};

/**
 * 決定「一切正常」要補哪些應巡教室。
 * 已有任何人登錄缺失或正常的教室都不改，只補完全還沒登錄的。
 */
export function planAllNormalRooms(
  targets: PatrolRoom[],
  recordsByRoom: Map<string, PatrolRecord[]>
): AllNormalRoomPlan {
  const toMark: PatrolRoom[] = [];
  const skippedIssue: PatrolRoom[] = [];
  const alreadyNormal: PatrolRoom[] = [];
  for (const room of targets) {
    const recs = recordsByRoom.get(room.id) || [];
    if (recs.some((r) => patrolRecordHasIssue(r))) skippedIssue.push(room);
    else if (recs.length > 0) alreadyNormal.push(room);
    else toMark.push(room);
  }
  return { toMark, skippedIssue, alreadyNormal };
}

/** 每一間應巡教室都已有紀錄，且沒有任何缺失 */
export function allTargetsAreNormal(
  targets: PatrolRoom[],
  recordsByRoom: Map<string, PatrolRecord[]>
): boolean {
  if (targets.length === 0) return false;
  const plan = planAllNormalRooms(targets, recordsByRoom);
  return plan.toMark.length === 0 && plan.skippedIssue.length === 0;
}
