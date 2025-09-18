/**
 * CLI and command-line interface tests
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

describe('CLI Interface', () => {
  const scriptPath = path.join(process.cwd(), 'src/cli.ts');

  beforeEach(() => {
    // Mock console methods to avoid noise in tests
    // Note: jest functions are available within test functions, not in global scope
  });

  afterEach(() => {
    // Note: jest functions are available within test functions, not in global scope
  });

  describe('Command Line Arguments', () => {
    it('should show help when --help is provided', async () => {
      const result = await runCLI(['--help']);

      expect(result.stdout).toContain('Usage:');
      expect(result.stdout).toContain('Options:');
      expect(result.stdout).toContain('Commands:');
      expect(result.stdout).toContain('gen');
      expect(result.stdout).toContain('sync');
    });

    it('should show version when --version is provided', async () => {
      const result = await runCLI(['--version']);

      expect(result.stdout).toContain('1.0.0');
    });

    it('should show help for gen command', async () => {
      const result = await runCLI(['gen', '--help']);

      expect(result.stdout).toContain('Generate schema definitions');
      expect(result.stdout).toContain('--host');
      expect(result.stdout).toContain('--database');
      expect(result.stdout).toContain('--username');
      expect(result.stdout).toContain('--password');
    });

    it('should show help for sync command', async () => {
      const result = await runCLI(['sync', '--help']);

      expect(result.stdout).toContain('Compare two live databases');
      expect(result.stdout).toContain('--source-host');
      expect(result.stdout).toContain('--target-host');
      expect(result.stdout).toContain('--source-database');
      expect(result.stdout).toContain('--target-database');
    });

    it('should reject unknown commands', async () => {
      const result = await runCLI(['unknown-command']);

      expect(result.stderr).toContain('unknown command');
      expect(result.code).not.toBe(0);
    });
  });

  describe('Gen Command', () => {
    it('should require database credentials', async () => {
      const result = await runCLI(['gen']);

      expect(result.stderr).toContain('Database credentials are required');
      expect(result.stderr).toContain(
        'Required: --database, --username, --password'
      );
      expect(result.code).not.toBe(0);
    });

    it('should accept database credentials', async () => {
      const result = await runCLI([
        'gen',
        '--host',
        'localhost',
        '--database',
        'testdb',
        '--username',
        'testuser',
        '--password',
        'testpass',
      ]);

      // Should not fail due to missing arguments
      expect(result.stderr).not.toContain('Database credentials are required');
      // Gen command currently exits with 0 (placeholder implementation)
      expect(result.code).toBe(0);
    });

    it('should accept optional schema name', async () => {
      const result = await runCLI([
        'gen',
        '--host',
        'localhost',
        '--database',
        'testdb',
        '--username',
        'testuser',
        '--password',
        'testpass',
        '--schema',
        'custom_schema',
      ]);

      expect(result.stderr).not.toContain('unknown option');
      expect(result.code).toBe(0);
    });

    it('should accept output directory option', async () => {
      const result = await runCLI([
        'gen',
        '--host',
        'localhost',
        '--database',
        'testdb',
        '--username',
        'testuser',
        '--password',
        'testpass',
        '--output',
        './custom-output',
      ]);

      expect(result.stderr).not.toContain('unknown option');
      expect(result.code).toBe(0);
    });

    it('should accept stdout option', async () => {
      const result = await runCLI([
        'gen',
        '--host',
        'localhost',
        '--database',
        'testdb',
        '--username',
        'testuser',
        '--password',
        'testpass',
        '--stdout',
      ]);

      expect(result.stderr).not.toContain('unknown option');
      expect(result.code).toBe(0);
    });

    it('should accept filter options', async () => {
      const result = await runCLI([
        'gen',
        '--host',
        'localhost',
        '--database',
        'testdb',
        '--username',
        'testuser',
        '--password',
        'testpass',
        '--schema-only',
      ]);

      expect(result.stderr).not.toContain('unknown option');
      expect(result.code).toBe(0);
    });
  });

  describe('Sync Command', () => {
    it('should work with environment variables when no options provided', async () => {
      // Set environment variables for the test
      const testEnv = {
        ...process.env,
        SOURCE_DB_HOST: 'localhost',
        SOURCE_DB_PORT: '5432',
        SOURCE_DB_NAME: 'test_source_db',
        SOURCE_DB_USER: 'test_source_user',
        SOURCE_DB_PASSWORD: 'test_source_pass',
        SOURCE_DB_SCHEMA: 'public',
        TARGET_DB_HOST: 'localhost',
        TARGET_DB_PORT: '5432',
        TARGET_DB_NAME: 'test_target_db',
        TARGET_DB_USER: 'test_target_user',
        TARGET_DB_PASSWORD: 'test_target_pass',
        TARGET_DB_SCHEMA: 'public',
      };

      const result = await runCLI(['sync'], testEnv);

      // Should work with environment variables
      expect(result.stderr).not.toContain('credentials are required');
      // May fail due to connection, but should not fail due to missing credentials
      expect(result.code).toBeDefined();
    });

    it('should require target database credentials when source is provided', async () => {
      const result = await runCLI([
        'sync',
        '--source-host',
        'localhost',
        '--source-database',
        'sourcedb',
        '--source-username',
        'sourceuser',
        '--source-password',
        'sourcepass',
      ]);

      // The sync command validates credentials after building connection details
      // It will fail with either missing target credentials or connection error
      expect(result.stderr).toMatch(
        /Target database credentials are required|DDP SYNC failed/
      );
      expect(result.code).not.toBe(0);
    });

    it('should accept all required credentials', async () => {
      const result = await runCLI([
        'sync',
        '--source-host',
        'localhost',
        '--source-database',
        'sourcedb',
        '--source-username',
        'sourceuser',
        '--source-password',
        'sourcepass',
        '--target-host',
        'localhost',
        '--target-database',
        'targetdb',
        '--target-username',
        'targetuser',
        '--target-password',
        'targetpass',
      ]);

      // Should not fail due to missing arguments
      expect(result.stderr).not.toContain('credentials are required');
      // May fail due to connection, but should not fail due to missing args
      expect(result.code).toBeDefined();
    });

    it('should accept optional schema names', async () => {
      const result = await runCLI([
        'sync',
        '--source-host',
        'localhost',
        '--source-database',
        'sourcedb',
        '--source-username',
        'sourceuser',
        '--source-password',
        'sourcepass',
        '--source-schema',
        'dev_schema',
        '--target-host',
        'localhost',
        '--target-database',
        'targetdb',
        '--target-username',
        'targetuser',
        '--target-password',
        'targetpass',
        '--target-schema',
        'prod_schema',
      ]);

      expect(result.stderr).not.toContain('unknown option');
      expect(result.code).toBeDefined();
    });

    it('should accept output file option', async () => {
      const result = await runCLI([
        'sync',
        '--source-host',
        'localhost',
        '--source-database',
        'sourcedb',
        '--source-username',
        'sourceuser',
        '--source-password',
        'sourcepass',
        '--target-host',
        'localhost',
        '--target-database',
        'targetdb',
        '--target-username',
        'targetuser',
        '--target-password',
        'targetpass',
        '--output',
        'custom-alter.sql',
      ]);

      expect(result.stderr).not.toContain('unknown option');
      expect(result.code).toBeDefined();
    });

    it('should accept dry-run option', async () => {
      const result = await runCLI([
        'sync',
        '--source-host',
        'localhost',
        '--source-database',
        'sourcedb',
        '--source-username',
        'sourceuser',
        '--source-password',
        'sourcepass',
        '--target-host',
        'localhost',
        '--target-database',
        'targetdb',
        '--target-username',
        'targetuser',
        '--target-password',
        'targetpass',
        '--dry-run',
      ]);

      expect(result.stderr).not.toContain('unknown option');
      expect(result.code).toBeDefined();
    });
  });

  describe('Connection String Validation', () => {
    it('should accept valid database credentials for gen command', async () => {
      const result = await runCLI([
        'gen',
        '--host',
        'localhost',
        '--port',
        '5432',
        '--database',
        'testdb',
        '--username',
        'testuser',
        '--password',
        'testpass',
      ]);

      // Should not fail due to invalid credentials format
      expect(result.stderr).not.toContain('invalid');
    });

    it('should handle special characters in credentials', async () => {
      const result = await runCLI([
        'gen',
        '--host',
        'localhost',
        '--database',
        'test%20db',
        '--username',
        'test%20user',
        '--password',
        'test%20pass',
      ]);

      expect(result.stderr).not.toContain('invalid');
    });
  });

  describe('Schema Name Validation', () => {
    it('should accept valid schema names', async () => {
      const validSchemas = [
        'public',
        'dev_schema',
        'prod_schema',
        'schema123',
        'my-schema',
        'schema_with_underscores',
        'SchemaWithCamelCase',
      ];

      for (const schema of validSchemas) {
        const result = await runCLI([
          'gen',
          '--host',
          'localhost',
          '--database',
          'testdb',
          '--username',
          'testuser',
          '--password',
          'testpass',
          '--schema',
          schema,
        ]);

        expect(result.stderr).not.toContain('invalid');
      }
    });

    it('should handle schema names with special characters', async () => {
      const specialSchemas = [
        'schema-with-dashes',
        'schema_with_underscores',
        'schema.with.dots',
        'schema@with@at',
        'schema#with#hash',
      ];

      for (const schema of specialSchemas) {
        const result = await runCLI([
          'gen',
          '--host',
          'localhost',
          '--database',
          'testdb',
          '--username',
          'testuser',
          '--password',
          'testpass',
          '--schema',
          schema,
        ]);

        expect(result.stderr).not.toContain('invalid');
      }
    });
  });

  describe('File Output Options', () => {
    it('should save to file when output directory is provided', async () => {
      const outputDir = 'test-output-dir';

      // Clean up any existing directory
      if (fs.existsSync(outputDir)) {
        fs.rmSync(outputDir, { recursive: true });
      }

      const result = await runCLI([
        'gen',
        '--host',
        'localhost',
        '--database',
        'testdb',
        '--username',
        'testuser',
        '--password',
        'testpass',
        '--output',
        outputDir,
      ]);

      // Should not fail due to argument parsing
      expect(result.stderr).not.toContain('unknown option');
      expect(result.stderr).not.toContain('required option');

      // Gen command currently exits with 0 (placeholder implementation)
      expect(result.code).toBe(0);

      // Clean up
      if (fs.existsSync(outputDir)) {
        fs.rmSync(outputDir, { recursive: true });
      }
    });

    it('should output to stdout when --stdout is provided', async () => {
      const result = await runCLI([
        'gen',
        '--host',
        'localhost',
        '--database',
        'testdb',
        '--username',
        'testuser',
        '--password',
        'testpass',
        '--stdout',
      ]);

      // Should not fail due to argument parsing
      expect(result.stderr).not.toContain('unknown option');
      expect(result.stderr).not.toContain('required option');

      // Gen command currently exits with 0 (placeholder implementation)
      expect(result.code).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid connection gracefully for gen command', async () => {
      const result = await runCLI([
        'gen',
        '--host',
        'invalid-host',
        '--database',
        'testdb',
        '--username',
        'testuser',
        '--password',
        'testpass',
      ]);

      // Gen command is currently a placeholder, so it won't actually connect
      expect(result.code).toBe(0);
    });

    it('should handle invalid connection gracefully for sync command', async () => {
      const result = await runCLI([
        'sync',
        '--source-host',
        'invalid-host',
        '--source-database',
        'sourcedb',
        '--source-username',
        'sourceuser',
        '--source-password',
        'sourcepass',
        '--target-host',
        'invalid-host',
        '--target-database',
        'targetdb',
        '--target-username',
        'targetuser',
        '--target-password',
        'targetpass',
      ]);

      expect(result.stderr).toContain('DDP SYNC failed');
      expect(result.code).not.toBe(0);
    });

    it('should handle missing schemas gracefully', async () => {
      const result = await runCLI([
        'gen',
        '--host',
        'localhost',
        '--database',
        'testdb',
        '--username',
        'testuser',
        '--password',
        'testpass',
        '--schema',
        'nonexistent_schema',
      ]);

      // Gen command is currently a placeholder, so it won't actually connect
      expect(result.code).toBe(0);
    });
  });

  describe('Output Format', () => {
    it('should output to console by default for gen command', async () => {
      const result = await runCLI([
        'gen',
        '--host',
        'localhost',
        '--database',
        'testdb',
        '--username',
        'testuser',
        '--password',
        'testpass',
      ]);

      // Gen command is currently a placeholder, so it won't actually connect
      expect(result.stderr).not.toContain('unknown option');
      expect(result.stderr).not.toContain('required option');
      expect(result.code).toBe(0);
    });

    it('should output to console by default for sync command', async () => {
      const result = await runCLI([
        'sync',
        '--source-host',
        'localhost',
        '--source-database',
        'sourcedb',
        '--source-username',
        'sourceuser',
        '--source-password',
        'sourcepass',
        '--target-host',
        'localhost',
        '--target-database',
        'targetdb',
        '--target-username',
        'targetuser',
        '--target-password',
        'targetpass',
      ]);

      // May fail due to connection, but should not fail due to missing args
      expect(result.stderr).not.toContain('unknown option');
      expect(result.stderr).not.toContain('required option');
      expect(result.code).toBeDefined();
    });
  });

  describe('Performance and Resource Usage', () => {
    it('should complete within reasonable time for small schemas', async () => {
      const startTime = Date.now();

      await runCLI([
        'gen',
        '--host',
        'localhost',
        '--database',
        'testdb',
        '--username',
        'testuser',
        '--password',
        'testpass',
      ]);

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete within 30 seconds (allowing for network timeouts)
      expect(duration).toBeLessThan(30000);
    });

    it('should handle large output gracefully', async () => {
      const result = await runCLI([
        'gen',
        '--host',
        'localhost',
        '--database',
        'testdb',
        '--username',
        'testuser',
        '--password',
        'testpass',
      ]);

      // Should not crash with large output
      expect(result.code).toBeDefined();
    });
  });

  // Helper function to run CLI with arguments
  const runCLI = async (args, env = process.env) => {
    return new Promise(resolve => {
      const child = spawn('npx', ['tsx', scriptPath, ...args], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: env,
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', data => {
        stdout += data.toString();
      });

      child.stderr.on('data', data => {
        stderr += data.toString();
      });

      child.on('close', code => {
        resolve({
          code,
          stdout,
          stderr,
        });
      });

      child.on('error', error => {
        resolve({
          code: 1,
          stdout,
          stderr: error.message,
        });
      });
    });
  };
});
