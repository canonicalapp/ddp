/**
 * Prisma-style: materialize repo state on shadow catalog, introspect diff vs target, emit SQL.
 * Default: same database as target, dedicated shadow schema (DDP_SHADOW_SCHEMA or ddp_shadow).
 * Optional: separate disposable DB via --shadow-url / DDP_SHADOW_DATABASE_URL.
 */

import { Client } from 'pg';
import { createInterface } from 'readline';
import { buildConnectionString } from '@/database/connection';
import {
  ensurePgSchemaExists,
  ensureTargetDatabase,
} from '@/commands/apply/databasePreflight';
import { assembleStateApplyPlan } from '@/migrate/assembleStateApplyPlan';
import {
  applyStateFilesToShadowWithAggregateErrors,
  resetShadowSchema,
} from '@/migrate/shadowApply';
import { SchemaSyncOrchestrator } from '@/sync/orchestrator';
import type { IMigrateDiffCommandOptions } from '@/types/cli';
import type { IDatabaseConnection } from '@/types/database';
import { ValidationError } from '@/types/errors';
import { loadEnvFile } from '@/utils/envLoader';
import { resolvePgSchema } from '@/utils/pgSchema';
import { logError, logInfo } from '@/utils/logger';
import { migrationWriteFromDiff, sanitizeMigrationSlug } from './persist';

const DEFAULT_SAME_DB_SHADOW_SCHEMA = 'ddp_shadow';

const promptLine = (question: string): Promise<string> =>
  new Promise(resolve => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });

/**
 * With `--write`, require an explicit slug (non-interactive / no TTY) or prompt interactively.
 */
const resolveMigrationSlugForWrite = async (
  options: IMigrateDiffCommandOptions
): Promise<string> => {
  const fromFlag = options.migrationName?.trim();
  if (fromFlag) {
    return sanitizeMigrationSlug(fromFlag);
  }

  if (options.nonInteractive === true) {
    throw new ValidationError(
      'When using --write with --non-interactive, pass --migration-name <slug>.',
      'migrationName',
      {}
    );
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new ValidationError(
      'When using --write without --migration-name, run in a terminal or pass --migration-name <slug>.',
      'migrationName',
      {}
    );
  }

  for (;;) {
    const line = await promptLine(
      'Migration name (slug, e.g. add_orders_table): '
    );
    try {
      return sanitizeMigrationSlug(line);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(msg);
    }
  }
};

const MIGRATE_DIFF_CLI_KEYS = [
  'env',
  'shadowUrl',
  'shadowSchema',
  'host',
  'port',
  'database',
  'username',
  'password',
  'schema',
  'write',
  'migrationName',
  'nonInteractive',
  'createDatabase',
] as const satisfies ReadonlyArray<keyof IMigrateDiffCommandOptions>;

/** Pick only defined Commander options into `IMigrateDiffCommandOptions`. */
export const migrateDiffOptionsFromCommander = (
  opts: Partial<IMigrateDiffCommandOptions>
): IMigrateDiffCommandOptions => {
  const payload: IMigrateDiffCommandOptions = {};
  for (const key of MIGRATE_DIFF_CLI_KEYS) {
    const v = opts[key];
    if (v !== undefined) {
      (payload as Record<string, unknown>)[key] = v;
    }
  }
  return payload;
};

