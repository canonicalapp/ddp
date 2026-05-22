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

interface IVerifyFailure {
  statement: string;
  result: unknown;
}

interface IVerifyRunResult {
  success: boolean;
  failures: IVerifyFailure[];
}

interface IPrepareBackfillExecutionOptions {
  force?: boolean;
}

const runVerifyChecks = async (
  migrationId: string,
  verifyPath: string,
  client: Client
): Promise<IVerifyRunResult> => {
  const verifySql = await readFile(verifyPath, 'utf8');
  const verifyStatements = splitSqlStatements(verifySql);
  if (verifyStatements.length === 0) {
    throw new ValidationError(
      `Empty verify file for ${migrationId}.`,
      'backfill',
      { migrationId, verifyPath }
    );
  }

  const failures: IVerifyFailure[] = [];
  for (const statement of verifyStatements) {
    const result = await client.query(statement);
    const row = result.rows[0];
    const firstValue = row ? Object.values(row)[0] : null;
    const numericResult = Number(firstValue);
    if (!Number.isFinite(numericResult) || numericResult !== 0) {
      failures.push({
        statement,
        result: row ?? null,
      });
    }
  }

  return {
    success: failures.length === 0,
    failures,
  };
};

const loadBackfillStatements = async (
  migrationFile: ILoadedFile
): Promise<{
  backfillPath: string;
  statements: string[];
}> => {
  const migrationDir = dirname(migrationFile.path);
  const backfillPath = join(migrationDir, 'backfill.sql');
  const backfillExists = await stat(backfillPath)
    .then(s => s.isFile())
    .catch(() => false);
  if (!backfillExists) {
    throw new ValidationError(
      `Missing backfill.sql for ${migrationFile.baseMigrationId}.`,
      'backfill',
      { migrationId: migrationFile.baseMigrationId, backfillPath }
    );
  }

  const backfillSql = await readFile(backfillPath, 'utf8');
  const statements = splitSqlStatements(backfillSql);
  return {
    backfillPath,
    statements,
  };
};

export const prepareFilesForBackfillExecution = async (
  files: ILoadedFile[],
  client: Client,
  options?: IPrepareBackfillExecutionOptions
): Promise<ILoadedFile[]> => {
  const executionFiles: ILoadedFile[] = [];
  const force = options?.force ?? false;

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

    console.log(`🔎 Verifying backfill status for ${file.baseMigrationId}...`);
    const initialVerify = await runVerifyChecks(
      file.baseMigrationId,
      file.verifyPath,
      client
    );
    if (initialVerify.success) {
      console.log(
        `✅ Verify passed for ${file.baseMigrationId}; backfill not required.`
      );
      executionFiles.push(file);
      continue;
    }
    console.log(
      `⚠️ Verify failed for ${file.baseMigrationId}; backfill is required before constraints.`
    );

    const { backfillPath, statements: backfillStatements } =
      await loadBackfillStatements(file);

    if (backfillStatements.length === 0) {
      if (force) {
        console.warn(
          `⚠️ Verify failed for ${file.baseMigrationId}, but --force is enabled. Applying constraints without backfill execution.`
        );
        executionFiles.push(file);
        continue;
      }
      throw new ValidationError(
        `Backfill not implemented for ${file.baseMigrationId}. Complete ${backfillPath} and retry with --with-backfill.`,
        'backfill',
        {
          migrationId: file.baseMigrationId,
          backfillPath,
          verifyFailures: initialVerify.failures,
        }
      );
    }

    console.log(`🛠️ Running backfill.sql for ${file.baseMigrationId}...`);
    for (const statement of backfillStatements) {
      await client.query(statement);
    }
    console.log(`✅ Backfill applied for ${file.baseMigrationId}.`);

    console.log(`🔎 Re-running verify for ${file.baseMigrationId}...`);
    const verifyAfterBackfill = await runVerifyChecks(
      file.baseMigrationId,
      file.verifyPath,
      client
    );
    if (!verifyAfterBackfill.success) {
      if (force) {
        console.warn(
          `⚠️ Verify still failing for ${file.baseMigrationId}, but --force is enabled. Applying constraints anyway.`
        );
        executionFiles.push(file);
        continue;
      }
      throw new ValidationError(
        `Verify checks failed for ${file.baseMigrationId} after backfill. Resolve remaining NULLs before running constraints.`,
        'backfill',
        {
          migrationId: file.baseMigrationId,
          verifyFailures: verifyAfterBackfill.failures,
        }
      );
    }

    console.log(`✅ Backfill verify passed for ${file.baseMigrationId}.`);
    executionFiles.push(file);
  }

  return executionFiles;
};
