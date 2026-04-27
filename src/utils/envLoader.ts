import { findUp } from 'find-up';
import { readFileSync } from 'fs';
import { parse } from 'dotenv';
import type { TRecord } from '@/types';

/**
 * Load environment variables from .env file
 * @param skipInTest - Whether to skip loading in test environment (default: true)
 * @param customPath - Custom path to .env file (optional)
 */
export const loadEnvFile = async (
  skipInTest: boolean = true,
  customPath?: string
): Promise<void> => {
  // Skip loading .env file in test environment if requested
  if (
    skipInTest &&
    (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID)
  ) {
    return;
  }

  try {
    let envPath: string | undefined;

    if (customPath) {
      envPath = customPath;
    } else {
      envPath = await findUp('.env', { cwd: process.cwd() });
    }

    if (envPath) {
      const envContent = readFileSync(envPath, 'utf8');
      // Use dotenv parser to support quoted values, inline comments, and escapes.
      const envVars: TRecord<string, string> = parse(envContent);

      // Set environment variables
      Object.entries(envVars).forEach(([key, value]) => {
        process.env[key] ??= value;
      });
    }
  } catch {
    // .env file not found or couldn't be read, continue without it
  }
};
