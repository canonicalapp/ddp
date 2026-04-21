/**
 * Apply command types and interfaces
 */

import type { IDatabaseConnectionOptions } from './cli';

// File loading options
export interface IFileLoadOptions {
  folder?: string;
}

// Loaded file information
export interface ILoadedFile {
  /** Version folder name, e.g. 20260417120000_add_users */
  migrationId: string;
  name: string;
  path: string;
  content: string;
  checksum: string;
  order: number;
  type: 'schema' | 'procs' | 'triggers' | 'unknown';
}

// Execution options
export type TransactionMode = 'per-file' | 'all-or-nothing' | 'none';

export interface IExecutionOptions {
  sql: string;
  fileName: string;
  transactionMode: TransactionMode;
  continueOnError: boolean;
}

// Execution result
export interface IExecutionResult {
  success: boolean;
  fileName: string;
  statementsExecuted: number;
  executionTime: number;
  error?: Error;
  errorMessage?: string;
}

// Transaction options
export interface ITransactionOptions {
  operations: () => Promise<void>;
  mode: TransactionMode;
}

// Migration history record
export interface IMigrationRecord {
  id?: number;
  migration_id: string;
  file_name: string;
  file_path: string;
  checksum: string;
  applied_at?: Date;
  execution_time_ms?: number;
  success: boolean;
  error_message?: string | null;
  applied_by?: string | null;
  environment?: string | null;
}

// Apply command options
export interface IApplyCommandOptions extends IDatabaseConnectionOptions {
  // File options
  folder?: string;

  // Execution options
  dryRun?: boolean;
  continueOnError?: boolean;
  transactionMode?: TransactionMode;
  skipHistory?: boolean;
  /** Required when pending migrations look destructive (DROP, TRUNCATE, etc.) in non-interactive mode */
  acceptDestructive?: boolean;
  /** Fail instead of prompting (CI / automation) */
  nonInteractive?: boolean;
  /** Create target DB if missing (non-interactive) or use with TTY prompt */
  createDatabase?: boolean;
  /** Skip pg advisory lock (testing only) */
  skipLock?: boolean;
}

// Execution error
export interface IExecutionError {
  type: 'critical' | 'warning' | 'info';
  message: string;
  file?: string;
  statement?: string;
  line?: number;
  suggestion?: string;
}
