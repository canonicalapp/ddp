/**
 * Execute pending migrations inside a transaction and roll back (no history writes).
 * Catches dependency errors (e.g. DROP FUNCTION blocked by triggers) before a real apply.
 */

import type { Client } from 'pg';
import type { SQLExecutor } from '@/commands/apply/executor';
import type { ILoadedFile } from '@/types/apply';
import { assertDestructiveMigrationsAllowed } from '@/commands/apply/destructiveGuard';

export interface IValidateRunOptions {
  acceptDestructive?: boolean;
  nonInteractive?: boolean;
}

export const validatePendingMigrations = async (
  client: Client,
  files: ILoadedFile[],
  executor: SQLExecutor,
  options: IValidateRunOptions
): Promise<void> => {
  if (files.length === 0) {
    console.log('✅ No pending migrations to validate');
    return;
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
  await assertDestructiveMigrationsAllowed(files, destructiveOpts);

  console.log(
    `🧪 Validating ${files.length} pending migration(s) (execute + ROLLBACK, no history)...`
  );
  console.log('');

  await client.query('BEGIN');

  try {
    for (const file of files) {
      console.log(`  ▶ ${file.migrationId}`);
      const result = await executor.execute(client, {
        sql: file.content,
        fileName: file.name,
        transactionMode: 'none',
        continueOnError: false,
      });

      if (!result.success) {
        throw new Error(
          result.errorMessage ??
            `Validation failed on ${file.migrationId}`
        );
      }
    }

    await client.query('ROLLBACK');
    console.log('');
    console.log(
      '✅ Validation passed — SQL executed successfully; all changes rolled back'
    );
  } catch (e) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw e;
  }
};
