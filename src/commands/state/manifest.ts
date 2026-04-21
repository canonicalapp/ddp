import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import type { IStateManifest } from '../../types/state';

export const getManifestPath = (rootPath: string): string =>
  join(rootPath, 'state', 'state-manifest.json');

export const readManifest = async (
  rootPath: string
): Promise<IStateManifest> => {
  const manifestPath = getManifestPath(rootPath);
  try {
    const raw = await readFile(manifestPath, 'utf8');
    const parsed = JSON.parse(raw) as IStateManifest;
    return {
      version: 1,
      entries: Array.isArray(parsed.entries) ? parsed.entries : [],
    };
  } catch {
    return { version: 1, entries: [] };
  }
};

export const writeManifest = async (
  rootPath: string,
  manifest: IStateManifest
): Promise<void> => {
  const manifestPath = getManifestPath(rootPath);
  await writeFile(
    manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8'
  );
};