const buildTargetConfig = (
  options: IMigrateDiffCommandOptions
): IDatabaseConnection => {
  const database = options.database ?? process.env.DB_NAME;
  const username = options.username ?? process.env.DB_USER;
  const password = options.password ?? process.env.DB_PASSWORD;
  const schema = resolvePgSchema(options.schema, process.env.DB_SCHEMA);

  if (!database || !username || !password) {
    throw new ValidationError(
      'Target database credentials required (DB_NAME, DB_USER, DB_PASSWORD or CLI flags).',
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
};

/**
 * Schema name that holds materialized state for diff: on a separate shadow DB this matches
 * the target schema; on the same database it must be a different non-public schema.
 */
const resolveShadowCatalogSchema = (
  options: IMigrateDiffCommandOptions,
  targetSchema: string,
  usesSeparateShadowDb: boolean
): string => {
  if (usesSeparateShadowDb) {
    return targetSchema;
  }

  const fromCli = options.shadowSchema?.trim();
  const fromEnv = process.env.DDP_SHADOW_SCHEMA?.trim();
  const name =
    fromCli && fromCli.length > 0
      ? fromCli
      : fromEnv && fromEnv.length > 0
        ? fromEnv
        : DEFAULT_SAME_DB_SHADOW_SCHEMA;

  if (name === 'public') {
    throw new ValidationError(
      'Same-database shadow mode needs a non-public shadow schema. Set DDP_SHADOW_SCHEMA or --shadow-schema (default: ddp_shadow).',
      'shadowSchema',
      {}
    );
  }

  if (name === targetSchema) {
    throw new ValidationError(
      `Shadow schema "${name}" must differ from target schema "${targetSchema}" on the same database. Change DDP_SHADOW_SCHEMA / --shadow-schema, or use a separate shadow database (DDP_SHADOW_DATABASE_URL / --shadow-url).`,
      'shadowSchema',
      { shadowSchema: name, targetSchema }
    );
  }

  return name;
};

export const migrateDiffCommand = async (
  options: IMigrateDiffCommandOptions
): Promise<void> => {
  try {
    await loadEnvFile(true);

    const targetConfig = buildTargetConfig(options);
    const targetSchema = resolvePgSchema(
      targetConfig.schema,
      process.env.DB_SCHEMA
    );

    const ensureOpts: Parameters<typeof ensureTargetDatabase>[1] = {};
    if (options.nonInteractive !== undefined) {
      ensureOpts.nonInteractive = options.nonInteractive;
    }
    if (options.createDatabase !== undefined) {
      ensureOpts.createDatabase = options.createDatabase;
    }
    const dbOk = await ensureTargetDatabase(targetConfig, ensureOpts);
    if (!dbOk) {
      process.exit(1);
    }

    const explicitShadowUrl = (
      options.shadowUrl ??
      process.env.DDP_SHADOW_DATABASE_URL ??
      ''
    ).trim();
    const usesSeparateShadowDb = explicitShadowUrl.length > 0;

    const shadowConnectionString = usesSeparateShadowDb
      ? explicitShadowUrl
      : buildConnectionString(targetConfig);

    const shadowCatalogSchema = resolveShadowCatalogSchema(
      options,
      targetSchema,
      usesSeparateShadowDb
    );

    logInfo('migrate diff: assembling state files');
    const files = await assembleStateApplyPlan();

    const shadowClient = new Client({
      connectionString: shadowConnectionString,
    });
    await shadowClient.connect();

    try {
      if (!usesSeparateShadowDb) {
        logInfo('migrate diff: resetting shadow schema (same DB)', {
          shadowSchema: shadowCatalogSchema,
        });
        await resetShadowSchema(shadowClient, shadowCatalogSchema);
      }

      logInfo('migrate diff: applying state to shadow', {
        fileCount: files.length,
        shadowSchema: shadowCatalogSchema,
        targetSchema,
        separateShadowDb: usesSeparateShadowDb,
      });
      const shadowResult = await applyStateFilesToShadowWithAggregateErrors(
        shadowClient,
        files,
        { schema: shadowCatalogSchema }
      );

      if (!shadowResult.success) {
        console.error('');
        console.error(
          'Shadow apply finished with errors — nothing was committed on the shadow catalog.'
        );
        console.error('Fix the issues below, then run again.\n');

        for (const err of shadowResult.errors) {
          console.error(`  • ${err.file}`);
          console.error(
            `    ${err.code ? `[${err.code}] ` : ''}${err.message}`
          );
          if (err.possiblyCascading) {
            console.error(
              '    (This may be a follow-on error from an earlier failure.)'
            );
          }
          console.error('');
        }

        throw new ValidationError(
          `Shadow apply failed with ${shadowResult.errors.length} error(s).`,
          'shadowApply',
          { count: shadowResult.errors.length }
        );
      }
    } catch (e) {
      await shadowClient.end().catch(() => undefined);
      throw e;
    }

    const targetClient = new Client({
      connectionString: buildConnectionString(targetConfig),
    });
    await targetClient.connect();
    await ensurePgSchemaExists(targetClient, targetSchema);

    try {
      const targetConn = buildConnectionString(targetConfig);
      const syncOptions = {
        conn: shadowConnectionString,
        source: shadowCatalogSchema,
        target: targetSchema,
        targetConn,
        dryRun: false,
      };

      const orchestrator = new SchemaSyncOrchestrator(
        shadowClient,
        targetClient,
        syncOptions
      );

      logInfo('migrate diff: generating structural diff (shadow → target)');
      const alterStatements = await orchestrator.generateSyncScript();
      const script = alterStatements.join('\n').trimEnd();

      if (options.write === true) {
        const name = await resolveMigrationSlugForWrite(options);
        const { migrationId, targetDir } = await migrationWriteFromDiff({
          name,
          upSql: script,
        });
        console.log('');
        console.log('Wrote migration:');
        console.log(`- Id: ${migrationId}`);
        console.log(`- Path: ${targetDir}`);
        console.log('');
        console.log('Review up.sql, then run: ddp apply');
      } else {
        console.log(script);
      }
    } finally {
      await targetClient.end().catch(() => undefined);
      await shadowClient.end().catch(() => undefined);
    }
  } catch (error) {
    logError('ddp migration diff failed', error as Error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('DDP MIGRATION DIFF failed:', message);
    process.exit(1);
  }
};
