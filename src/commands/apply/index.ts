/**
 * Apply Command Handler
 * Main entry point for applying SQL files to database
 */

import { resolve } from 'path';
import { buildConnectionString, testConnection } from '@/database/connection';
import { assertDestructiveMigrationsAllowed } from '@/commands/apply/destructiveGuard';
import {
  ensurePgSchemaExists,
  ensureTargetDatabase,
} from '@/commands/apply/databasePreflight';
import { FileLoader } from '@/commands/apply/fileLoader';
import { SQLExecutor } from '@/commands/apply/executor';
import { TransactionManager } from '@/commands/apply/transactionManager';
import { HistoryTracker } from '@/commands/apply/historyTracker';
import type {
  IApplyCommandOptions,
  ILoadedFile,
  IExecutionResult,
  TransactionMode,
  IFileLoadOptions,
} from '@/types/apply';
import type { IDatabaseConnection } from '@/types/database';
import { ValidationError } from '@/types/errors';
import { loadEnvFile } from '@/utils/envLoader';
import { resolvePgSchema } from '@/utils/pgSchema';
import { resolveDdpConfig, resolveDdpMigrationsDir } from '@/utils/ddpConfig';
import { DatabaseConnectionError } from '@/utils/generatorErrors';
import { logDebug, logError, logInfo, logWarn } from '@/utils/logger';
import { createProgress } from '@/utils/progress';
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

    await loadEnvFile(true);

    const connectionConfig = buildConnectionConfig(options);
    const migrationsFolder = await resolveApplyFolder(options);

    console.log(`📂 Migrations folder: ${migrationsFolder}`);
    console.log('');

    const fileLoader = new FileLoader();
    const loadOptions: IFileLoadOptions = { folder: migrationsFolder };
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

      const transactionMode: TransactionMode =
        options.transactionMode || 'per-file';
      const continueOnError = options.continueOnError || false;

      console.log('🚀 Applying migrations...');
      console.log(`Transaction mode: ${transactionMode}`);
      console.log(`Continue on error: ${continueOnError}`);
      console.log(`Immutability: ${enforceImmutability}`);
      console.log('');

      const execOpts: Parameters<typeof executeFiles>[5] = {
        transactionMode,
        continueOnError,
        skipHistory: options.skipHistory || false,
        enforceImmutability,
      };
      if (options.acceptDestructive !== undefined) {
        execOpts.acceptDestructive = options.acceptDestructive;
      }
      if (options.nonInteractive !== undefined) {
        execOpts.nonInteractive = options.nonInteractive;
      }

      const results = await executeFiles(
        files,
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

async function performDryRun(files: ILoadedFile[]): Promise<void> {
  console.log('Migrations that would run (in order):');
  console.log('');

  for (const file of files) {
    console.log(`📄 ${file.migrationId}`);
    console.log(`   Path: ${file.path}`);
    console.log(`   Checksum: ${file.checksum.substring(0, 16)}...`);
    console.log(`   Size: ${file.content.length} bytes`);
    console.log('');
  }

  console.log('✅ Dry-run completed — no database changes');
}

async function executeFiles(
  files: ILoadedFile[],
  executor: SQLExecutor,
  transactionManager: TransactionManager,
  historyTracker: HistoryTracker,
  client: Client,
  options: {
    transactionMode: TransactionMode;
    continueOnError: boolean;
    skipHistory: boolean;
    enforceImmutability: boolean;
    acceptDestructive?: boolean;
    nonInteractive?: boolean;
  }
): Promise<IExecutionResult[]> {
  const results: IExecutionResult[] = [];
  const progress = createProgress({
    total: files.length,
    title: 'Applying migrations',
    showPercentage: true,
    showTime: true,
  });

  const filesToApply: ILoadedFile[] = [];

  if (!options.skipHistory) {
    for (const file of files) {
      const decision = await historyTracker.getApplyDecision(
        client,
        file.migrationId,
        file.checksum,
        options.enforceImmutability
      );

      if (decision === 'skip') {
        logInfo('Skipping already applied migration', {
          migrationId: file.migrationId,
        });
        console.log(`⏭️  Skipping ${file.migrationId} (already applied)`);
        results.push({
          success: true,
          fileName: file.name,
          statementsExecuted: 0,
          executionTime: 0,
        });
        progress.update();
      } else {
        filesToApply.push(file);
      }
    }
  } else {
    filesToApply.push(...files);
  }

  const destructiveOpts: Parameters<
    typeof assertDestructiveMigrationsAllowed
  >[1] = {};
  if (options.acceptDestructive !== undefined) {
    destructiveOpts.acceptDestructive = options.acceptDestructive;
  }
  if (options.nonInteractive !== undefined) {
    destructiveOpts.nonInteractive = options.nonInteractive;
  }
  await assertDestructiveMigrationsAllowed(filesToApply, destructiveOpts);

  const recordPayload = (file: ILoadedFile, result: IExecutionResult) => ({
    migration_id: file.migrationId,
    file_name: file.name,
    file_path: file.path,
    checksum: file.checksum,
    execution_time_ms: result.executionTime,
    success: result.success,
    error_message: result.errorMessage ?? null,
  });

  if (options.transactionMode === 'all-or-nothing') {
    try {
      await transactionManager.executeInTransaction(client, {
        mode: options.transactionMode,
        operations: async () => {
          for (const file of filesToApply) {
            const result = await executor.execute(client, {
              sql: file.content,
              fileName: file.name,
              transactionMode: 'none',
              continueOnError: options.continueOnError,
            });

            results.push(result);

            if (!options.skipHistory && result.success) {
              await historyTracker.recordMigration(
                client,
                recordPayload(file, result)
              );
            }

            progress.update();

            if (!result.success && !options.continueOnError) {
              throw new Error(result.errorMessage || 'Execution failed');
            }
          }
        },
      });
    } catch (error) {
      logError('All-or-nothing transaction failed', error as Error);
      throw error;
    }
  } else {
    for (const file of filesToApply) {
      try {
        await transactionManager.executeInTransaction(client, {
          mode: options.transactionMode,
          operations: async () => {
            const result = await executor.execute(client, {
              sql: file.content,
              fileName: file.name,
              transactionMode: options.transactionMode,
              continueOnError: options.continueOnError,
            });

            results.push(result);

            if (!options.skipHistory && result.success) {
              await historyTracker.recordMigration(
                client,
                recordPayload(file, result)
              );
            }

            if (!result.success && !options.continueOnError) {
              throw new Error(result.errorMessage || 'Execution failed');
            }
          },
        });

        progress.update();
      } catch (error) {
        logError('Migration execution failed', error as Error, {
          fileName: file.name,
        });

        const errorResult: IExecutionResult = {
          success: false,
          fileName: file.name,
          statementsExecuted: 0,
          executionTime: 0,
          error: error as Error,
          errorMessage: (error as Error).message,
        };

        results.push(errorResult);

        if (!options.skipHistory) {
          try {
            await historyTracker.recordMigration(client, {
              migration_id: file.migrationId,
              file_name: file.name,
              file_path: file.path,
              checksum: file.checksum,
              execution_time_ms: 0,
              success: false,
              error_message: (error as Error).message,
            });
          } catch (historyError) {
            logWarn('Failed to record failure in history', {
              error: (historyError as Error).message,
            });
          }
        }

        if (!options.continueOnError) {
          throw error;
        }

        progress.update();
      }
    }
  }

  progress.complete();
  return results;
}

function reportResults(results: IExecutionResult[]): void {
  console.log('');
  console.log('📊 Execution summary:');
  console.log('');

  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  const totalStatements = results.reduce(
    (sum, r) => sum + r.statementsExecuted,
    0
  );
  const totalTime = results.reduce((sum, r) => sum + r.executionTime, 0);

  console.log(`✅ Successful: ${successful}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📝 Total statements: ${totalStatements}`);
  console.log(`⏱️  Total time: ${totalTime}ms`);
  console.log('');

  if (failed > 0) {
    console.log('Failed migrations:');
    for (const result of results) {
      if (!result.success) {
        console.log(`  ❌ ${result.fileName}`);
        if (result.errorMessage) {
          console.log(`     Error: ${result.errorMessage}`);
        }
      }
    }
    console.log('');
  }
}
