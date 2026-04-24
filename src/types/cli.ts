/**
 * CLI command types and interfaces
 */

import type { IObjectFilterOptions } from './generator';

// Base database connection options
export interface IDatabaseConnectionOptions {
  env?: string;
  host?: string;
  port?: string;
  database?: string;
  username?: string;
  password?: string;
  schema?: string;
}

// CLI Command Types
export interface IGenCommandOptions
  extends IDatabaseConnectionOptions,
    IObjectFilterOptions {
  output?: string;
  stdout?: boolean;
}

export interface ISyncCommandOptions {
  env?: string;
  // Database sync options
  sourceHost?: string;
  sourcePort?: string;
  sourceDatabase?: string;
  sourceUsername?: string;
  sourcePassword?: string;
  sourceSchema?: string;
  targetHost?: string;
  targetPort?: string;
  targetDatabase?: string;
  targetUsername?: string;
  targetPassword?: string;
  targetSchema?: string;
  // Repository sync options
  sourceRepo?: string;
  targetRepo?: string;
  sourceBranch?: string;
  targetBranch?: string;
  // Common options
  output?: string;
  dryRun?: boolean;
}

export interface IInitCommandOptions {
  path?: string;
  force?: boolean;
}

export interface IMigrationCreateCommandOptions {
  name: string;
}

/** `ddp migration diff`: optional shadow URL; default same DB + shadow schema */
export interface IMigrateDiffCommandOptions extends IDatabaseConnectionOptions {
  /** Separate disposable DB (optional). If omitted, uses target DB + shadow schema. */
  shadowUrl?: string;
  /** Schema for materialized state when using same DB as target (default: DDP_SHADOW_SCHEMA or ddp_shadow). */
  shadowSchema?: string;
  write?: boolean;
  /** With `--write`: optional in TTY (prompted); required with `--non-interactive` or non-TTY. */
  migrationName?: string;
  /** Create target database if missing (same semantics as `ddp apply`). */
  createDatabase?: boolean;
  /** Fail instead of prompting when DB is missing (use with --create-database in CI). */
  nonInteractive?: boolean;
}

export type StateArtifactType = 'schema' | 'proc' | 'trigger';

export type SchemaStateKind =
  | 'table'
  | 'index'
  | 'constraint'
  | 'extension'
  | 'view'
  | 'enum';

// Re-export apply command options
export type { IApplyCommandOptions } from './apply';

/** `ddp seed` — run flat `*.sql` files with no migration history. */
export interface ISeedCommandOptions extends IDatabaseConnectionOptions {
  folder?: string;
  transactionMode?: 'per-file' | 'all-or-nothing' | 'none';
  continueOnError?: boolean;
  acceptDestructive?: boolean;
  nonInteractive?: boolean;
  createDatabase?: boolean;
  skipLock?: boolean;
}
