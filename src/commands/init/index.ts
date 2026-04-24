import { access, writeFile } from 'fs/promises';
import { constants } from 'fs';
import { join } from 'path';
import type { IInitCommandOptions } from '@/types';
import type { IDdpConfig } from '@/utils/ddpConfig';
import { ensureDirectory } from '@/utils/filesystem';
import { logError, logInfo } from '@/utils/logger';

const buildDefaultConfig = (rootPath: string): IDdpConfig => {
  return {
    version: 1,
    paths: {
      root: rootPath,
      state: `${rootPath}/state`,
      migrations: `${rootPath}/migrations`,
      seeds: `${rootPath}/seeds`,
    },
    stateLayout: {
      schemaDir: `${rootPath}/state/schema`,
      procsDir: `${rootPath}/state/procs`,
      triggersDir: `${rootPath}/state/triggers`,
      splitMode: 'modular',
    },
    migrations: {
      namingPattern: 'timestamp_name',
      requireDownSql: false,
      requireMetadata: false,
      enforceImmutability: true,
    },
    compat: {
      legacyMode: false,
    },
    statePolicy: {
      strictMode: true,
      namePattern: '^[a-z][a-z0-9_]*$',
      allowedSchemaKinds: [
        'table',
        'index',
        'constraint',
        'extension',
        'view',
        'enum',
      ],
    },
  };
};

const fileExists = async (path: string): Promise<boolean> => {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
};

export const initCommand = async (options: IInitCommandOptions) => {
  const rootPath = options.path ?? 'db';
  const configPath = join(process.cwd(), 'ddp.config.json');

  try {
    logInfo('Initializing DDP project structure', {
      rootPath,
      force: options.force,
    });

    console.log(`Initializing DDP structure at: ${rootPath}`);

    await ensureDirectory(rootPath);
    await ensureDirectory(join(rootPath, 'state'));
    await ensureDirectory(join(rootPath, 'state', 'schema'));
    await ensureDirectory(join(rootPath, 'state', 'procs'));
    await ensureDirectory(join(rootPath, 'state', 'triggers'));
    await ensureDirectory(join(rootPath, 'migrations'));
    await ensureDirectory(join(rootPath, 'seeds'));

    const shouldOverwriteConfig = options.force ?? false;
    const configAlreadyExists = await fileExists(configPath);

    if (configAlreadyExists && !shouldOverwriteConfig) {
      console.log(`Skipped existing config: ${configPath}`);
      console.log('Use --force to overwrite the existing config.');
    } else {
      const config = buildDefaultConfig(rootPath);
      await writeFile(
        configPath,
        `${JSON.stringify(config, null, 2)}\n`,
        'utf8'
      );
      console.log(
        `${configAlreadyExists ? 'Overwrote' : 'Created'} config: ${configPath}`
      );
    }

    console.log('Created directories:');
    console.log(`- ${join(rootPath, 'state', 'schema')}`);
    console.log(`- ${join(rootPath, 'state', 'procs')}`);
    console.log(`- ${join(rootPath, 'state', 'triggers')}`);
    console.log(`- ${join(rootPath, 'migrations')}`);
    console.log(`- ${join(rootPath, 'seeds')}`);
    console.log('');
    console.log('DDP init complete.');
  } catch (error) {
    logError('DDP init command failed', error as Error, { rootPath, options });
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('DDP INIT failed:', message);
    process.exit(1);
  }
};
