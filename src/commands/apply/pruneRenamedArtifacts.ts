/**
 * `ddp apply --prune`: remove only preserved rename tombstones from non-destructive sync/diff
 * (same name patterns as `ddp inspect` / migration diff notices).
 */

import { Client } from 'pg';
import { buildConnectionString, testConnection } from '@/database/connection';
import {
  ensurePgSchemaExists,
  ensureTargetDatabase,
} from '@/commands/apply/databasePreflight';
import {
  collectPreservedArtifacts,
  collectPreservedTriggerDropRefs,
} from '@/commands/inspect/artifacts';
import type { IApplyCommandOptions } from '@/types/apply';
import type { IDatabaseConnection } from '@/types/database';
import { DatabaseConnectionError } from '@/utils/generatorErrors';
import { logError, logInfo, logWarn } from '@/utils/logger';

const ADVISORY_LOCK_K1 = 0x44445031;
const ADVISORY_LOCK_K2 = 0x4150504c;

function escapeIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function buildPruneStatements(
  schema: string,
  triggerRefs: Array<{ triggerName: string; eventObjectTable: string }>,
  artifacts: Awaited<ReturnType<typeof collectPreservedArtifacts>>
): string[] {
  const escSchema = escapeIdentifier(schema);
  const statements: string[] = [];

  for (const t of triggerRefs) {
    statements.push(
      `DROP TRIGGER IF EXISTS ${escapeIdentifier(t.triggerName)} ON ${escSchema}.${escapeIdentifier(t.eventObjectTable)}`
    );
  }

  for (const c of artifacts.droppedColumns) {
    statements.push(
      `ALTER TABLE ${escSchema}.${escapeIdentifier(c.tableName)} DROP COLUMN IF EXISTS ${escapeIdentifier(c.columnName)} CASCADE`
    );
  }

  for (const tbl of artifacts.tableNames) {
    statements.push(
      `DROP TABLE IF EXISTS ${escSchema}.${escapeIdentifier(tbl)} CASCADE`
    );
  }

  return statements;
}

/**
 * Connect, optionally lock, discover tombstones, then DROP matching objects only.
 * Does not touch migration history or migration files.
 */
export const runApplyPruneFlow = async (
  connectionConfig: IDatabaseConnection,
  options: IApplyCommandOptions
): Promise<void> => {
  console.log('DDP APPLY --prune');
  console.log(
    'This run only targets preserved rename tombstones (non-destructive sync policy):'
  );
  console.log('  • triggers named like *_old_<digits>  → DROP TRIGGER … ON …');
  console.log(
    '  • tables named like *_dropped_<digits>  → DROP TABLE … CASCADE'
  );
  console.log(
    '  • columns named like *_dropped_<digits>  → ALTER TABLE … DROP COLUMN … CASCADE'
  );
  console.log(
    'No migration files are loaded or applied. Use `ddp apply` without --prune for migrations.'
  );
  console.log('');

  const dryRun = options.dryRun === true;
  if (dryRun) {
    console.log(
      '🔍 DRY-RUN: objects are discovered via the database; DROP statements are printed only.'
    );
    console.log('');
  } else {
    logWarn(
      'Prune will execute DROP / DROP COLUMN for matching objects only. Confirm backups if unsure.'
    );
  }

  console.log('DDP APPLY --prune — validating database...');
  console.log(`Database: ${connectionConfig.database}`);
  console.log(`Schema: ${connectionConfig.schema ?? 'public'}`);
  console.log(`Host: ${connectionConfig.host}:${connectionConfig.port}`);
  console.log('');

  const ensureOpts: Parameters<typeof ensureTargetDatabase>[1] = {};
  if (options.nonInteractive !== undefined) {
    ensureOpts.nonInteractive = options.nonInteractive;
  }
  if (options.createDatabase !== undefined) {
    ensureOpts.createDatabase = options.createDatabase;
  }
  const dbOk = await ensureTargetDatabase(connectionConfig, ensureOpts);
  if (!dbOk) {
    process.exit(1);
  }

  const connectionTest = await testConnection(connectionConfig);
  if (!connectionTest.connected) {
    const error = new DatabaseConnectionError(
      `Database connection failed: ${connectionTest.error}`,
      { connectionConfig, testResult: connectionTest }
    );
    logError('Database connection failed', error);
    console.error('❌ Database connection failed');
    if (connectionTest.error) {
      console.error(`Error: ${connectionTest.error}`);
    }
    throw error;
  }

  console.log('✅ Database connection validated');
  console.log('');

  const schema = connectionConfig.schema ?? 'public';
  const client = new Client({
    connectionString: buildConnectionString(connectionConfig),
  });

  let lockHeld = false;

  try {
    await client.connect();
    logInfo('Prune: database client connected');

    await ensurePgSchemaExists(client, schema);

    if (schema !== 'public') {
      await client.query(`SET search_path TO ${escapeIdentifier(schema)}`);
    }

    if (!options.skipLock) {
      await client.query(`SELECT pg_advisory_lock($1::integer, $2::integer)`, [
        ADVISORY_LOCK_K1,
        ADVISORY_LOCK_K2,
      ]);
      lockHeld = true;
    }

    const [triggerRefs, artifacts] = await Promise.all([
      collectPreservedTriggerDropRefs(client, schema),
      collectPreservedArtifacts(client, schema),
    ]);

    const statements = buildPruneStatements(schema, triggerRefs, artifacts);

    if (statements.length === 0) {
      console.log('No preserved rename tombstones matched the prune patterns.');
      console.log('Nothing to do.');
      return;
    }

    console.log(`Found ${statements.length} prune statement(s):`);
    console.log('');

    if (dryRun) {
      for (const sql of statements) {
        console.log(`Would execute:\n  ${sql}\n`);
      }
      console.log('DRY-RUN complete — no changes were made.');
      return;
    }

    await client.query('BEGIN');
    try {
      for (const sql of statements) {
        logWarn(`Prune executing: ${sql}`);
        await client.query(sql);
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    }

    console.log('');
    console.log(
      `🎉 Prune finished successfully (${statements.length} statement(s)).`
    );
  } finally {
    if (lockHeld) {
      try {
        await client.query(
          `SELECT pg_advisory_unlock($1::integer, $2::integer)`,
          [ADVISORY_LOCK_K1, ADVISORY_LOCK_K2]
        );
      } catch {
        logWarn('Prune: failed to release advisory lock');
      }
    }
    await client.end();
    logInfo('Prune: database client disconnected');
  }
};
