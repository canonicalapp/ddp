import { Client } from 'pg';
import { buildConnectionString } from '@/database/connection';
import type { IInspectCommandOptions } from '@/types/cli';
import type { IDatabaseConnection } from '@/types/database';
import { ValidationError } from '@/types/errors';
import { loadEnvFile } from '@/utils/envLoader';
import { resolvePgSchema } from '@/utils/pgSchema';
import { collectPreservedArtifacts } from './artifacts';

const buildTargetConfig = (
  options: IInspectCommandOptions
): IDatabaseConnection => {
  const database = options.database ?? process.env.DB_NAME;
  const username = options.username ?? process.env.DB_USER;
  const password = options.password ?? process.env.DB_PASSWORD;
  const schema = resolvePgSchema(options.schema, process.env.DB_SCHEMA);

  if (!database || !username || !password) {
    throw new ValidationError(
      'Database credentials required (DB_NAME, DB_USER, DB_PASSWORD or CLI flags).',
      'credentials',
      { database: !!database, username: !!username, password: !!password }
    );
  }

  return {
    host: options.host ?? process.env.DB_HOST ?? 'localhost',
    port: parseInt(options.port ?? process.env.DB_PORT ?? '5432'),
    database,
    username,
    password,
    schema,
  };
};

export const inspectCommand = async (
  options: IInspectCommandOptions
): Promise<void> => {
  await loadEnvFile(true, options.env);
  const target = buildTargetConfig(options);
  const targetSchema = resolvePgSchema(target.schema, process.env.DB_SCHEMA);

  const client = new Client({
    connectionString: buildConnectionString(target),
  });
  await client.connect();

  try {
    const artifacts = await collectPreservedArtifacts(client, targetSchema);

    if (artifacts.totalCount === 0) {
      console.log(
        `No preserved backup artifacts found in schema "${targetSchema}".`
      );
      return;
    }

    console.log(
      `Found ${artifacts.totalCount} preserved backup artifact(s) in schema "${targetSchema}".`
    );

    if (artifacts.triggerNames.length > 0) {
      console.log(`\nTriggers (${artifacts.triggerNames.length}):`);
      artifacts.triggerNames.forEach(name => console.log(`- ${name}`));
    }

    if (artifacts.tableNames.length > 0) {
      console.log(`\nTables (${artifacts.tableNames.length}):`);
      artifacts.tableNames.forEach(name => console.log(`- ${name}`));
    }

    if (artifacts.droppedColumns.length > 0) {
      console.log(`\nColumns (${artifacts.droppedColumns.length}):`);
      artifacts.droppedColumns.forEach(entry =>
        console.log(`- ${entry.tableName}.${entry.columnName}`)
      );
    }

    console.log(
      '\nCleanup guidance: review artifacts and drop only after validating they are no longer needed.'
    );
  } finally {
    await client.end().catch(() => undefined);
  }
};
