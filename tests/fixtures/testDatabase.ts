import { exec } from 'child_process';
import { Client } from 'pg';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface TestDatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  schema: string;
}

export class TestDatabase {
  private client: Client | null = null;
  private config: TestDatabaseConfig;

  constructor(config: TestDatabaseConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    if (!this.client) {
      this.client = new Client({
        host: this.config.host,
        port: this.config.port,
        user: this.config.username,
        password: this.config.password,
        database: this.config.database,
      });
    }

    await this.client.connect();
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.end();
    }
  }

  async createTestDatabase(): Promise<void> {
    // First connect to postgres database to create the test database
    const adminClient = new Client({
      host: this.config.host,
      port: this.config.port,
      user: this.config.username,
      password: this.config.password,
      database: 'postgres',
    });

    await adminClient.connect();

    // Create the test database
    await adminClient.query(`DROP DATABASE IF EXISTS ${this.config.database}`);
    await adminClient.query(`CREATE DATABASE ${this.config.database}`);
    await adminClient.end();

    // Create client for the new database
    this.client = new Client({
      host: this.config.host,
      port: this.config.port,
      user: this.config.username,
      password: this.config.password,
      database: this.config.database,
    });
    await this.client.connect();
  }

  async dropTestDatabase(): Promise<void> {
    if (this.client) {
      await this.client.end();
    }

    // Connect to postgres database to drop the test database
    const adminClient = new Client({
      host: this.config.host,
      port: this.config.port,
      user: this.config.username,
      password: this.config.password,
      database: 'postgres',
    });

    try {
      await adminClient.connect();

      // First, terminate all connections to the target database
      await adminClient.query(
        `
        SELECT pg_terminate_backend(pid)
        FROM pg_stat_activity
        WHERE datname = $1 AND pid <> pg_backend_pid()
      `,
        [this.config.database]
      );

      // Wait a moment for connections to close
      await new Promise(resolve => setTimeout(resolve, 100));

      // Now drop the database
      await adminClient.query(
        `DROP DATABASE IF EXISTS ${this.config.database}`
      );
    } catch (error) {
      console.warn(
        `Warning: Could not drop database ${this.config.database}:`,
        error
      );
    } finally {
      await adminClient.end();
    }
  }

  async loadTestData(scriptPath: string): Promise<void> {
    if (!this.client) {
      throw new Error('Database not connected. Call connect() first.');
    }

    // Use psql command to execute the script directly
    const psqlCommand = `PGPASSWORD=${this.config.password} psql -h ${this.config.host} -p ${this.config.port} -U ${this.config.username} -d ${this.config.database} -f ${scriptPath}`;

    try {
      console.log('Executing SQL script with psql...');
      const { stdout, stderr } = await execAsync(psqlCommand);

      if (stderr && !stderr.includes('WARNING')) {
        console.warn('psql stderr:', stderr);
      }

      if (stdout) {
        console.log('psql stdout:', stdout);
      }

      console.log('✅ SQL script executed successfully');
    } catch (error) {
      console.error('❌ Failed to execute SQL script:', error);
      throw error;
    }
  }

  // Removed parseSQLStatements - now using psql command directly
  private parseSQLStatements(script: string): string[] {
    const statements: string[] = [];
    let currentStatement = '';
    let inDollarQuote = false;
    let dollarTag = '';
    let i = 0;

    while (i < script.length) {
      const char = script[i];

      // Handle dollar-quoted strings (functions, procedures, etc.)
      if (char === '$' && !inDollarQuote) {
        // Find the end of the dollar tag
        let j = i + 1;
        while (j < script.length && script[j] !== '$') {
          j++;
        }
        if (j < script.length) {
          dollarTag = script.substring(i, j + 1);
          inDollarQuote = true;
          currentStatement += char;
          i++;
          continue;
        }
      } else if (
        inDollarQuote &&
        script.substring(i, i + dollarTag.length) === dollarTag
      ) {
        inDollarQuote = false;
        currentStatement += dollarTag;
        i += dollarTag.length - 1;
        dollarTag = '';
        i++;
        continue;
      }

      // Handle statement termination
      if (!inDollarQuote && char === ';') {
        const trimmed = currentStatement.trim();
        // Filter out comments and empty statements
        if (trimmed && !trimmed.startsWith('--')) {
          // Remove comment lines from the statement
          const lines = trimmed.split('\n');
          const nonCommentLines = lines.filter(
            line => line.trim() && !line.trim().startsWith('--')
          );
          if (nonCommentLines.length > 0) {
            statements.push(nonCommentLines.join('\n'));
          }
        }
        currentStatement = '';
      } else {
        currentStatement += char;
      }

      i++;
    }

    // Add the last statement if it doesn't end with semicolon
    const trimmed = currentStatement.trim();
    if (trimmed && !trimmed.startsWith('--')) {
      // Remove comment lines from the statement
      const lines = trimmed.split('\n');

      const nonCommentLines = lines.filter(
        line => line.trim() && !line.trim().startsWith('--')
      );

      if (nonCommentLines.length > 0) {
        statements.push(nonCommentLines.join('\n'));
      }
    }

    return statements;
  }

  async executeQuery(
    query: string,
    params?: unknown[]
  ): Promise<{ rows: unknown[] }> {
    if (!this.client) {
      throw new Error('Database not connected. Call connect() first.');
    }
    return await this.client.query(query, params);
  }

  async getTables(): Promise<string[]> {
    if (!this.client) {
      throw new Error('Database not connected. Call connect() first.');
    }
    const result = await this.client.query(
      `
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = $1 
      ORDER BY tablename
    `,
      [this.config.schema]
    );

    return result.rows.map(row => row.tablename);
  }

  async getFunctions(): Promise<string[]> {
    if (!this.client) {
      throw new Error('Database not connected. Call connect() first.');
    }
    const result = await this.client.query(
      `
      SELECT p.proname as function_name
      FROM pg_proc p 
      JOIN pg_namespace n ON p.pronamespace = n.oid 
      WHERE n.nspname = $1 
      ORDER BY p.proname
    `,
      [this.config.schema]
    );

    return result.rows.map(row => row.function_name);
  }

  async getTriggers(): Promise<string[]> {
    if (!this.client) {
      throw new Error('Database not connected. Call connect() first.');
    }
    const result = await this.client.query(
      `
      SELECT t.tgname as trigger_name
      FROM pg_trigger t 
      JOIN pg_class c ON t.tgrelid = c.oid 
      JOIN pg_namespace n ON c.relnamespace = n.oid 
      WHERE n.nspname = $1 
        AND t.tgname NOT LIKE 'RI_ConstraintTrigger_%'
      ORDER BY t.tgname
    `,
      [this.config.schema]
    );

    return result.rows.map(row => row.trigger_name);
  }

  async getTableColumns(tableName: string): Promise<unknown[]> {
    if (!this.client) {
      throw new Error('Database not connected. Call connect() first.');
    }
    const result = await this.client.query(
      `
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_schema = $1 AND table_name = $2
      ORDER BY ordinal_position
    `,
      [this.config.schema, tableName]
    );

    return result.rows;
  }

  async getConstraints(tableName: string): Promise<unknown[]> {
    if (!this.client) {
      throw new Error('Database not connected. Call connect() first.');
    }
    const result = await this.client.query(
      `
      SELECT constraint_name, constraint_type
      FROM information_schema.table_constraints 
      WHERE table_schema = $1 AND table_name = $2
      ORDER BY constraint_name
    `,
      [this.config.schema, tableName]
    );

    return result.rows;
  }

  async getIndexes(tableName: string): Promise<unknown[]> {
    if (!this.client) {
      throw new Error('Database not connected. Call connect() first.');
    }
    const result = await this.client.query(
      `
      SELECT indexname, indexdef
      FROM pg_indexes 
      WHERE schemaname = $1 AND tablename = $2
      ORDER BY indexname
    `,
      [this.config.schema, tableName]
    );

    return result.rows;
  }

  getConfig(): TestDatabaseConfig {
    return { ...this.config };
  }
}

export class TestDatabaseManager {
  private static instance: TestDatabaseManager;
  private testDatabase: TestDatabase | null = null;

  static getInstance(): TestDatabaseManager {
    if (!TestDatabaseManager.instance) {
      TestDatabaseManager.instance = new TestDatabaseManager();
    }
    return TestDatabaseManager.instance;
  }

  async setupTestDatabase(
    config: TestDatabaseConfig,
    scriptPath: string
  ): Promise<TestDatabase> {
    this.testDatabase = new TestDatabase(config);
    await this.testDatabase.connect();
    await this.testDatabase.loadTestData(scriptPath);
    return this.testDatabase;
  }

  getTestDatabase(): TestDatabase | null {
    return this.testDatabase;
  }

  async cleanupTestDatabase(): Promise<void> {
    if (this.testDatabase) {
      await this.testDatabase.dropTestDatabase();
      this.testDatabase = null;
    }
  }
}
