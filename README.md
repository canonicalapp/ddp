# DDP - Declarative Database Provisioning

A comprehensive PostgreSQL database schema management and synchronization tool that provides declarative database provisioning capabilities through a modern CLI interface.

## Overview

DDP (Declarative Database Provisioning) is a Node.js CLI tool designed to help development teams manage PostgreSQL database schemas in a declarative, version-controlled manner. It provides two core functionalities:

1. **Schema Generation** - Extract schema definitions from live databases
2. **Schema Synchronization** - Compare and sync database schemas with data preservation

## Features

### 🔄 Schema Generation (`ddp gen`)

- **Complete Schema Extraction**: Generate comprehensive schema definitions from live PostgreSQL databases
- **Modular Output**: Separate files for different schema components
  - `schema.sql` - Tables, columns, constraints, indexes
  - `procs.sql` - Functions and stored procedures
  - `triggers.sql` - Database triggers
- **Flexible Output**: Console output or file generation
- **Selective Generation**: Generate specific components only
- **Environment Integration**: Support for `.env` files and environment variables

### 🔄 Schema Synchronization (`ddp sync`)

- **Bi-directional Comparison**: Compare two live databases and generate sync scripts
- **Comprehensive Coverage**: Handle all database objects
  - Tables (create missing, drop extra with data preservation)
  - Columns (add missing, modify types, drop extra)
  - Functions/Procedures (sync definitions and parameters)
  - Constraints (foreign keys, unique constraints, check constraints)
  - Indexes (sync index definitions and properties)
  - Triggers (sync trigger definitions and events)
- **Data Preservation**: All destructive operations rename objects first to preserve data
- **Safe Migration**: Generate ALTER scripts for review before execution

## Installation

```bash
# Install globally
npm install -g @advcomm/ddp

# Or install locally in your project
npm install @advcomm/ddp
```

## Quick Start

### Generate Schema Definitions

```bash
# Generate all schema components
ddp gen --database mydb --username user --password pass

# Generate specific components only
ddp gen --database mydb --username user --password pass --schema-only
ddp gen --database mydb --username user --password pass --procs-only
ddp gen --database mydb --username user --password pass --triggers-only

# Use environment variables
ddp gen --env .env

# Output to specific directory
ddp gen --database mydb --username user --password pass --output ./schema
```

### Synchronize Database Schemas

```bash
# Compare and sync two databases
ddp sync \
  --source-database dev_db --source-username dev_user --source-password dev_pass \
  --target-database prod_db --target-username prod_user --target-password prod_pass

# Use environment variables
ddp sync --env .env

# Dry run to preview changes
ddp sync --source-database dev_db --target-database prod_db --dry-run

# Custom output file
ddp sync --source-database dev_db --target-database prod_db --output migration.sql
```

## Configuration

### Environment Variables

DDP supports configuration through environment variables or `.env` files:

```bash
# Database connection
DB_HOST=localhost
DB_PORT=5432
DB_NAME=mydatabase
DB_USER=username
DB_PASSWORD=password
DB_SCHEMA=public

# For sync operations
SOURCE_DB_HOST=localhost
SOURCE_DB_PORT=5432
SOURCE_DB_NAME=dev_database
SOURCE_DB_USER=dev_user
SOURCE_DB_PASSWORD=dev_password
SOURCE_DB_SCHEMA=public

TARGET_DB_HOST=localhost
TARGET_DB_PORT=5432
TARGET_DB_NAME=prod_database
TARGET_DB_USER=prod_user
TARGET_DB_PASSWORD=prod_password
TARGET_DB_SCHEMA=public
```

### Command Line Options

#### Generation Command (`ddp gen`)

| Option              | Description                       | Default       |
| ------------------- | --------------------------------- | ------------- |
| `--env <path>`      | Path to .env file                 | Auto-discover |
| `--host <host>`     | Database host                     | localhost     |
| `--port <port>`     | Database port                     | 5432          |
| `--database <name>` | Database name                     | Required      |
| `--username <user>` | Database username                 | Required      |
| `--password <pass>` | Database password                 | Required      |
| `--schema <name>`   | Schema name to introspect         | public        |
| `--output <dir>`    | Output directory                  | ./output      |
| `--stdout`          | Output to stdout instead of files | false         |
| `--schema-only`     | Generate only schema.sql          | false         |
| `--procs-only`      | Generate only procs.sql           | false         |
| `--triggers-only`   | Generate only triggers.sql        | false         |

#### Synchronization Command (`ddp sync`)

