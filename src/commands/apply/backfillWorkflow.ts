import { dirname, join } from 'path';
import { readFile, stat } from 'fs/promises';
import type { Client } from 'pg';
import { ValidationError } from '@/types/errors';
import type { ILoadedFile } from '@/types/apply';
import type { HistoryTracker } from '@/commands/apply/historyTracker';
import { splitSqlStatements } from '@/utils/splitSqlStatements';

export interface IPendingBackfillMigration {
  migrationId: string;
  backfillPath: string;
}

export const detectPendingBackfillMigrations = async (
  files: ILoadedFile[],
  historyTracker: HistoryTracker,
  client: Client,
  skipHistory: boolean,
  enforceImmutability: boolean
): Promise<IPendingBackfillMigration[]> => {
  const pending: IPendingBackfillMigration[] = [];

  for (const file of files) {
    if (file.phase === 'constraints') {
      continue;
    }

    if (!skipHistory) {
      const decision = await historyTracker.getApplyDecision(
        client,
        file.migrationId,
        file.checksum,
        enforceImmutability
      );
      if (decision === 'skip') {
        continue;
      }
    }

    const migrationDir = dirname(file.path);
    const backfillPath = join(migrationDir, 'backfill.sql');
    const exists = await stat(backfillPath)
      .then(s => s.isFile())
      .catch(() => false);
    if (exists) {
      pending.push({
        migrationId: file.baseMigrationId,
        backfillPath,
      });
    }
  }

  return pending;
};

export const filterFilesByBackfillVerify = async (
  files: ILoadedFile[],
  client: Client
): Promise<ILoadedFile[]> => {
  const executionFiles: ILoadedFile[] = [];

  for (const file of files) {
    if (file.phase !== 'constraints') {
      executionFiles.push(file);
      continue;
    }

    if (!file.verifyPath) {
      throw new ValidationError(
        `Missing verify file for ${file.baseMigrationId}.`,
        'backfill',
        { migrationId: file.baseMigrationId }
      );
    }

    const verifySql = await readFile(file.verifyPath, 'utf8');
    const verifyStatements = splitSqlStatements(verifySql);
    if (verifyStatements.length === 0) {
      throw new ValidationError(
        `Empty verify file for ${file.baseMigrationId}.`,
        'backfill',
        { migrationId: file.baseMigrationId, verifyPath: file.verifyPath }
      );
    }

    for (const statement of verifyStatements) {
      const result = await client.query(statement);
      const row = result.rows[0];
      const firstValue = row ? Object.values(row)[0] : null;
      const numericResult = Number(firstValue);

      if (!Number.isFinite(numericResult) || numericResult !== 0) {
        throw new ValidationError(
          `Verify checks failed for ${file.baseMigrationId}. Resolve NULLs before running constraints.`,
          'backfill',
          {
            migrationId: file.baseMigrationId,
            verifyStatement: statement,
            verifyResult: row ?? null,
          }
        );
      }
    }

    executionFiles.push(file);
  }

  return executionFiles;
};
