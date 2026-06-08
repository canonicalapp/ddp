#!/usr/bin/env node
import { program } from 'commander';
import type { Command } from 'commander';
import { genCommand } from '@/commands/gen/index';
import { syncCommand } from '@/commands/sync/index';
import { applyCommand } from '@/commands/apply/index';
import { seedCommand } from '@/commands/seed/index';
import { resetCommand } from '@/commands/reset/index';
import { initCommand } from '@/commands/init/index';
import {
  inspectBackfillCommand,
  inspectStaleCommand,
} from '@/commands/inspect/index';
import {
  migrationCreateCommand,
  migrateDiffCommand,
  migrateDiffOptionsFromCommander,
} from '@/commands/migrate/index';
import {
  stateCreateCommand,
  stateSortManifestCommand,
  stateValidateCommand,
} from '@/commands/state/index';
import type {
  IGenCommandOptions,
  ISyncCommandOptions,
  IApplyCommandOptions,
  ISeedCommandOptions,
  IResetCommandOptions,
  IInitCommandOptions,
  IMigrationCreateCommandOptions,
  IInspectCommandOptions,
} from '@/types/index';

program
  .name('ddp')
  .description('Declarative Database Provisioning - DDP CLI tool')
  .version(require('../package.json').version);

interface IDbOptionTexts {
  host: string;
  port: string;
  database: string;
  username: string;
  password: string;
  schema: string;
}

const withDbConnectionOptions = <T extends Command>(
  command: T,
  texts?: Partial<IDbOptionTexts>
): T => {
  const resolved: IDbOptionTexts = {
    host: texts?.host ?? 'Database host',
    port: texts?.port ?? 'Database port',
    database: texts?.database ?? 'Database name',
    username: texts?.username ?? 'Database username',
    password: texts?.password ?? 'Database password',
    schema: texts?.schema ?? 'Target schema (default: DB_SCHEMA or public)',
  };

  return command
    .option('--env <path>', 'Path to .env file (default: auto-discover)')
    .option('--host <host>', resolved.host)
    .option('--port <port>', resolved.port, '5432')
    .option('--database <name>', resolved.database)
    .option('--username <user>', resolved.username)
    .option('--password <pass>', resolved.password)
    .option('--schema <name>', resolved.schema);
};

