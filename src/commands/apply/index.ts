/**
 * Apply Command Handler
 * Main entry point for applying SQL files to database
 */

import { resolve } from 'path';
import { buildConnectionString, testConnection } from '@/database/connection';
import {
  ensurePgSchemaExists,
  ensureTargetDatabase,
} from '@/commands/apply/databasePreflight';
import { FileLoader } from '@/commands/apply/fileLoader';
import { SQLExecutor } from '@/commands/apply/executor';
import { TransactionManager } from '@/commands/apply/transactionManager';
import { HistoryTracker } from '@/commands/apply/historyTracker';
import {
  executeFiles,
  type IExecuteFilesOptions,
} from '@/commands/apply/executionPipeline';
import {
  detectPendingBackfillMigrations,
  prepareFilesForBackfillExecution,
} from '@/commands/apply/backfillWorkflow';
import { performDryRun, reportResults } from '@/commands/apply/reporting';
import { validatePendingMigrations } from '@/commands/apply/validateRun';
import { runApplyPruneFlow } from '@/commands/apply/pruneRenamedArtifacts';
import type { IApplyCommandOptions, IFileLoadOptions } from '@/types/apply';
import type { IDatabaseConnection } from '@/types/database';
import { ValidationError } from '@/types/errors';
import { loadEnvFile } from '@/utils/envLoader';
import { resolvePgSchema } from '@/utils/pgSchema';
import { resolveDdpConfig, resolveDdpMigrationsDir } from '@/utils/ddpConfig';
import { DatabaseConnectionError } from '@/utils/generatorErrors';
import { logDebug, logError, logInfo, logWarn } from '@/utils/logger';
import { Client } from 'pg';

const ADVISORY_LOCK_K1 = 0x44445031;
const ADVISORY_LOCK_K2 = 0x4150504c;

/**
 * Main apply command handler
 */
