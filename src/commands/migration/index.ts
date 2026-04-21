/**
 * Migration commands: scaffold folders, diff vs DB, write SQL.
 */

import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import type { IMigrationCreateCommandOptions } from '@/types';
import { resolveDdpConfig, resolveDdpMigrationsDir } from '@/utils/ddpConfig';
import { ensureDirectory } from '@/utils/filesystem';
import { logError, logInfo } from '@/utils/logger';
import {
  migrationDirExists,
  migrationIdPattern,
  sanitizeMigrationSlug,
  utcTimestamp14,
} from './persist';

export {
  migrationWriteFromDiff,
  sanitizeMigrationSlug,
  type IMigrationWriteFromDiffInput,
} from './persist';

export { migrateDiffCommand, migrateDiffOptionsFromCommander } from './diff';

export const migrationCreateCommand = async (
  options: IMigrationCreateCommandOptions
): Promise<void> => {
  try {
    const slug = sanitizeMigrationSlug(options.name);
    const resolved = await resolveDdpConfig();
    if (!resolved) {
      throw new Error(
        'ddp.config.json not found. Run `ddp init` in the project root first.'
      );
    }

    const migrationsDir = await resolveDdpMigrationsDir();
    await ensureDirectory(migrationsDir);

    const migrationId = `${utcTimestamp14()}_${slug}`;
    if (!migrationIdPattern.test(migrationId)) {
      throw new Error(`Invalid migration id "${migrationId}"`);
    }

    const targetDir = join(migrationsDir, migrationId);
    if (await migrationDirExists(targetDir)) {
      throw new Error(
        `Migration directory already exists: ${targetDir}\nChoose a different name or remove the folder.`
      );
    }

    await mkdir(targetDir, { recursive: true });

    const cfg = resolved.config.migrations ?? {};
    const requireDown = cfg.requireDownSql === true;
    const requireMeta = cfg.requireMetadata === true;

    const upTemplate =
      `-- DDP migration: ${migrationId}\n` +
      `-- Forward-only SQL (applied in order by timestamp prefix).\n\n`;

    await writeFile(join(targetDir, 'up.sql'), upTemplate, 'utf8');

    if (requireDown) {
      const downTemplate =
        `-- DDP migration rollback: ${migrationId}\n` +
        `-- Optional rollback SQL (best-effort; review before use).\n\n`;
      await writeFile(join(targetDir, 'down.sql'), downTemplate, 'utf8');
    }

    if (requireMeta) {
      const meta = {
        id: migrationId,
        createdAt: new Date().toISOString(),
        description: slug.replace(/_/g, ' '),
      };
      await writeFile(
        join(targetDir, 'migration.json'),
        `${JSON.stringify(meta, null, 2)}\n`,
        'utf8'
      );
    }

    logInfo('Created migration', { migrationId, path: targetDir });

    console.log('Created migration:');
    console.log(`- Id: ${migrationId}`);
    console.log(`- Path: ${targetDir}`);
    console.log(
      `- Files: up.sql${requireDown ? ', down.sql' : ''}${requireMeta ? ', migration.json' : ''}`
    );
  } catch (error) {
    logError('ddp migration create failed', error as Error, { options });
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('DDP MIGRATION CREATE failed:', message);
    process.exit(1);
  }
};
