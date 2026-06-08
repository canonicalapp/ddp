/**
 * Apply command types and interfaces
 */

import type { IDatabaseConnectionOptions } from './cli';

// File loading options
export interface IFileLoadOptions {
  folder?: string;
  withBackfill?: boolean;
}

// Loaded file information
export interface ILoadedFile {
  /** Version folder name, e.g. 20260417120000_add_users */
  migrationId: string;
  baseMigrationId: string;
  phase: 'expand' | 'constraints' | undefined;
  name: string;
  path: string;
  verifyPath: string | undefined;
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
  /**
   * Execute pending migrations in a transaction and ROLLBACK (no history).
   * Catches SQL/dependency errors before a real apply.
   */
  validate?: boolean;
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
  /** Optional acknowledgment for pending backfill.sql follow-ups (informational only) */
  acknowledgeBackfill?: boolean;
  /** Include and enforce constraints.sql after verify checks pass */
  withBackfill?: boolean;
  /** With --with-backfill, allow constraints.sql even when verify/backfill checks fail (dangerous) */
  force?: boolean;
  /**
   * Prune-only run: remove preserved rename tombstones (sync non-destructive policy).
   * Matches `*_old_<digits>` triggers, `*_dropped_<digits>` tables, and `*_dropped_<digits>` columns
   * (same detection as `ddp inspect`). Does not load or apply migrations; use plain `ddp apply` for that.
   */
  prune?: boolean;
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

export interface IStateApplyFile {
  absolutePath: string;
  displayPath: string;
}
