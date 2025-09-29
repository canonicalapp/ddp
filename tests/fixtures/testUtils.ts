/**
 * Test utilities for schema-sync-script tests
 */

import { TestDatabaseConfig } from './testDatabase';

/**
 * Create a mock PostgreSQL client for testing
 */
export const createMockClient = () => {
  const calls = [];
  const results = [];
  let callIndex = 0;

  const queryFunction = (...args) => {
    calls.push(args);
    const result = results[callIndex] || { rows: [] };
    callIndex++;
    if (result.error) {
      return Promise.reject(result.error);
    }
    return Promise.resolve(result);
  };

  // Add mock properties to the query function
  queryFunction.mockResolvedValue = result => {
    results.push(result);
    return queryFunction;
  };
  queryFunction.mockRejectedValue = error => {
    results.push({ error });
    return queryFunction;
  };
  queryFunction.mockResolvedValueOnce = result => {
    results.push(result);
    return queryFunction;
  };
  queryFunction.mockRejectedValueOnce = error => {
    results.push({ error });
    return queryFunction;
  };
  queryFunction.mock = {
    calls: calls,
    results: results,
  };

  // Add jest-like spy methods that work with our call tracking
  queryFunction.toHaveBeenCalledWith = (...expectedArgs) => {
    const found = calls.some(call => {
      if (call.length !== expectedArgs.length) return false;

      return call.every((arg, index) => {
        const expected = expectedArgs[index];

        // Handle expect.stringContaining
        if (
          expected &&
          typeof expected === 'object' &&
          expected.asymmetricMatch
        ) {
          return expected.asymmetricMatch(arg);
        }

        // Handle expect.any()
        if (
          expected &&
          typeof expected === 'function' &&
          expected.name === 'Any'
        ) {
          return true;
        }

        // Handle array comparison
        if (Array.isArray(expected) && Array.isArray(arg)) {
          return JSON.stringify(expected) === JSON.stringify(arg);
        }

        return arg === expected;
      });
    });

    return found;
  };

  queryFunction.toHaveBeenCalledTimes = expectedTimes => {
    return calls.length === expectedTimes;
  };

  const mockClient = {
    connect: () => Promise.resolve(),
    end: () => Promise.resolve(),
    query: queryFunction,
  };

  return mockClient;
};

/**
 * Create mock options for testing
 */
export const createMockOptions = (overrides = {}) => {
  return {
    conn: 'postgresql://user:pass@localhost:5432/testdb',
    source: 'dev_schema',
    target: 'prod_schema',
    withComments: false,
    save: false,
    output: null,
    ...overrides,
  };
};

/**
 * Create a mock client with Jest spy functions
 */
export const createJestMockClient = () => {
  return {
    connect: global.jest.fn().mockResolvedValue(),
    end: global.jest.fn().mockResolvedValue(),
    query: global.jest.fn().mockResolvedValue({ rows: [] }),
  };
};

/**
 * Creates a test database configuration using environment variables
 * with fallback to default values for local development
 */
export function createTestConfig(
  database: string,
  schema: string = 'dev'
): TestDatabaseConfig {
  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database,
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'root',
    schema,
  };
}

/**
 * Creates a source database configuration for sync testing
 */
export function createSourceTestConfig(
  database: string,
  schema: string = 'dev'
): TestDatabaseConfig {
  return {
    host: process.env.SOURCE_DB_HOST || 'localhost',
    port: parseInt(process.env.SOURCE_DB_PORT || '5432'),
    database,
    username: process.env.SOURCE_DB_USER || 'postgres',
    password: process.env.SOURCE_DB_PASSWORD || 'root',
    schema,
  };
}

/**
 * Creates a target database configuration for sync testing
 */
export function createTargetTestConfig(
  database: string,
  schema: string = 'prod'
): TestDatabaseConfig {
  return {
    host: process.env.TARGET_DB_HOST || 'localhost',
    port: parseInt(process.env.TARGET_DB_PORT || '5432'),
    database,
    username: process.env.TARGET_DB_USER || 'postgres',
    password: process.env.TARGET_DB_PASSWORD || 'root',
    schema,
  };
}

/**
 * Creates a gen command string using environment variables
 */
export function createGenCommand(
  config: TestDatabaseConfig,
  outputDir: string
): string {
  return `npm run dev gen -- --host ${config.host} --port ${config.port} --username ${config.username} --password ${config.password} --database ${config.database} --schema ${config.schema} --output ${outputDir}`;
}

/**
 * Creates a sync command string using environment variables
 */
export function createSyncCommand(
  sourceConfig: TestDatabaseConfig,
  targetConfig: TestDatabaseConfig,
  outputFile: string
): string {
  return `npm run dev sync -- --source-host ${sourceConfig.host} --source-port ${sourceConfig.port} --source-username ${sourceConfig.username} --source-password ${sourceConfig.password} --source-database ${sourceConfig.database} --source-schema ${sourceConfig.schema} --target-host ${targetConfig.host} --target-port ${targetConfig.port} --target-username ${targetConfig.username} --target-password ${targetConfig.password} --target-database ${targetConfig.database} --target-schema ${targetConfig.schema} --output ${outputFile}`;
}

/**
 * Environment variables used for testing
 */
export const TEST_ENV = {
  // Gen command database
  HOST: process.env.DB_HOST || 'localhost',
  PORT: process.env.DB_PORT || '5432',
  USER: process.env.DB_USER || 'postgres',
  PASSWORD: process.env.DB_PASSWORD || 'root',
  SCHEMA: process.env.DB_SCHEMA || 'dev',

  // Source database for sync
  SOURCE_HOST: process.env.SOURCE_DB_HOST || 'localhost',
  SOURCE_PORT: process.env.SOURCE_DB_PORT || '5432',
  SOURCE_USER: process.env.SOURCE_DB_USER || 'postgres',
  SOURCE_PASSWORD: process.env.SOURCE_DB_PASSWORD || 'root',
  SOURCE_SCHEMA: process.env.SOURCE_DB_SCHEMA || 'dev',

  // Target database for sync
  TARGET_HOST: process.env.TARGET_DB_HOST || 'localhost',
  TARGET_PORT: process.env.TARGET_DB_PORT || '5432',
  TARGET_USER: process.env.TARGET_DB_USER || 'postgres',
  TARGET_PASSWORD: process.env.TARGET_DB_PASSWORD || 'root',
  TARGET_SCHEMA: process.env.TARGET_DB_SCHEMA || 'prod',

  // Test configuration
  DATA_SCRIPT: process.env.TEST_DATA_SCRIPT_BASIC || 'test-database-setup.sql',
  OUTPUT_DIR: process.env.TEST_OUTPUT_DIR || 'output/test-runner',
  TIMEOUT: parseInt(process.env.TEST_TIMEOUT || '60000'),
} as const;
