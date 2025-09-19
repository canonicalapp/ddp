import { readFileSync } from 'fs';
import { findUp } from 'find-up';
import { Client } from 'pg';
import { SchemaSyncOrchestrator } from '@/sync/orchestrator';
import { FileSyncOrchestrator } from '@/sync/fileSyncOrchestrator';
import { RepoIntegration } from '@/sync/repoIntegration';
import type {
  ISyncCommandOptions,
  IDatabaseConnection,
  TRecord,
} from '@/types';

// Load environment variables from .env file
const loadEnvFile = async (): Promise<void> => {
  try {
    const envPath = await findUp('.env', { cwd: process.cwd() });
    if (envPath) {
      const envContent = readFileSync(envPath, 'utf8');
      const envVars: TRecord<string, string> = {};

      envContent.split('\n').forEach((line: string) => {
        const [key, ...valueParts] = line.split('=');
        if (key && valueParts.length > 0) {
          const value = valueParts.join('=').trim();
          envVars[key.trim()] = value;
        }
      });

      // Set environment variables
      Object.entries(envVars).forEach(([key, value]) => {
        process.env[key] ??= value;
      });
    }
  } catch {
    // .env file not found or couldn't be read, continue without it
  }
};

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
const validateCredentials = (
  details: IDatabaseConnection,
  type: string
): void => {
  if (!details.database || !details.username || !details.password) {
    console.error(`Error: ${type} database credentials are required.`);
    process.exit(1);
  }
};

// Helper function to build connection string
const buildConnectionString = (details: IDatabaseConnection): string => {
  return `postgresql://${details.username}:${details.password}@${details.host}:${details.port}/${details.database}`;
};

export const syncCommand = async (
  options: ISyncCommandOptions
): Promise<void> => {
  try {
    await loadEnvFile();

    // Check sync mode
    if (options.sourceRepo && options.targetRepo) {
      // Repository sync mode
      await executeRepoSync(options);
    } else if (options.sourceDir && options.targetDir) {
      // File-based sync mode
      await executeFileSync(options);
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
async function executeRepoSync(options: ISyncCommandOptions): Promise<void> {
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
 * Execute file-based sync
 */
async function executeFileSync(options: ISyncCommandOptions): Promise<void> {
  if (!options.sourceDir || !options.targetDir) {
    console.error(
      'Error: Both --source-dir and --target-dir are required for file-based sync'
    );
    process.exit(1);
  }

  const fileSyncOptions = {
    sourceDir: options.sourceDir,
    targetDir: options.targetDir,
    output: options.output ?? 'alter.sql',
    dryRun: options.dryRun ?? false,
  };

  const orchestrator = new FileSyncOrchestrator(fileSyncOptions);
  await orchestrator.execute();
}

/**
 * Execute database sync (existing functionality)
 */
async function executeDatabaseSync(
  options: ISyncCommandOptions
): Promise<void> {
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

  // Use existing sync functionality
  const client = new Client({
    connectionString: sourceConnectionString,
  });

  const syncOptions = {
    conn: sourceConnectionString,
    dev: sourceDetails.schema ?? 'public',
    prod: targetDetails.schema ?? 'public',
    targetConn: targetConnectionString,
    output: options.output ?? 'alter.sql',
    dryRun: options.dryRun ?? false,
  };

  const orchestrator = new SchemaSyncOrchestrator(client, syncOptions);
  await orchestrator.execute();
}
