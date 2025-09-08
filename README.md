# Schema Sync Script

A modular PostgreSQL schema synchronization tool that generates ALTER scripts to sync development and production database schemas.

## Features

- **Table Operations**: Create missing tables, drop extra tables (with data preservation)
- **Column Operations**: Add missing columns, drop extra columns, modify column types
- **Function Operations**: Sync stored procedures and functions
- **Constraint Operations**: Sync foreign keys, unique constraints, and indexes
- **Trigger Operations**: Sync database triggers
- **Data Preservation**: All destructive operations rename objects first to preserve data

## Project Structure

```
schema-sync-script/
├── index.js                           # Main entry point
├── package.json                       # Dependencies and scripts
├── modules/                           # Modular components
│   ├── schemaSyncOrchestrator.js     # Main orchestrator
│   ├── tableOperations.js            # Table sync logic
│   ├── columnOperations.js           # Column sync logic
│   ├── functionOperations.js         # Function/procedure sync logic
│   ├── constraintOperations.js       # Constraint/index sync logic
│   └── triggerOperations.js          # Trigger sync logic
└── README.md                         # This file
```

## Usage

### Console Output (Default)

```bash
npm run start -- --conn "postgresql://user:pass@host:port/database" --dev "dev_schema" --prod "prod_schema"
```

### Save to File

```bash
# Auto-generated filename with timestamp
npm run start -- --conn "postgresql://user:pass@host:port/database" --dev "dev_schema" --prod "prod_schema" --save

# Custom filename
npm run start -- --conn "postgresql://user:pass@host:port/database" --dev "dev_schema" --prod "prod_schema" --save --output "my-schema-sync.sql"

# Save to subdirectory
npm run start -- --conn "postgresql://user:pass@host:port/database" --dev "dev_schema" --prod "prod_schema" --save --output "scripts/schema-sync.sql"
```

### Options

- `--conn <connectionString>`: PostgreSQL connection string (required)
- `--dev <schemaName>`: Development schema name (required)
- `--prod <schemaName>`: Production schema name (required)
- `--with-comments`: Include column comments (optional, not yet implemented)
- `--save`: Save script to file instead of console output (optional)
- `--output <filename>`: Output filename when using --save (optional, auto-generated if not provided)

### File Naming Convention

When using `--save` without `--output`, files are automatically named using this pattern:

```
schema-sync_{dev-schema}-to-{prod-schema}_{timestamp}.sql
```

Example: `schema-sync_dev-to-prod_2024-01-15T10-30-45.sql`

## Module Architecture

### SchemaSyncOrchestrator

The main coordinator that:

- Manages database connections
- Coordinates all operation modules
- Generates the final sync script
- Handles error management

### TableOperations

Handles table-level operations:

- `getTables(schemaName)`: Get all tables from a schema
- `getTableDefinition(schemaName, tableName)`: Get table structure
- `generateCreateTableStatement(tableName, columns)`: Generate CREATE TABLE SQL
- `generateTableOperations()`: Main method to generate table sync operations

### ColumnOperations

Handles column-level operations:

- `getColumns(schemaName)`: Get all columns from a schema
- `groupColumnsByTable(columns)`: Group columns by table
- `generateColumnDefinition(column)`: Generate column definition SQL
- `generateAlterColumnStatement(tableName, devCol, prodCol)`: Generate ALTER COLUMN SQL
- `generateColumnOperations()`: Main method to generate column sync operations

### FunctionOperations

Handles stored procedures and functions:

- `getFunctions(schemaName)`: Get all functions/procedures from a schema
- `generateFunctionOperations()`: Main method to generate function sync operations

### ConstraintOperations

Handles constraints and indexes:

- `getConstraints(schemaName)`: Get all constraints from a schema
- `generateConstraintOperations()`: Main method to generate constraint sync operations

### TriggerOperations

Handles database triggers:

- `getTriggers(schemaName)`: Get all triggers from a schema
- `generateTriggerOperations()`: Main method to generate trigger sync operations

## Data Preservation Strategy

All destructive operations are designed to preserve data:

1. **Tables**: Renamed with timestamp before drop

   - `table_name_dropped_2024-01-15T10-30-45-123Z`

2. **Columns**: Renamed with timestamp before drop

   - `column_name_dropped_2024-01-15T10-30-45-123Z`

3. **Functions**: Renamed with timestamp before drop
   - `function_name_dropped_2024-01-15T10-30-45-123Z`

Manual cleanup is required after confirming data is no longer needed.

## Example Output

```sql
-- ===========================================
-- Schema Sync Script
-- Dev Schema: dev
-- Prod Schema: prod
-- Generated: 2024-01-15T10:30:45.123Z
-- ===========================================

-- ===========================================
-- TABLE OPERATIONS
-- ===========================================
-- Create missing table orders
CREATE TABLE prod.orders (
  "id" integer NOT NULL DEFAULT nextval('dev.orders_id_seq'::regclass),
  "user_id" integer,
  "product_id" integer,
  "quantity" integer DEFAULT 1,
  "order_date" timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);

-- ===========================================
-- COLUMN OPERATIONS
-- ===========================================
ALTER TABLE prod.products ADD COLUMN "description" text;
ALTER TABLE prod.users ADD COLUMN "status" character varying(20) DEFAULT 'active'::character varying;

-- ===========================================
-- CONSTRAINT/INDEX OPERATIONS
-- ===========================================
-- TODO: Create constraint orders_pkey in prod
-- Constraint type: PRIMARY KEY
-- TODO: Create constraint orders_product_id_fkey in prod
-- Constraint type: FOREIGN KEY
-- Foreign key: product_id -> products.id

-- ===========================================
-- END OF SCHEMA SYNC SCRIPT
-- ===========================================
```

## Development

### Adding New Operations

1. Create a new module in `modules/` directory
2. Follow the existing pattern with a class and `generateOperations()` method
3. Add the module to `SchemaSyncOrchestrator`
4. Update the orchestrator's `generateSyncScript()` method

### Testing

```bash
# Test with your database
npm run start -- --conn "your-connection-string" --dev "dev_schema" --prod "prod_schema"
```

## Dependencies

- `pg`: PostgreSQL client for Node.js
- `commander`: Command-line interface framework

## License

ISC
