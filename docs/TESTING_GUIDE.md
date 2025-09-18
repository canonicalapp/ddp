# DDP Testing Guide

This guide explains how to test the DDP `gen` and `sync` commands using the provided test database setup.

## Prerequisites

1. **PostgreSQL Database** (version 12 or higher)
2. **Database User** with CREATE privileges
3. **DDP CLI** built and ready (`npm run build`)

## Step 1: Database Setup

### 1.1 Run the Test Database Setup Script

```bash
# Connect to your PostgreSQL database as a superuser or user with CREATE privileges
psql -h localhost -U postgres -d your_database_name -f test-database-setup.sql
```

This script creates:

- **`dev` schema** - Complete source database with:
  - 5 tables (users, categories, products, orders, order_items, inventory_logs)
  - 3 functions (calculate_order_total, update_product_stock, get_user_orders)
  - 1 procedure (process_order)
  - 3 triggers (updated_at triggers, order validation)
  - Comprehensive indexes and constraints
  - Sample data

- **`prod` schema** - Incomplete target database with:
  - 4 tables (users, categories, products, orders) - missing columns and tables
  - 1 function (get_user_count) - different from dev
  - Basic indexes only
  - Different sample data

## Step 2: Test the GEN Command

### 2.1 Test Schema Generation (Dev)

```bash
# Generate schema from dev database
npm run dev gen -- --host localhost --port 5432 --database your_database_name --username your_username --password your_password --schema dev --output ./test-output/dev
```

**Expected Output:**

```
DDP GEN - Validating database connection...
Database: your_database_name
Schema: dev
Host: localhost:5432
✅ Database connection validated successfully
✅ Read-only access confirmed
Output: ./test-output/dev
🔍 Introspecting database schema...
📊 Database: your_database_name (PostgreSQL 15.0)
📁 Schema: dev (owner: your_username)
📋 Discovering tables...
   Found 6 tables
📋 Discovering table details...
   Analyzed 6 tables with full metadata
⚙️  Discovering functions and procedures...
   Found 3 functions/procedures
🔔 Discovering triggers...
   Found 3 triggers
✅ Database introspection completed successfully

🔧 Generating SchemaGenerator...
📄 Generated: ./test-output/dev/schema.sql
✅ SchemaGenerator generation completed successfully
🔧 Generating ProcsGenerator...
📄 Generated: ./test-output/dev/procs.sql
✅ ProcsGenerator generation completed successfully
🔧 Generating TriggersGenerator...
📄 Generated: ./test-output/dev/triggers.sql
✅ TriggersGenerator generation completed successfully
🎉 All SQL files generated successfully!
```

### 2.2 Test Schema Generation (Prod)

```bash
# Generate schema from prod database
npm run dev gen -- --host localhost --port 5432 --database your_database_name --username your_username --password your_password --schema prod --output ./test-output/prod
```

**Expected Output:**

- Similar to dev but with fewer tables, functions, and triggers
- Should show 4 tables, 1 function, 0 triggers

### 2.3 Test Individual Components

```bash
# Test schema only
npm run dev gen -- --schema-only --host localhost --port 5432 --database your_database_name --username your_username --password your_password --schema dev --output ./test-output/dev-schema-only

# Test procedures only
npm run dev gen -- --procs-only --host localhost --port 5432 --database your_database_name --username your_username --password your_password --schema dev --output ./test-output/dev-procs-only

# Test triggers only
npm run dev gen -- --triggers-only --host localhost --port 5432 --database your_database_name --username your_username --password your_password --schema dev --output ./test-output/dev-triggers-only

# Test stdout output
npm run dev gen -- --stdout --host localhost --port 5432 --database your_database_name --username your_username --password your_password --schema dev
```

## Step 3: Test the SYNC Command

### 3.1 Basic Sync Test

```bash
# Sync dev (source) to prod (target)
npm run dev sync -- \
  --source-host localhost --source-port 5432 --source-database your_database_name --source-username your_username --source-password your_password --source-schema dev \
  --target-host localhost --target-port 5432 --target-database your_database_name --target-username your_username --target-password your_password --target-schema prod \
  --output ./test-output/alter.sql
```

**Expected Output:**

```
DDP SYNC - Validating database connections...
Source: localhost:5432/your_database_name.dev
Target: localhost:5432/your_database_name.prod
✅ Source database connection validated successfully
✅ Target database connection validated successfully
✅ Read-only access confirmed for both databases
🔍 Comparing schemas...
📊 Source schema: dev (6 tables, 3 functions, 3 triggers)
📊 Target schema: prod (4 tables, 1 function, 0 triggers)
🔍 Analyzing differences...
📋 Tables to add: 2 (order_items, inventory_logs)
📋 Tables to modify: 4 (users, categories, products, orders)
📋 Functions to add: 2 (calculate_order_total, update_product_stock, get_user_orders)
📋 Functions to modify: 0
📋 Triggers to add: 3
📋 Generating alter.sql...
📄 Generated: ./test-output/alter.sql
✅ Schema synchronization completed successfully
```

