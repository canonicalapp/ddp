# DDP Gen Command

The `ddp gen` command generates comprehensive schema definitions from live PostgreSQL databases.

## Overview

The generation command extracts database schema information and creates modular SQL files that can be used for:

- Version control of database schemas
- Database documentation
- Schema replication
- Development environment setup

## Usage

```bash
ddp gen [options]
```

## Options

| Option              | Type    | Default       | Description                                                  |
| ------------------- | ------- | ------------- | ------------------------------------------------------------ |
| `--env <path>`      | string  | auto-discover | Path to .env file                                            |
| `--host <host>`     | string  | localhost     | Database host                                                |
| `--port <port>`     | string  | 5432          | Database port                                                |
| `--database <name>` | string  | required      | Database name                                                |
| `--username <user>` | string  | required      | Database username                                            |
| `--password <pass>` | string  | required      | Database password                                            |
| `--schema <name>`   | string  | public        | Schema name to introspect                                    |
| `--output <dir>`    | string  | ./output      | Output directory for generated files                         |
| `--stdout`          | boolean | false         | Output individual files to stdout instead of saving to files |
| `--schema-only`     | boolean | false         | Generate only schema.sql                                     |
| `--procs-only`      | boolean | false         | Generate only procs.sql                                      |
| `--triggers-only`   | boolean | false         | Generate only triggers.sql                                   |

## Examples

### Basic Generation

Generate all schema components:

```bash
ddp gen --database mydb --username user --password pass
```

### Environment Variables

Use environment variables from .env file:

```bash
ddp gen --env .env
```

### Specific Schema

Generate from a specific schema:

```bash
ddp gen --database mydb --username user --password pass --schema my_schema
```

### Custom Output Directory

Generate to a custom directory:

```bash
ddp gen --database mydb --username user --password pass --output ./schema_files
```

### Selective Generation

Generate only specific components:

```bash
# Generate only tables, columns, constraints, and indexes
ddp gen --database mydb --username user --password pass --schema-only

# Generate only functions and procedures
ddp gen --database mydb --username user --password pass --procs-only

# Generate only triggers
ddp gen --database mydb --username user --password pass --triggers-only
```

### Console Output

Output to console instead of files:

```bash
ddp gen --database mydb --username user --password pass --stdout
```

## Generated Files

### schema.sql

Contains table definitions, columns, constraints, and indexes:

```sql
-- Tables
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_created_at ON users(created_at);

-- Constraints
ALTER TABLE users ADD CONSTRAINT users_username_key UNIQUE (username);
ALTER TABLE users ADD CONSTRAINT users_email_key UNIQUE (email);
```

### procs.sql

Contains functions and stored procedures:

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

-- Procedures
CREATE OR REPLACE PROCEDURE update_user_status(
  user_id INTEGER,
  new_status VARCHAR(20)
)
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE users
  SET status = new_status, updated_at = CURRENT_TIMESTAMP
  WHERE id = user_id;
END;
$$;
```

### triggers.sql

Contains database triggers:

```sql
-- Trigger Functions
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER users_audit_trigger
  AFTER INSERT OR UPDATE OR DELETE ON users
  FOR EACH ROW
  EXECUTE FUNCTION audit_trigger_function();
```

## Environment Variables

DDP supports configuration through environment variables:

```bash
# Database connection
DB_HOST=localhost
DB_PORT=5432
DB_NAME=mydatabase
DB_USER=username
DB_PASSWORD=password
DB_SCHEMA=public
```

## Configuration File

Create a `.env` file in your project root:

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=my_database
DB_USER=my_username
DB_PASSWORD=my_password
DB_SCHEMA=public

# Output Configuration
OUTPUT_DIR=./schema
```

## Output Structure

When generating to files, DDP creates the following structure:

```
output/
├── schema.sql      # Tables, columns, constraints, indexes
├── procs.sql       # Functions and procedures
└── triggers.sql    # Database triggers
```

## Error Handling

DDP provides comprehensive error handling:

### Common Errors

**Missing Credentials:**

```
Error: Database credentials are required. Provide via options or .env file.
Required: --database, --username, --password
Or set in .env: DB_NAME, DB_USER, DB_PASSWORD
```

**Connection Failed:**

```
DDP GEN failed: connection refused
```

**Invalid Schema:**

```
DDP GEN failed: schema "invalid_schema" does not exist
```

### Troubleshooting

1. **Check Database Connection:**

   ```bash
   psql -h localhost -p 5432 -U username -d database
   ```

2. **Verify Schema Exists:**

   ```sql
   SELECT schema_name FROM information_schema.schemata;
   ```

3. **Check Permissions:**
   ```sql
   SELECT has_schema_privilege('username', 'schema_name', 'USAGE');
   ```

## Advanced Usage

### Custom Output Formatting

The generated SQL files are formatted for readability and include:

- Proper indentation
- Comments for complex objects
- Consistent naming conventions
- PostgreSQL-specific syntax

### Integration with CI/CD

Use DDP in your CI/CD pipeline:

```yaml
# GitHub Actions example
- name: Generate Schema
  run: |
    ddp gen --database ${{ secrets.DB_NAME }} \
            --username ${{ secrets.DB_USER }} \
            --password ${{ secrets.DB_PASSWORD }} \
            --output ./schema
```

### Version Control Integration

Generated schema files are designed to be version controlled:

```bash
# Add generated files to git
git add schema.sql procs.sql triggers.sql
git commit -m "Update database schema"
```

## Implementation Status

**Current Status**: The generation command is currently in development. The CLI interface is complete, but the actual generation logic is being implemented.

**Planned Features**:

- Complete schema introspection
- Advanced formatting options
- Custom output templates
- Schema validation
- Incremental generation

## Related Commands

- [`ddp sync`](./sync.md) - Synchronize database schemas
- [`ddp help`](../README.md) - Show help information

## See Also

- [Main Documentation](../README.md)
- [API Documentation](../api/README.md)
- [Examples](../examples/README.md)
