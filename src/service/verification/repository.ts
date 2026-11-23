import { execute, query, queryOne, type ExecuteResult, type Queryable } from '../../common/db/index.js';
import type { ImportCounts, ImportRow, ImportRowRecord, ImportRowView } from './interface.js';

export const insertImport = (
  db: Queryable,
  importId: string,
  adminId: string,
  fileName: string,
  counts: ImportCounts,
): Promise<ExecuteResult> =>
  execute(
    db,
    `INSERT INTO verification_imports (id, uploaded_by_admin_id, file_name, rows_total, rows_accepted, rows_rejected, rows_failed, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, LOCALTIMESTAMP(3))`,
    [importId, adminId, fileName, counts.rows, counts.accepted, counts.rejected, counts.errors],
  );

export const insertImportRows = (db: Queryable, importId: string, rows: ImportRowView[]): Promise<ExecuteResult> =>
  execute(
    db,
    `INSERT INTO verification_import_rows (import_id, row_no, primary_phone_raw, verified_raw, outcome, partner_id)
     SELECT ?::text, r."rowNumber", r."primaryPhone", r.verified, r.outcome, r."partnerId"
     FROM jsonb_to_recordset(?::jsonb) AS r ("rowNumber" INTEGER, "primaryPhone" TEXT, verified TEXT, outcome TEXT, "partnerId" TEXT)`,
    [importId, JSON.stringify(rows)],
  );

export const findImport = (db: Queryable, importId: string): Promise<ImportRow | undefined> =>
  queryOne<ImportRow>(db, 'SELECT * FROM verification_imports WHERE id = ?', [importId]);

export const listImportRows = (db: Queryable, importId: string): Promise<ImportRowRecord[]> =>
  query<ImportRowRecord>(
    db,
    `SELECT row_no, primary_phone_raw, verified_raw, outcome, partner_id
     FROM verification_import_rows WHERE import_id = ? ORDER BY row_no`,
    [importId],
  );
