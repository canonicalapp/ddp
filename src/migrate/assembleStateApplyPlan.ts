/**
 * Ordered list of state SQL files for shadow apply (manifest order, else discovery).
 */

import { readFile, readdir } from 'fs/promises';
import { join, relative } from 'path';
import { resolveDdpConfig } from '@/utils/ddpConfig';

export interface IStateApplyFile {
  absolutePath: string;
  displayPath: string;
}

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

interface IManifestEntry {
  path?: string;
  type?: 'schema' | 'proc' | 'trigger';
  kind?: 'table' | 'index' | 'constraint' | 'extension' | 'view' | 'enum';
  domain?: string;
}

interface IManifest {
  entries?: IManifestEntry[];
}

const PRIORITY_BY_KIND: Record<string, number> = {
  extension: 10,
  enum: 20,
  table: 30,
  constraint: 40,
  index: 50,
  view: 60,
  trigger: 70,
  proc: 80,
};

const priorityForKind = (kind: string): number => PRIORITY_BY_KIND[kind] ?? 999;

const inferPriority = (
  entry: Partial<IManifestEntry>,
  displayPath: string
): number => {
  if (entry.type === 'proc') return priorityForKind('proc');
  if (entry.type === 'trigger') return priorityForKind('trigger');
  if (entry.kind) {
    return priorityForKind(entry.kind);
  }

  const p = displayPath.toLowerCase();
  if (p.includes('/schema/extensions/')) return priorityForKind('extension');
  if (p.includes('/schema/enums/')) return priorityForKind('enum');
  if (p.includes('/schema/tables/')) return priorityForKind('table');
  if (p.includes('/schema/constraints/')) return priorityForKind('constraint');
  if (p.includes('/schema/indexes/')) return priorityForKind('index');
  if (p.includes('/schema/views/')) return priorityForKind('view');
  if (p.includes('/triggers/')) return priorityForKind('trigger');
  if (p.includes('/procs/')) return priorityForKind('proc');
  return 999;
};

export const assembleStateApplyPlan = async (): Promise<IStateApplyFile[]> => {
  const resolved = await resolveDdpConfig();
  if (!resolved) {
    throw new Error('ddp.config.json not found. Run `ddp init` first.');
  }

  const { projectRoot, rootPath } = resolved;
  const stateRoot = join(projectRoot, rootPath, 'state');
  const manifestPath = join(stateRoot, 'state-manifest.json');

  let ordered: IStateApplyFile[] = [];

  try {
    const raw = await readFile(manifestPath, 'utf8');
    const manifest = JSON.parse(raw) as IManifest;
    const entries = manifest.entries ?? [];

    for (const e of entries) {
      if (!e.path) {
        continue;
      }
      const abs = join(projectRoot, e.path);
      ordered.push({
        absolutePath: abs,
        displayPath: e.path,
      });
    }

    ordered = ordered
      .map((file, index) => ({ file, index }))
      .sort((a, b) => {
        const aPriority = inferPriority(
          entries[a.index] ?? {},
          a.file.displayPath
        );
        const bPriority = inferPriority(
          entries[b.index] ?? {},
          b.file.displayPath
        );
        if (aPriority !== bPriority) {
          return aPriority - bPriority;
        }
        return a.index - b.index;
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
        const aPriority = inferPriority({}, a.file.displayPath);
        const bPriority = inferPriority({}, b.file.displayPath);
        if (aPriority !== bPriority) {
          return aPriority - bPriority;
        }
        return a.index - b.index;
      })
      .map(item => item.file);
  }

  if (ordered.length === 0) {
    throw new Error(
      'No state SQL files found. Create artifacts with `ddp state create` or add .sql under state/.'
    );
  }

  return ordered;
};
