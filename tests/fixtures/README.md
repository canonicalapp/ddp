# Schema Sync Script - Test Suite

This directory contains comprehensive test cases for the Schema Sync Script application, covering all modules, use cases, and edge cases.

## Test Structure

```
tests/
├── setup.js                    # Jest setup and global mocks
├── unit/                       # Unit tests for individual modules
│   ├── utils.test.js          # Utils module tests
│   ├── tableOperations.test.js # Table operations tests
│   ├── columnOperations.test.js # Column operations tests
│   ├── functionOperations.test.js # Function operations tests
│   ├── constraintOperations.test.js # Constraint operations tests
│   ├── triggerOperations.test.js # Trigger operations tests
│   ├── schemaSyncOrchestrator.test.js # Orchestrator tests
│   └── edgeCases.test.js      # Edge cases and error handling
├── integration/               # Integration tests
│   ├── main.test.js          # Main application integration tests
│   └── cli.test.js           # CLI interface tests
└── fixtures/                 # Test data and fixtures
```

## Running Tests

### All Tests

```bash
npm test
```

### Specific Test Types

```bash
# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# With coverage report
npm run test:coverage

# Watch mode for development
npm run test:watch

# Verbose output
npm run test:verbose

# CI mode (no watch, with coverage)
npm run test:ci
```

## Test Coverage

The test suite provides comprehensive coverage for:

### Unit Tests (tests/unit/)

#### Utils Module (`utils.test.js`)

- ✅ `generateTimestamp()` - Timestamp generation and formatting
- ✅ `generateBackupName()` - Backup naming with timestamps
- ✅ `generateOutputFilename()` - Output file naming
- ✅ `formatColumnDefinition()` - Column definition formatting
- ✅ `formatDataType()` - Data type formatting
- ✅ `generateManualReviewComment()` - Comment generation
- ✅ `generateSectionHeader()` - Section header generation
- ✅ `generateScriptFooter()` - Script footer generation
- ✅ Edge cases and error handling

#### Table Operations (`tableOperations.test.js`)

- ✅ `getTables()` - Table retrieval from schema
- ✅ `getTableDefinition()` - Table structure retrieval
- ✅ `generateCreateTableStatement()` - CREATE TABLE SQL generation
- ✅ `generateTableOperations()` - Complete table sync operations
- ✅ Missing table creation
- ✅ Extra table handling (rename for data preservation)
- ✅ Database error handling
- ✅ Edge cases with special characters and long names

#### Column Operations (`columnOperations.test.js`)

- ✅ `getColumns()` - Column retrieval from schema
- ✅ `groupColumnsByTable()` - Column grouping logic
- ✅ `generateColumnDefinition()` - Column definition generation
- ✅ `generateAlterColumnStatement()` - ALTER COLUMN SQL generation
- ✅ `generateColumnOperations()` - Complete column sync operations
- ✅ Missing column addition
- ✅ Extra column handling (rename for data preservation)
- ✅ Column modification (type, nullability, defaults)
- ✅ Database error handling
- ✅ Edge cases with special characters and malformed data

#### Function Operations (`functionOperations.test.js`)

- ✅ `getFunctions()` - Function/procedure retrieval from schema
- ✅ `generateFunctionOperations()` - Complete function sync operations
- ✅ Missing function creation (TODO comments)
- ✅ Extra function handling (rename for data preservation)
- ✅ Both FUNCTION and PROCEDURE types
- ✅ Database error handling
- ✅ Edge cases with special characters and long names

#### Constraint Operations (`constraintOperations.test.js`)

- ✅ `getConstraints()` - Constraint retrieval from schema
- ✅ `generateConstraintOperations()` - Complete constraint sync operations
- ✅ Missing constraint creation (TODO comments)
- ✅ Extra constraint handling (DROP statements)
- ✅ All constraint types (PRIMARY KEY, FOREIGN KEY, UNIQUE, CHECK)
- ✅ Foreign key relationship information
- ✅ Database error handling
- ✅ Edge cases with special characters and malformed data

#### Trigger Operations (`triggerOperations.test.js`)

- ✅ `getTriggers()` - Trigger retrieval from schema
- ✅ `generateTriggerOperations()` - Complete trigger sync operations
- ✅ Missing trigger creation (TODO comments)
- ✅ Extra trigger handling (DROP statements)
- ✅ All event types (INSERT, UPDATE, DELETE)
- ✅ All timing types (BEFORE, AFTER)
- ✅ Database error handling
- ✅ Edge cases with special characters and malformed data

#### Schema Sync Orchestrator (`schemaSyncOrchestrator.test.js`)

- ✅ Constructor and initialization
- ✅ `generateSyncScript()` - Complete script generation
- ✅ `generateOutputFilename()` - Filename generation
- ✅ `saveScriptToFile()` - File saving with directory creation
- ✅ `execute()` - Complete execution workflow
- ✅ Console output vs file output
- ✅ Error handling and connection management
- ✅ Integration with all operation modules
- ✅ Edge cases and error scenarios

