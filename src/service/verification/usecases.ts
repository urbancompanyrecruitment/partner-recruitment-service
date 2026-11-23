import { randomUUID } from 'node:crypto';
import { toCsv } from '../../common/csv.js';
import { piiChecksum } from '../../common/crypto/pii.js';
import { pool, withTransaction } from '../../common/db/index.js';
import { AppError, ErrorCode } from '../../common/errors/index.js';
import { lockKey, withCriticalSection } from '../../common/lock/index.js';
import { logger } from '../../common/logger.js';
import { isValidPhone, normalisePhone } from '../../common/phone/index.js';
import { toIsoDateTime } from '../../common/time.js';
import { ActorType, AuditAction, AuditEntityType, recordAudit } from '../audit/index.js';
import { lockForRegistrar } from '../lock/index.js';
import { notifyPartner, PartnerNotificationType } from '../notification/index.js';
import {
  approveLead,
  findPartnerIdByChecksum,
  PartnerState,
  requirePartnerRow,
  TRANSITION_REASON,
  transitionPartner,
  updateVerificationDecision,
} from '../partner/index.js';
import { FAIL_CSV_HEADERS, FALSE_VALUES, IMPORT_OUTCOME_REASON, PROCESSED_OUTCOMES, TRUE_VALUES } from './constant.js';
import { ImportRowOutcome, type ImportEntry, type ImportInput, type ImportRowView, type VerifiedImportResult } from './interface.js';
import { findImport, insertImport, insertImportRows, listImportRows } from './repository.js';

const decidePartner = (
  partnerId: string,
  verified: boolean,
  adminId: string,
  importId: string,
  requestId: string,
): Promise<ImportRowOutcome> =>
  withCriticalSection([lockKey.partner(partnerId)], async connection => {
    const partner = await requirePartnerRow(connection, partnerId);
    const actor = { actorType: ActorType.Admin, actorId: adminId };

    if (partner.state === PartnerState.VerificationFailed) return ImportRowOutcome.AlreadyFailed;

    if (partner.state !== PartnerState.SignedUp) return ImportRowOutcome.AlreadyVerified;

    const approved = !verified || (await approveLead(connection, partner, actor, requestId));

    if (!approved) return ImportRowOutcome.ApprovalFailed;

    await withTransaction(connection, async () => {
      await transitionPartner(
        connection,
        partner,
        verified ? PartnerState.Verified : PartnerState.VerificationFailed,
        actor,
        verified ? TRANSITION_REASON.verifiedUpload : TRANSITION_REASON.verificationFailedUpload,
        requestId,
      );

      await updateVerificationDecision(connection, partnerId, { adminId, importId, verified });

      if (!verified) return;

      await notifyPartner(connection, partnerId, PartnerNotificationType.Verified);

      await lockForRegistrar(connection, partner, actor, requestId);
    });

    return verified ? ImportRowOutcome.Accepted : ImportRowOutcome.Rejected;
  });

const processRow = async (
  entries: ImportEntry[],
  index: number,
  adminId: string,
  importId: string,
  requestId: string,
): Promise<ImportRowView> => {
  const entry = entries[index];
  const row = { rowNumber: index + 1, primaryPhone: entry.raw, verified: entry.verifiedRaw };

  if (!entry.raw || !isValidPhone(entry.phone)) return { ...row, outcome: ImportRowOutcome.InvalidPhone };

  if (entry.verified === undefined) return { ...row, outcome: ImportRowOutcome.InvalidVerified };

  if (entries.findIndex(item => item.phone === entry.phone) !== index) return { ...row, outcome: ImportRowOutcome.DuplicateInFile };

  const partnerId = await findPartnerIdByChecksum(pool, piiChecksum(entry.phone));

  if (!partnerId) return { ...row, outcome: ImportRowOutcome.NotFound };

  const outcome = await decidePartner(partnerId, entry.verified, adminId, importId, requestId);

  return { ...row, outcome, partnerId };
};

const parseVerified = (raw: string): boolean | undefined => {
  const value = raw.trim().toLowerCase();

  if (TRUE_VALUES.includes(value)) return true;

  if (FALSE_VALUES.includes(value)) return false;

  return undefined;
};

export const importVerifiedPartners = async (input: ImportInput, adminId: string, requestId: string): Promise<VerifiedImportResult> => {
  const importId = randomUUID();
  const entries: ImportEntry[] = input.rows.map(row => ({
    raw: row.primaryPhone.trim(),
    phone: normalisePhone(row.primaryPhone),
    verifiedRaw: row.verified.trim(),
    verified: parseVerified(row.verified),
  }));
  const rows = await entries.reduce<Promise<ImportRowView[]>>(
    (chain, _entry, index) =>
      chain.then(async done => [...done, await processRow(entries, index, adminId, importId, requestId)]),
    Promise.resolve([]),
  );
  const accepted = rows.filter(row => row.outcome === ImportRowOutcome.Accepted).length;
  const rejected = rows.filter(row => row.outcome === ImportRowOutcome.Rejected).length;
  const counts = { rows: rows.length, accepted, rejected, errors: rows.length - accepted - rejected };

  await insertImport(pool, importId, adminId, input.fileName, counts);

  await insertImportRows(pool, importId, rows);

  await recordAudit(pool, {
    action: AuditAction.VerificationImported,
    actorType: ActorType.Admin,
    actorId: adminId,
    entityType: AuditEntityType.Import,
    entityId: importId,
    data: { fileName: input.fileName, ...counts },
    requestId,
  });

  logger.info({
    method: 'importVerifiedPartners',
    key_1: 'import_id',
    key_1_value: importId,
    key_2: 'accepted',
    key_2_value: String(accepted),
    key_3: 'rejected',
    key_3_value: String(rejected),
  });

  return { importId, fileName: input.fileName, counts, rows, createdAt: new Date().toISOString() };
};

export const getImport = async (importId: string): Promise<VerifiedImportResult> => {
  const record = await findImport(pool, importId);

  if (!record) throw new AppError(ErrorCode.NotFound, { importId });

  const rows = await listImportRows(pool, importId);

  return {
    importId,
    fileName: record.file_name,
    counts: { rows: record.rows_total, accepted: record.rows_accepted, rejected: record.rows_rejected, errors: record.rows_failed },
    rows: rows.map(row => ({
      rowNumber: row.row_no,
      primaryPhone: row.primary_phone_raw,
      verified: row.verified_raw ?? '',
      outcome: row.outcome,
      partnerId: row.partner_id ?? undefined,
    })),
    createdAt: toIsoDateTime(record.created_at),
  };
};

export const buildFailCsv = async (importId: string): Promise<string> => {
  const result = await getImport(importId);

  return toCsv([
    FAIL_CSV_HEADERS,
    ...result.rows
      .filter(row => !PROCESSED_OUTCOMES.includes(row.outcome))
      .map(row => [row.rowNumber, row.primaryPhone, row.verified, IMPORT_OUTCOME_REASON[row.outcome]]),
  ]);
};
