import { readFileSync } from 'fs';
import { findUp } from 'find-up';
import { Client } from 'pg';
import { SchemaSyncOrchestrator } from '../../sync/orchestrator.js';

// Load environment variables from .env file
const loadEnvFile = async () => {
  try {
    const envPath = await findUp('.env', { cwd: process.cwd() });
    if (envPath) {
      const envContent = readFileSync(envPath, 'utf8');
      const envVars = {};

      envContent.split('\n').forEach(line => {
        const [key, ...valueParts] = line.split('=');
        if (key && valueParts.length > 0) {
          const value = valueParts.join('=').trim();
          envVars[key.trim()] = value;
        }
      });

      // Set environment variables
      Object.entries(envVars).forEach(([key, value]) => {
        if (!process.env[key]) {
          process.env[key] = value;
        }
      });
    }
  } catch {
    // .env file not found or couldn't be read, continue without it
  }
};

// Helper function to build connection details
const buildConnectionDetails = (options, prefix = '') => {
  const hostKey = prefix === 'source' ? `SOURCE_DB_HOST` : 'TARGET_DB_HOST';
  const portKey = prefix === 'source' ? `SOURCE_DB_PORT` : 'TARGET_DB_PORT';
  const databaseKey = prefix === 'source' ? `SOURCE_DB_NAME` : 'TARGET_DB_NAME';
  const usernameKey = prefix === 'source' ? `SOURCE_DB_USER` : 'TARGET_DB_USER';
  const passwordKey =
    prefix === 'source' ? `SOURCE_DB_PASSWORD` : 'TARGET_DB_PASSWORD';
  const schemaKey =
    prefix === 'source' ? `SOURCE_DB_SCHEMA` : 'TARGET_DB_SCHEMA';

  return {
    host: options[`${prefix}Host`] || process.env[hostKey] || 'localhost',
    port: options[`${prefix}Port`] || process.env[portKey] || '5432',
    database: options[`${prefix}Database`] || process.env[databaseKey],
    username: options[`${prefix}Username`] || process.env[usernameKey],
    password: options[`${prefix}Password`] || process.env[passwordKey],
    schema: options[`${prefix}Schema`] || process.env[schemaKey] || 'public',
  };
};

// Helper function to validate credentials
const validateCredentials = (details, type) => {
  if (!details.database || !details.username || !details.password) {
    console.error(`Error: ${type} database credentials are required.`);
    process.exit(1);
  }
};

// Helper function to build connection string
const buildConnectionString = details => {
  return `postgresql://${details.username}:${details.password}@${details.host}:${details.port}/${details.database}`;
};

export const syncCommand = async options => {
  try {
    await loadEnvFile();

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
      dev: sourceDetails.schema,
      prod: targetDetails.schema,
      targetConn: targetConnectionString,
      output: options.output,
      dryRun: options.dryRun,
    };

    const orchestrator = new SchemaSyncOrchestrator(client, syncOptions);
    await orchestrator.execute();
  } catch (error) {
    console.error('DDP SYNC failed:', error.message);
    process.exit(1);
  }
};
