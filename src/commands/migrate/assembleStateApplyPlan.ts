/**
 * Ordered list of state SQL files for shadow apply (manifest order, else discovery).
 * Within the `table` kind bucket, files are ordered by FK dependencies using `TableSorter`
 * (same approach as `ddp gen` schema generation).
 */

import { readFile, readdir } from 'fs/promises';
import { join, relative } from 'path';
import { resolveDdpConfig } from '@/utils/ddpConfig';
import {
  inferStateApplyPriority,
  priorityForKind,
  type IStateManifestEntryLike,
} from '@/commands/migrate/stateApplyPriority';
import { reorderTableApplyBucketByDependencies } from '@/commands/migrate/reorderTableApplyBucket';
import type { IStateApplyFile } from '@/types/apply';

async function walkSqlFiles(dir: string, acc: string[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      await walkSqlFiles(p, acc);
    } else if (e.isFile() && e.name.toLowerCase().endsWith('.sql')) {
      acc.push(p);
    }
  }
}

async function discoverStateSqlFiles(
  stateRoot: string,
  projectRoot: string
): Promise<IStateApplyFile[]> {
  const paths: string[] = [];
  await walkSqlFiles(stateRoot, paths);
  paths.sort((a, b) => a.localeCompare(b));

  return paths.map(absolutePath => ({
    absolutePath,
    displayPath: relative(projectRoot, absolutePath),
  }));
}

interface IManifest {
  entries?: IStateManifestEntryLike[];
}

const TABLE_PRIORITY = priorityForKind('table');

async function injectTableDependencyOrder(
  ordered: IStateApplyFile[],
  manifestEntries: IStateManifestEntryLike[] | undefined
): Promise<IStateApplyFile[]> {
  const entryByPath = new Map<string, Partial<IStateManifestEntryLike>>();
  if (manifestEntries) {
    for (const e of manifestEntries) {
      if (e.path) {
        entryByPath.set(e.path, e);
      }
    }
  }

  const prio = (f: IStateApplyFile) =>
    inferStateApplyPriority(
      entryByPath.get(f.displayPath) ?? {},
      f.displayPath
    );

  const out: IStateApplyFile[] = [];
  let i = 0;
  while (i < ordered.length) {
    const head = ordered[i];
    if (head === undefined) {
      break;
    }
    const p = prio(head);
    if (p !== TABLE_PRIORITY) {
      out.push(head);
      i += 1;
      continue;
    }
    let j = i;
    while (j < ordered.length) {
      const f = ordered[j];
      if (f === undefined || prio(f) !== TABLE_PRIORITY) {
        break;
      }
      j += 1;
    }
    const bucket = ordered.slice(i, j);
    const reordered = await reorderTableApplyBucketByDependencies(bucket);
    out.push(...reordered);
    i = j;
  }

  return out;
}

export const assembleStateApplyPlan = async (): Promise<IStateApplyFile[]> => {
  const resolved = await resolveDdpConfig();
  if (!resolved) {
    throw new Error('ddp.config.json not found. Run `ddp init` first.');
  }

  const { projectRoot, rootPath } = resolved;
  const stateRoot = join(projectRoot, rootPath, 'state');
  const manifestPath = join(stateRoot, 'state-manifest.json');

  let ordered: IStateApplyFile[] = [];
  let manifestEntries: IStateManifestEntryLike[] | undefined;

  try {
    const raw = await readFile(manifestPath, 'utf8');
    const manifest = JSON.parse(raw) as IManifest;
    const entries = manifest.entries ?? [];
    manifestEntries = entries;

    const rows: { file: IStateApplyFile; manifestIndex: number }[] = [];
    for (let mi = 0; mi < entries.length; mi++) {
      const e = entries[mi];
      if (!e?.path) {
        continue;
      }
      const abs = join(projectRoot, e.path);
      rows.push({
        file: {
          absolutePath: abs,
          displayPath: e.path,
        },
        manifestIndex: mi,
      });
    }

    ordered = rows
      .sort((a, b) => {
        const aPriority = inferStateApplyPriority(
          entries[a.manifestIndex] ?? {},
          a.file.displayPath
        );
        const bPriority = inferStateApplyPriority(
          entries[b.manifestIndex] ?? {},
          b.file.displayPath
        );
        if (aPriority !== bPriority) {
          return aPriority - bPriority;
        }
        return a.manifestIndex - b.manifestIndex;
      })
      .map(item => item.file);
  } catch {
    /* no manifest */
  }

  if (ordered.length === 0) {
    ordered = await discoverStateSqlFiles(stateRoot, projectRoot);
    ordered = ordered
      .map((file, index) => ({ file, index }))
      .sort((a, b) => {
        const aPriority = inferStateApplyPriority({}, a.file.displayPath);
        const bPriority = inferStateApplyPriority({}, b.file.displayPath);
        if (aPriority !== bPriority) {
          return aPriority - bPriority;
        }
        return a.index - b.index;
      })
      .map(item => item.file);
    manifestEntries = undefined;
  }

  if (ordered.length === 0) {
    throw new Error(
      'No state SQL files found. Create artifacts with `ddp state create` or add .sql under state/.'
    );
  }

  ordered = await injectTableDependencyOrder(ordered, manifestEntries);

  return ordered;
};
