import { readdir } from 'fs/promises';
import { basename, extname, join } from 'path';
import { schemaKindToSubdir } from './aliases';
import type { ParsedStateCreateInput } from '../../types/state';
import { ensureDirectory } from '@/utils/filesystem';

export const getTargetDirectory = async (
  parsed: ParsedStateCreateInput,
  rootPath: string
): Promise<string> => {
  if (parsed.type === 'schema') {
    const dir = join(
      rootPath,
      'state',
      'schema',
      schemaKindToSubdir(parsed.schemaKind)
    );
    await ensureDirectory(dir);

    return dir;
  }

  if (parsed.type === 'trigger') {
    const dir = join(rootPath, 'state', 'triggers');
    await ensureDirectory(dir);

    return dir;
  }

  if (parsed.procDomain) {
    const dir = join(rootPath, 'state', 'procs', parsed.procDomain);
    await ensureDirectory(dir);

    return dir;
  }

  const dir = join(rootPath, 'state', 'procs');
  await ensureDirectory(dir);

  return dir;
};

export const getNextNumericPrefix = async (dir: string): Promise<string> => {
  const entries = await readdir(dir, { withFileTypes: true });
  let max = 0;

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (extname(entry.name).toLowerCase() !== '.sql') continue;

    const nameWithoutExt = basename(entry.name, '.sql');
    const match = /^(\d{3,})_/.exec(nameWithoutExt);
    const prefix = match?.[1];
    if (!prefix) continue;

    const value = Number.parseInt(prefix, 10);
    if (Number.isFinite(value) && value > max) {
      max = value;
    }
  }

  const next = max === 0 ? 1 : max + 10;
  return next.toString().padStart(3, '0');
};