| Option                     | Description                    | Default       |
| -------------------------- | ------------------------------ | ------------- |
| `--env <path>`             | Path to .env file              | Auto-discover |
| `--source-host <host>`     | Source database host           | localhost     |
| `--source-port <port>`     | Source database port           | 5432          |
| `--source-database <name>` | Source database name           | Required      |
| `--source-username <user>` | Source database username       | Required      |
| `--source-password <pass>` | Source database password       | Required      |
| `--source-schema <name>`   | Source schema name             | public        |
| `--target-host <host>`     | Target database host           | localhost     |
| `--target-port <port>`     | Target database port           | 5432          |
| `--target-database <name>` | Target database name           | Required      |
| `--target-username <user>` | Target database username       | Required      |
| `--target-password <pass>` | Target database password       | Required      |
| `--target-schema <name>`   | Target schema name             | public        |
| `--output <file>`          | Output file for alter.sql      | alter.sql     |
| `--dry-run`                | Show changes without executing | false         |

## Example Output

### Generated Schema Files

**schema.sql**

```sql
-- Tables
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_created_at ON users(created_at);
```

**procs.sql**

```sql
-- Functions
CREATE OR REPLACE FUNCTION get_user_by_email(email_param VARCHAR(100))
RETURNS TABLE(id INTEGER, username VARCHAR(50), email VARCHAR(100))
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT u.id, u.username, u.email
  FROM users u
  WHERE u.email = email_param;
END;
$$;
```

**triggers.sql**

```sql
-- Triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

### Generated Sync Script

**alter.sql**

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
-- CONSTRAINT OPERATIONS
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

## Data Preservation Strategy

DDP implements a comprehensive data preservation strategy to ensure no data loss during schema migrations:

### Renaming Convention

All destructive operations rename objects with timestamps before dropping:

- **Tables**: `table_name_dropped_2024-01-15T10-30-45-123Z`
- **Columns**: `column_name_dropped_2024-01-15T10-30-45-123Z`
- **Functions**: `function_name_dropped_2024-01-15T10-30-45-123Z`
- **Constraints**: `constraint_name_dropped_2024-01-15T10-30-45-123Z`
- **Indexes**: `index_name_dropped_2024-01-15T10-30-45-123Z`
- **Triggers**: `trigger_name_dropped_2024-01-15T10-30-45-123Z`

### Manual Cleanup

After confirming data is no longer needed, manual cleanup is required:

```sql
-- Example cleanup after verification
DROP TABLE IF EXISTS old_table_dropped_2024-01-15T10-30-45-123Z;
DROP COLUMN IF EXISTS old_column_dropped_2024-01-15T10-30-45-123Z;
```

## Development

**Note**: The npm package contains only the compiled CLI tool. For development, testing, and contributing, you need to clone the source repository from GitHub.

### Prerequisites

- Node.js 18+ with ES modules support
- PostgreSQL 12+ for database operations
- npm or yarn for package management

### Setup (Source Repository)

```bash
# Clone the repository
git clone <repository-url>
cd ddp

# Install dependencies
npm install

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests with cleanup
npm run test:clean
```

### Testing (Source Repository)

The source repository includes a comprehensive test suite with **562 tests across 26 test files**:

```bash
# Run all tests (562 tests across 26 files)
npm test

# Run specific test suites
npm run test:unit        # Unit tests (24 files)
npm run test:integration # Integration tests (2 files)

# Run with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch

# Run tests with verbose output
npm run test:verbose

# Run tests for CI
npm run test:ci
```

#### Manual Testing

For comprehensive manual testing of the `gen` and `sync` commands, you can test with your own databases:

```bash
# Test schema generation
ddp gen --database mydb --username myuser --password mypass

# Test schema synchronization (dry run first)
ddp sync --source-database dev_db --target-database prod_db --dry-run

# Generate actual sync script
ddp sync --source-database dev_db --target-database prod_db --output migration.sql
```

**Note**: For development and testing with test fixtures, clone the source repository from GitHub which includes test database setup scripts and comprehensive test suites.

### Code Quality (Source Repository)

```bash
# Lint code
npm run lint

# Fix linting issues
npm run lint:fix

# Format code
npm run format

# Check code quality
npm run check

# Run all checks
npm run check:all
```

### Cleanup Commands (Source Repository)

```bash
# Clean test-generated files
npm run clean

# Clean only SQL files
npm run clean:test-files

# Clean only output directory
npm run clean:output

# Clean everything
npm run clean:all
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests (`npm test`)
5. Run linting (`npm run lint`)
6. Commit your changes (`git commit -m 'Add amazing feature'`)
7. Push to the branch (`git push origin feature/amazing-feature`)
8. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For support, questions, or feature requests, please open an issue on the GitHub repository.

## Changelog

### v1.0.0

- Initial release
- Schema generation from live databases
- Schema synchronization between databases
- Comprehensive test suite (562 tests across 26 files)
- Data preservation strategy
- CLI interface with full argument parsing
- Environment variable support
- Modular TypeScript architecture
- Clean, organized test structure
- Complete type safety with TypeScript
