/**
 * Jest setup file for schema-sync-script tests
 */

// Mock console methods to avoid noise in tests
global.console = {
  ...console,
  log: () => {},
  error: () => {},
  warn: () => {},
  info: () => {},
  debug: () => {},
};

// Mock fs module for file operations
global.mockFs = {
  writeFileSync: () => {},
  mkdirSync: () => {},
  readFileSync: () => {},
  existsSync: () => {},
};

// Mock path module
global.mockPath = {
  dirname: path => path.split('/').slice(0, -1).join('/') || '.',
  join: (...args) => args.join('/'),
  resolve: (...args) => args.join('/'),
};

// Global test utilities
global.createMockClient = () => {
  const calls = [];
  const results = [];
  let callIndex = 0;

  const queryFunction = (...args) => {
    calls.push(args);
    const result = results[callIndex] || { rows: [] };
    callIndex++;
    if (result.error) {
      return Promise.reject(result.error);
    }
    return Promise.resolve(result);
  };

  // Add mock properties to the query function
  queryFunction.mockResolvedValue = result => {
    results.push(result);
    return queryFunction;
  };
  queryFunction.mockRejectedValue = error => {
    results.push({ error });
    return queryFunction;
  };
  queryFunction.mockResolvedValueOnce = result => {
    results.push(result);
    return queryFunction;
  };
  queryFunction.mockRejectedValueOnce = error => {
    results.push({ error });
    return queryFunction;
  };
  queryFunction.mock = {
    calls: calls,
    results: results,
  };

  // Add jest-like spy methods that work with our call tracking
  queryFunction.toHaveBeenCalledWith = (...expectedArgs) => {
    const found = calls.some(call => {
      if (call.length !== expectedArgs.length) return false;

      return call.every((arg, index) => {
        const expected = expectedArgs[index];

        // Handle expect.stringContaining
        if (
          expected &&
          typeof expected === 'object' &&
          expected.asymmetricMatch
        ) {
          return expected.asymmetricMatch(arg);
        }

        // Handle expect.any()
        if (
          expected &&
          typeof expected === 'function' &&
          expected.name === 'Any'
        ) {
          return true;
        }

        // Handle array comparison
        if (Array.isArray(expected) && Array.isArray(arg)) {
          return JSON.stringify(expected) === JSON.stringify(arg);
        }

        return arg === expected;
      });
    });

    return found;
  };

  queryFunction.toHaveBeenCalledTimes = expectedTimes => {
    return calls.length === expectedTimes;
  };

  const mockClient = {
    connect: () => Promise.resolve(),
    end: () => Promise.resolve(),
    query: queryFunction,
  };

  return mockClient;
};

global.createMockOptions = (overrides = {}) => ({
  conn: 'postgresql://user:pass@localhost:5432/testdb',
  dev: 'dev_schema',
  prod: 'prod_schema',
  withComments: false,
  save: false,
  output: null,
  ...overrides,
});

// Mock data fixtures
global.mockTableData = [
  { table_name: 'users' },
  { table_name: 'orders' },
  { table_name: 'products' },
];

global.mockColumnData = [
  {
    table_name: 'users',
    column_name: 'id',
    data_type: 'integer',
    character_maximum_length: null,
    is_nullable: 'NO',
    column_default: "nextval('users_id_seq'::regclass)",
    ordinal_position: 1,
  },
  {
    table_name: 'users',
    column_name: 'name',
    data_type: 'character varying',
    character_maximum_length: 255,
    is_nullable: 'NO',
    column_default: null,
    ordinal_position: 2,
  },
];

global.mockFunctionData = [
  {
    routine_name: 'get_user_by_id',
    routine_type: 'FUNCTION',
    specific_name: 'get_user_by_id_1',
  },
];

global.mockConstraintData = [
  {
    table_name: 'users',
    constraint_name: 'users_pkey',
    constraint_type: 'PRIMARY KEY',
    column_name: 'id',
    foreign_table_name: null,
    foreign_column_name: null,
  },
];

global.mockTriggerData = [
  {
    trigger_name: 'update_user_timestamp',
    event_manipulation: 'UPDATE',
    event_object_table: 'users',
    action_timing: 'BEFORE',
    action_statement: 'EXECUTE FUNCTION update_modified_column()',
  },
];
