import type { Pool, PoolClient } from 'pg';

export type DbConnection = PoolClient;

export type Queryable = Pool | PoolClient;

export interface ExecuteResult {
  affectedRows: number;
}

export interface DatabaseError {
  code?: string;
  message?: string;
  stack?: string;
}

export interface CountRow {
  total: number;
}

export interface MigrationRow {
  name: string;
}
