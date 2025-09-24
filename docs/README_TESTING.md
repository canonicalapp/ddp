# DDP Testing Setup

This directory contains comprehensive testing tools for the DDP (Declarative Database Provisioning) CLI tool.

## Quick Start

### 1. Setup Test Database

```bash
./test-runner.sh setup --database mydb --username myuser --password mypass
```

### 2. Test GEN Command

```bash
./test-runner.sh test-gen --database mydb --username myuser --password mypass
```

### 3. Test SYNC Command

```bash
./test-runner.sh test-sync --database mydb --username myuser --password mypass
```

### 4. Cleanup

```bash
./test-runner.sh clean --database mydb --username myuser --password mypass
```

## Files Overview

| File                      | Purpose                                                                    |
| ------------------------- | -------------------------------------------------------------------------- |
| `test-database-setup.sql` | Creates comprehensive test schemas (source and target) with realistic data |
| `test-runner.sh`          | Automated script to run setup, tests, and cleanup                          |
| `TESTING_GUIDE.md`        | Detailed manual testing instructions                                       |
| `README_TESTING.md`       | This file - quick reference                                                |

## Test Suite Overview

- **26 test files** with **562 tests** total
- **24 unit tests** covering individual components
- **2 integration tests** for CLI and sync functionality
- **13 fixture files** providing test data and utilities
- **Clean, organized structure** by functionality

## Test Database Schema

### Dev Schema (Source - Complete)

- **6 tables**: users, categories, products, orders, order_items, inventory_logs
- **3 functions**: calculate_order_total, update_product_stock, get_user_orders
- **1 procedure**: process_order
- **3 triggers**: updated_at triggers, order validation
- **15 indexes**: Comprehensive indexing
- **Sample data**: 5 users, 7 categories, 5 products, 3 orders, etc.

### Prod Schema (Target - Incomplete)

- **4 tables**: users, categories, products, orders (missing columns and tables)
- **1 function**: get_user_count (different from source)
- **0 triggers**: No triggers
- **3 indexes**: Basic indexing only
- **Different data**: 2 users, 2 categories, 2 products, 2 orders

## What Gets Tested

### GEN Command Tests

- ✅ Schema generation (tables, columns, constraints, indexes)
- ✅ Function and procedure generation
- ✅ Trigger generation
- ✅ Individual component generation (--schema-only, --procs-only, --triggers-only)
- ✅ Output to files and stdout
- ✅ Error handling (invalid credentials, missing schemas)

### SYNC Command Tests

- ✅ Schema comparison between source and target
- ✅ Alter script generation
- ✅ Dry run mode
- ✅ Detection of missing tables, columns, functions, triggers
- ✅ Proper DDL generation for schema synchronization

## Expected Results

After running the tests, you should see:

1. **Generated Files** in `test-output/`:
   - `source/schema.sql` - Complete schema DDL
   - `source/procs.sql` - Functions and procedures
   - `source/triggers.sql` - Trigger definitions
   - `target/schema.sql` - Incomplete schema DDL
   - `target/procs.sql` - Basic functions
   - `target/triggers.sql` - Empty (no triggers)
   - `alter.sql` - Sync script to make target match source

2. **File Sizes**:
   - Dev files should be larger (more complete)
   - Prod files should be smaller (incomplete)
   - Alter.sql should contain significant changes

3. **Console Output**:
   - Connection validation messages
   - Introspection progress
   - File generation confirmations
   - Success/error indicators

## Troubleshooting

### Common Issues

1. **Permission Denied**: Ensure your database user has CREATE and SELECT privileges
2. **Connection Failed**: Check PostgreSQL is running and credentials are correct
3. **Schema Not Found**: Run setup command first
4. **Build Errors**: Run `npm run build` before testing

### Debug Mode

For verbose output:

```bash
DEBUG=* ./test-runner.sh test-gen --database mydb --username myuser --password mypass
```

## Manual Testing

If you prefer manual testing, see `TESTING_GUIDE.md` for detailed step-by-step instructions.

## Cleanup

Always run cleanup when done:

```bash
./test-runner.sh clean --database mydb --username myuser --password mypass
```

This removes generated files and optionally the test schemas from your database.
