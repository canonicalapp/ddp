/**
 * Apply ordered state SQL to a shadow database; collect all errors; COMMIT only if none.
 */

import { readFile } from 'fs/promises';
import type { Client } from 'pg';
import { splitSqlStatements } from '@/utils/splitSqlStatements';
import type { IStateApplyFile } from '@/types/apply';
import {
  resolveStateApplySearchPath,
  type TShadowCatalogLayout,
} from '@/commands/migrate/stateApplyRouting';

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

export interface IShadowApplyOptions {
  /** Schema for tables/enums/indexes (and all objects when same-database layout). */
  shadowSchema: string;
  /** Production catalog schema (from env / DB_SCHEMA). */
  targetSchema: string;
  layout: TShadowCatalogLayout;
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

const ensureSchemaExists = async (
  client: Client,
  schema: string
): Promise<void> => {
  if (!schema) {
    return;
  }
  await client.query(`CREATE SCHEMA IF NOT EXISTS ${escapeIdent(schema)}`);
};

/**
 * Per-file SAVEPOINT: try each file; on failure roll back that file only and record.
 * If any failures: ROLLBACK entire transaction (shadow unchanged). Else COMMIT.
 *
 * Layout:
 * - separate-database: schema → shadowSchema; procs/triggers → targetSchema (production shape).
 * - same-database: everything → shadowSchema only (does not mutate target during diff).
 */
export const applyStateFilesToShadowWithAggregateErrors = async (
  client: Client,
  files: IStateApplyFile[],
  options: IShadowApplyOptions
): Promise<IShadowApplyResult> => {
  const errors: IShadowApplyError[] = [];
  const sqlByPath = new Map<string, string>();

  for (const file of files) {
    sqlByPath.set(file.absolutePath, await readFile(file.absolutePath, 'utf8'));
  }

  await ensureSchemaExists(client, options.shadowSchema);
  if (options.layout === 'separate-database') {
    await ensureSchemaExists(client, options.targetSchema);
  }

  await client.query('BEGIN');

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (!file) {
      continue;
    }
    const sp = `ddp_sh_${i}`;
    await client.query(`SAVEPOINT ${sp}`);

    try {
      const searchPath = resolveStateApplySearchPath(
        file.displayPath,
        options.layout,
        {
          shadowSchema: options.shadowSchema,
          targetSchema: options.targetSchema,
        }
      );
      await client.query(`SET search_path TO ${escapeIdent(searchPath)}`);

      const sql = sqlByPath.get(file.absolutePath) ?? '';
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
