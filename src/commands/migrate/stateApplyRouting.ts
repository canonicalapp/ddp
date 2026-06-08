/**
 * Route state SQL to shadow vs target catalog schema (layout-aware).
 */

import { inferStateApplyPriority, priorityForKind } from '@/commands/migrate/stateApplyPriority';

export type TStateFileKind = 'schema' | 'proc' | 'trigger' | 'other';

export type TShadowCatalogLayout = 'same-database' | 'separate-database';

export const inferStateFileKind = (displayPath: string): TStateFileKind => {
  const p = displayPath.toLowerCase().replace(/\\/g, '/');
  if (p.includes('/procs/')) {
    return 'proc';
  }
  if (p.includes('/triggers/')) {
    return 'trigger';
  }
  if (
    p.includes('/schema/') ||
    p.includes('/tables/') ||
    p.includes('/enums/') ||
    p.includes('/indexes/') ||
    p.includes('/constraints/') ||
    p.includes('/extensions/')
  ) {
    return 'schema';
  }
  return 'other';
};

/**
 * Which search_path to use when applying this file to the shadow connection.
 * - separate-database: schema → shadow; procs/triggers → target (production layout).
 * - same-database: all files → shadow (never mutate target during diff).
 */
export const resolveStateApplySearchPath = (
  displayPath: string,
  layout: TShadowCatalogLayout,
  names: { shadowSchema: string; targetSchema: string }
): string => {
  const kind = inferStateFileKind(displayPath);
  if (layout === 'separate-database') {
    if (kind === 'proc' || kind === 'trigger') {
      return names.targetSchema;
    }
    return names.shadowSchema;
  }

  return names.shadowSchema;
};

export const stateFileSortPriority = (displayPath: string): number => {
  const kind = inferStateFileKind(displayPath);
  if (kind === 'proc') {
    return priorityForKind('proc');
  }
  if (kind === 'trigger') {
    return priorityForKind('trigger');
  }
  if (kind === 'schema') {
    return inferStateApplyPriority({}, displayPath);
  }
  return 999;
};
