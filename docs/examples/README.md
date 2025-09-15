# DDP Examples

This directory contains comprehensive examples demonstrating how to use DDP (Declarative Database Provisioning) for various database management scenarios.

## Table of Contents

- [Quick Start Examples](#quick-start-examples)
- [Schema Generation Examples](#schema-generation-examples)
- [Schema Synchronization Examples](#schema-synchronization-examples)
- [Environment Configuration Examples](#environment-configuration-examples)
- [CI/CD Integration Examples](#cicd-integration-examples)
- [Advanced Usage Examples](#advanced-usage-examples)
- [Troubleshooting Examples](#troubleshooting-examples)

## Quick Start Examples

### Basic Schema Generation

Generate schema definitions from a live database:

```bash
# Simple generation
ddp gen --database mydb --username user --password pass

# With custom output directory
ddp gen --database mydb --username user --password pass --output ./schema

# Generate only specific components
ddp gen --database mydb --username user --password pass --schema-only
ddp gen --database mydb --username user --password pass --procs-only
ddp gen --database mydb --username user --password pass --triggers-only
```

### Basic Schema Synchronization

Compare and sync two databases:

```bash
# Simple sync
ddp sync \
  --source-database dev_db \
  --source-username dev_user \
  --source-password dev_pass \
  --target-database prod_db \
  --target-username prod_user \
  --target-password prod_pass

# With custom output file
ddp sync \
  --source-database dev_db \
  --target-database prod_db \
  --output migration.sql

# Dry run to preview changes
ddp sync \
  --source-database dev_db \
  --target-database prod_db \
  --dry-run
```

## Schema Generation Examples

### Complete Schema Extraction

Extract all schema components from a database:

```bash
ddp gen \
  --database ecommerce_db \
  --username admin \
  --password secure_password \
  --schema public \
  --output ./ecommerce_schema
```

**Generated Files:**

```
ecommerce_schema/
├── schema.sql      # Tables, columns, constraints, indexes
├── procs.sql       # Functions and procedures
└── triggers.sql    # Database triggers
```

### Selective Component Generation

Generate only specific components:

```bash
# Only tables and columns
ddp gen --database mydb --username user --password pass --schema-only

# Only functions and procedures
ddp gen --database mydb --username user --password pass --procs-only

# Only triggers
ddp gen --database mydb --username user --password pass --triggers-only
```

### Console Output

Output schema definitions to console:

```bash
ddp gen --database mydb --username user --password pass --stdout
```

### Environment-Based Generation

Use environment variables for configuration:

```bash
# Using .env file
ddp gen --env .env

# Using environment variables
export DB_NAME=mydb
export DB_USER=user
export DB_PASSWORD=pass
ddp gen
```

## Schema Synchronization Examples

### Development to Production Sync

Sync development database to production:

```bash
ddp sync \
  --source-database dev_ecommerce \
  --source-username dev_user \
  --source-password dev_pass \
  --source-schema public \
  --target-database prod_ecommerce \
  --target-username prod_user \
  --target-password prod_pass \
  --target-schema public \
  --output prod_migration.sql
```

### Cross-Server Synchronization

Sync databases on different servers:

```bash
ddp sync \
  --source-host dev-server.company.com \
  --source-database dev_db \
  --source-username dev_user \
  --source-password dev_pass \
  --target-host prod-server.company.com \
  --target-database prod_db \
  --target-username prod_user \
  --target-password prod_pass \
  --output cross_server_migration.sql
```

### Schema-to-Schema Sync

Sync between different schemas on the same database:

```bash
ddp sync \
  --source-database mydb \
  --source-username user \
  --source-password pass \
  --source-schema dev_schema \
  --target-database mydb \
  --target-username user \
  --target-password pass \
  --target-schema prod_schema \
  --output schema_migration.sql
```

### Dry Run Analysis

Preview changes before execution:

```bash
ddp sync \
  --source-database dev_db \
  --target-database prod_db \
  --dry-run
```

**Output:**

```
DDP SYNC - Comparing databases and generating alter.sql...
Source: dev_db.public
Target: prod_db.public
Output: alter.sql

-- ===========================================
-- Schema Sync Script
-- Dev Schema: public
-- Prod Schema: public
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
```

## Environment Configuration Examples

### Basic .env File

Create a `.env` file for basic configuration:

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

### Sync-Specific .env File

Create a `.env` file for synchronization:

```env
# Source Database
SOURCE_DB_HOST=localhost
SOURCE_DB_PORT=5432
SOURCE_DB_NAME=dev_database
SOURCE_DB_USER=dev_user
SOURCE_DB_PASSWORD=dev_password
SOURCE_DB_SCHEMA=public

# Target Database
TARGET_DB_HOST=localhost
TARGET_DB_PORT=5432
TARGET_DB_NAME=prod_database
TARGET_DB_USER=prod_user
TARGET_DB_PASSWORD=prod_password
TARGET_DB_SCHEMA=public

# Output Configuration
OUTPUT_FILE=migration.sql
```

### Multiple Environment Files

Use different configuration files for different environments:

```bash
# Development environment
ddp gen --env .env.dev

# Staging environment
ddp gen --env .env.staging

# Production environment
ddp gen --env .env.prod
```

**Example .env.dev:**

```env
DB_HOST=dev-db.company.com
DB_NAME=dev_database
DB_USER=dev_user
DB_PASSWORD=dev_password
```

**Example .env.prod:**

```env
DB_HOST=prod-db.company.com
DB_NAME=prod_database
DB_USER=prod_user
DB_PASSWORD=prod_password
```

## CI/CD Integration Examples

### GitHub Actions

Integrate DDP with GitHub Actions:

```yaml
name: Database Schema Sync

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  sync-schema:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install DDP
        run: npm install -g ddp

      - name: Generate Schema
        run: |
          ddp gen \
            --database ${{ secrets.DEV_DB_NAME }} \
            --username ${{ secrets.DEV_DB_USER }} \
            --password ${{ secrets.DEV_DB_PASSWORD }} \
            --output ./schema

      - name: Sync Schemas
        run: |
          ddp sync \
            --source-database ${{ secrets.DEV_DB_NAME }} \
            --source-username ${{ secrets.DEV_DB_USER }} \
            --source-password ${{ secrets.DEV_DB_PASSWORD }} \
            --target-database ${{ secrets.PROD_DB_NAME }} \
            --target-username ${{ secrets.PROD_DB_USER }} \
            --target-password ${{ secrets.PROD_DB_PASSWORD }} \
            --output migration.sql

      - name: Upload Migration Script
        uses: actions/upload-artifact@v3
        with:
          name: migration-script
          path: migration.sql
```

### GitLab CI

Integrate DDP with GitLab CI:

```yaml
stages:
  - schema-generation
  - schema-sync

variables:
  NODE_VERSION: '18'

schema-generation:
  stage: schema-generation
  image: node:${NODE_VERSION}
  script:
    - npm install -g ddp
    - ddp gen --env .env --output ./schema
  artifacts:
    paths:
      - schema/
    expire_in: 1 week

schema-sync:
  stage: schema-sync
  image: node:${NODE_VERSION}
  script:
    - npm install -g ddp
    - ddp sync --env .env --output migration.sql
  artifacts:
    paths:
      - migration.sql
    expire_in: 1 week
  only:
    - main
```

### Jenkins Pipeline

Integrate DDP with Jenkins:

```groovy
pipeline {
    agent any

    stages {
        stage('Setup') {
            steps {
                sh 'npm install -g ddp'
            }
        }

        stage('Generate Schema') {
            steps {
                sh 'ddp gen --env .env --output ./schema'
            }
        }

        stage('Sync Schema') {
            when {
                branch 'main'
            }
            steps {
                sh 'ddp sync --env .env --output migration.sql'
            }
        }
    }

    post {
        always {
            archiveArtifacts artifacts: 'schema/*', fingerprint: true
            archiveArtifacts artifacts: 'migration.sql', fingerprint: true
        }
    }
}
```

## Advanced Usage Examples

### Custom Output Directory Structure

Organize generated files by environment and date:

```bash
# Create organized directory structure
mkdir -p ./schema/$(date +%Y-%m-%d)/{dev,staging,prod}

# Generate schemas for different environments
ddp gen --env .env.dev --output ./schema/$(date +%Y-%m-%d)/dev
ddp gen --env .env.staging --output ./schema/$(date +%Y-%m-%d)/staging
ddp gen --env .env.prod --output ./schema/$(date +%Y-%m-%d)/prod
```

### Automated Schema Comparison

Create a script to compare schemas across environments:

```bash
#!/bin/bash
# compare_schemas.sh

echo "Generating schemas for all environments..."

# Generate schemas
ddp gen --env .env.dev --output ./schemas/dev
ddp gen --env .env.staging --output ./schemas/staging
ddp gen --env .env.prod --output ./schemas/prod

# Compare schemas
echo "Comparing dev vs staging..."
ddp sync --env .env.dev --target-database staging_db --output dev_to_staging.sql

echo "Comparing staging vs prod..."
ddp sync --env .env.staging --target-database prod_db --output staging_to_prod.sql

echo "Schema comparison complete!"
```

### Database Migration Workflow

Complete migration workflow with DDP:

```bash
#!/bin/bash
# migration_workflow.sh

set -e

echo "Starting database migration workflow..."

# 1. Generate current schema
echo "Step 1: Generating current schema..."
ddp gen --env .env.prod --output ./backup/schema_before_$(date +%Y%m%d_%H%M%S)

# 2. Generate migration script
echo "Step 2: Generating migration script..."
ddp sync --env .env.dev --target-database prod_db --output migration_$(date +%Y%m%d_%H%M%S).sql

# 3. Review migration script
echo "Step 3: Please review the migration script before proceeding..."
read -p "Press Enter to continue after review..."

# 4. Execute migration
echo "Step 4: Executing migration..."
psql -h $PROD_DB_HOST -U $PROD_DB_USER -d $PROD_DB_NAME -f migration_$(date +%Y%m%d_%H%M%S).sql

# 5. Verify migration
echo "Step 5: Verifying migration..."
ddp gen --env .env.prod --output ./backup/schema_after_$(date +%Y%m%d_%H%M%S)

echo "Migration workflow complete!"
```

### Integration with Database Backup

Combine DDP with database backup:

```bash
#!/bin/bash
# backup_and_sync.sh

# Create backup before sync
echo "Creating database backup..."
pg_dump -h $SOURCE_DB_HOST -U $SOURCE_DB_USER -d $SOURCE_DB_NAME > backup_$(date +%Y%m%d_%H%M%S).sql

# Generate sync script
echo "Generating sync script..."
ddp sync \
  --source-database $SOURCE_DB_NAME \
  --source-username $SOURCE_DB_USER \
  --source-password $SOURCE_DB_PASSWORD \
  --target-database $TARGET_DB_NAME \
  --target-username $TARGET_DB_USER \
  --target-password $TARGET_DB_PASSWORD \
  --output migration_$(date +%Y%m%d_%H%M%S).sql

echo "Backup and sync preparation complete!"
```

## Troubleshooting Examples

### Connection Issues

**Problem**: Connection refused error

```bash
# Check database connection
psql -h localhost -p 5432 -U username -d database

# Verify database is running
sudo systemctl status postgresql

# Check firewall settings
sudo ufw status
```

**Solution**: Ensure database is running and accessible

### Permission Issues

**Problem**: Permission denied error

```sql
-- Check user permissions
SELECT has_schema_privilege('username', 'schema_name', 'USAGE');
SELECT has_table_privilege('username', 'table_name', 'SELECT');

-- Grant necessary permissions
GRANT USAGE ON SCHEMA schema_name TO username;
GRANT SELECT ON ALL TABLES IN SCHEMA schema_name TO username;
```

### Schema Not Found

**Problem**: Schema does not exist error

```sql
-- List available schemas
SELECT schema_name FROM information_schema.schemata;

-- Create schema if needed
CREATE SCHEMA IF NOT EXISTS schema_name;
```

### Large Database Performance

**Problem**: Slow performance with large databases

```bash
# Use specific schema instead of all schemas
ddp gen --database mydb --username user --password pass --schema specific_schema

# Generate only specific components
ddp gen --database mydb --username user --password pass --schema-only
```

### Memory Issues

**Problem**: Out of memory errors

```bash
# Increase Node.js memory limit
node --max-old-space-size=4096 $(which ddp) gen --database mydb --username user --password pass
```

## Best Practices

### 1. Always Use Dry Run First

```bash
# Always preview changes before execution
ddp sync --source-database dev_db --target-database prod_db --dry-run
```

### 2. Backup Before Sync

```bash
# Create backup before any sync operation
pg_dump -h localhost -U user -d database > backup_$(date +%Y%m%d_%H%M%S).sql
```

### 3. Use Environment Variables

```bash
# Use .env files for sensitive information
ddp gen --env .env
ddp sync --env .env
```

### 4. Version Control Generated Files

```bash
# Add generated files to version control
git add schema.sql procs.sql triggers.sql
git commit -m "Update database schema"
```

### 5. Clean Up Renamed Objects

```sql
-- After verification, clean up renamed objects
DROP TABLE IF EXISTS old_table_dropped_2024-01-15T10-30-45-123Z;
```

## Related Documentation

- [Main Documentation](../README.md)
- [API Documentation](../api/README.md)
- [Gen Command Documentation](../commands/gen.md)
- [Sync Command Documentation](../commands/sync.md)
