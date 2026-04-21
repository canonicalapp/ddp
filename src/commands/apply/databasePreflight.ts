/**
 * Database existence checks and optional CREATE DATABASE (user-guided).
 */

import { buildConnectionString } from '@/database/connection';
import type { IDatabaseConnection } from '@/types/database';
import { Client } from 'pg';
import { createInterface } from 'readline';

const promptLine = (question: string): Promise<string> => {
  return new Promise(resolve => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
};

const escapeIdent = (name: string): string => `"${name.replace(/"/g, '""')}"`;

/**
 * Ensure a PostgreSQL schema exists (e.g. from DB_SCHEMA in .env).
 * `ddp init` only creates filesystem layout — it does not create PG schemas.
 */
export const ensurePgSchemaExists = async (
  client: { query: (sql: string) => Promise<unknown> },
  schema: string
): Promise<void> => {
  if (!schema || schema === 'public') {
    return;
  }
  await client.query(`CREATE SCHEMA IF NOT EXISTS ${escapeIdent(schema)}`);
};

/**
 * Connect to `postgres` maintenance DB with same host/user/password/port.
 */
const connectMaintenanceClient = async (
  config: IDatabaseConnection
): Promise<Client> => {
  const maintenance: IDatabaseConnection = {
    ...config,
    database: 'postgres',
  };
  const client = new Client({
    connectionString: buildConnectionString(maintenance),
  });
  await client.connect();
  return client;
};

export const databaseExists = async (
  config: IDatabaseConnection
): Promise<boolean> => {
  let client: Client | undefined;
  try {
    client = await connectMaintenanceClient(config);
    const r = await client.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [config.database]
    );
    return r.rows.length > 0;
  } finally {
    await client?.end().catch(() => undefined);
  }
};

export const createDatabaseFromConfig = async (
  config: IDatabaseConnection
): Promise<void> => {
  const client = await connectMaintenanceClient(config);
  try {
    await client.query(`CREATE DATABASE ${escapeIdent(config.database)}`);
  } finally {
    await client.end();
  }
};

export interface IEnsureDatabaseOptions {
  nonInteractive?: boolean;
  createDatabase?: boolean;
}

/**
 * If the target database is missing, optionally create it or prompt (TTY).
 * Returns false if the caller should abort (user declined or missing flags).
 */
export const ensureTargetDatabase = async (
  config: IDatabaseConnection,
  options: IEnsureDatabaseOptions
): Promise<boolean> => {
  const exists = await databaseExists(config);
  if (exists) {
    return true;
  }

  const db = config.database;
  console.error('');
  console.error(
    `Database "${db}" does not exist on ${config.host}:${config.port}.`
  );

  if (options.createDatabase) {
    console.log(`Creating database "${db}"...`);
    await createDatabaseFromConfig(config);
    console.log(`Created database "${db}".`);
    return true;
  }

  if (options.nonInteractive) {
    console.error(
      'Non-interactive mode: create the database first, or re-run with --create-database.'
    );
    return false;
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.error(
      'Not a TTY: cannot prompt. Create the database or use --create-database.'
    );
    return false;
  }

  const answer = await promptLine(`Create database "${db}" now? [y/N] `);
  if (!/^y(es)?$/i.test(answer)) {
    console.error('Aborted.');
    return false;
  }

  await createDatabaseFromConfig(config);
  console.log(`Created database "${db}".`);
  return true;
};
