export default {
  // Test environment
  testEnvironment: 'node',

  // Test file patterns
  testMatch: [
    '<rootDir>/tests/**/*.test.{js,ts}',
    '<rootDir>/tests/**/*.spec.{js,ts}',
  ],

  // TypeScript support
  preset: 'ts-jest/presets/default',
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        useESM: false,
        tsconfig: {
          module: 'commonjs',
        },
      },
    ],
  },

  // Path mapping to match tsconfig.json
  moduleNameMapper: {
    '^@/fixtures/(.*)$': '<rootDir>/tests/fixtures/$1',
    '^@/types/(.*)$': '<rootDir>/src/types/$1',
    '^@/commands/(.*)$': '<rootDir>/src/commands/$1',
    '^@/sync/(.*)$': '<rootDir>/src/sync/$1',
    '^@/utils/(.*)$': '<rootDir>/src/utils/$1',
    '^@/config/(.*)$': '<rootDir>/src/config/$1',
    '^@/database/(.*)$': '<rootDir>/src/database/$1',
    '^@/file/(.*)$': '<rootDir>/src/file/$1',
    '^@/generators/(.*)$': '<rootDir>/src/generators/$1',
    '^@/(.*)$': '<rootDir>/src/$1',
    // Mock find-up module to avoid ES module issues
    '^find-up$': '<rootDir>/tests/fixtures/mocks/find-up.js',
  },

  // Coverage configuration
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  collectCoverageFrom: [
    '<rootDir>/src/**/*.{js,ts}',
    '!**/node_modules/**',
    '!**/tests/**',
    '!**/*.d.ts',
  ],

  // Setup files - removed setup.js as it only mocks console

  // Test timeout
  testTimeout: 30000,

  // Verbose output
  verbose: true,

  // Clear mocks between tests
  clearMocks: true,
  restoreMocks: true,
};
