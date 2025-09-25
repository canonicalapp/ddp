# DDP Utilities

This directory contains utility modules for the Declarative Database Provisioning (DDP) tool.

## Modules

### generatorErrors.ts

Custom error classes for generator operations with detailed context and error codes.

#### Classes

- `GeneratorError` - Base error class for all generator operations
- `SchemaGeneratorError` - Specific errors for schema generation
- `ProcsGeneratorError` - Specific errors for procedures generation
- `TriggersGeneratorError` - Specific errors for triggers generation
- `DatabaseConnectionError` - Specific errors for database connections
- `IntrospectionError` - Specific errors for database introspection

#### Error Codes

- `CONNECTION_FAILED` - Database connection failures
- `AUTHENTICATION_FAILED` - Authentication failures
- `SCHEMA_NOT_FOUND` - Schema not found errors
- `INVALID_SCHEMA` - Invalid schema errors
- `INVALID_TABLE` - Invalid table errors
- `INVALID_FUNCTION` - Invalid function errors
- `INVALID_TRIGGER` - Invalid trigger errors
- `GENERATION_FAILED` - General generation failures
- `SQL_SYNTAX_ERROR` - SQL syntax errors
- `MISSING_DEPENDENCY` - Missing dependency errors
- `INTROSPECTION_FAILED` - Introspection failures
- `QUERY_FAILED` - Query execution failures
- `DATA_CORRUPTION` - Data corruption errors

#### Usage

```typescript
import {
  SchemaGeneratorError,
  DatabaseConnectionError,
  ERROR_CODES,
} from '@/utils/generatorErrors';

// Throw specific error with context
throw new SchemaGeneratorError('Failed to generate table SQL', {
  table: 'users',
  schema: 'public',
  error: 'constraint_failed',
});

// Use error codes
if (error.code === ERROR_CODES.CONNECTION_FAILED) {
  // Handle connection error
}
```

### validation.ts

Comprehensive input validation utilities for database operations.

#### Functions

- `validateDatabaseConnection(connection)` - Validates database connection parameters
- `validateSchemaName(schema)` - Validates PostgreSQL schema names
- `validateTableName(tableName)` - Validates PostgreSQL table names
- `validateFunctionName(functionName)` - Validates PostgreSQL function/procedure names
- `validateSQLIdentifier(identifier, type)` - Validates SQL identifiers with optional quoting
- `validateNotNull(value, name)` - Ensures value is not null or undefined
- `validateNonEmptyString(value, name)` - Ensures value is a non-empty string
- `validatePositiveInteger(value, name)` - Ensures value is a positive integer
- `validateNonEmptyArray(array, name)` - Ensures value is a non-empty array
- `validateRequiredProperties(obj, requiredProperties)` - Ensures object has required properties
- `sanitizeSQLIdentifier(identifier)` - Sanitizes SQL identifiers for safe use

#### Usage

```typescript
import {
  validateDatabaseConnection,
  validateSchemaName,
} from '@/utils/validation';

// Validate connection
const connection = {
  host: 'localhost',
  port: 5432,
  database: 'mydb',
  username: 'user',
  password: 'pass',
  schema: 'public',
};
validateDatabaseConnection(connection);

// Validate schema name
validateSchemaName('my_schema');
```

### logger.ts

Structured logging utility with multiple log levels and context support.

#### Classes

- `Logger` - Main logger class (singleton)

#### Enums

- `LogLevel` - Log levels: DEBUG, INFO, WARN, ERROR

#### Functions

- `logDebug(message, context?)` - Log debug message
- `logInfo(message, context?)` - Log info message
- `logWarn(message, context?)` - Log warning message
- `logError(message, error?, context?)` - Log error message

#### Usage

```typescript
import { logInfo, logError, Logger, LogLevel } from '@/utils/logger';

// Use convenience functions
logInfo('Operation completed', { userId: 123 });
logError('Operation failed', error, { context: 'validation' });

// Use logger instance
const logger = Logger.getInstance();
logger.setLogLevel(LogLevel.DEBUG);
logger.debug('Debug message', { data: 'value' });
```

### progress.ts

Progress indicator utility for long-running operations.

#### Classes

- `ProgressIndicator` - Visual progress indicator

#### Interfaces

- `ProgressOptions` - Configuration options for progress indicator

#### Functions

- `createProgress(options)` - Create progress indicator
- `logProgress(message, current, total)` - Log progress message
- `withProgress(items, processor, options?)` - Process items with progress

#### Usage

```typescript
import { createProgress, withProgress } from '@/utils/progress';

// Create progress indicator
const progress = createProgress({
  total: 100,
  title: 'Processing',
  showPercentage: true,
  showTime: true,
});

// Update progress
progress.update(50);
progress.complete();

// Process items with progress
await withProgress(
  items,
  async (item, index) => {
    await processItem(item);
  },
  { title: 'Processing items' }
);
```

### testHelpers.ts

Test utility functions for database testing.

#### Functions

- `createTestClient()` - Create test database client
- `cleanupTestClient(client)` - Clean up test client
- `executeTestSQL(sql)` - Execute SQL in test database
- `queryTestDB(sql, params?)` - Query test database
- `isTestDatabaseAvailable()` - Check if test database is available
- `resetTestSchema()` - Reset test database schema
- `setupTestDatabase()` - Setup test database with sample data
- `createMockConnection()` - Create mock database connection
- `createMockClient(responses?)` - Create mock database client

#### Usage

```typescript
import {
  createTestClient,
  cleanupTestClient,
  setupTestDatabase,
} from '@/utils/testHelpers';

// Setup test database
await setupTestDatabase();

// Use test client
const client = await createTestClient();
try {
  const result = await client.query('SELECT * FROM test_table');
  // Test logic
} finally {
  await cleanupTestClient(client);
}
```

## Error Handling

All utilities use the DDP error system:

- `ValidationError` - For input validation failures (from types/errors)
- `DatabaseError` - For general database operation failures (from types/errors)
- `GeneratorError` - For generator-specific failures (from utils/generatorErrors)
- `DatabaseConnectionError` - For connection-specific failures (from utils/generatorErrors)

## Testing

Each utility module has comprehensive unit tests:

- `validation.test.ts` - Tests for validation functions
- `logger.test.ts` - Tests for logging functionality
- `progress.test.ts` - Tests for progress indicators

## Configuration

Utilities can be configured through environment variables:

- `DB_HOST` - Database host
- `DB_PORT` - Database port
- `DB_NAME` - Database name
- `DB_USER` - Database username
- `DB_PASSWORD` - Database password
- `DB_SCHEMA` - Database schema

## Best Practices

1. **Validation**: Always validate inputs before processing
2. **Logging**: Use appropriate log levels and include context
3. **Progress**: Show progress for operations taking >1 second
4. **Testing**: Use test helpers for database operations
5. **Error Handling**: Use specific error types for better debugging
6. **Error Context**: Include detailed context in error objects
