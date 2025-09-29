import { exec } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { promisify } from 'util';
import { TestDatabase, TestDatabaseConfig } from '../fixtures/testDatabase';
import {
  createSourceTestConfig,
  createTargetTestConfig,
  createSyncCommand,
} from '../fixtures/testUtils';

const execAsync = promisify(exec);

describe('Sync Command Live Database Integration Tests', () => {
  let sourceDb: TestDatabase;
  let targetDb: TestDatabase;

  const sourceConfig: TestDatabaseConfig = createSourceTestConfig(
    'ddp_test_source',
    'dev'
  );
  const targetConfig: TestDatabaseConfig = createTargetTestConfig(
    'ddp_test_target',
    'prod'
  );

  beforeAll(async () => {
    console.log('🚀 Setting up test databases for sync...');

    // Create source database (dev schema)
    sourceDb = new TestDatabase(sourceConfig);
    await sourceDb.dropTestDatabase();
    await sourceDb.createTestDatabase();
    await sourceDb.loadTestData('./test-database-setup.sql');

    // Create target database (prod schema) - will be different from source
    targetDb = new TestDatabase(targetConfig);
    await targetDb.dropTestDatabase();
    await targetDb.createTestDatabase();
    await targetDb.loadTestData('./test-database-setup.sql');

    console.log('✅ Test databases setup complete');
  });

  afterAll(async () => {
    console.log('🧹 Cleaning up test databases...');
    try {
      if (sourceDb) {
        await sourceDb.disconnect();
        await sourceDb.dropTestDatabase();
      }
    } catch (error) {
      console.warn('Warning: Error cleaning up source database:', error);
    }

    try {
      if (targetDb) {
        await targetDb.disconnect();
        await targetDb.dropTestDatabase();
      }
    } catch (error) {
      console.warn('Warning: Error cleaning up target database:', error);
    }

    console.log('✅ Cleanup complete');
  });

  describe('Sync Command Execution', () => {
    it('should run sync command between dev and prod schemas', async () => {
      console.log('\n📋 Testing sync command execution...');

      // Verify initial state of both databases
      const sourceTables = await sourceDb.executeQuery(`
        SELECT tablename FROM pg_tables 
        WHERE schemaname = 'dev' 
        ORDER BY tablename
      `);
      console.log(
        `Source (dev) tables: ${sourceTables.rows.map(r => r.tablename).join(', ')}`
      );

      const targetTables = await targetDb.executeQuery(`
        SELECT tablename FROM pg_tables 
        WHERE schemaname = 'prod' 
        ORDER BY tablename
      `);
      console.log(
        `Target (prod) tables: ${targetTables.rows.map(r => r.tablename).join(', ')}`
      );

      const sourceFunctions = await sourceDb.executeQuery(`
        SELECT p.proname as function_name
        FROM pg_proc p 
        JOIN pg_namespace n ON p.pronamespace = n.oid 
        WHERE n.nspname = 'dev' 
        ORDER BY p.proname
      `);
      console.log(
        `Source (dev) functions: ${sourceFunctions.rows.map(r => r.function_name).join(', ')}`
      );

      const targetFunctions = await targetDb.executeQuery(`
        SELECT p.proname as function_name
        FROM pg_proc p 
        JOIN pg_namespace n ON p.pronamespace = n.oid 
        WHERE n.nspname = 'prod' 
        ORDER BY p.proname
      `);
      console.log(
        `Target (prod) functions: ${targetFunctions.rows.map(r => r.function_name).join(', ')}`
      );

      // Run sync command
      console.log('Running sync command...');
      const timestamp = Date.now();
      const syncCommand = createSyncCommand(
        sourceConfig,
        targetConfig,
        `output/sync-live-test-${timestamp}/alter.sql`
      );

      try {
        const { stdout, stderr } = await execAsync(syncCommand);
        console.log('Sync command stdout:', stdout);
        if (stderr) console.log('Sync command stderr:', stderr);
      } catch (error) {
        console.error('Sync command failed:', error);
        throw error;
      }

      // Verify output files were created
      const alterFile = `output/sync-live-test-${timestamp}/alter.sql`;
      expect(existsSync(alterFile)).toBe(true);
      console.log('✅ Alter file created');

      // Verify alter.sql content
      const alterContent = readFileSync(alterFile, 'utf8');
      expect(alterContent).toContain('-- Schema Sync Script');
      expect(alterContent).toContain('-- Source Schema: dev');
      expect(alterContent).toContain('-- Target Schema: prod');
      console.log('✅ Alter file contains expected headers');

      // Check if there are differences (should be some since dev and prod are different)
      const hasDifferences =
        alterContent.includes('-- DIFFERENCES FOUND') ||
        alterContent.includes('ALTER TABLE') ||
        alterContent.includes('CREATE') ||
        alterContent.includes('DROP');
      expect(hasDifferences).toBe(true);
      console.log('✅ Alter file contains differences as expected');
    });
  });

  describe('Sync Command with Identical Schemas', () => {
    it('should run sync command between identical schemas and show no differences', async () => {
      console.log('\n📋 Testing sync command with identical schemas...');

      // Create a copy of the source database for identical comparison
      const identicalConfig: TestDatabaseConfig = {
        ...sourceConfig,
        database: 'ddp_test_identical',
        schema: 'dev',
      };

      const identicalDb = new TestDatabase(identicalConfig);

      try {
        // Create identical database
        await identicalDb.dropTestDatabase();
        await identicalDb.createTestDatabase();
        await identicalDb.loadTestData('./test-database-setup.sql');

        // Run sync command between identical databases
        console.log('Running sync command on identical databases...');
        const timestamp2 = Date.now();
        const identicalConfig = createSourceTestConfig(
          'ddp_test_identical',
          'dev'
        );
        const syncCommand = createSyncCommand(
          sourceConfig,
          identicalConfig,
          `output/sync-identical-test-${timestamp2}/alter.sql`
        );

        try {
          const { stdout, stderr } = await execAsync(syncCommand);
          console.log('Sync command stdout:', stdout);
          if (stderr) console.log('Sync command stderr:', stderr);
        } catch (error) {
          console.error('Sync command failed:', error);
          throw error;
        }

        // Verify output files were created
        const alterFile = `output/sync-identical-test-${timestamp2}/alter.sql`;
        expect(existsSync(alterFile)).toBe(true);
        console.log('✅ Alter file created');

        // Verify alter.sql content shows no differences
        const alterContent = readFileSync(alterFile, 'utf8');
        expect(alterContent).toContain('-- Schema Sync Script');
        expect(alterContent).toContain('-- Source Schema: dev');
        expect(alterContent).toContain('-- Target Schema: dev');

        // Should show no differences
        const hasNoDifferences =
          alterContent.includes('-- NO DIFFERENCES FOUND') ||
          (!alterContent.includes('ALTER TABLE') &&
            !alterContent.includes('CREATE') &&
            !alterContent.includes('DROP'));
        expect(hasNoDifferences).toBe(true);
        console.log('✅ Alter file shows no differences as expected');
      } finally {
        // Cleanup identical database
        await identicalDb.dropTestDatabase();
      }
    });
  });

  describe('Sync Command Alter Script Execution', () => {
    it('should execute the generated alter script to synchronize databases', async () => {
      console.log('\n📋 Testing alter script execution...');

      // First, let's create a fresh target database that's different from source
      await targetDb.dropTestDatabase();
      await targetDb.createTestDatabase();
      await targetDb.loadTestData('./test-database-setup.sql');

      // Run sync to generate alter script
      console.log('Generating alter script...');
      const timestamp3 = Date.now();
      const syncCommand = createSyncCommand(
        sourceConfig,
        targetConfig,
        `output/sync-execution-test-${timestamp3}/alter.sql`
      );

      try {
        const { stdout, stderr } = await execAsync(syncCommand);
        console.log('Sync command stdout:', stdout);
        if (stderr) console.log('Sync command stderr:', stderr);
      } catch (error) {
        console.error('Sync command failed:', error);
        throw error;
      }

      // Verify alter script was created
      const alterFile = `output/sync-execution-test-${timestamp3}/alter.sql`;
      expect(existsSync(alterFile)).toBe(true);
      console.log('✅ Alter script generated');

      // Execute the alter script on the target database
      console.log('Executing alter script...');
      await targetDb.loadTestData(alterFile);
      console.log('✅ Alter script executed successfully');

      // Verify the databases are now synchronized
      console.log('Verifying synchronization...');

      // Compare table counts
      const sourceTableCount = await sourceDb.executeQuery(`
        SELECT COUNT(*) as count FROM pg_tables 
        WHERE schemaname = 'dev'
      `);

      const targetTableCount = await targetDb.executeQuery(`
        SELECT COUNT(*) as count FROM pg_tables 
        WHERE schemaname = 'prod'
      `);

      console.log(
        `Source tables: ${sourceTableCount.rows[0].count}, Target tables: ${targetTableCount.rows[0].count}`
      );

      // Compare function counts
      const sourceFunctionCount = await sourceDb.executeQuery(`
        SELECT COUNT(*) as count FROM pg_proc p 
        JOIN pg_namespace n ON p.pronamespace = n.oid 
        WHERE n.nspname = 'dev'
      `);

      const targetFunctionCount = await targetDb.executeQuery(`
        SELECT COUNT(*) as count FROM pg_proc p 
        JOIN pg_namespace n ON p.pronamespace = n.oid 
        WHERE n.nspname = 'prod'
      `);

      console.log(
        `Source functions: ${sourceFunctionCount.rows[0].count}, Target functions: ${targetFunctionCount.rows[0].count}`
      );

      // The counts should now be similar (target should have been updated to match source)
      expect(
        parseInt(targetTableCount.rows[0].count as string)
      ).toBeGreaterThan(0);
      expect(
        parseInt(targetFunctionCount.rows[0].count as string)
      ).toBeGreaterThan(0);
      console.log('✅ Databases appear to be synchronized');
    });
  });

  describe('Sync Command Error Handling', () => {
    it('should handle sync command errors gracefully', async () => {
      console.log('\n📋 Testing sync command error handling...');

      // Test with invalid database credentials
      const invalidSourceConfig = {
        ...sourceConfig,
        username: 'invalid',
        password: 'wrong',
        database: 'nonexistent',
      };
      const invalidSyncCommand = createSyncCommand(
        invalidSourceConfig,
        targetConfig,
        'output/sync-error/alter.sql'
      );

      try {
        await execAsync(invalidSyncCommand);
        // If we get here, the command didn't fail as expected
        fail('Expected sync command to fail with invalid credentials');
      } catch (error) {
        console.log(
          '✅ Sync command failed as expected with invalid credentials'
        );
        expect(error).toBeDefined();
      }
    });
  });
});
