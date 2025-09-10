/**
 * Jest setup file for schema-sync-script tests
 */

// Mock console methods to avoid noise in tests
global.console = {
  ...console,
  log: () => {},
  error: () => {},
  warn: () => {},
  info: () => {},
  debug: () => {},
};
