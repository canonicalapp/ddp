/**
 * Sync operation types and interfaces
 */

import type { IDatabaseConfig } from './database';

// Sync Types
export interface ISyncOptions {
  source: IDatabaseConfig;
  target: IDatabaseConfig;
  outputFile: string;
  dryRun?: boolean;
}

// Legacy Sync Options (for backward compatibility with existing operations)
export interface ILegacySyncOptions {
  conn: string;
  dev: string;
  prod: string;
  targetConn: string;
  output?: string;
  dryRun?: boolean;
  save?: boolean;
  [key: string]: unknown;
}

export interface ISyncResult {
  success: boolean;
  operations: ISyncOperation[];
  error?: string;
}

export interface ISyncOperation {
  type: 'CREATE' | 'ALTER' | 'DROP' | 'COMMENT';
  objectType:
    | 'TABLE'
    | 'COLUMN'
    | 'CONSTRAINT'
    | 'INDEX'
    | 'FUNCTION'
    | 'TRIGGER';
  name: string;
  schema: string;
  sql: string;
  description: string;
}

// Sync Utility Types
export type TSyncOperationType = 'CREATE' | 'ALTER' | 'DROP' | 'COMMENT';

export type TSyncObjectType =
  | 'TABLE'
  | 'COLUMN'
  | 'CONSTRAINT'
  | 'INDEX'
  | 'FUNCTION'
  | 'TRIGGER';