#### Edge Cases (`edgeCases.test.js`)

- ✅ Timestamp generation edge cases (leap years, 2038 problem)
- ✅ Database connection edge cases (timeouts, auth failures)
- ✅ Query result edge cases (malformed data, large datasets)
- ✅ Schema name edge cases (SQL injection, unicode, long names)
- ✅ Data type edge cases (unknown types, extreme values)
- ✅ Memory and performance edge cases
- ✅ File system edge cases (permissions, disk full)
- ✅ Network edge cases (interruptions, DNS failures)
- ✅ Concurrency edge cases
- ✅ Data corruption edge cases

### Integration Tests (tests/integration/)

#### Main Application (`main.test.js`)

- ✅ Database connection lifecycle
- ✅ Complete schema comparison workflow
- ✅ Schema differences handling
- ✅ File output integration
- ✅ Error handling integration
- ✅ Real-world scenarios (large schemas, empty schemas)
- ✅ Special character handling
- ✅ Concurrent execution scenarios

#### CLI Interface (`cli.test.js`)

- ✅ Command line argument validation
- ✅ Help and version commands
- ✅ Required vs optional arguments
- ✅ Connection string validation
- ✅ Schema name validation
- ✅ File output options
- ✅ Error handling and graceful failures
- ✅ Output format validation
- ✅ Performance and resource usage
- ✅ Cross-platform compatibility

## Test Data and Fixtures

The test suite includes comprehensive mock data covering:

- **Table Data**: Various table structures and names
- **Column Data**: Different data types, constraints, and defaults
- **Function Data**: Functions and procedures with different signatures
- **Constraint Data**: All constraint types with relationships
- **Trigger Data**: Triggers with different events and timings
- **Edge Case Data**: Malformed, extreme, and special character data

## Mock Strategy

The test suite uses comprehensive mocking to:

- **Database Client**: Mock PostgreSQL client with configurable responses
- **File System**: Mock file operations for testing file output
- **Console**: Mock console output for testing CLI behavior
- **Time**: Mock time functions for testing timestamp generation
- **Modules**: Mock individual operation modules for isolated testing

## Test Configuration

### Jest Configuration (`jest.config.js`)

- Node.js test environment
- ES modules support
- Coverage collection and reporting
- Test file patterns
- Setup files
- Timeout configuration
- Verbose output

### Setup File (`setup.js`)

- Global console mocking
- File system mocking
- Path module mocking
- Test utilities and helpers
- Mock data fixtures
- Global test functions

## Coverage Goals

The test suite aims for:

- **100% Line Coverage** - All code lines executed
- **100% Branch Coverage** - All conditional branches tested
- **100% Function Coverage** - All functions called
- **100% Statement Coverage** - All statements executed

## Continuous Integration

The test suite is designed for CI/CD pipelines with:

- `npm run test:ci` - CI-optimized test run
- Coverage reporting
- Exit codes for build failures
- Parallel test execution
- Resource optimization

## Development Workflow

### Adding New Tests

1. Create test file in appropriate directory (`unit/` or `integration/`)
2. Follow naming convention: `moduleName.test.js`
3. Use descriptive test names and organize with `describe` blocks
4. Include both positive and negative test cases
5. Add edge cases and error scenarios
6. Update this README with new test coverage

### Test Best Practices

- **Arrange-Act-Assert** pattern
- **Descriptive test names** that explain the scenario
- **Isolated tests** that don't depend on each other
- **Comprehensive mocking** to avoid external dependencies
- **Edge case coverage** for robust error handling
- **Performance testing** for large datasets
- **Security testing** for SQL injection and other attacks

## Troubleshooting

### Common Issues

1. **ES Module Issues**: Ensure `"type": "module"` in package.json
2. **Mock Issues**: Check mock setup in `setup.js`
3. **Timeout Issues**: Increase timeout in jest.config.js
4. **Coverage Issues**: Check file patterns in jest.config.js

### Debug Mode

```bash
# Run specific test with debug output
npm test -- --verbose tests/unit/utils.test.js

# Run with Node.js debugger
node --inspect-brk node_modules/.bin/jest --runInBand
```

## Performance Benchmarks

The test suite includes performance tests for:

- Large dataset handling (100,000+ records)
- Memory usage optimization
- Concurrent operation handling
- File I/O performance
- Database query optimization

## Security Testing

The test suite includes security tests for:

- SQL injection prevention
- Input validation
- File system security
- Network security
- Data sanitization

## Future Enhancements

Planned test improvements:

- [ ] Visual regression testing for CLI output
- [ ] Load testing for large schemas
- [ ] Cross-database compatibility testing
- [ ] Performance benchmarking suite
- [ ] Security penetration testing
- [ ] Accessibility testing for CLI interface
