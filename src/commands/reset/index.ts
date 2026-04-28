/**
 * Dev reset command: drop + recreate DB, then apply migrations and seed data.
 */

import { createInterface } from 'readline';
import { Client } from 'pg';
import { applyCommand } from '@/commands/apply/index';
import { seedCommand } from '@/commands/seed/index';
import { buildConnectionString } from '@/database/connection';
import type { IApplyCommandOptions } from '@/types/apply';
import type { IResetCommandOptions, ISeedCommandOptions } from '@/types/cli';
import type { IDatabaseConnection } from '@/types/database';
import { ValidationError } from '@/types/errors';
import { loadEnvFile } from '@/utils/envLoader';
import { logError } from '@/utils/logger';
import { resolvePgSchema } from '@/utils/pgSchema';

const DEV_ENV_VALUES = new Set(['development', 'dev', 'local', 'test']);
const DEFAULT_HOST_ALLOWLIST = ['localhost', '127.0.0.1', '::1'];
const DEFAULT_DB_ALLOWLIST = [
  '*dev*',
  '*test*',
  '*local*',
  '*sandbox*',
  '*tmp*',
];
const RISKY_DB_PATTERNS = ['*prod*', '*production*', '*staging*', '*live*'];

const promptLine = (question: string): Promise<string> => {
  return new Promise(resolve => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
};

const escapeIdent = (name: string): string => `"${name.replace(/"/g, '""')}"`;

const parseCsvList = (raw?: string): string[] =>
  (raw ?? '')
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);

