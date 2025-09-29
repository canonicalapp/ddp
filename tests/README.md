# DDP Testing System

This directory contains a comprehensive testing system for DDP that uses live PostgreSQL databases for integration testing.

## 🏗️ Test Architecture

### Test Types

1. **Unit Tests** (`tests/unit/`) - Test individual components in isolation
2. **Integration Tests** (`tests/integration/`) - Test components working together with live databases
3. **Database Tests** (`tests/integration/database.test.ts`) - Test database structure and functionality
4. **Gen Command Tests** (`tests/integration/gen-command.test.ts`) - Test the gen command with live databases

### Test Database System

The testing system uses a dedicated test database that is:

- Created automatically for each test run
- Populated with comprehensive test data
- Cleaned up after tests (optional)
- Isolated from production databases

## 🚀 Quick Start

### 1. Setup Test Environment

Create the test environment file:

```bash
cp tests/fixtures/test.env .env.testing
```

Edit `.env.testing` with your PostgreSQL credentials:

```env
TEST_DB_HOST=localhost
TEST_DB_PORT=5432
TEST_DB_NAME=ddp_test_runner
TEST_DB_USER=postgres
TEST_DB_PASSWORD=your_password
TEST_DB_SCHEMA=test
```

### 2. Run Tests

**Setup test database and run all integration tests:**

```bash
npm run test:integration:live
```

**Setup test database only:**

```bash
npm run test:integration:setup
```

**Run specific test:**

```bash
tsx tests/run-integration-tests.ts test "Database Structure Verification"
```

**Cleanup test database:**

```bash
npm run test:integration:cleanup
```

**Run unit tests only:**

```bash
npm run test:unit
```

**Run all tests:**

```bash
npm test
```

## 📁 File Structure

```
tests/
├── fixtures/
│   ├── testDatabase.ts          # Database connection and management
│   ├── test.env                 # Test environment template
│   ├── populate-test-data.sql   # Test data population script
│   └── ...                      # Other test fixtures
├── integration/
│   ├── database.test.ts         # Database structure tests
│   ├── gen-command.test.ts      # Gen command tests
│   └── ...                      # Other integration tests
├── unit/
│   └── ...                      # Unit tests
├── setup-test-db.ts             # Database setup script
├── run-integration-tests.ts     # Test runner script
└── README.md                    # This file
```

## 🧪 Test Database Features

### Automatic Setup

- Creates isolated test database
- Loads comprehensive test schema
- Populates with realistic test data
- Handles cleanup automatically

### Test Data Includes

- **6 Tables**: categories, products, users, orders, order_items, inventory_logs
- **6 Functions**: calculate_order_total, update_product_stock, get_user_orders, process_order, update_updated_at_column, validate_order_total
- **4 Triggers**: tr_orders_updated_at, tr_orders_validate_total, tr_products_updated_at, tr_users_updated_at
- **Realistic Data**: 11 categories, 8 users, 10 products, 5 orders, 10 order items, 10 inventory logs

### Database Verification

- Table structure validation
- Function functionality testing
- Trigger behavior verification
- Constraint enforcement testing
- Data integrity checks

## 🔧 Configuration

### Environment Variables

| Variable                 | Description            | Default                 |
| ------------------------ | ---------------------- | ----------------------- |
| `TEST_DB_HOST`           | PostgreSQL host        | localhost               |
| `TEST_DB_PORT`           | PostgreSQL port        | 5432                    |
| `TEST_DB_NAME`           | Test database name     | ddp_test_runner         |
| `TEST_DB_USER`           | PostgreSQL username    | postgres                |
| `TEST_DB_PASSWORD`       | PostgreSQL password    | root                    |
| `TEST_DB_SCHEMA`         | Test schema name       | test                    |
| `TEST_DATA_SCRIPT_BASIC` | Basic test data script | test-database-setup.sql |
| `TEST_OUTPUT_DIR`        | Test output directory  | output/test-runner      |
| `TEST_TIMEOUT`           | Test timeout (ms)      | 60000                   |

### Test Scripts

