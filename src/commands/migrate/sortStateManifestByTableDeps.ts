import { join } from 'path';
import type { IStateManifest } from '@/types/state';
import {
  inferStateApplyPriority,
  priorityForKind,
} from '@/commands/migrate/stateApplyPriority';
import { reorderTableApplyBucketByDependencies } from '@/commands/migrate/reorderTableApplyBucket';

const TABLE_PRIORITY = priorityForKind('table');

/**
 * Reorders `state-manifest.json` entries the same way apply does after kind bucketing:
 * non-table kinds keep stable ordering among themselves; `table` entries are ordered by FK
 * dependencies parsed from SQL (see `TableSorter` / `reorderTableApplyBucketByDependencies`).
 */
export const sortStateManifestEntriesByTableDependencies = async (
  manifest: IStateManifest,
  projectRoot: string
): Promise<IStateManifest> => {
  const entries = manifest.entries;
  const tableLike = entries.filter(
    e => inferStateApplyPriority(e, e.path) === TABLE_PRIORITY
  );

  if (tableLike.length <= 1) {
    return manifest;
  }

  const files = tableLike.map(e => ({
    absolutePath: join(projectRoot, e.path),
    displayPath: e.path,
  }));

  const sortedFiles = await reorderTableApplyBucketByDependencies(files);

  const rank = new Map<string, number>();
  sortedFiles.forEach((f, i) => {
    rank.set(f.displayPath, i);
  });

  const decorated = entries.map((e, idx) => ({ e, idx }));
  const sorted = [...decorated].sort((a, b) => {
    const pa = inferStateApplyPriority(a.e, a.e.path);
    const pb = inferStateApplyPriority(b.e, b.e.path);
    if (pa !== pb) {
      return pa - pb;
    }
    if (pa === TABLE_PRIORITY) {
      const ra = rank.get(a.e.path) ?? 1_000_000 + a.idx;
      const rb = rank.get(b.e.path) ?? 1_000_000 + b.idx;
      if (ra !== rb) {
        return ra - rb;
      }
    }
    return a.idx - b.idx;
  });

  return { version: 1, entries: sorted.map(d => d.e) };
};
