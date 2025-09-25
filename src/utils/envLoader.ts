import { findUp } from 'find-up';
import { readFileSync } from 'fs';
import type { TRecord } from '@/types';

/**
 * Load environment variables from .env file
 * @param skipInTest - Whether to skip loading in test environment (default: true)
 */
export const loadEnvFile = async (
  skipInTest: boolean = true
): Promise<void> => {
  // Skip loading .env file in test environment if requested
  if (
    skipInTest &&
    (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID)
  ) {
    return;
  }

  try {
    const envPath = await findUp('.env', { cwd: process.cwd() });
    if (envPath) {
      const envContent = readFileSync(envPath, 'utf8');
      const envVars: TRecord<string, string> = {};

      envContent.split('\n').forEach((line: string) => {
        const [key, ...valueParts] = line.split('=');
        if (key && valueParts.length > 0) {
          const value = valueParts.join('=').trim();
          envVars[key.trim()] = value;
        }
      });

      // Set environment variables
      Object.entries(envVars).forEach(([key, value]) => {
        process.env[key] ??= value;
      });
    }
  } catch {
    // .env file not found or couldn't be read, continue without it
  }
};
