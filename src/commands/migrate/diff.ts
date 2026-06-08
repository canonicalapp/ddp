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
import { assembleStateApplyPlan } from '@/commands/migrate/assembleStateApplyPlan';
import {
  applyStateFilesToShadowWithAggregateErrors,
  resetShadowSchema,
} from '@/commands/migrate/shadowApply';
import { resolveCatalogSchemaNames } from '@/utils/catalogSchemas';
import { SchemaSyncOrchestrator } from '@/sync/orchestrator';
import type { IMigrateDiffCommandOptions } from '@/types/cli';
import type { IDatabaseConnection } from '@/types/database';
import { ValidationError } from '@/types/errors';
import { loadEnvFile } from '@/utils/envLoader';
import { resolvePgSchema } from '@/utils/pgSchema';
import { logError, logInfo } from '@/utils/logger';
import { resolveRemovedTableStrategy } from '@/sync/pendingTableRemoval';
import { migrationWriteFromDiff, sanitizeMigrationSlug } from './persist';
import {
  collectPreservedArtifacts,
  formatArtifactNoticeLines,
} from '@/commands/inspect/artifacts';

const DEFAULT_SAME_DB_SHADOW_SCHEMA = 'ddp_shadow';

const hasActionableDrift = (lines: string[]): boolean =>
  lines.some(line => /^(ALTER|CREATE|DROP)\b/i.test(line.trim()));

interface IBackfillRequirement {
  table: string;
  column: string;
  type: string;
  reason: string;
}

const extractBackfillRequirements = (
  lines: string[]
): { cleanLines: string[]; requirements: IBackfillRequirement[] } => {
  const requirements: IBackfillRequirement[] = [];
  const cleanLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith('-- BACKFILL_REQUIRED ')) {
      const payload = line.slice('-- BACKFILL_REQUIRED '.length).trim();
      try {
        const parsed = JSON.parse(payload) as IBackfillRequirement;
        if (parsed.table && parsed.column && parsed.type && parsed.reason) {
          requirements.push(parsed);
          continue;
        }
      } catch {
        // Ignore malformed marker; keep original line in output.
      }
    }
    cleanLines.push(line);
  }

  return { cleanLines, requirements };
};

const buildBackfillScaffoldSql = (
  requirements: IBackfillRequirement[],
  targetSchema: string
): string => {
  if (requirements.length === 0) {
    return '';
  }

  const reasonHint: Record<string, string> = {
    fk_like:
      'FK-like identifier: use a join-based mapping to real parent keys (never placeholder ids).',
    enum_or_custom_type:
      'Enum/custom type: choose a valid domain value explicitly before NOT NULL.',
    uuid_needs_domain_value:
      'UUID column: derive/create real UUIDs from domain data; avoid synthetic placeholders unless explicitly acceptable.',
  };

  const grouped = new Map<string, IBackfillRequirement[]>();
  for (const req of requirements) {
    const key = req.table;
    const existing = grouped.get(key) ?? [];
    existing.push(req);
    grouped.set(key, existing);
  }

  const lines: string[] = [
    '-- Manual backfill scaffold',
    '-- Fill in domain-correct UPDATE statements for each item below.',
    '-- After backfill, you can add NOT NULL in a follow-up migration.',
    '-- Verify each column returns 0 NULL rows before NOT NULL enforcement.',
    '',
  ];

  for (const [tableName, tableRequirements] of grouped.entries()) {
    lines.push(`-- Table: ${targetSchema}.${tableName}`);
    lines.push('');
    for (const req of tableRequirements) {
      lines.push(
        `-- TODO [${req.reason}] ${targetSchema}.${req.table}.${req.column} (${req.type})`
      );
      if (reasonHint[req.reason]) {
        lines.push(`-- Hint: ${reasonHint[req.reason]}`);
      }
      lines.push(
        `-- UPDATE ${targetSchema}.${req.table} SET "${req.column}" = <valid_value_or_join> WHERE "${req.column}" IS NULL;`
      );
      lines.push(
        `-- VERIFY: SELECT COUNT(*) AS "${req.column}_nulls" FROM ${targetSchema}.${req.table} WHERE "${req.column}" IS NULL;`
      );
      lines.push('');
    }
    lines.push('');
  }

  return lines.join('\n');
};