| Script                                     | Description                        |
| ------------------------------------------ | ---------------------------------- |
| `test-database-setup.sql`                  | Basic complexity test database     |
| `test-database-mid-complexity.sql`         | Mid-level complexity test database |
| `test-database-high-complexity-simple.sql` | High complexity test database      |

## 🧪 Writing Tests

### Database Integration Test Example

```typescript
import { TestDatabaseManager } from '../fixtures/testDatabase';

describe('My Database Test', () => {
  let testDb: any;
  let manager: TestDatabaseManager;

  beforeAll(async () => {
    manager = TestDatabaseManager.getInstance();
    testDb = manager.getTestDatabase();

    if (!testDb) {
      throw new Error('Test database not initialized');
    }
  });

  test('should have correct tables', async () => {
    const tables = await testDb.getTables();
    expect(tables).toContain('products');
    expect(tables).toContain('orders');
  });

  test('should execute functions correctly', async () => {
    const result = await testDb.executeQuery(
      'SELECT calculate_order_total($1) as total',
      [1]
    );
    expect(result.rows[0].total).toBe('0.00');
  });
});
```

### Gen Command Test Example

```typescript
import { execSync } from 'child_process';

test('should generate schema.sql successfully', async () => {
  const config = testDb.getConfig();

  const command = `npm run dev gen -- --host ${config.host} --port ${config.port} --database ${config.database} --username ${config.username} --password ${config.password} --schema ${config.schema} --output ${outputDir}`;

  expect(() => {
    execSync(command, { stdio: 'pipe' });
  }).not.toThrow();

  expect(existsSync(join(outputDir, 'schema.sql'))).toBe(true);
});
```

## 🐛 Troubleshooting

### Common Issues

**Test database not initialized:**

```bash
# Run setup first
npm run test:integration:setup
```

**Permission denied errors:**

```bash
# Check PostgreSQL user permissions
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE ddp_test_runner TO postgres;"
```

**Connection refused:**

```bash
# Check PostgreSQL is running
sudo systemctl status postgresql
# or
brew services list | grep postgresql
```

**Test timeout:**

```bash
# Increase timeout in .env.test
TEST_TIMEOUT=120000
```

### Debug Mode

Run tests with verbose output:

```bash
npm run test:verbose
```

Run specific test with debug:

```bash
tsx tests/run-integration-tests.ts test "Database Structure Verification"
```

## 📊 Test Coverage

The testing system provides comprehensive coverage of:

- ✅ Database schema generation
- ✅ Function and procedure generation
- ✅ Trigger generation
- ✅ Constraint enforcement
- ✅ Index creation
- ✅ Data integrity
- ✅ Gen command functionality
- ✅ Sync command functionality
- ✅ Error handling
- ✅ Edge cases

## 🔄 CI/CD Integration

For continuous integration, use:

```bash
# Run all tests with coverage
npm run test:ci

# Run integration tests with live database
npm run test:integration:live
```

## 📝 Best Practices

1. **Always use the test database** - Never test against production
2. **Clean up after tests** - Use the cleanup commands
3. **Use realistic test data** - The provided test data covers most scenarios
4. **Test edge cases** - Include boundary conditions and error cases
5. **Verify both structure and data** - Test schema and functionality
6. **Use descriptive test names** - Make failures easy to understand
7. **Group related tests** - Use describe blocks effectively

## 🚀 Advanced Usage

### Custom Test Data

Create custom test data by modifying `tests/fixtures/populate-test-data.sql` or creating new scripts.

### Multiple Test Databases

Run tests against different complexity levels:

```bash
# Test with mid-complexity data
TEST_DATA_SCRIPT_BASIC=test-database-mid-complexity.sql npm run test:integration:live
```

### Performance Testing

Add performance tests to verify generation speed:

```typescript
test('should generate schema within time limit', async () => {
  const start = Date.now();
  // ... run gen command
  const duration = Date.now() - start;
  expect(duration).toBeLessThan(5000); // 5 seconds
});
```

This testing system ensures DDP works correctly with real PostgreSQL databases and provides confidence in the tool's reliability and functionality.
