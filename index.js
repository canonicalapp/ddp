#!/usr/bin/env node
import { program } from 'commander';
import { Client } from 'pg';

import { SchemaSyncOrchestrator } from './modules/schemaSyncOrchestrator.js';

program
  .name('schema-sync-script')
  .description(
    'Script to sync schemas between development and production databases'
  )
  .version('0.01');

program
  .requiredOption('--conn <connectionString>', 'PostgreSQL connection string')
  .requiredOption('--dev <schemaName>', 'Development schema name')
  .requiredOption('--prod <schemaName>', 'Production schema name')
  .option('--with-comments', 'Include column comments', false)
  .option('--save', 'Save script to file instead of console output', false)
  .option('--output <filename>', 'Output filename (used with --save)')
  .parse();

const options = program.opts();

const client = new Client({
  connectionString: options.conn,
});

const main = async () => {
  try {
    const orchestrator = new SchemaSyncOrchestrator(client, options);
    await orchestrator.execute();
  } catch (error) {
    console.error('Schema sync failed:', error);
    process.exit(1);
  }
};

main();

/**
--conn "postgresql://postgres:root@localhost:5432/test-sync" --dev "dev" --prod "prod"
 */
