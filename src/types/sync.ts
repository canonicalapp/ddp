/**
 * Sync operation types and interfaces
 */

// Legacy Sync Options (for backward compatibility with existing operations)
export interface ILegacySyncOptions {
  conn: string;
  source: string;
  target: string;
  targetConn: string;
  output?: string;
  dryRun?: boolean;
  save?: boolean;
  [key: string]: unknown;
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