export const applyCommand = async (options: IApplyCommandOptions) => {
  try {
    logInfo('Starting DDP apply command', {
      options: { ...options, password: '[REDACTED]' },
    });

    await loadEnvFile(true, options.env);

    const connectionConfig = buildConnectionConfig(options);

    if (options.prune === true) {
      if (options.withBackfill === true || options.force === true) {
        logWarn(
          'apply: --prune ignores --with-backfill and --force for this invocation'
        );
      }
      await runApplyPruneFlow(connectionConfig, options);
      return;
    }

    const migrationsFolder = await resolveApplyFolder(options);

    console.log(`📂 Migrations folder: ${migrationsFolder}`);
    console.log('');

    const fileLoader = new FileLoader();
    const loadOptions: IFileLoadOptions = {
      folder: migrationsFolder,
      withBackfill: options.withBackfill ?? false,
    };
    console.log('📂 Loading SQL migrations...');
    const files = await fileLoader.loadFiles(loadOptions);

    if (files.length === 0) {
      console.warn('⚠️  No SQL migrations found to apply');
      return;
    }

    console.log(`✅ Found ${files.length} migration(s)`);
    console.log('');

    if (options.dryRun) {
      console.log('🔍 DRY-RUN — no database connection, no changes');
      console.log('');
      await performDryRun(files);
      return;
    }

    if (options.validate && options.prune) {
      throw new ValidationError(
        'Use either --validate or --prune, not both.',
        'validate',
        {}
      );
    }

    console.log('DDP APPLY — validating database...');
    console.log(`Database: ${connectionConfig.database}`);
    console.log(`Schema: ${connectionConfig.schema}`);
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

    const resolvedCfg = await resolveDdpConfig();
    const enforceImmutability =
      resolvedCfg?.config.migrations?.enforceImmutability ?? true;

    const client = new Client({
      connectionString: buildConnectionString(connectionConfig),
    });

    let lockHeld = false;

    try {
      await client.connect();
      logInfo('Database client connected');

      await ensurePgSchemaExists(client, connectionConfig.schema ?? 'public');

      if (connectionConfig.schema && connectionConfig.schema !== 'public') {
        await client.query(
          `SET search_path TO ${escapeIdentifier(connectionConfig.schema)}`
        );
        logDebug('Search path set', { schema: connectionConfig.schema });
      }

      if (!options.skipLock) {
        await client.query(
          `SELECT pg_advisory_lock($1::integer, $2::integer)`,
          [ADVISORY_LOCK_K1, ADVISORY_LOCK_K2]
        );
        lockHeld = true;
      }

      const executor = new SQLExecutor();
      const transactionManager = new TransactionManager();
      const historyTracker = new HistoryTracker();

      if (!options.skipHistory) {
        console.log('📋 Migration history...');
        await historyTracker.ensureHistoryTable(client);
        console.log('✅ History table ready');
        console.log('');
      }

      if (options.validate) {
        const pending: typeof files = [];
        for (const file of files) {
          const decision = await historyTracker.getApplyDecision(
            client,
            file.migrationId,
            file.checksum,
            enforceImmutability
          );
          if (decision !== 'skip') {
            pending.push(file);
          }
        }

        const validateOpts: Parameters<typeof validatePendingMigrations>[3] =
          {};
        if (options.acceptDestructive !== undefined) {
          validateOpts.acceptDestructive = options.acceptDestructive;
        }
        if (options.nonInteractive !== undefined) {
          validateOpts.nonInteractive = options.nonInteractive;
        }

        await validatePendingMigrations(
          client,
          pending,
          executor,
          validateOpts
        );
        return;
      }

      const transactionMode = options.transactionMode ?? 'per-file';
      const continueOnError = options.continueOnError ?? false;
      const pendingBackfillMigrations = await detectPendingBackfillMigrations(
        files,
        historyTracker,
        client,
        options.skipHistory ?? false,
        enforceImmutability
      );

      console.log('🚀 Applying migrations...');
      console.log(`Transaction mode: ${transactionMode}`);
      console.log(`Continue on error: ${continueOnError}`);
      console.log(`Immutability: ${enforceImmutability}`);
      console.log('');

      if (pendingBackfillMigrations.length > 0) {
        console.log(
          '🧩 Detected migrations with backfill scaffolds (backfill.sql):'
        );
        pendingBackfillMigrations.forEach(item => {
          console.log(`   - ${item.migrationId}: ${item.backfillPath}`);
        });
        console.log('');
        console.log(
          '   Apply up.sql first, then complete backfill.sql before running constraints.sql.'
        );
        console.log('');

        if (!options.withBackfill && !options.acknowledgeBackfill) {
          console.log(
            'ℹ️ Continuing with up.sql only. Run backfill.sql manually, then re-run apply with --with-backfill to execute constraints.sql.'
          );
          console.log('');
        }
      }

      const execOpts: IExecuteFilesOptions = {
        transactionMode,
        continueOnError,
        skipHistory: options.skipHistory ?? false,
        enforceImmutability,
      };
      if (options.acceptDestructive !== undefined) {
        execOpts.acceptDestructive = options.acceptDestructive;
      }
      if (options.nonInteractive !== undefined) {
        execOpts.nonInteractive = options.nonInteractive;
      }

      const executionFiles = options.withBackfill
        ? await prepareFilesForBackfillExecution(files, client, {
            force: options.force ?? false,
          })
        : files;

      const results = await executeFiles(
        executionFiles,
        executor,
        transactionManager,
        historyTracker,
        client,
        execOpts
      );

      reportResults(results);

      const hasFailures = results.some(r => !r.success);
      if (hasFailures) {
        console.error('');
        console.error('❌ Some migrations failed');
        process.exit(1);
      }

      console.log('');
      console.log('🎉 All migrations applied successfully!');
      if (pendingBackfillMigrations.length > 0) {
        console.log('');
        console.log('📌 Manual backfill follow-up:');
        pendingBackfillMigrations.forEach(item => {
          console.log(`   - Review and run: ${item.backfillPath}`);
        });
      }
    } finally {
      if (lockHeld) {
        try {
          await client.query(
            `SELECT pg_advisory_unlock($1::integer, $2::integer)`,
            [ADVISORY_LOCK_K1, ADVISORY_LOCK_K2]
          );
        } catch {
          logWarn('Failed to release advisory lock');
        }
      }
      await client.end();
      logInfo('Database client disconnected');
    }
  } catch (error) {
    logError('DDP apply command failed', error as Error, {
      options: { ...options, password: '[REDACTED]' },
    });

    if (error instanceof ValidationError) {
      console.error('❌ Validation Error:', error.message);
    } else {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ DDP APPLY failed:', errorMessage);
    }

    process.exit(1);
  }
};

async function resolveApplyFolder(
  options: IApplyCommandOptions
): Promise<string> {
  if (options.folder) {
    return resolve(process.cwd(), options.folder);
  }

  try {
    return await resolveDdpMigrationsDir();
  } catch {
    throw new ValidationError(
      'Migrations folder not set. Use --folder <path> or run `ddp init` and keep paths.migrations in ddp.config.json.',
      'files',
      {}
    );
  }
}

function buildConnectionConfig(
  options: IApplyCommandOptions
): IDatabaseConnection {
  const database = options.database ?? process.env.DB_NAME;
  const username = options.username ?? process.env.DB_USER;
  const password = options.password ?? process.env.DB_PASSWORD;
  const schema = resolvePgSchema(options.schema, process.env.DB_SCHEMA);

  if (!database || !username || !password) {
    throw new ValidationError(
      'Database credentials are required',
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
}

function escapeIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}
