import { writeFileSync, rmSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { loadEnvFile } from '@/utils/envLoader';

describe('loadEnvFile', () => {
  const keys = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'] as const;

  beforeEach(() => {
    for (const key of keys) {
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of keys) {
      delete process.env[key];
    }
  });

  it('parses quoted env values without preserving quote characters', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ddp-env-loader-'));
    const envPath = join(dir, '.env');
    writeFileSync(
      envPath,
      [
        "DB_HOST='localhost'",
        "DB_PORT='5432'",
        "DB_NAME='billing_ddp_test'",
        "DB_USER='postgres'",
        "DB_PASSWORD='postgres'",
      ].join('\n'),
      'utf8'
    );

    try {
      await loadEnvFile(false, envPath);
      expect(process.env.DB_HOST).toBe('localhost');
      expect(process.env.DB_PORT).toBe('5432');
      expect(process.env.DB_NAME).toBe('billing_ddp_test');
      expect(process.env.DB_USER).toBe('postgres');
      expect(process.env.DB_PASSWORD).toBe('postgres');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
