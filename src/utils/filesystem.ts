import { mkdir } from 'fs/promises';

export const ensureDirectory = async (path: string): Promise<void> => {
  await mkdir(path, { recursive: true });
};
