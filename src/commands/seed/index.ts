/**
 * Seed command — run flat *.sql files in the seeds directory (no history tracking).
 */

import { createHash } from 'crypto';
import { readFile, readdir } from 'fs/promises';
import { basename, join, resolve } from 'path';
import { Client } from 'pg';
import { assertDestructiveMigrationsAllowed } from '@/commands/apply/destructiveGuard';
import {
  ensurePgSchemaExists,
  ensureTargetDatabase,
} from '@/commands/apply/databasePreflight';
import { SQLExecutor } from '@/commands/apply/executor';
import { TransactionManager } from '@/commands/apply/transactionManager';
import { buildConnectionString, testConnection } from '@/database/connection';
import type {
  ILoadedFile,
  IExecutionResult,
  TransactionMode,
} from '@/types/apply';
import type { ISeedCommandOptions } from '@/types/cli';
import type { IDatabaseConnection } from '@/types/database';
import { ValidationError } from '@/types/errors';
import { resolveDdpSeedsDir } from '@/utils/ddpConfig';
import { loadEnvFile } from '@/utils/envLoader';
import { DatabaseConnectionError } from '@/utils/generatorErrors';
import { logError, logInfo, logWarn } from '@/utils/logger';
import { resolvePgSchema } from '@/utils/pgSchema';

/** Distinct from apply advisory lock so migrate + seed do not block each other. */
const ADVISORY_LOCK_K1 = 0x44445033;
const ADVISORY_LOCK_K2 = 0x53494544;

function escapeIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function buildConnectionConfig(
  options: ISeedCommandOptions
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
    port: parseInt(options.port ?? process.env.DB_PORT ?? '5432', 10),
    database,
    username,
    password,
    schema,
  };
}

async function resolveSeedFolder(
  options: ISeedCommandOptions
): Promise<string> {
  if (options.folder) {
    return resolve(process.cwd(), options.folder);
  }
  try {
    return await resolveDdpSeedsDir();
  } catch {
    throw new ValidationError(
      'Seeds folder not set. Use --folder <path> or run `ddp init` and keep paths.seeds in ddp.config.json.',
      'files',
      {}
    );
  }
}

async function loadSeedSqlFiles(seedsDir: string): Promise<ILoadedFile[]> {
  const entries = await readdir(seedsDir, { withFileTypes: true });
  const sqlNames = entries
    .filter(e => e.isFile() && e.name.toLowerCase().endsWith('.sql'))
    .map(e => e.name)
    .sort((a, b) => a.localeCompare(b));

  if (sqlNames.length === 0) {
    throw new Error(
      `No seed SQL files found in "${seedsDir}". Add one or more .sql files, or use --folder to point elsewhere.`
    );
  }

  const files: ILoadedFile[] = [];
  let order = 0;
  for (const name of sqlNames) {
    const filePath = join(seedsDir, name);
    const content = await readFile(filePath, 'utf8');
    const checksum = createHash('sha256').update(content).digest('hex');
    const stem = basename(name, '.sql');
    files.push({
      migrationId: stem,
      name,
      path: filePath,
      content,
      checksum,
      order: order++,
      type: 'unknown',
    });
  }
  return files;
}

