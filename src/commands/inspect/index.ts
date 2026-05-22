import { Client } from 'pg';
import { readdir, stat } from 'fs/promises';
import { join } from 'path';
import { buildConnectionString } from '@/database/connection';
import type { IInspectCommandOptions } from '@/types/cli';
import type { IDatabaseConnection } from '@/types/database';
import { ValidationError } from '@/types/errors';
import { loadEnvFile } from '@/utils/envLoader';
import { resolvePgSchema } from '@/utils/pgSchema';
import { resolveDdpMigrationsDir } from '@/utils/ddpConfig';
import { collectPreservedArtifacts } from './artifacts';

const buildTargetConfig = (
  options: IInspectCommandOptions
): IDatabaseConnection => {
  const database = options.database ?? process.env.DB_NAME;
  const username = options.username ?? process.env.DB_USER;
  const password = options.password ?? process.env.DB_PASSWORD;
  const schema = resolvePgSchema(options.schema, process.env.DB_SCHEMA);

  if (!database || !username || !password) {
    throw new ValidationError(
      'Database credentials required (DB_NAME, DB_USER, DB_PASSWORD or CLI flags).',
      'credentials',
      { database: !!database, username: !!username, password: !!password }
    );
  }

  return {
    host: options.host ?? process.env.DB_HOST ?? 'localhost',
    port: parseInt(options.port ?? process.env.DB_PORT ?? '5432'),
    database,
    username,
    password,
    schema,
  };
};

export const inspectStaleCommand = async (
  options: IInspectCommandOptions
): Promise<void> => {
  await loadEnvFile(true, options.env);
  const target = buildTargetConfig(options);
  const targetSchema = resolvePgSchema(target.schema, process.env.DB_SCHEMA);

  const client = new Client({
    connectionString: buildConnectionString(target),
  });
  await client.connect();

  try {
    const artifacts = await collectPreservedArtifacts(client, targetSchema);

    if (artifacts.totalCount === 0) {
      console.log(
        `No preserved backup artifacts found in schema "${targetSchema}".`
      );
      return;
    }

    console.log(
      `Found ${artifacts.totalCount} preserved backup artifact(s) in schema "${targetSchema}".`
    );

    if (artifacts.triggerNames.length > 0) {
      console.log(`\nTriggers (${artifacts.triggerNames.length}):`);
      artifacts.triggerNames.forEach(name => console.log(`- ${name}`));
    }

    if (artifacts.tableNames.length > 0) {
      console.log(`\nTables (${artifacts.tableNames.length}):`);
      artifacts.tableNames.forEach(name => console.log(`- ${name}`));
    }

    if (artifacts.droppedColumns.length > 0) {
      console.log(`\nColumns (${artifacts.droppedColumns.length}):`);
      artifacts.droppedColumns.forEach(entry =>
        console.log(`- ${entry.tableName}.${entry.columnName}`)
      );
    }

    console.log(
      '\nCleanup: after validating data is no longer needed, remove tombstones with `ddp apply --prune --dry-run` then `ddp apply --prune`, or drop manually.'
    );
  } finally {
    await client.end().catch(() => undefined);
  }
};

interface IBackfillMigrationStatus {
  migrationId: string;
  hasUp: boolean;
  hasBackfill: boolean;
  hasVerify: boolean;
  hasConstraints: boolean;
  appliedExpand: boolean;
  appliedConstraints: boolean;
}

const migrationDirPattern = /^\d{14}_[a-z0-9_]+$/;

const collectAppliedMigrationIds = async (
  client: Client
): Promise<Set<string>> => {
  try {
    const res = await client.query<{ migration_id: string }>(
      `SELECT migration_id FROM ddp_migrations WHERE success = true`
    );
    return new Set(res.rows.map(r => r.migration_id));
  } catch {
    return new Set();
  }
};

const inspectBackfillMigrations = async (
  migrationsDir: string,
  appliedIds: Set<string>
): Promise<IBackfillMigrationStatus[]> => {
  const entries = await readdir(migrationsDir);
  const statuses: IBackfillMigrationStatus[] = [];

  for (const entry of entries) {
    if (!migrationDirPattern.test(entry)) continue;

    const dir = join(migrationsDir, entry);
    const dirStats = await stat(dir).catch(() => null);
    if (!dirStats?.isDirectory()) continue;

    const hasUp = await stat(join(dir, 'up.sql'))
      .then(s => s.isFile())
      .catch(() => false);
    const hasBackfill = await stat(join(dir, 'backfill.sql'))
      .then(s => s.isFile())
      .catch(() => false);
    const hasVerify = await stat(join(dir, 'backfill.verify.sql'))
      .then(s => s.isFile())
      .catch(() => false);
    const hasConstraints = await stat(join(dir, 'constraints.sql'))
      .then(s => s.isFile())
      .catch(() => false);

    const isPhasedMigration = hasBackfill || hasVerify || hasConstraints;
    if (!isPhasedMigration) {
      continue;
    }

    const appliedExpand =
      appliedIds.has(`${entry}::expand`) || appliedIds.has(entry);
    const appliedConstraints = appliedIds.has(`${entry}::constraints`);

    statuses.push({
      migrationId: entry,
      hasUp,
      hasBackfill,
      hasVerify,
      hasConstraints,
      appliedExpand,
      appliedConstraints,
    });
  }

  return statuses.sort((a, b) => a.migrationId.localeCompare(b.migrationId));
};

export const inspectBackfillCommand = async (
  options: IInspectCommandOptions
): Promise<void> => {
  await loadEnvFile(true, options.env);
  const target = buildTargetConfig(options);
  const client = new Client({
    connectionString: buildConnectionString(target),
  });
  await client.connect();

  try {
    const migrationsDir = await resolveDdpMigrationsDir();
    const appliedIds = await collectAppliedMigrationIds(client);
    const statuses = await inspectBackfillMigrations(migrationsDir, appliedIds);

    if (statuses.length === 0) {
      console.log(`No split backfill migrations found in "${migrationsDir}".`);
      return;
    }

    let completed = 0;
    let pendingBackfill = 0;
    let pendingExpand = 0;

    for (const status of statuses) {
      if (status.appliedConstraints) {
        completed++;
      } else if (status.appliedExpand) {
        pendingBackfill++;
      } else {
        pendingExpand++;
      }
    }

    console.log('Backfill inspection summary:');
    console.log(`- Completed constraints: ${completed}`);
    console.log(`- Waiting for backfill/constraints: ${pendingBackfill}`);
    console.log(`- Waiting for expand apply: ${pendingExpand}`);
    console.log('');

    for (const status of statuses) {
      const fileSet = [
        status.hasUp ? 'up.sql' : '',
        status.hasBackfill ? 'backfill.sql' : '',
        status.hasVerify ? 'backfill.verify.sql' : '',
        status.hasConstraints ? 'constraints.sql' : '',
      ]
        .filter(Boolean)
        .join(', ');

      let next = 'run ddp apply';
      if (status.appliedConstraints) {
        next = 'completed';
      } else if (status.appliedExpand) {
        next = 'run backfill.sql, then ddp apply --with-backfill';
      }

      console.log(`- ${status.migrationId}`);
      console.log(`  files: ${fileSet}`);
      console.log(
        `  applied: expand=${status.appliedExpand ? 'yes' : 'no'}, constraints=${status.appliedConstraints ? 'yes' : 'no'}`
      );
      console.log(`  next: ${next}`);
    }
  } finally {
    await client.end().catch(() => undefined);
  }
};
