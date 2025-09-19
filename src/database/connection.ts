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

  // URL encode the credentials to handle special characters
  const encodedUsername = encodeURIComponent(username);
  const encodedPassword = encodeURIComponent(password);
  const encodedDatabase = encodeURIComponent(database);

  return `postgresql://${encodedUsername}:${encodedPassword}@${host}:${port}/${encodedDatabase}`;
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
  const client = new Client({
    connectionString: buildConnectionString(config),
  });

  try {
    await client.connect();

    // Test the connection with a simple query
    const result = await client.query('SELECT 1 as test');

    // Verify we got the expected result
    if (result.rows.length === 1 && result.rows[0].test === 1) {
      // Test read-only access by attempting to read from information_schema
      try {
        const readTest = await client.query(
          `
          SELECT COUNT(*) as table_count 
          FROM information_schema.tables 
          WHERE table_schema = $1
        `,
          [config.schema ?? 'public']
        );

        // If we can read from information_schema, we have read access
        const hasReadAccess = readTest.rows.length === 1;

        return {
          connected: true,
          readOnly: hasReadAccess,
        };
      } catch {
        // If we can't read from information_schema, it's not read-only
        return {
          connected: true,
          readOnly: false,
          error: 'Read-only access validation failed',
        };
      }
    }

    return {
      connected: false,
      readOnly: false,
      error: 'Connection test query failed',
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    return {
      connected: false,
      readOnly: false,
      error: errorMessage,
    };
  } finally {
    await client.end();
  }
};
