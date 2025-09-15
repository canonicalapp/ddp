# DDP API Documentation

This document provides comprehensive API documentation for the DDP (Declarative Database Provisioning) tool.

## Table of Contents

- [CLI Interface](#cli-interface)
- [Command Modules](#command-modules)
- [Generator Modules](#generator-modules)
- [Sync Operations](#sync-operations)
- [Database Layer](#database-layer)
- [Utility Functions](#utility-functions)
- [Type Definitions](#type-definitions)

## CLI Interface

### Main Entry Point

**File**: `src/cli.js`

The main CLI interface built with Commander.js that provides two primary commands:

- `ddp gen` - Schema generation
- `ddp sync` - Schema synchronization

### Program Configuration

```javascript
program
  .name('ddp')
  .description('Declarative Database Provisioning - DDP CLI tool')
  .version('1.0.0');
```

## Command Modules

### Generation Command

**File**: `src/commands/gen/index.js`

#### `genCommand(options)`

Main handler for the `ddp gen` command.

**Parameters:**

- `options` (Object) - Command line options

**Options:**

- `env` (string) - Path to .env file (default: auto-discover)
- `host` (string) - Database host
- `port` (string) - Database port (default: '5432')
- `database` (string) - Database name (required)
- `username` (string) - Database username (required)
- `password` (string) - Database password (required)
- `schema` (string) - Schema name to introspect (default: 'public')
- `output` (string) - Output directory for generated files (default: './output')
- `stdout` (boolean) - Output individual files to stdout instead of saving to files
- `schemaOnly` (boolean) - Generate only schema.sql
- `procsOnly` (boolean) - Generate only procs.sql
- `triggersOnly` (boolean) - Generate only triggers.sql

**Returns:** `Promise<void>`

**Example:**

```javascript
await genCommand({
  database: 'mydb',
  username: 'user',
  password: 'pass',
  schema: 'public',
  output: './schema',
});
```

### Synchronization Command

**File**: `src/commands/sync/index.js`

#### `syncCommand(options)`

Main handler for the `ddp sync` command.

**Parameters:**

- `options` (Object) - Command line options

**Options:**

- `env` (string) - Path to .env file (default: auto-discover)
- `sourceHost` (string) - Source database host
- `sourcePort` (string) - Source database port (default: '5432')
- `sourceDatabase` (string) - Source database name (required)
- `sourceUsername` (string) - Source database username (required)
- `sourcePassword` (string) - Source database password (required)
- `sourceSchema` (string) - Source schema name (default: 'public')
- `targetHost` (string) - Target database host
- `targetPort` (string) - Target database port (default: '5432')
- `targetDatabase` (string) - Target database name (required)
- `targetUsername` (string) - Target database username (required)
- `targetPassword` (string) - Target database password (required)
- `targetSchema` (string) - Target schema name (default: 'public')
- `output` (string) - Output file for alter.sql (default: 'alter.sql')
- `dryRun` (boolean) - Show what would be changed without executing

**Returns:** `Promise<void>`

**Example:**

```javascript
await syncCommand({
  sourceDatabase: 'dev_db',
  sourceUsername: 'dev_user',
  sourcePassword: 'dev_pass',
  targetDatabase: 'prod_db',
  targetUsername: 'prod_user',
  targetPassword: 'prod_pass',
  output: 'migration.sql',
});
```

## Generator Modules

### Base Generator

**File**: `src/generators/baseGenerator.js`

Base class for all schema generators providing common functionality.

#### `BaseGenerator(client, options)`

**Constructor Parameters:**

- `client` (Client) - PostgreSQL client instance
- `options` (Object) - Generator options

### Schema Generator

**File**: `src/generators/schemaGenerator.js`

Generates schema.sql files containing tables, columns, constraints, and indexes.

#### `SchemaGenerator`

Extends `BaseGenerator` to generate table definitions and related objects.

### Procedures Generator

**File**: `src/generators/procsGenerator.js`

Generates procs.sql files containing functions and stored procedures.

#### `ProcsGenerator`

Extends `BaseGenerator` to generate function and procedure definitions.

### Triggers Generator

**File**: `src/generators/triggersGenerator.js`

Generates triggers.sql files containing database triggers.

#### `TriggersGenerator`

Extends `BaseGenerator` to generate trigger definitions.

## Sync Operations

### Schema Sync Orchestrator

**File**: `src/sync/orchestrator.js`

Main coordinator for schema synchronization operations.

#### `SchemaSyncOrchestrator(client, options)`

**Constructor Parameters:**

- `client` (Client) - PostgreSQL client instance
- `options` (Object) - Sync options

**Options:**

- `conn` (string) - Source database connection string
- `dev` (string) - Development schema name
- `prod` (string) - Production schema name
- `targetConn` (string) - Target database connection string
- `output` (string) - Output file path
- `dryRun` (boolean) - Dry run mode

#### `execute()`

Executes the complete schema synchronization process.

**Returns:** `Promise<string>` - Generated sync script

#### `generateSyncScript()`

Generates the complete schema sync script.

**Returns:** `Promise<Array<string>>` - Array of SQL statements

#### `saveScriptToFile(script, filename)`

Saves the generated script to a file.

**Parameters:**

- `script` (string) - Script content
- `filename` (string) - Output file path

### Operation Modules

#### Table Operations

**File**: `src/sync/operations/tables.js`

Handles table-level synchronization operations.

##### `TableOperations`

**Methods:**

- `getTables(schemaName)` - Get all tables from a schema
- `getTableDefinition(schemaName, tableName)` - Get table structure
- `generateCreateTableStatement(tableName, columns)` - Generate CREATE TABLE SQL
- `generateTableOperations()` - Generate complete table sync operations

#### Column Operations

**File**: `src/sync/operations/columns.js`

Handles column-level synchronization operations.

##### `ColumnOperations`

**Methods:**

- `getColumns(schemaName)` - Get all columns from a schema
- `groupColumnsByTable(columns)` - Group columns by table
- `generateColumnDefinition(column)` - Generate column definition SQL
- `generateAlterColumnStatement(tableName, devCol, prodCol)` - Generate ALTER COLUMN SQL
- `generateColumnOperations()` - Generate complete column sync operations

#### Function Operations

**File**: `src/sync/operations/functions.js`

Handles function and procedure synchronization operations.

##### `FunctionOperations`

**Methods:**

- `getFunctions(schemaName)` - Get all functions/procedures from a schema
- `getFunctionDefinition(schemaName, functionName)` - Get function definition
- `generateFunctionOperations()` - Generate complete function sync operations

#### Constraint Operations

**File**: `src/sync/operations/constraints.js`

Handles constraint synchronization operations.

##### `ConstraintOperations`

**Methods:**

- `getConstraints(schemaName)` - Get all constraints from a schema
- `generateConstraintOperations()` - Generate complete constraint sync operations

#### Index Operations

**File**: `src/sync/operations/indexes.js`

Handles index synchronization operations.

##### `IndexOperations`

**Methods:**

- `getIndexes(schemaName)` - Get all indexes from a schema
- `generateIndexOperations()` - Generate complete index sync operations

#### Trigger Operations

**File**: `src/sync/operations/triggers.js`

Handles trigger synchronization operations.

##### `TriggerOperations`

**Methods:**

- `getTriggers(schemaName)` - Get all triggers from a schema
- `generateTriggerOperations()` - Generate complete trigger sync operations

## Database Layer

### Connection Management

**File**: `src/database/connection.js`

Handles PostgreSQL database connections.

#### `createConnection(options)`

Creates a new PostgreSQL client connection.

**Parameters:**

- `options` (Object) - Connection options
  - `host` (string) - Database host
  - `port` (number) - Database port
  - `database` (string) - Database name
  - `username` (string) - Username
  - `password` (string) - Password

**Returns:** `Client` - PostgreSQL client instance

### Database Introspection

**File**: `src/database/introspection.js`

Provides methods for introspecting database schemas.

#### `DatabaseIntrospector(client)`

**Constructor Parameters:**

- `client` (Client) - PostgreSQL client instance

**Methods:**

- `getSchemas()` - Get all schemas
- `getTables(schemaName)` - Get tables in a schema
- `getColumns(schemaName)` - Get columns in a schema
- `getFunctions(schemaName)` - Get functions in a schema
- `getTriggers(schemaName)` - Get triggers in a schema
- `getConstraints(schemaName)` - Get constraints in a schema
- `getIndexes(schemaName)` - Get indexes in a schema

### Database Queries

**File**: `src/database/queries.js`

Contains predefined SQL queries for database introspection.

#### Query Functions

- `getTablesQuery(schemaName)` - Query for table information
- `getColumnsQuery(schemaName)` - Query for column information
- `getFunctionsQuery(schemaName)` - Query for function information
- `getTriggersQuery(schemaName)` - Query for trigger information
- `getConstraintsQuery(schemaName)` - Query for constraint information
- `getIndexesQuery(schemaName)` - Query for index information

## Utility Functions

### Formatting Utilities

**File**: `src/utils/formatting.js`

Provides formatting utilities for SQL generation.

#### `Utils`

**Static Methods:**

- `generateTimestamp()` - Generate timestamp for naming
- `generateBackupName(originalName, suffix)` - Generate backup names
- `generateOutputFilename(devSchema, prodSchema, prefix)` - Generate output filenames
- `formatColumnDefinition(column)` - Format column definitions
- `formatDataType(column)` - Format data types
- `generateManualReviewComment(type, name, reason)` - Generate review comments
- `generateSectionHeader(title)` - Generate section headers
- `generateScriptFooter()` - Generate script footer

### Naming Utilities

**File**: `src/utils/naming.js`

Provides naming convention utilities.

#### `NamingUtils`

**Static Methods:**

- `sanitizeName(name)` - Sanitize object names
- `generateBackupName(originalName)` - Generate backup names
- `validateName(name)` - Validate object names

### Validation Utilities

**File**: `src/utils/validation.js`

Provides validation utilities.

#### `ValidationUtils`

**Static Methods:**

- `validateConnectionString(connString)` - Validate connection strings
- `validateSchemaName(schemaName)` - Validate schema names
- `validateOptions(options)` - Validate command options

### Comparison Utilities

**File**: `src/utils/comparison.js`

Provides comparison utilities for schema objects.

#### `ComparisonUtils`

**Static Methods:**

- `compareTables(devTable, prodTable)` - Compare table definitions
- `compareColumns(devCol, prodCol)` - Compare column definitions
- `compareFunctions(devFunc, prodFunc)` - Compare function definitions
- `compareConstraints(devConstraint, prodConstraint)` - Compare constraint definitions

### Preservation Utilities

**File**: `src/utils/preservation.js`

Provides data preservation utilities.

#### `PreservationUtils`

**Static Methods:**

- `generateBackupName(originalName, type)` - Generate backup names
- `createRenameStatement(objectType, oldName, newName)` - Create rename statements
- `createDropStatement(objectType, name)` - Create drop statements

## Type Definitions

**File**: `src/types/index.js`

Contains TypeScript-style type definitions for the project.

### Database Objects

```javascript
// Table definition
const TableDefinition = {
  name: string,
  columns: ColumnDefinition[],
  constraints: ConstraintDefinition[],
  indexes: IndexDefinition[]
};

// Column definition
const ColumnDefinition = {
  name: string,
  type: string,
  nullable: boolean,
  defaultValue: string | null,
  length: number | null,
  precision: number | null,
  scale: number | null
};

// Function definition
const FunctionDefinition = {
  name: string,
  schema: string,
  definition: string,
  language: string,
  returnType: string,
  parameters: ParameterDefinition[]
};

// Trigger definition
const TriggerDefinition = {
  name: string,
  table: string,
  event: string,
  timing: string,
  function: string,
  definition: string
};
```

### Configuration Objects

```javascript
// Generator options
const GeneratorOptions = {
  database: string,
  username: string,
  password: string,
  host: string,
  port: number,
  schema: string,
  output: string,
  stdout: boolean,
};

// Sync options
const SyncOptions = {
  conn: string,
  dev: string,
  prod: string,
  targetConn: string,
  output: string,
  dryRun: boolean,
};
```

## Error Handling

DDP implements comprehensive error handling throughout the API:

### Error Types

- `ConnectionError` - Database connection failures
- `ValidationError` - Input validation failures
- `GenerationError` - Schema generation failures
- `SyncError` - Schema synchronization failures
- `FileError` - File operation failures

### Error Handling Pattern

```javascript
try {
  // Operation
  const result = await operation();
  return result;
} catch (error) {
  console.error('Operation failed:', error.message);
  process.exit(1);
}
```

## Examples

### Basic Usage

```javascript
import { genCommand, syncCommand } from './src/commands/index.js';

// Generate schema
await genCommand({
  database: 'mydb',
  username: 'user',
  password: 'pass',
  output: './schema',
});

// Sync schemas
await syncCommand({
  sourceDatabase: 'dev_db',
  sourceUsername: 'dev_user',
  sourcePassword: 'dev_pass',
  targetDatabase: 'prod_db',
  targetUsername: 'prod_user',
  targetPassword: 'prod_pass',
  output: 'migration.sql',
});
```

### Advanced Usage

```javascript
import { SchemaSyncOrchestrator } from './src/sync/orchestrator.js';
import { Client } from 'pg';

const client = new Client({
  connectionString: 'postgresql://user:pass@localhost:5432/database',
});

const orchestrator = new SchemaSyncOrchestrator(client, {
  conn: 'postgresql://user:pass@localhost:5432/database',
  dev: 'dev_schema',
  prod: 'prod_schema',
  output: 'sync.sql',
});

await client.connect();
const script = await orchestrator.execute();
await client.end();
```

## Testing

The API is thoroughly tested with a comprehensive test suite:

- **Unit Tests**: Individual module testing
- **Integration Tests**: End-to-end workflow testing
- **E2E Tests**: Complete command execution testing
- **Coverage**: 91.59% code coverage across 348 tests

Run tests with:

```bash
npm test
npm run test:coverage
npm run test:integration
```