const wildcardMatch = (value: string, pattern: string): boolean => {
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`, 'i').test(value);
};

const anyWildcardMatch = (value: string, patterns: string[]): boolean =>
  patterns.some(p => wildcardMatch(value, p));

function buildConnectionConfig(
  options: IResetCommandOptions
): IDatabaseConnection {
  const database = options.database ?? process.env.DB_NAME;
  const username = options.username ?? process.env.DB_USER;
  const password = options.password ?? process.env.DB_PASSWORD;
  const schema = resolvePgSchema(options.schema, process.env.DB_SCHEMA);

  if (!database || !username || !password) {
    throw new ValidationError(
      'Database credentials are required',
      'credentials',
      {
        database: !!database,
        username: !!username,
        password: !!password,
      }
    );
  }

  return {
    host: options.host ?? process.env.DB_HOST ?? 'localhost',
    port: parseInt(options.port ?? process.env.DB_PORT ?? '5432', 10),
    database,
    username,
    password,
    schema,
  };
}

async function assertDevOnly(options: IResetCommandOptions): Promise<void> {
  const envCandidate = (
    process.env.DDP_ENV ??
    process.env.NODE_ENV ??
    process.env.APP_ENV ??
    'development'
  )
    .toLowerCase()
    .trim();

  if (!DEV_ENV_VALUES.has(envCandidate)) {
    throw new Error(
      `ddp reset is dev-only. Current env is "${envCandidate}". ` +
        `Use NODE_ENV=development (or DDP_ENV=development) in your dev setup.`
    );
  }

  if (options.nonInteractive) {
    if (!options.force) {
      throw new Error(
        'Non-interactive reset requires --force to avoid accidental database destruction.'
      );
    }
    return;
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(
      'Not a TTY. Re-run with --non-interactive --force if intentional.'
    );
  }

  if (options.force) {
    return;
  }

  const db = options.database ?? process.env.DB_NAME;
  const answer = await promptLine(
    `This will DROP and recreate database "${db}". Type the database name to continue: `
  );
  if (answer !== db) {
    throw new Error(
      'Reset aborted (confirmation did not match database name).'
    );
  }
}

function assertResetTargetAllowed(
  options: IResetCommandOptions,
  connection: IDatabaseConnection
): void {
  const host = connection.host.trim();
  const database = connection.database.trim();

  const hostAllowlist = parseCsvList(
    options.allowedHosts ?? process.env.DDP_RESET_ALLOWED_HOSTS
  );
  const effectiveHostAllowlist =
    hostAllowlist.length > 0 ? hostAllowlist : DEFAULT_HOST_ALLOWLIST;

  if (!anyWildcardMatch(host, effectiveHostAllowlist)) {
    throw new Error(
      `Reset blocked for host "${host}". Allowed hosts: ${effectiveHostAllowlist.join(', ')}.\n` +
        `Use --allowed-hosts or DDP_RESET_ALLOWED_HOSTS for approved non-local dev hosts.`
    );
  }

  const dbAllowlist = parseCsvList(
    options.allowedDatabases ?? process.env.DDP_RESET_ALLOWED_DATABASES
  );
  const effectiveDbAllowlist =
    dbAllowlist.length > 0 ? dbAllowlist : DEFAULT_DB_ALLOWLIST;

  if (!anyWildcardMatch(database, effectiveDbAllowlist)) {
    throw new Error(
      `Reset blocked for database "${database}". Allowed DB patterns: ${effectiveDbAllowlist.join(', ')}.\n` +
        `Use --allowed-databases or DDP_RESET_ALLOWED_DATABASES for explicit dev DB names.`
    );
  }

  if (
    !options.allowRiskyDatabaseName &&
    anyWildcardMatch(database, RISKY_DB_PATTERNS)
  ) {
    throw new Error(
      `Reset blocked: database name "${database}" looks production-like.\n` +
        `If this is a safe dev target, pass --allow-risky-database-name explicitly.`
    );
  }
}

async function resetDatabase(
  target: IDatabaseConnection,
  maintenanceDatabase: string
): Promise<void> {
  const maintenance: IDatabaseConnection = {
    ...target,
    database: maintenanceDatabase,
  };
  const client = new Client({
    connectionString: buildConnectionString(maintenance),
  });

  await client.connect();
  try {
    await client.query(
      `SELECT pg_terminate_backend(pid)
       FROM pg_stat_activity
       WHERE datname = $1
         AND pid <> pg_backend_pid()`,
      [target.database]
    );
    await client.query(
      `DROP DATABASE IF EXISTS ${escapeIdent(target.database)}`
    );
    await client.query(`CREATE DATABASE ${escapeIdent(target.database)}`);
  } finally {
    await client.end();
  }
}

export const resetCommand = async (options: IResetCommandOptions) => {
  try {
    await loadEnvFile(true, options.env);
    await assertDevOnly(options);

    const connectionConfig = buildConnectionConfig(options);
    assertResetTargetAllowed(options, connectionConfig);
    const maintenanceDatabase =
      options.maintenanceDatabase ??
      process.env.DDP_MAINTENANCE_DB ??
      'postgres';

    console.log('DDP RESET (dev-only)');
    console.log(`Target DB: ${connectionConfig.database}`);
    console.log(`Host: ${connectionConfig.host}:${connectionConfig.port}`);
    console.log(`Schema: ${connectionConfig.schema ?? 'public'}`);
    console.log(`Maintenance DB: ${maintenanceDatabase}`);
    console.log('');

    console.log('🗑️  Dropping and recreating database...');
    await resetDatabase(connectionConfig, maintenanceDatabase);
    console.log('✅ Database recreated');
    console.log('');

    const applyOptions: IApplyCommandOptions = {
      host: connectionConfig.host,
      port: String(connectionConfig.port),
      database: connectionConfig.database,
      username: connectionConfig.username,
      password: connectionConfig.password,
      nonInteractive: true,
      createDatabase: false,
    };
    if (options.env !== undefined) {
      applyOptions.env = options.env;
    }
    if (connectionConfig.schema !== undefined) {
      applyOptions.schema = connectionConfig.schema;
    }
    if (options.acceptDestructive !== undefined) {
      applyOptions.acceptDestructive = options.acceptDestructive;
    }
    if (options.transactionMode !== undefined) {
      applyOptions.transactionMode = options.transactionMode;
    }
    if (options.continueOnError !== undefined) {
      applyOptions.continueOnError = options.continueOnError;
    }
    if (options.skipLock !== undefined) {
      applyOptions.skipLock = options.skipLock;
    }

    console.log('🚀 Running ddp apply...');
    await applyCommand(applyOptions);
    console.log('');

    if (!options.skipSeed) {
      const seedOptions: ISeedCommandOptions = {
        host: connectionConfig.host,
        port: String(connectionConfig.port),
        database: connectionConfig.database,
        username: connectionConfig.username,
        password: connectionConfig.password,
        nonInteractive: true,
        createDatabase: false,
      };
      if (options.env !== undefined) {
        seedOptions.env = options.env;
      }
      if (connectionConfig.schema !== undefined) {
        seedOptions.schema = connectionConfig.schema;
      }
      if (options.acceptDestructive !== undefined) {
        seedOptions.acceptDestructive = options.acceptDestructive;
      }
      if (options.transactionMode !== undefined) {
        seedOptions.transactionMode = options.transactionMode;
      }
      if (options.continueOnError !== undefined) {
        seedOptions.continueOnError = options.continueOnError;
      }
      if (options.skipLock !== undefined) {
        seedOptions.skipLock = options.skipLock;
      }
      console.log('🌱 Running ddp seed...');
      await seedCommand(seedOptions);
      console.log('');
    } else {
      console.log('⏭️  Skipping seed step (--skip-seed)');
      console.log('');
    }

    console.log('🎉 Reset complete.');
  } catch (error) {
    logError('DDP reset command failed', error as Error, {
      options: { ...options, password: '[REDACTED]' },
    });
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ DDP RESET failed:', message);
    process.exit(1);
  }
};
