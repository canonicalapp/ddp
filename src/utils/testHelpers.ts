/**
 * Test helper utilities for DDP testing
 */

import { Client } from 'pg';
import { buildConnectionString } from '@/database/connection';
import type { IDatabaseConnection } from '@/types';

/**
 * Test database configuration
 */
export const TEST_DB_CONFIG: IDatabaseConnection = {
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432'),
  database: process.env.DB_NAME ?? 'test-sync',
  username: process.env.DB_USER ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'root',
  schema: process.env.DB_SCHEMA ?? 'dev',
};

/**
 * Create a test database client
 */
export async function createTestClient(): Promise<Client> {
  const client = new Client({
    connectionString: buildConnectionString(TEST_DB_CONFIG),
  });

  await client.connect();
  return client;
}

/**
 * Clean up test database client
 */
export async function cleanupTestClient(client: Client): Promise<void> {
  try {
    await client.end();
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Execute SQL in test database
 */
export async function executeTestSQL(sql: string): Promise<void> {
  const client = await createTestClient();
  try {
    await client.query(sql);
  } finally {
    await cleanupTestClient(client);
  }
}

/**
 * Query test database
 */
export async function queryTestDB<T = unknown>(
  sql: string,
  params?: unknown[]
): Promise<T[]> {
  const client = await createTestClient();
  try {
    const result = await client.query(sql, params);
    return result.rows;
  } finally {
    await cleanupTestClient(client);
  }
}

/**
 * Check if test database is available
 */
export async function isTestDatabaseAvailable(): Promise<boolean> {
  try {
    const client = await createTestClient();
    await client.query('SELECT 1');
    await cleanupTestClient(client);
    return true;
  } catch {
    return false;
  }
}

/**
 * Reset test database schema
 */
export async function resetTestSchema(): Promise<void> {
  const client = await createTestClient();
  try {
    // Drop schema if it exists
    await client.query(
      `DROP SCHEMA IF EXISTS ${TEST_DB_CONFIG.schema} CASCADE`
    );

    // Create schema
    await client.query(`CREATE SCHEMA ${TEST_DB_CONFIG.schema}`);
  } finally {
    await cleanupTestClient(client);
  }
}

/**
 * Setup test database with sample data
 */
export async function setupTestDatabase(): Promise<void> {
  const client = await createTestClient();
  try {
    // Reset schema
    await resetTestSchema();

    // Create test tables
    await client.query(`
      CREATE TABLE ${TEST_DB_CONFIG.schema}.test_table (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Insert test data
    await client.query(`
      INSERT INTO ${TEST_DB_CONFIG.schema}.test_table (name) VALUES 
      ('Test 1'), ('Test 2'), ('Test 3');
    `);
  } finally {
    await cleanupTestClient(client);
  }
}

/**
 * Mock database connection for testing
 */
export function createMockConnection(): IDatabaseConnection {
  return {
    host: 'localhost',
    port: 5432,
    database: 'test-db',
    username: 'test-user',
    password: 'test-password',
    schema: 'test_schema',
  };
}

/**
 * Mock client for testing
 */
export class MockClient {
  public query = jest.fn();
  public connect = jest.fn();
  public end = jest.fn();
}

/**
 * Create a mock client with predefined responses
 */
export function createMockClient(responses: unknown[] = []): MockClient {
  const client = new MockClient();

  let responseIndex = 0;
  client.query.mockImplementation(() => {
    if (responseIndex < responses.length) {
      return Promise.resolve({ rows: responses[responseIndex++] });
    }
    return Promise.resolve({ rows: [] });
  });

  client.connect.mockResolvedValue(undefined);
  client.end.mockResolvedValue(undefined);

  return client;
}
