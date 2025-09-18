#!/usr/bin/env node
import { program } from 'commander';
import { genCommand } from '@/commands/gen/index';
import { syncCommand } from '@/commands/sync/index';
import type { IGenCommandOptions, ISyncCommandOptions } from '@/types/index';

program
  .name('ddp')
  .description('Declarative Database Provisioning - DDP CLI tool')
  .version('1.0.0');

// DDP GEN command
program
  .command('gen')
  .description('Generate schema definitions from a live database')
  .option('--env <path>', 'Path to .env file (default: auto-discover)')
  .option('--host <host>', 'Database host')
  .option('--port <port>', 'Database port', '5432')
  .option('--database <name>', 'Database name')
  .option('--username <user>', 'Database username')
  .option('--password <pass>', 'Database password')
  .option('--schema <name>', 'Schema name to introspect')
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
    'Compare two live databases and generate alter.sql to sync target with source'
  )
  .option('--env <path>', 'Path to .env file (default: auto-discover)')
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

// Parse command line arguments
program.parse();

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
