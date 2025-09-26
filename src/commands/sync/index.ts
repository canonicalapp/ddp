import { SchemaSyncOrchestrator } from '@/sync/orchestrator';
import { RepoIntegration } from '@/sync/repoIntegration';
import type { IDatabaseConnection, ISyncCommandOptions } from '@/types';
import { loadEnvFile } from '@/utils/envLoader';
import { Client } from 'pg';

// Helper function to build connection details
const buildConnectionDetails = (
  options: ISyncCommandOptions,
  prefix: 'source' | 'target'
): IDatabaseConnection => {
  const hostKey = prefix === 'source' ? 'SOURCE_DB_HOST' : 'TARGET_DB_HOST';
  const portKey = prefix === 'source' ? 'SOURCE_DB_PORT' : 'TARGET_DB_PORT';
  const databaseKey = prefix === 'source' ? 'SOURCE_DB_NAME' : 'TARGET_DB_NAME';
  const usernameKey = prefix === 'source' ? 'SOURCE_DB_USER' : 'TARGET_DB_USER';
  const passwordKey =
    prefix === 'source' ? 'SOURCE_DB_PASSWORD' : 'TARGET_DB_PASSWORD';
  const schemaKey =
    prefix === 'source' ? 'SOURCE_DB_SCHEMA' : 'TARGET_DB_SCHEMA';

  const port = options[`${prefix}Port`] ?? process.env[portKey] ?? '5432';
  const portNumber = parseInt(port, 10);

  return {
    host: options[`${prefix}Host`] ?? process.env[hostKey] ?? 'localhost',
    port: portNumber,
    database: options[`${prefix}Database`] ?? process.env[databaseKey] ?? '',
    username: options[`${prefix}Username`] ?? process.env[usernameKey] ?? '',
    password: options[`${prefix}Password`] ?? process.env[passwordKey] ?? '',
    schema: options[`${prefix}Schema`] ?? process.env[schemaKey] ?? 'public',
  };
};

// Helper function to validate credentials
const validateCredentials = (details: IDatabaseConnection, type: string) => {
  if (!details.database || !details.username || !details.password) {
    console.error(`Error: ${type} database credentials are required.`);
    process.exit(1);
  }
};

// Helper function to build connection string
const buildConnectionString = (details: IDatabaseConnection) => {
  return `postgresql://${details.username}:${details.password}@${details.host}:${details.port}/${details.database}`;
};

export const syncCommand = async (options: ISyncCommandOptions) => {
  try {
    await loadEnvFile(false); // Don't skip in any environment for sync

    // Check sync mode
    if (options.sourceRepo && options.targetRepo) {
      // Repository sync mode
      await executeRepoSync(options);
    } else {
      // Database sync mode (existing functionality)
      await executeDatabaseSync(options);
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    console.error('DDP SYNC failed:', errorMessage);
    process.exit(1);
  }
};

/**
 * Execute repository sync
 */
async function executeRepoSync(options: ISyncCommandOptions) {
  if (!options.sourceRepo || !options.targetRepo) {
    console.error(
      'Error: Both --source-repo and --target-repo are required for repository sync'
    );
    process.exit(1);
  }

  const repoSyncOptions = {
    sourceRepo: options.sourceRepo,
    targetRepo: options.targetRepo,
    sourceBranch: options.sourceBranch ?? 'main',
    targetBranch: options.targetBranch ?? 'main',
    output: options.output ?? 'alter.sql',
    dryRun: options.dryRun ?? false,
  };

  const orchestrator = new RepoIntegration(repoSyncOptions);
  await orchestrator.execute();
}

/**
 * Execute database sync (existing functionality)
 */
async function executeDatabaseSync(options: ISyncCommandOptions) {
  // Build connection details
  const sourceDetails = buildConnectionDetails(options, 'source');
  const targetDetails = buildConnectionDetails(options, 'target');

  // Validate credentials
  validateCredentials(sourceDetails, 'Source');
  validateCredentials(targetDetails, 'Target');

  // Build connection strings
  const sourceConnectionString = buildConnectionString(sourceDetails);
  const targetConnectionString = buildConnectionString(targetDetails);

  console.log('DDP SYNC - Comparing databases and generating alter.sql...');
  console.log(`Source: ${sourceDetails.database}.${sourceDetails.schema}`);
  console.log(`Target: ${targetDetails.database}.${targetDetails.schema}`);
  console.log(`Output: ${options.output}`);

  // Create separate clients for source and target
  const sourceClient = new Client({
    connectionString: sourceConnectionString,
  });

  const targetClient = new Client({
    connectionString: targetConnectionString,
  });

  const syncOptions = {
    conn: sourceConnectionString,
    source: sourceDetails.schema ?? 'public',
    target: targetDetails.schema ?? 'public',
    targetConn: targetConnectionString,
    output: options.output ?? 'alter.sql',
    dryRun: options.dryRun ?? false,
  };

  const orchestrator = new SchemaSyncOrchestrator(
    sourceClient,
    targetClient,
    syncOptions
  );

  await orchestrator.execute();
}
