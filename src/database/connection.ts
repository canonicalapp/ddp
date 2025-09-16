/**
 * Database Connection Module
 * Handles database connections and validation
 */

import type { IDatabaseConnection } from '@/types/database';
import { Client } from 'pg';

/**
 * Build a PostgreSQL connection string from connection details
 */
export const buildConnectionString = (config: IDatabaseConnection): string => {
  const { host, port, database, username, password } = config;
  return `postgresql://${username}:${password}@${host}:${port}/${database}`;
};

/**
 * Validate database connection by attempting to connect and run a simple query
 */
export const validateConnection = async (
  config: IDatabaseConnection
): Promise<boolean> => {
  const client = new Client({
    connectionString: buildConnectionString(config),
  });

  try {
    await client.connect();

    // Test the connection with a simple query
    const result = await client.query('SELECT 1 as test');

    // Verify we got the expected result
    if (result.rows.length === 1 && result.rows[0].test === 1) {
      return true;
    }

    return false;
  } catch (error) {
    console.error('Database connection validation failed:', error);
    return false;
  } finally {
    await client.end();
  }
};

/**
 * Validate that the connection has read-only access by checking permissions
 */
export const validateReadOnlyAccess = async (
  config: IDatabaseConnection
): Promise<boolean> => {
  const client = new Client({
    connectionString: buildConnectionString(config),
  });

  try {
    await client.connect();

    // Check if we can read from information_schema (read-only operation)
    const result = await client.query(
      `
      SELECT COUNT(*) as table_count 
      FROM information_schema.tables 
      WHERE table_schema = $1
    `,
      [config.schema || 'public']
    );

    // If we can read from information_schema, we have read access
    return result.rows.length === 1;
  } catch (error) {
    console.error('Read-only access validation failed:', error);
    return false;
  } finally {
    await client.end();
  }
};

/**
 * Test database connection with comprehensive validation
 */
export const testConnection = async (
  config: IDatabaseConnection
): Promise<{
  connected: boolean;
  readOnly: boolean;
  error?: string;
}> => {
  try {
    // Test basic connection
    const connected = await validateConnection(config);
    if (!connected) {
      return {
        connected: false,
        readOnly: false,
        error: 'Failed to establish database connection',
      };
    }

    // Test read-only access
    const readOnly = await validateReadOnlyAccess(config);
    if (!readOnly) {
      return {
        connected: true,
        readOnly: false,
        error:
          'Database connection successful but read-only access validation failed',
      };
    }

    return {
      connected: true,
      readOnly: true,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    return {
      connected: false,
      readOnly: false,
      error: errorMessage,
    };
  }
};
