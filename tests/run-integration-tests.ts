#!/usr/bin/env tsx

import { execSync } from 'child_process';
import {
  TestDatabaseManager,
  TestDatabaseConfig,
} from './fixtures/testDatabase';
import { loadEnvFile } from '../src/utils/envLoader';
import { join } from 'path';
import { existsSync } from 'fs';

async function main() {
  // Load test environment variables using the existing function
  const testEnvPath = join(process.cwd(), '.env.testing');
  if (!existsSync(testEnvPath)) {
    console.error(
      '❌ Test environment file not found. Please create .env.testing file'
    );
    process.exit(1);
  }

  // Use the existing loadEnvFile function with custom path
  await loadEnvFile(false, testEnvPath); // Don't skip in test environment, use custom path

  const testConfig: TestDatabaseConfig = {
    host: process.env.TEST_DB_HOST || 'localhost',
    port: parseInt(process.env.TEST_DB_PORT || '5432'),
    database: process.env.TEST_DB_NAME || 'ddp_test_runner',
    username: process.env.TEST_DB_USER || 'postgres',
    password: process.env.TEST_DB_PASSWORD || 'root',
    schema: process.env.TEST_DB_SCHEMA || 'test',
  };

  const scriptPath =
    process.env.TEST_DATA_SCRIPT_BASIC || 'test-database-setup.sql';

  async function runIntegrationTests() {
    console.log('🚀 Starting Integration Tests with Live Database...');
    console.log(`📊 Database: ${testConfig.database}`);
    console.log(`📋 Schema: ${testConfig.schema}`);
    console.log(`📄 Script: ${scriptPath}`);

    try {
      // Setup test database
      console.log('\n📦 Setting up test database...');
      const manager = TestDatabaseManager.getInstance();
      const testDb = await manager.setupTestDatabase(testConfig, scriptPath);

      console.log('✅ Test database setup complete!');

      // Verify database is ready
      const tables = await testDb.getTables();
      console.log(`📋 Found ${tables.length} tables: ${tables.join(', ')}`);

      const functions = await testDb.getFunctions();
      console.log(
        `🔧 Found ${functions.length} functions: ${functions.join(', ')}`
      );

      const triggers = await testDb.getTriggers();
      console.log(
        `⚡ Found ${triggers.length} triggers: ${triggers.join(', ')}`
      );

      // Run the integration tests
      console.log('\n🧪 Running integration tests...');

      try {
        execSync('npm test -- --testPathPattern="integration" --verbose', {
          stdio: 'inherit',
          cwd: process.cwd(),
        });
        console.log('\n✅ All integration tests passed!');
      } catch (testError) {
        console.error('\n❌ Some tests failed:', testError);
        throw testError;
      }
    } catch (error) {
      console.error('❌ Integration test setup failed:', error);
      process.exit(1);
    } finally {
      // Cleanup is optional - keep database for inspection
      console.log(
        '\n💡 Test database kept for inspection. Clean up manually with:'
      );
      console.log('   tsx tests/setup-test-db.ts cleanup');
    }
  }

  async function runSpecificTest(testName: string) {
    console.log(`🧪 Running specific test: ${testName}`);

    try {
      const manager = TestDatabaseManager.getInstance();
      let testDb = manager.getTestDatabase();

      if (!testDb) {
        console.log('📦 Setting up test database...');
        testDb = await manager.setupTestDatabase(testConfig, scriptPath);
      }

      execSync(`npm test -- --testNamePattern="${testName}" --verbose`, {
        stdio: 'inherit',
        cwd: process.cwd(),
      });

      console.log('✅ Test completed successfully!');
    } catch (error) {
      console.error('❌ Test failed:', error);
      process.exit(1);
    }
  }

  async function cleanup() {
    console.log('🧹 Cleaning up test database...');

    try {
      const manager = TestDatabaseManager.getInstance();
      await manager.cleanupTestDatabase();
      console.log('✅ Test database cleanup complete!');
    } catch (error) {
      console.error('❌ Failed to cleanup test database:', error);
      process.exit(1);
    }
  }

  // Handle command line arguments
  const command = process.argv[2];
  const testName = process.argv[3];

  switch (command) {
    case 'run':
      await runIntegrationTests();
      break;
    case 'test':
      if (!testName) {
        console.error(
          '❌ Please provide test name: tsx tests/run-integration-tests.ts test "test name"'
        );
        process.exit(1);
      }
      await runSpecificTest(testName);
      break;
    case 'cleanup':
      await cleanup();
      break;
    default:
      console.log(
        'Usage: tsx tests/run-integration-tests.ts [run|test|cleanup] [test-name]'
      );
      console.log('  run                    - Run all integration tests');
      console.log('  test "test name"       - Run specific test');
      console.log('  cleanup                - Remove test database');
      process.exit(1);
  }
}

// Run the main function
main().catch(console.error);
