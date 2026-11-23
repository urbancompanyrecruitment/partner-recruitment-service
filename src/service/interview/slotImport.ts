import { randomUUID } from 'node:crypto';
import { pool, withTransaction } from '../../common/db/index.js';
import { lockKey, withCriticalSection } from '../../common/lock/index.js';
import { logger } from '../../common/logger.js';
import { ActorType, AuditAction, AuditEntityType, recordAudit } from '../audit/index.js';
import {
  INTERVIEW_CENTRES,
  MAX_SLOT_CAPACITY,
  SAVED_SLOT_OUTCOMES,
  SLOT_CAPACITY_PATTERN,
  SLOT_INSTRUCTIONS,
  SLOT_UPLOAD_TIME_PATTERN,
} from './constant.js';
import {
  SlotRowOutcome,
  type SlotEntry,
  type SlotImportInput,
  type SlotImportResult,
  type SlotRowView,
  type ValidSlotEntry,
} from './interface.js';
import { findSlotDefinition, updateCentreDetails, upsertSlotDefinition } from './repository.js';

const toTimeOfDay = (raw: string): string | undefined => {
  const time = SLOT_UPLOAD_TIME_PATTERN.exec(raw);

  return time ? `${time[1].padStart(2, '0')}:${time[2]}:00` : undefined;
};

const saveSlot = ({ centre, startTime, endTime, capacity }: ValidSlotEntry): Promise<SlotRowOutcome> =>
  withCriticalSection([lockKey.slot(`${centre.key}|${startTime}`)], async connection => {
    const existing = await findSlotDefinition(connection, centre.key, startTime);

    await withTransaction(connection, async () => {
      await upsertSlotDefinition(connection, { id: randomUUID(), centre, instructions: SLOT_INSTRUCTIONS, startTime, endTime, capacity });

      await updateCentreDetails(connection, centre);
    });

    return existing ? SlotRowOutcome.Updated : SlotRowOutcome.Created;
  });

const processRow = async (entries: SlotEntry[], index: number): Promise<SlotRowView> => {
  const { centre, startTime, endTime, capacity, ...raw } = entries[index];
  const row = { rowNumber: index + 1, centre: raw.centreRaw, startTime: raw.startTimeRaw, endTime: raw.endTimeRaw, capacity: raw.capacityRaw };

  if (!centre) return { ...row, outcome: SlotRowOutcome.UnknownCentre };

  if (!startTime) return { ...row, outcome: SlotRowOutcome.InvalidTime };

  if (!endTime || endTime <= startTime) return { ...row, outcome: SlotRowOutcome.InvalidEndTime };

  if (capacity === undefined) return { ...row, outcome: SlotRowOutcome.InvalidCapacity };

  if (entries.findIndex(item => item.centre?.key === centre.key && item.startTime === startTime) !== index) {
    return { ...row, outcome: SlotRowOutcome.DuplicateInFile };
  }

  const outcome = await saveSlot({ centre, startTime, endTime, capacity });

  return { ...row, outcome };
};

export const importSlots = async (input: SlotImportInput, adminId: string, requestId: string): Promise<SlotImportResult> => {
  const entries: SlotEntry[] = input.rows.map(row => {
    const centreValue = row.centre.toLowerCase();
    const capacity = SLOT_CAPACITY_PATTERN.test(row.capacity) ? Number(row.capacity) : 0;

    return {
      centreRaw: row.centre,
      startTimeRaw: row.startTime,
      endTimeRaw: row.endTime,
      capacityRaw: row.capacity,
      centre: INTERVIEW_CENTRES.find(centre => centre.key === centreValue || centre.name.toLowerCase() === centreValue),
      startTime: toTimeOfDay(row.startTime),
      endTime: toTimeOfDay(row.endTime),
      capacity: capacity >= 1 && capacity <= MAX_SLOT_CAPACITY ? capacity : undefined,
    };
  });
  const rows = await entries.reduce<Promise<SlotRowView[]>>(
    (chain, _entry, index) => chain.then(async done => [...done, await processRow(entries, index)]),
    Promise.resolve([]),
  );
  const created = rows.filter(row => row.outcome === SlotRowOutcome.Created).length;
  const updated = rows.filter(row => row.outcome === SlotRowOutcome.Updated).length;
  const counts = { rows: rows.length, created, updated, errors: rows.filter(row => !SAVED_SLOT_OUTCOMES.includes(row.outcome)).length };

  await recordAudit(pool, {
    action: AuditAction.SlotsImported,
    actorType: ActorType.Admin,
    actorId: adminId,
    entityType: AuditEntityType.Import,
    entityId: randomUUID(),
    data: { fileName: input.fileName, ...counts },
    requestId,
  });

  logger.info({
    method: 'importSlots',
    key_1: 'created',
    key_1_value: String(created),
    key_2: 'updated',
    key_2_value: String(updated),
    key_3: 'errors',
    key_3_value: String(counts.errors),
  });

  return { fileName: input.fileName, counts, rows };
};
