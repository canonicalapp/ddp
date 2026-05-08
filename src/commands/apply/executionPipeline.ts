import type { Client } from 'pg';
import { createProgress } from '@/utils/progress';
import { logError, logInfo, logWarn } from '@/utils/logger';
import { assertDestructiveMigrationsAllowed } from '@/commands/apply/destructiveGuard';
import type { SQLExecutor } from '@/commands/apply/executor';
import type { TransactionManager } from '@/commands/apply/transactionManager';
import type { HistoryTracker } from '@/commands/apply/historyTracker';
import type {
  IExecutionResult,
  ILoadedFile,
  TransactionMode,
} from '@/types/apply';

export interface IExecuteFilesOptions {
  transactionMode: TransactionMode;
  continueOnError: boolean;
  skipHistory: boolean;
  enforceImmutability: boolean;
  acceptDestructive?: boolean;
  nonInteractive?: boolean;
}

export const executeFiles = async (
  files: ILoadedFile[],
  executor: SQLExecutor,
  transactionManager: TransactionManager,
  historyTracker: HistoryTracker,
  client: Client,
  options: IExecuteFilesOptions
): Promise<IExecutionResult[]> => {
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
              throw new Error(result.errorMessage ?? 'Execution failed');
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
              throw new Error(result.errorMessage ?? 'Execution failed');
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
};