### 3.2 Dry Run Test

```bash
# Test dry run (shows what would be changed without executing)
npm run dev sync -- --dry-run \
  --source-host localhost --source-port 5432 --source-database your_database_name --source-username your_username --source-password your_password --source-schema dev \
  --target-host localhost --target-port 5432 --target-database your_database_name --target-username your_username --target-password your_password --target-schema prod
```

## Step 4: Verify Generated Files

### 4.1 Check Generated Files

```bash
# List generated files
ls -la test-output/

# Check file sizes
wc -l test-output/dev/*.sql
wc -l test-output/prod/*.sql
wc -l test-output/alter.sql
```

### 4.2 Examine Generated Content

```bash
# View schema files
head -50 test-output/dev/schema.sql
head -50 test-output/prod/schema.sql

# View procedures
head -30 test-output/dev/procs.sql
head -30 test-output/prod/procs.sql

# View triggers
head -30 test-output/dev/triggers.sql
head -30 test-output/prod/triggers.sql

# View sync script
head -50 test-output/alter.sql
```

## Step 5: Expected Differences

### 5.1 Schema Differences (Dev vs Prod)

| Component            | Dev         | Prod       | Notes                                                                                                                                 |
| -------------------- | ----------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **Tables**           | 6 tables    | 4 tables   | Missing: order_items, inventory_logs                                                                                                  |
| **Users table**      | 8 columns   | 5 columns  | Missing: is_active, updated_at                                                                                                        |
| **Categories table** | 6 columns   | 3 columns  | Missing: parent_id, sort_order, is_active                                                                                             |
| **Products table**   | 12 columns  | 5 columns  | Missing: cost, stock_quantity, is_active, weight_kg, dimensions_cm, metadata, updated_at                                              |
| **Orders table**     | 12 columns  | 5 columns  | Missing: tax_amount, shipping_amount, discount_amount, shipping_address, billing_address, notes, updated_at, shipped_at, delivered_at |
| **Functions**        | 3 functions | 1 function | Different functions entirely                                                                                                          |
| **Triggers**         | 3 triggers  | 0 triggers | No triggers in prod                                                                                                                   |
| **Indexes**          | 15 indexes  | 3 indexes  | Comprehensive vs basic                                                                                                                |

### 5.2 Expected Sync Operations

The `alter.sql` should contain:

1. **Table Modifications:**
   - Add missing columns to existing tables
   - Add missing constraints and checks
   - Add missing indexes

2. **Table Additions:**
   - Create `order_items` table
   - Create `inventory_logs` table

3. **Function Operations:**
   - Drop existing `get_user_count` function
   - Create new functions: `calculate_order_total`, `update_product_stock`, `get_user_orders`
   - Create procedure: `process_order`

4. **Trigger Operations:**
   - Create all 3 triggers for updated_at functionality
   - Create order validation trigger

## Step 6: Test Error Scenarios

### 6.1 Invalid Credentials

```bash
# Test with wrong password
npm run dev gen -- --host localhost --port 5432 --database your_database_name --username your_username --password wrong_password --schema dev
```

### 6.2 Invalid Schema

```bash
# Test with non-existent schema
npm run dev gen -- --host localhost --port 5432 --database your_database_name --username your_username --password your_password --schema nonexistent
```

### 6.3 Missing Required Options

```bash
# Test without required options
npm run dev gen -- --host localhost --port 5432
```

## Step 7: Cleanup

### 7.1 Remove Test Data

```sql
-- Connect to your database and run:
DROP SCHEMA IF EXISTS dev CASCADE;
DROP SCHEMA IF EXISTS prod CASCADE;
```

### 7.2 Remove Generated Files

```bash
rm -rf test-output/
```

## Troubleshooting

### Common Issues:

1. **Connection Refused**: Check if PostgreSQL is running and accessible
2. **Authentication Failed**: Verify username/password
3. **Permission Denied**: Ensure user has appropriate privileges
4. **Schema Not Found**: Verify schema names are correct
5. **Read-Only Access Failed**: Ensure user has SELECT privileges

### Debug Mode:

Set environment variables for more verbose output:

```bash
DEBUG=* npm run dev gen -- [options]
```

## Success Criteria

✅ **GEN Command Success:**

- All files generated without errors
- Schema files contain proper DDL statements
- Procedure files contain function definitions
- Trigger files contain trigger definitions
- File sizes are reasonable (> 0 bytes)

✅ **SYNC Command Success:**

- Alter script generated successfully
- Script contains appropriate DDL statements
- Script addresses all differences between schemas
- Script is syntactically correct SQL

This comprehensive test setup will help you verify that both the `gen` and `sync` commands work correctly with realistic database schemas and data.
