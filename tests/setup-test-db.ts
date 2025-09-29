#!/usr/bin/env tsx

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

  async function setupTestDatabase() {
    console.log('🚀 Setting up test database...');
    console.log(`📊 Database: ${testConfig.database}`);
    console.log(`📋 Schema: ${testConfig.schema}`);
    console.log(`📄 Script: ${scriptPath}`);

    try {
      const manager = TestDatabaseManager.getInstance();
      const testDb = await manager.setupTestDatabase(testConfig, scriptPath);

      console.log('✅ Test database setup complete!');
      console.log('📋 Available tables:');

      const tables = await testDb.getTables();
      tables.forEach(table => console.log(`  - ${table}`));

      console.log('🔧 Available functions:');
      const functions = await testDb.getFunctions();
      functions.forEach(func => console.log(`  - ${func}`));

      console.log('⚡ Available triggers:');
      const triggers = await testDb.getTriggers();
      triggers.forEach(trigger => console.log(`  - ${trigger}`));

      console.log('\n🎉 Test database is ready for testing!');
      console.log('💡 Run tests with: npm test');
    } catch (error) {
      console.error('❌ Failed to setup test database:', error);
      process.exit(1);
    }
  }

  async function cleanupTestDatabase() {
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

  switch (command) {
    case 'setup':
      await setupTestDatabase();
      break;
    case 'cleanup':
      await cleanupTestDatabase();
      break;
    default:
      console.log('Usage: tsx tests/setup-test-db.ts [setup|cleanup]');
      console.log('  setup   - Create and populate test database');
      console.log('  cleanup - Remove test database');
      process.exit(1);
  }
}

// Run the main function
main().catch(console.error);