// DDP INIT command
program
  .command('init')
  .description('Initialize DDP standard folder structure and config')
  .option('--path <path>', 'Root path for DDP structure', 'db')
  .option('--force', 'Overwrite existing ddp.config.json if present')
  .action(async (options: IInitCommandOptions) => {
    try {
      await initCommand(options);
    } catch (error) {
      console.error(error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

const inspectCommand = program
  .command('inspect')
  .description(
    'Read-only diagnostics. Use `inspect stale` for preserved artifacts, `inspect backfill` for split migration progress.'
  );

withDbConnectionOptions(
  inspectCommand
    .command('stale')
    .description(
      'Inspect preserved backup artifacts (e.g. *_old_* / *_dropped_*) in the target schema'
    )
).action(async (options: IInspectCommandOptions) => {
  try {
    await inspectStaleCommand(options);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
});

withDbConnectionOptions(
  inspectCommand
    .command('backfill')
    .description(
      'Inspect split backfill migration progress (expand/backfill/verify/constraints) using migration files + history'
    )
).action(async (options: IInspectCommandOptions) => {
  try {
    await inspectBackfillCommand(options);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
});

withDbConnectionOptions(
  program
    .command('seed')
    .description(
      'Run every .sql file in paths.seeds (sorted). No history table — executes each time. Fails if no .sql files exist.'
    )
)
  .option(
    '--folder <path>',
    'Override seeds directory (default: ddp.config.json paths.seeds)'
  )
  .option(
    '--transaction-mode <mode>',
    'Transaction mode: per-file, all-or-nothing, or none',
    'per-file'
  )
  .option('--continue-on-error', 'Continue after a failed file')
  .option(
    '--accept-destructive',
    'Allow TRUNCATE/DROP-style SQL (same heuristics as apply)'
  )
  .option('--non-interactive', 'Fail instead of prompting for destructive SQL')
  .option('--create-database', 'Create target database if it does not exist')
  .option('--skip-lock', 'Skip PostgreSQL advisory lock (testing only)')
  .action(async (options: ISeedCommandOptions) => {
    try {
      await seedCommand(options);
    } catch (error) {
      console.error(error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

withDbConnectionOptions(
  program
    .command('reset')
    .description(
      'Dev-only DB reset: DROP/CREATE database, then run apply and seed.'
    )
)
  .option(
    '--maintenance-database <name>',
    'Maintenance DB used to execute DROP/CREATE DATABASE (default: postgres)'
  )
  .option('-y, --yes', 'Accept confirmation prompt (alias of --force)')
  .option('--force', 'Bypass interactive confirmation prompt')
  .option('--non-interactive', 'Fail if --force/--yes is not provided')
  .option(
    '--allowed-hosts <list>',
    'Comma-separated host allowlist for reset target (supports * wildcard)'
  )
  .option(
    '--allowed-databases <list>',
    'Comma-separated database allowlist for reset target (supports * wildcard)'
  )
  .option(
    '--allow-risky-database-name',
    'Allow prod-like DB names (prod/production/staging/live) after other checks'
  )
  .option('--skip-seed', 'Do not run ddp seed after apply')
  .option(
    '--transaction-mode <mode>',
    'Pass-through transaction mode for apply/seed: per-file, all-or-nothing, none'
  )
  .option('--continue-on-error', 'Pass-through for apply/seed')
  .option('--accept-destructive', 'Pass-through for apply/seed')
  .option('--skip-lock', 'Pass-through for apply/seed')
  .action(async (options: IResetCommandOptions) => {
    try {
      await resetCommand(options);
    } catch (error) {
      console.error(error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

const stateCommand = program
  .command('state')
  .description('Manage DDP state files');

stateCommand
  .command('create')
  .description(
    'Create a state SQL file with DDP-managed numbering.\n' +
      'Usage:\n' +
      '  ddp state create <type> <kind> <name>        # schema (kind required)\n' +
      '  ddp state create <type> <name>             # proc (flat) or trigger\n' +
      '  ddp state create <type> <domain> <name>    # proc (optional domain)\n' +
      '\n' +
      'Aliases:\n' +
      '  type: schema|sch, proc|prc, trigger|trg\n' +
      '  kind: table|tbl|t, index|idx|i, constraint|cons|c, extension|ext, view|vw|v, enum|en\n' +
      '\n' +
      'Examples:\n' +
      '  ddp state create schema table users\n' +
      '  ddp state create sch idx users_email_idx\n' +
      '  ddp state create proc login\n' +
      '  ddp state create prc auth login\n' +
      '  ddp state create trg audit_users'
  )
  .argument('<type>', 'schema|sch, proc|prc, trigger|trg')
  .argument('[kindOrDomain]', 'schema kind, optional proc domain, or omit')
  .argument('[name]', 'artifact name (snake_case-ish)')
  .action(async function (
    this: Command,
    type: string,
    kindOrDomain?: string,
    name?: string
  ) {
    try {
      const payload: {
        type: string;
        kindOrDomain?: string;
        name?: string;
      } = { type };

      if (kindOrDomain !== undefined) {
        payload.kindOrDomain = kindOrDomain;
      }

      if (name !== undefined) {
        payload.name = name;
      }

      await stateCreateCommand(payload);
    } catch (error) {
      console.error(error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

stateCommand
  .command('validate')
  .description(
    'Validate DDP state structure against strict policy and manifest'
  )
  .action(async function (this: Command) {
    try {
      await stateValidateCommand();
    } catch (error) {
      console.error(error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

stateCommand
  .command('sort-manifest')
  .description(
    'Rewrite state-manifest.json so schema/table entries follow FK dependency order (same logic as apply).'
  )
  .action(async function (this: Command) {
    try {
      await stateSortManifestCommand();
    } catch (error) {
      console.error(error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

const migrationCommand = program
  .command('migration')
  .description('Create and manage versioned SQL migrations');

migrationCommand
  .command('create <name>')
  .description(
    'Scaffold an empty YYYYMMDDHHMMSS_<name>/ (hand-written SQL). Generated diffs use: ddp migration diff --write'
  )
  .action(async (name: string) => {
    try {
      const payload: IMigrationCreateCommandOptions = { name };
      await migrationCreateCommand(payload);
    } catch (error) {
      console.error(error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

withDbConnectionOptions(
  migrationCommand
    .command('diff')
    .description(
      'Apply state to a shadow catalog, diff vs target, print or write migration (default: same DB as target, shadow schema ddp_shadow)'
    ),
  {
    host: 'Target database host',
    port: 'Target database port',
    database: 'Target database name',
    username: 'Target database username',
    password: 'Target database password',
    schema:
      'Target schema (default: DB_SCHEMA or public). Shadow uses --shadow-schema / DDP_SHADOW_SCHEMA when sharing the DB.',
  }
)
  .option(
    '--shadow-url <url>',
    'Optional: separate PostgreSQL URL (else same DB as target; env: DDP_SHADOW_DATABASE_URL)'
  )
  .option(
    '--shadow-schema <name>',
    'When using same DB as target: schema for materialized state (default: DDP_SHADOW_SCHEMA or ddp_shadow)'
  )
  .option('--write', 'Write SQL to a new migration under paths.migrations')
  .option(
    '--migration-name <slug>',
    'With --write: migration slug (skips prompt); required when using --non-interactive'
  )
  .option(
    '--non-interactive',
    'Fail instead of prompting (missing DB: use --create-database; --write: use --migration-name)'
  )
  .option(
    '--create-database',
    'Create the target database if it does not exist (same as ddp apply)'
  )
  .option(
    '--check',
    'Exit with code 1 if drift exists (no --write); for CI gates'
  )
  .action(async opts => {
    try {
      await migrateDiffCommand(migrateDiffOptionsFromCommander(opts));
    } catch (error) {
      console.error(error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

// DDP GEN command
withDbConnectionOptions(
  program
    .command('gen')
    .description('Generate schema definitions from a live database'),
  { schema: 'Schema name to introspect' }
)
  .option('--output <dir>', 'Output directory for generated files', './output')
  .option(
    '--stdout',
    'Output individual files to stdout instead of saving to files'
  )
  .option('--schema-only', 'Generate only schema.sql')
  .option('--procs-only', 'Generate only procs.sql')
  .option('--triggers-only', 'Generate only triggers.sql')
  .action(async (options: IGenCommandOptions) => {
    try {
      await genCommand(options);
    } catch (error) {
      console.error(error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

// DDP SYNC command
program
  .command('sync')
  .description(
    'Compare databases and generate alter.sql to sync target with source'
  )
  .option('--env <path>', 'Path to .env file (default: auto-discover)')
  // Database sync options
  .option('--source-host <host>', 'Source database host')
  .option('--source-port <port>', 'Source database port', '5432')
  .option('--source-database <name>', 'Source database name')
  .option('--source-username <user>', 'Source database username')
  .option('--source-password <pass>', 'Source database password')
  .option('--source-schema <name>', 'Source schema name')
  .option('--target-host <host>', 'Target database host')
  .option('--target-port <port>', 'Target database port', '5432')
  .option('--target-database <name>', 'Target database name')
  .option('--target-username <user>', 'Target database username')
  .option('--target-password <pass>', 'Target database password')
  .option('--target-schema <name>', 'Target schema name')
  // Repository sync options
  .option(
    '--source-repo <url>',
    'Source repository URL for GitHub Actions integration'
  )
  .option(
    '--target-repo <url>',
    'Target repository URL for GitHub Actions integration'
  )
  .option('--source-branch <name>', 'Source repository branch', 'main')
  .option('--target-branch <name>', 'Target repository branch', 'main')
  // Common options
  .option('--output <file>', 'Output file for alter.sql', 'alter.sql')
  .option('--dry-run', 'Show what would be changed without executing')
  .action(async (options: ISyncCommandOptions) => {
    try {
      await syncCommand(options);
    } catch (error) {
      console.error(error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

// DDP APPLY command
withDbConnectionOptions(
  program
    .command('apply')
    .description(
      'Apply versioned migrations from paths.migrations in ddp.config.json (or --folder)'
    )
)
  .option(
    '--folder <path>',
    'Override migrations root (default: ddp.config.json paths.migrations)'
  )
  .option(
    '--dry-run',
    'Without --prune: list pending migrations only (no database). With --prune: connect, discover tombstones, print DROP statements without executing.'
  )
  .option(
    '--validate',
    'Run pending migrations in a transaction and roll back (no history); fails fast on SQL errors'
  )
  .option('--continue-on-error', 'Continue execution even if errors occur')
  .option(
    '--transaction-mode <mode>',
    'Transaction mode: per-file, all-or-nothing, or none',
    'per-file'
  )
  .option('--skip-history', 'Skip migration history tracking (not recommended)')
  .option(
    '--non-interactive',
    'Fail instead of prompting (use with --accept-destructive / --create-database)'
  )
  .option(
    '--accept-destructive',
    'Allow migrations that match destructive heuristics (DROP, TRUNCATE, …)'
  )
  .option(
    '--create-database',
    'Create the target database if it does not exist (non-interactive)'
  )
  .option('--with-backfill', 'Include constraints.sql after verify checks pass')
  .option(
    '--force',
    'With --with-backfill, bypass failed verify/backfill checks and apply constraints.sql anyway (dangerous)'
  )
  .option(
    '--acknowledge-backfill',
    'Optional acknowledgment for pending backfill.sql follow-ups (informational only)'
  )
  .option(
    '--prune',
    'Prune-only: DROP preserved rename tombstones (*_old_<n> triggers, *_dropped_<n> tables/columns). ' +
      'Does not load or apply migrations. Use --dry-run to print statements without executing. ' +
      'Same patterns as `ddp inspect` (non-destructive sync policy).'
  )
  .option('--skip-lock', 'Skip PostgreSQL advisory lock (testing only)')
  .action(async (options: IApplyCommandOptions) => {
    try {
      await applyCommand(options);
    } catch (error) {
      console.error(error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

// Parse command line arguments
program.parse();

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
