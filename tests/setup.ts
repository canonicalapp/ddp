import { loadEnvFile } from '../src/utils/envLoader';
import { join } from 'path';
import { existsSync } from 'fs';

// Load test environment variables using the existing function
const testEnvPath = join(process.cwd(), '.env.testing');
if (existsSync(testEnvPath)) {
  // Use the existing loadEnvFile function with custom path
  loadEnvFile(false, testEnvPath); // Don't skip in test environment, use custom path
}
