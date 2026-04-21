/**
 * Apply ordered state SQL to a shadow database; collect all errors; COMMIT only if none.
 */

import { readFile } from 'fs/promises';
import type { Client } from 'pg';
import { splitSqlStatements } from '@/utils/splitSqlStatements';
import type { IStateApplyFile } from '@/migrate/assembleStateApplyPlan';

export interface IShadowApplyError {
  file: string;
  message: string;
  code?: string;
  possiblyCascading: boolean;
}

export interface IShadowApplyResult {
  success: boolean;
  errors: IShadowApplyError[];
}

const cascadingHint = (message: string): boolean => {
  const u = message.toUpperCase();
  return (
    u.includes('DOES NOT EXIST') ||
    u.includes('UNDEFINED_TABLE') ||
    u.includes('UNDEFINED_OBJECT') ||
    (u.includes('RELATION') && u.includes('DOES NOT EXIST'))
  );
};

const escapeIdent = (identifier: string): string =>
  `"${identifier.replace(/"/g, '""')}"`;

/**
 * Drop and recreate a non-public schema so each diff starts from a clean catalog.
 * Used when shadow and target share one database (different schema names).
 */
export const resetShadowSchema = async (
  client: Client,
  schema: string
): Promise<void> => {
  if (!schema || schema === 'public') {
    throw new Error(
      'resetShadowSchema requires a dedicated shadow schema name (not public)'
    );
  }
  const esc = escapeIdent(schema);
  await client.query(`DROP SCHEMA IF EXISTS ${esc} CASCADE`);
  await client.query(`CREATE SCHEMA ${esc}`);
};

/**
 * Per-file SAVEPOINT: try each file; on failure roll back that file only and record.
 * If any failures: ROLLBACK entire transaction (shadow unchanged). Else COMMIT.
 */
export const applyStateFilesToShadowWithAggregateErrors = async (
  client: Client,
  files: IStateApplyFile[],
  options: { schema: string }
): Promise<IShadowApplyResult> => {
  const errors: IShadowApplyError[] = [];

  if (options.schema && options.schema !== 'public') {
    await client.query(
      `CREATE SCHEMA IF NOT EXISTS ${escapeIdent(options.schema)}`
    );
    await client.query(`SET search_path TO ${escapeIdent(options.schema)}`);
  }

  await client.query('BEGIN');

  for (let i = 0; i < files.length; i++) {
    const file = files[i]!;
    const sp = `ddp_sh_${i}`;
    await client.query(`SAVEPOINT ${sp}`);

    try {
      const sql = await readFile(file.absolutePath, 'utf8');
      const statements = splitSqlStatements(sql.trim());

      for (const stmt of statements) {
        const t = stmt.trim();
        if (t.length === 0) {
          continue;
        }
        await client.query(stmt);
      }

      await client.query(`RELEASE SAVEPOINT ${sp}`);
    } catch (e) {
      await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
      const err = e as Error & { code?: string };
      const message = err instanceof Error ? err.message : String(e);
      const code = typeof err.code === 'string' ? err.code : undefined;
      const entry: IShadowApplyError = {
        file: file.displayPath,
        message,
        possiblyCascading: cascadingHint(message),
      };
      if (code !== undefined) {
        entry.code = code;
      }
      errors.push(entry);
    }
  }

  if (errors.length > 0) {
    await client.query('ROLLBACK');
    return { success: false, errors };
  }

  await client.query('COMMIT');
  return { success: true, errors: [] };
};
