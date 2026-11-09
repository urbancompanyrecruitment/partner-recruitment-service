import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';

export type Queryable = Pool | PoolConnection;

export interface CountRow extends RowDataPacket {
  total: number;
}

export interface MigrationRow extends RowDataPacket {
  name: string;
}