const buildBackfillVerifySql = (
  requirements: IBackfillRequirement[],
  targetSchema: string
): string => {
  if (requirements.length === 0) return '';
  return requirements
    .map(
      req =>
        `SELECT COUNT(*) AS "${req.table}_${req.column}_nulls" FROM ${targetSchema}.${req.table} WHERE "${req.column}" IS NULL;`
    )
    .join('\n');
};

const buildConstraintsSql = (
  requirements: IBackfillRequirement[],
  targetSchema: string
): string => {
  if (requirements.length === 0) return '';
  return requirements
    .map(
      req =>
        `ALTER TABLE ${targetSchema}.${req.table} ALTER COLUMN "${req.column}" SET NOT NULL;`
    )
    .join('\n');
};

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
  'check',
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
    await loadEnvFile(true, options.env);

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

      const catalogNames = resolveCatalogSchemaNames(
        targetSchema,
        shadowCatalogSchema
      );
      logInfo('migrate diff: applying state to shadow', {
        fileCount: files.length,
        shadowSchema: catalogNames.shadowSchema,
        targetSchema: catalogNames.targetSchema,
        layout: usesSeparateShadowDb ? 'separate-database' : 'same-database',
        separateShadowDb: usesSeparateShadowDb,
      });
      const shadowResult = await applyStateFilesToShadowWithAggregateErrors(
        shadowClient,
        files,
        {
          shadowSchema: catalogNames.shadowSchema,
          targetSchema: catalogNames.targetSchema,
          layout: usesSeparateShadowDb ? 'separate-database' : 'same-database',
        }
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
        removedTableStrategy: resolveRemovedTableStrategy({
          conn: shadowConnectionString,
          source: shadowCatalogSchema,
          target: targetSchema,
          targetConn,
        }),
      };

      const orchestrator = new SchemaSyncOrchestrator(
        shadowClient,
        targetClient,
        syncOptions
      );

      logInfo('migrate diff: generating structural diff (shadow → target)');
      const rawStatements = await orchestrator.generateSyncScript();
      const { cleanLines: alterStatements, requirements } =
        extractBackfillRequirements(rawStatements);

      if (options.write === true && hasActionableDrift(alterStatements)) {
        const artifacts = await collectPreservedArtifacts(
          targetClient,
          targetSchema
        );

        const noticeLines = formatArtifactNoticeLines(artifacts, targetSchema);

        if (noticeLines.length > 0) {
          alterStatements.splice(7, 0, ...noticeLines, '');
        }
      }

      const script = alterStatements.join('\n').trimEnd();
      const backfillSql = buildBackfillScaffoldSql(requirements, targetSchema);
      const verifySql = buildBackfillVerifySql(requirements, targetSchema);
      const constraintsSql = buildConstraintsSql(requirements, targetSchema);

      const hasDrift = hasActionableDrift(alterStatements);

      if (options.check === true) {
        if (hasDrift) {
          console.error(
            'Drift detected between materialized state (shadow) and target schema.'
          );
          console.error(
            'Run without --check to preview SQL, or use --write to generate a migration.'
          );
          process.exit(1);
        }
        console.log(
          '✅ No actionable drift between state catalog and target schema.'
        );
        return;
      }

      if (options.write === true) {
        const name = await resolveMigrationSlugForWrite(options);
        const { migrationId, targetDir } = await migrationWriteFromDiff({
          name,
          upSql: script,
          backfillSql,
          verifySql,
          constraintsSql,
        });
        console.log('');
        console.log('Wrote migration:');
        console.log(`- Id: ${migrationId}`);
        console.log(`- Path: ${targetDir}`);
        if (backfillSql.trim().length > 0) {
          console.log('- Expand: up.sql');
          console.log('- Backfill: backfill.sql');
          console.log('- Verify: backfill.verify.sql');
          console.log('- Constraints: constraints.sql');
        }
        console.log('');
        console.log('Review up.sql, then run: ddp apply --validate && ddp apply');
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
