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
  path: string;
}

interface IManifest {
  entries?: IManifestEntry[];
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
  } catch {
    /* no manifest */
  }

  if (ordered.length === 0) {
    ordered = await discoverStateSqlFiles(stateRoot, projectRoot);
  }

  if (ordered.length === 0) {
    throw new Error(
      'No state SQL files found. Create artifacts with `ddp state create` or add .sql under state/.'
    );
  }

  return ordered;
};
