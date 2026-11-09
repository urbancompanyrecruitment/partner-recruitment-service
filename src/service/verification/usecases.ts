import { randomUUID } from 'node:crypto';
import { bulkApproveJourney } from '../../common/clients/onboarding.js';
import { toCsv } from '../../common/csv.js';
import { phoneChecksum } from '../../common/crypto/phone.js';
import { pool, withTransaction } from '../../common/db/index.js';
import { AppError, ErrorCode } from '../../common/errors/index.js';
import { lockKey, withCriticalSection } from '../../common/lock/index.js';
import { logger } from '../../common/logger.js';
import { isValidPhone, normalisePhone } from '../../common/phone/index.js';
import { toIsoDateTime } from '../../common/time.js';
import { ActorType, AuditAction, AuditEntityType, recordAudit } from '../audit/index.js';
import {
  findPartnerIdByChecksum,
  PartnerState,
  requirePartnerRow,
  TRANSITION_REASON,
  transitionPartner,
  updateVerified,
} from '../partner/index.js';
import { FAIL_CSV_HEADERS, IMPORT_OUTCOME_REASON } from './constant.js';
import { ImportRowOutcome, type ImportInput, type ImportRowView, type PhoneEntry, type VerifiedImportResult } from './interface.js';
import { findImport, insertImport, insertImportRows, listImportRows } from './repository.js';

const verifyPartner = (partnerId: string, adminId: string, importId: string, requestId: string): Promise<ImportRowOutcome> =>
  withCriticalSection([lockKey.partner(partnerId)], async connection => {
    const partner = await requirePartnerRow(connection, partnerId);

    if (partner.state !== PartnerState.SignedUp) return ImportRowOutcome.AlreadyVerified;

    if (!partner.singapore_phone_enc || !partner.lead_id) return ImportRowOutcome.NoSingaporeNumber;

    const approved = await bulkApproveJourney([partner.lead_id], adminId, requestId);

    if (!approved) return ImportRowOutcome.ApprovalFailed;

    await withTransaction(connection, async () => {
      await transitionPartner(
        connection,
        partner,
        PartnerState.Verified,
        { actorType: ActorType.Admin, actorId: adminId },
        TRANSITION_REASON.verifiedUpload,
        requestId,
      );

      await updateVerified(connection, partnerId, adminId, importId);
    });

    return ImportRowOutcome.Accepted;
  });

const processRow = async (
  entries: PhoneEntry[],
  index: number,
  adminId: string,
  importId: string,
  requestId: string,
): Promise<ImportRowView> => {
  const entry = entries[index];
  const row = { rowNumber: index + 1, primaryPhone: entry.raw };

  if (!entry.raw || !isValidPhone(entry.phone)) return { ...row, outcome: ImportRowOutcome.InvalidPhone };

  if (entries.findIndex(item => item.phone === entry.phone) !== index) return { ...row, outcome: ImportRowOutcome.DuplicateInFile };

  const partnerId = await findPartnerIdByChecksum(pool, phoneChecksum(entry.phone));

  if (!partnerId) return { ...row, outcome: ImportRowOutcome.NotFound };

  const outcome = await verifyPartner(partnerId, adminId, importId, requestId);

  return { ...row, outcome, partnerId };
};

export const importVerifiedPartners = async (input: ImportInput, adminId: string, requestId: string): Promise<VerifiedImportResult> => {
  const importId = randomUUID();
  const entries: PhoneEntry[] = input.primaryPhones.map(raw => ({ raw: raw.trim(), phone: normalisePhone(raw) }));
  const rows = await entries.reduce<Promise<ImportRowView[]>>(
    (chain, _entry, index) =>
      chain.then(async done => [...done, await processRow(entries, index, adminId, importId, requestId)]),
    Promise.resolve([]),
  );
  const accepted = rows.filter(row => row.outcome === ImportRowOutcome.Accepted).length;
  const counts = { rows: rows.length, accepted, failed: rows.length - accepted };

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
    key_3: 'failed',
    key_3_value: String(counts.failed),
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
    counts: { rows: record.rows_total, accepted: record.rows_accepted, failed: record.rows_failed },
    rows: rows.map(row => ({
      rowNumber: row.row_no,
      primaryPhone: row.primary_phone_raw,
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
      .filter(row => row.outcome !== ImportRowOutcome.Accepted)
      .map(row => [row.rowNumber, row.primaryPhone, IMPORT_OUTCOME_REASON[row.outcome]]),
  ]);
};
