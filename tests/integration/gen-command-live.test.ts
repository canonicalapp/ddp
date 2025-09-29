import { exec } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { promisify } from 'util';
import { TestDatabase, TestDatabaseConfig } from '../fixtures/testDatabase';
import { createTestConfig, createGenCommand } from '../fixtures/testUtils';

const execAsync = promisify(exec);

describe('Gen Command Live Database Integration Tests', () => {
  let testDb: TestDatabase;
  const config: TestDatabaseConfig = createTestConfig('ddp_test_runner', 'dev');

  beforeAll(async () => {
    console.log('🚀 Setting up test database...');
    testDb = new TestDatabase(config);

    // Drop and recreate database
    await testDb.dropTestDatabase();
    await testDb.createTestDatabase();
    await testDb.loadTestData('./test-database-setup.sql');

    console.log('✅ Test database setup complete');
  });

  afterAll(async () => {
    console.log('🧹 Cleaning up test database...');
    try {
      if (testDb) {
        await testDb.disconnect();
        await testDb.dropTestDatabase();
      }
    } catch (error) {
      console.warn('Warning: Error cleaning up test database:', error);
    }
    console.log('✅ Cleanup complete');
  });

  describe('Dev Schema Generation', () => {
    it('should generate schema files for dev schema', async () => {
      console.log('\n📋 Testing dev schema generation...');

      // Verify initial state
      const initialTables = await testDb.executeQuery(`
        SELECT tablename FROM pg_tables 
        WHERE schemaname = 'dev' 
        ORDER BY tablename
      `);
      console.log(
        `Initial dev tables: ${initialTables.rows.map(r => r.tablename).join(', ')}`
      );

      const initialFunctions = await testDb.executeQuery(`
        SELECT p.proname as function_name
        FROM pg_proc p 
        JOIN pg_namespace n ON p.pronamespace = n.oid 
        WHERE n.nspname = 'dev' 
        ORDER BY p.proname
      `);
      console.log(
        `Initial dev functions: ${initialFunctions.rows.map(r => r.function_name).join(', ')}`
      );

      const initialTriggers = await testDb.executeQuery(`
        SELECT t.tgname as trigger_name
        FROM pg_trigger t 
        JOIN pg_class c ON t.tgrelid = c.oid 
        JOIN pg_namespace n ON c.relnamespace = n.oid 
        WHERE n.nspname = 'dev' 
          AND t.tgname NOT LIKE 'RI_ConstraintTrigger_%'
        ORDER BY t.tgname
      `);
      console.log(
        `Initial dev triggers: ${initialTriggers.rows.map(r => r.trigger_name).join(', ')}`
      );

      // Run gen command for dev schema
      console.log('Running gen command for dev schema...');
      const genCommand = createGenCommand(config, 'output/test-dev-live');

      try {
        const { stdout, stderr } = await execAsync(genCommand);
        console.log('Gen command stdout:', stdout);
        if (stderr) console.log('Gen command stderr:', stderr);
      } catch (error) {
        console.error('Gen command failed:', error);
        throw error;
      }

      // Verify output files were created
      const schemaFile = 'output/test-dev-live/schema.sql';
      const procsFile = 'output/test-dev-live/procs.sql';
      const triggersFile = 'output/test-dev-live/triggers.sql';

      expect(existsSync(schemaFile)).toBe(true);
      expect(existsSync(procsFile)).toBe(true);
      expect(existsSync(triggersFile)).toBe(true);

      console.log('✅ Generated files exist');

      // Verify schema.sql content
      const schemaContent = readFileSync(schemaFile, 'utf8');
      expect(schemaContent).toContain('CREATE TABLE "dev"."users"');
      expect(schemaContent).toContain('CREATE TABLE "dev"."products"');
      expect(schemaContent).toContain('CREATE TABLE "dev"."orders"');
      console.log('✅ Schema file contains expected tables');

      // Verify procs.sql content
      const procsContent = readFileSync(procsFile, 'utf8');
      expect(procsContent).toContain('calculate_order_total');
      expect(procsContent).toContain('get_user_orders');
      console.log('✅ Procs file contains expected functions');

      // Verify triggers.sql content
      const triggersContent = readFileSync(triggersFile, 'utf8');
      expect(triggersContent).toContain('tr_products_updated_at');
      expect(triggersContent).toContain('tr_orders_validate_total');
      console.log('✅ Triggers file contains expected triggers');
    });
  });

  describe('Prod Schema Generation', () => {
    it('should generate schema files for prod schema', async () => {
      console.log('\n📋 Testing prod schema generation...');

      // Verify initial state
      const initialTables = await testDb.executeQuery(`
        SELECT tablename FROM pg_tables 
        WHERE schemaname = 'prod' 
        ORDER BY tablename
      `);
      console.log(
        `Initial prod tables: ${initialTables.rows.map(r => r.tablename).join(', ')}`
      );

      const initialFunctions = await testDb.executeQuery(`
        SELECT p.proname as function_name
        FROM pg_proc p 
        JOIN pg_namespace n ON p.pronamespace = n.oid 
        WHERE n.nspname = 'prod' 
        ORDER BY p.proname
      `);
      console.log(
        `Initial prod functions: ${initialFunctions.rows.map(r => r.function_name).join(', ')}`
      );

      // Run gen command for prod schema
      console.log('Running gen command for prod schema...');
      const prodConfig = createTestConfig('ddp_test_runner', 'prod');
      const genCommand = createGenCommand(prodConfig, 'output/test-prod-live');

      try {
        const { stdout, stderr } = await execAsync(genCommand);
        console.log('Gen command stdout:', stdout);
        if (stderr) console.log('Gen command stderr:', stderr);
      } catch (error) {
        console.error('Gen command failed:', error);
        throw error;
      }

      // Verify output files were created
      const schemaFile = 'output/test-prod-live/schema.sql';
      const procsFile = 'output/test-prod-live/procs.sql';
      const triggersFile = 'output/test-prod-live/triggers.sql';

      expect(existsSync(schemaFile)).toBe(true);
      expect(existsSync(procsFile)).toBe(true);
      expect(existsSync(triggersFile)).toBe(true);

      console.log('✅ Generated files exist');

      // Verify schema.sql content
      const schemaContent = readFileSync(schemaFile, 'utf8');
      expect(schemaContent).toContain('CREATE TABLE "prod"."users"');
      expect(schemaContent).toContain('CREATE TABLE "prod"."products"');
      expect(schemaContent).toContain('CREATE TABLE "prod"."orders"');
      console.log('✅ Schema file contains expected tables');

      // Verify procs.sql content
      const procsContent = readFileSync(procsFile, 'utf8');
      expect(procsContent).toContain('get_user_count');
      console.log('✅ Procs file contains expected functions');

      // Verify triggers.sql content (should only contain header for prod)
      const triggersContent = readFileSync(triggersFile, 'utf8');
      expect(triggersContent).toContain('-- TRIGGERS');
      expect(triggersContent).toContain('-- END OF TRIGGERS GENERATOR');
      expect(triggersContent).not.toContain('CREATE TRIGGER');
      console.log('✅ Triggers file contains only header as expected for prod');
    });
  });

  describe('Database Recreation Test', () => {
    it('should recreate database from generated files', async () => {
      console.log('\n🔄 Testing database recreation from generated files...');

      // Create a new test database for recreation
      const recreateConfig: TestDatabaseConfig = {
        ...config,
        database: 'ddp_test_recreated',
      };

      const recreateDb = new TestDatabase(recreateConfig);

      try {
        // Drop and create fresh database
        await recreateDb.dropTestDatabase();
        await recreateDb.createTestDatabase();

        // Load dev schema from generated files
        console.log('Loading dev schema from generated files...');
        await recreateDb.loadTestData('./output/test-dev-live/schema.sql');
        await recreateDb.loadTestData('./output/test-dev-live/procs.sql');
        await recreateDb.loadTestData('./output/test-dev-live/triggers.sql');

        // Load prod schema from generated files
        console.log('Loading prod schema from generated files...');
        await recreateDb.loadTestData('./output/test-prod-live/schema.sql');
        await recreateDb.loadTestData('./output/test-prod-live/procs.sql');
        await recreateDb.loadTestData('./output/test-prod-live/triggers.sql');

        // Verify dev schema was recreated
        const recreatedDevTables = await recreateDb.executeQuery(`
          SELECT tablename FROM pg_tables 
          WHERE schemaname = 'dev' 
          ORDER BY tablename
        `);
        console.log(
          `Recreated dev tables: ${recreatedDevTables.rows.map(r => r.tablename).join(', ')}`
        );

        const recreatedDevFunctions = await recreateDb.executeQuery(`
          SELECT p.proname as function_name
          FROM pg_proc p 
          JOIN pg_namespace n ON p.pronamespace = n.oid 
          WHERE n.nspname = 'dev' 
          ORDER BY p.proname
        `);
        console.log(
          `Recreated dev functions: ${recreatedDevFunctions.rows.map(r => r.function_name).join(', ')}`
        );

        const recreatedDevTriggers = await recreateDb.executeQuery(`
          SELECT t.tgname as trigger_name
          FROM pg_trigger t 
          JOIN pg_class c ON t.tgrelid = c.oid 
          JOIN pg_namespace n ON c.relnamespace = n.oid 
          WHERE n.nspname = 'dev' 
            AND t.tgname NOT LIKE 'RI_ConstraintTrigger_%'
          ORDER BY t.tgname
        `);
        console.log(
          `Recreated dev triggers: ${recreatedDevTriggers.rows.map(r => r.trigger_name).join(', ')}`
        );

        // Verify prod schema was recreated
        const recreatedProdTables = await recreateDb.executeQuery(`
          SELECT tablename FROM pg_tables 
          WHERE schemaname = 'prod' 
          ORDER BY tablename
        `);
        console.log(
          `Recreated prod tables: ${recreatedProdTables.rows.map(r => r.tablename).join(', ')}`
        );

        const recreatedProdFunctions = await recreateDb.executeQuery(`
          SELECT p.proname as function_name
          FROM pg_proc p 
          JOIN pg_namespace n ON p.pronamespace = n.oid 
          WHERE n.nspname = 'prod' 
          ORDER BY p.proname
        `);
        console.log(
          `Recreated prod functions: ${recreatedProdFunctions.rows.map(r => r.function_name).join(', ')}`
        );

        // Compare with original
        const originalDevTables = await testDb.executeQuery(`
          SELECT tablename FROM pg_tables 
          WHERE schemaname = 'dev' 
          ORDER BY tablename
        `);

        const originalDevFunctions = await testDb.executeQuery(`
          SELECT p.proname as function_name
          FROM pg_proc p 
          JOIN pg_namespace n ON p.pronamespace = n.oid 
          WHERE n.nspname = 'dev' 
          ORDER BY p.proname
        `);

        const originalDevTriggers = await testDb.executeQuery(`
          SELECT t.tgname as trigger_name
          FROM pg_trigger t 
          JOIN pg_class c ON t.tgrelid = c.oid 
          JOIN pg_namespace n ON c.relnamespace = n.oid 
          WHERE n.nspname = 'dev' 
            AND t.tgname NOT LIKE 'RI_ConstraintTrigger_%'
          ORDER BY t.tgname
        `);

        // Assertions
        expect(recreatedDevTables.rows.length).toBe(
          originalDevTables.rows.length
        );
        expect(recreatedDevFunctions.rows.length).toBe(
          originalDevFunctions.rows.length
        );
        expect(recreatedDevTriggers.rows.length).toBe(
          originalDevTriggers.rows.length
        );

        console.log('✅ Database recreation successful - all structures match');
      } finally {
        // Cleanup recreated database
        await recreateDb.dropTestDatabase();
      }
    });
  });
});
