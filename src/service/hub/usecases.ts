import { piiChecksum } from '../../common/crypto/pii.js';
import { pool } from '../../common/db/index.js';
import { lockKey, withCriticalSection } from '../../common/lock/index.js';
import { logger } from '../../common/logger.js';
import { isValidPhone, normalisePhone } from '../../common/phone/index.js';
import { ActorType, AuditAction, AuditEntityType, recordAudit } from '../audit/index.js';
import { findPartnerIdByChecksum, PartnerState, requirePartnerRow, updateHub } from '../partner/index.js';
import { HubRowOutcome, type HubEntry, type HubImportInput, type HubImportResult, type HubRowView } from './interface.js';

const assignHub = (partnerId: string, hubName: string, adminId: string, requestId: string): Promise<HubRowOutcome> =>
  withCriticalSection([lockKey.partner(partnerId)], async connection => {
    const partner = await requirePartnerRow(connection, partnerId);

    if (partner.state === PartnerState.VerificationFailed) return HubRowOutcome.NotEligible;

    await updateHub(connection, partnerId, hubName);

    await recordAudit(connection, {
      action: AuditAction.HubUpdated,
      actorType: ActorType.Admin,
      actorId: adminId,
      entityType: AuditEntityType.Partner,
      entityId: partnerId,
      data: { from: partner.hub_name, to: hubName },
      requestId,
    });

    return HubRowOutcome.Updated;
  });

const processRow = async (entries: HubEntry[], index: number, adminId: string, requestId: string): Promise<HubRowView> => {
  const entry = entries[index];
  const row = { rowNumber: index + 1, primaryPhone: entry.raw, hubName: entry.hubName };

  if (!entry.raw || !isValidPhone(entry.phone)) return { ...row, outcome: HubRowOutcome.InvalidPhone };

  if (!entry.hubName) return { ...row, outcome: HubRowOutcome.MissingHub };

  if (entries.findIndex(item => item.phone === entry.phone) !== index) return { ...row, outcome: HubRowOutcome.DuplicateInFile };

  const partnerId = await findPartnerIdByChecksum(pool, piiChecksum(entry.phone));

  if (!partnerId) return { ...row, outcome: HubRowOutcome.NotFound };

  const outcome = await assignHub(partnerId, entry.hubName, adminId, requestId);

  return { ...row, outcome, partnerId };
};

export const importHubs = async (input: HubImportInput, adminId: string, requestId: string): Promise<HubImportResult> => {
  const entries: HubEntry[] = input.rows.map(row => ({
    raw: row.primaryPhone.trim(),
    phone: normalisePhone(row.primaryPhone),
    hubName: row.hubName.trim(),
  }));
  const rows = await entries.reduce<Promise<HubRowView[]>>(
    (chain, _entry, index) => chain.then(async done => [...done, await processRow(entries, index, adminId, requestId)]),
    Promise.resolve([]),
  );
  const updated = rows.filter(row => row.outcome === HubRowOutcome.Updated).length;

  logger.info({
    method: 'importHubs',
    key_1: 'rows',
    key_1_value: String(rows.length),
    key_2: 'updated',
    key_2_value: String(updated),
    key_3: 'admin_id',
    key_3_value: adminId,
  });

  return { fileName: input.fileName, counts: { rows: rows.length, updated, errors: rows.length - updated }, rows };
};
