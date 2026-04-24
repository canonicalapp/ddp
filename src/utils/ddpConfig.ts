import { readFile } from 'fs/promises';
import { dirname, join } from 'path';
import { findUp } from 'find-up';

export interface IDdpConfig {
  version: number;
  paths?: {
    root?: string;
    state?: string;
    migrations?: string;
    /** SQL seed files directory (flat `*.sql`, no history tracking). */
    seeds?: string;
  };
  stateLayout?: {
    schemaDir?: string;
    procsDir?: string;
    triggersDir?: string;
    splitMode?: 'modular';
  };
  migrations?: {
    namingPattern?: 'timestamp_name';
    requireDownSql?: boolean;
    requireMetadata?: boolean;
    enforceImmutability?: boolean;
  };
  compat?: {
    legacyMode?: boolean;
  };
  statePolicy?: {
    strictMode?: boolean;
    namePattern?: string;
    allowedSchemaKinds?: Array<
      'table' | 'index' | 'constraint' | 'extension' | 'view' | 'enum'
    >;
  };
}

export interface IResolvedDdpConfig {
  configPath: string;
  projectRoot: string;
  rootPath: string;
  config: IDdpConfig;
}

export const resolveDdpConfig =
  async (): Promise<IResolvedDdpConfig | null> => {
    const configPath = await findUp('ddp.config.json', { cwd: process.cwd() });

    if (!configPath) {
      return null;
    }

    const raw = await readFile(configPath, 'utf8');
    const config = JSON.parse(raw) as IDdpConfig;
    const projectRoot = dirname(configPath);
    const rootPath = config.paths?.root ?? 'db';

    return {
      configPath,
      projectRoot,
      rootPath,
      config,
    };
  };

/** DDP root (`paths.root`) from project-root `ddp.config.json` only. Set via `ddp init --path`. */
export const resolveDdpRootPath = async (): Promise<string> => {
  const resolved = await resolveDdpConfig();
  return resolved?.rootPath ?? 'db';
};

/** Absolute path to the migrations directory (`paths.migrations` relative to project root). */
export const resolveDdpMigrationsDir = async (): Promise<string> => {
  const resolved = await resolveDdpConfig();
  if (!resolved) {
    throw new Error(
      'ddp.config.json not found. Run `ddp init` or pass --folder to apply.'
    );
  }

  const relative =
    resolved.config.paths?.migrations ?? `${resolved.rootPath}/migrations`;

  return join(resolved.projectRoot, relative);
};

/** Absolute path to the seeds directory (`paths.seeds` or `{root}/seeds`). */
export const resolveDdpSeedsDir = async (): Promise<string> => {
  const resolved = await resolveDdpConfig();
  if (!resolved) {
    throw new Error(
      'ddp.config.json not found. Run `ddp init` or pass --folder to seed.'
    );
  }

  const relative = resolved.config.paths?.seeds ?? `${resolved.rootPath}/seeds`;

  return join(resolved.projectRoot, relative);
};
