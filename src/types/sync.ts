/**
 * Sync operation types and interfaces
 */

/** How to remove target tables that are absent from source (shadow / state). */
export type TRemovedTableStrategy = 'cascade' | 'preserve-rename';

// Legacy Sync Options (for backward compatibility with existing operations)
export interface ILegacySyncOptions {
  conn: string;
  source: string;
  target: string;
  targetConn: string;
  output?: string;
  dryRun?: boolean;
  save?: boolean;
  /**
   * Filled by `SchemaSyncOrchestrator` before sections run: target-only tables
   * not present in source. Used for module-style removal (e.g. affiliate tables).
   */
  pendingTableRemovals?: ReadonlySet<string>;
  /**
   * Default `cascade`: skip per-constraint/index/trigger on removed tables and emit
   * ordered `DROP TABLE ... CASCADE` at the end. `preserve-rename`: keep rename-first
   * tombstones and per-object drops (safer for manual review, more SQL).
   */
  removedTableStrategy?: TRemovedTableStrategy;
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
