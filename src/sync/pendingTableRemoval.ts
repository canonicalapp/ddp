/**
 * Tables slated for full removal (target-only, absent from shadow/state).
 * Supports module removal via CASCADE (default) or rename-first preservation.
 */

import type { ILegacySyncOptions, TRemovedTableStrategy } from '@/types/sync';

export const DEFAULT_REMOVED_TABLE_STRATEGY: TRemovedTableStrategy = 'cascade';

export const resolveRemovedTableStrategy = (
  options: ILegacySyncOptions
): TRemovedTableStrategy => {
  const fromOptions = options.removedTableStrategy;
  if (
    fromOptions === 'cascade' ||
    fromOptions === 'preserve-rename'
  ) {
    return fromOptions;
  }

  const fromEnv = process.env.DDP_REMOVED_TABLE_STRATEGY?.trim().toLowerCase();
  if (fromEnv === 'preserve-rename' || fromEnv === 'preserve') {
    return 'preserve-rename';
  }

  return DEFAULT_REMOVED_TABLE_STRATEGY;
};

export const primePendingTableRemovals = (
  options: ILegacySyncOptions,
  tableNames: Iterable<string>
): void => {
  options.pendingTableRemovals = new Set(tableNames);
};

export const getPendingTableRemovals = (
  options: ILegacySyncOptions
): ReadonlySet<string> => options.pendingTableRemovals ?? new Set<string>();

export const isPendingTableRemoval = (
  options: ILegacySyncOptions,
  tableName: string | null | undefined
): boolean => {
  if (!tableName) {
    return false;
  }
  return getPendingTableRemovals(options).has(tableName);
};

/**
 * When true, skip DROP CONSTRAINT / INDEX / TRIGGER on this table; removal is
 * handled in the final removed-table section (CASCADE or rename).
 */
export const shouldSkipPerObjectDropsOnRemovedTable = (
  options: ILegacySyncOptions,
  tableName: string | null | undefined
): boolean => {
  if (!isPendingTableRemoval(options, tableName)) {
    return false;
  }
  return resolveRemovedTableStrategy(options) === 'cascade';
};

export const referencesPendingTableRemoval = (
  options: ILegacySyncOptions,
  foreignTableName: string | null | undefined
): boolean => {
  if (!foreignTableName) {
    return false;
  }
  return isPendingTableRemoval(options, foreignTableName);
};