export const seedCommand = async (options: ISeedCommandOptions) => {
  try {
    logInfo('Starting DDP seed command', {
      options: { ...options, password: '[REDACTED]' },
    });

    await loadEnvFile(true);

    const connectionConfig = buildConnectionConfig(options);
    const seedsFolder = await resolveSeedFolder(options);

    console.log(`📂 Seeds folder: ${seedsFolder}`);
    console.log('');

    const files = await loadSeedSqlFiles(seedsFolder);
    console.log(`✅ Found ${files.length} seed file(s)`);
    for (const f of files) {
      console.log(`   • ${f.name}`);
    }
    console.log('');

    console.log('DDP SEED — validating database...');
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
      const err = new DatabaseConnectionError(
        `Database connection failed: ${connectionTest.error}`,
        { connectionConfig, testResult: connectionTest }
      );
      logError('Database connection failed', err);
      console.error('❌ Database connection failed');
      if (connectionTest.error) {
        console.error(`Error: ${connectionTest.error}`);
      }
      throw err;
    }

    console.log('✅ Database connection validated');
    console.log('');

    const destructiveOpts: Parameters<
      typeof assertDestructiveMigrationsAllowed
    >[1] = {};
    if (options.acceptDestructive !== undefined) {
      destructiveOpts.acceptDestructive = options.acceptDestructive;
    }
    if (options.nonInteractive !== undefined) {
      destructiveOpts.nonInteractive = options.nonInteractive;
    }
    await assertDestructiveMigrationsAllowed(files, destructiveOpts);

    const client = new Client({
      connectionString: buildConnectionString(connectionConfig),
    });

    let lockHeld = false;
    const transactionMode: TransactionMode =
      options.transactionMode ?? 'per-file';
    const continueOnError = options.continueOnError ?? false;

    try {
      await client.connect();
      logInfo('Database client connected');

      await ensurePgSchemaExists(client, connectionConfig.schema ?? 'public');

      if (connectionConfig.schema && connectionConfig.schema !== 'public') {
        await client.query(
          `SET search_path TO ${escapeIdentifier(connectionConfig.schema)}`
        );
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
      const results: IExecutionResult[] = [];

      console.log('🌱 Running seed SQL...');
      console.log(`Transaction mode: ${transactionMode}`);
      console.log(`Continue on error: ${continueOnError}`);
      console.log('');

      if (transactionMode === 'all-or-nothing') {
        try {
          await transactionManager.executeInTransaction(client, {
            mode: 'all-or-nothing',
            operations: async () => {
              for (const file of files) {
                const result = await executor.execute(client, {
                  sql: file.content,
                  fileName: file.name,
                  transactionMode: 'none',
                  continueOnError,
                });
                results.push(result);
                if (!result.success && !continueOnError) {
                  throw new Error(result.errorMessage || 'Execution failed');
                }
              }
            },
          });
        } catch (error) {
          logError('All-or-nothing seed transaction failed', error as Error);
          throw error;
        }
      } else {
        for (const file of files) {
          try {
            await transactionManager.executeInTransaction(client, {
              mode: transactionMode,
              operations: async () => {
                const result = await executor.execute(client, {
                  sql: file.content,
                  fileName: file.name,
                  transactionMode,
                  continueOnError,
                });
                results.push(result);
                if (!result.success && !continueOnError) {
                  throw new Error(result.errorMessage || 'Execution failed');
                }
              },
            });
          } catch (error) {
            logError('Seed file execution failed', error as Error, {
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
            if (!continueOnError) {
              throw error;
            }
          }
        }
      }

      reportSeedResults(results);
      const hasFailures = results.some(r => !r.success);
      if (hasFailures) {
        console.error('');
        console.error('❌ One or more seed files failed');
        process.exit(1);
      }

      console.log('');
      console.log('🎉 All seed SQL executed successfully.');
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
    logError('DDP seed command failed', error as Error, {
      options: { ...options, password: '[REDACTED]' },
    });

    if (error instanceof ValidationError) {
      console.error('❌ Validation Error:', error.message);
    } else {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      console.error('❌ DDP SEED failed:', errorMessage);
    }

    process.exit(1);
  }
};

function reportSeedResults(results: IExecutionResult[]): void {
  console.log('');
  console.log('📊 Seed summary:');
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  const totalStatements = results.reduce(
    (sum, r) => sum + r.statementsExecuted,
    0
  );
  console.log(`✅ Successful files: ${successful}`);
  console.log(`❌ Failed files: ${failed}`);
  console.log(`📝 Statements executed: ${totalStatements}`);
  console.log('');
  if (failed > 0) {
    for (const r of results) {
      if (!r.success) {
        console.error(`  ❌ ${r.fileName}`);
        if (r.errorMessage) {
          console.error(`     ${r.errorMessage}`);
        }
      }
    }
  }
}
