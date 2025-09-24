/**
 * Test utilities for schema-sync-script tests
 */

/**
 * Create a mock PostgreSQL client for testing
 */
export const createMockClient = () => {
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

/**
 * Create mock options for testing
 */
export const createMockOptions = (overrides = {}) => {
  return {
    conn: 'postgresql://user:pass@localhost:5432/testdb',
    source: 'dev_schema',
    target: 'prod_schema',
    withComments: false,
    save: false,
    output: null,
    ...overrides,
  };
};

/**
 * Create a mock client with Jest spy functions
 */
export const createJestMockClient = () => {
  return {
    connect: global.jest.fn().mockResolvedValue(),
    end: global.jest.fn().mockResolvedValue(),
    query: global.jest.fn().mockResolvedValue({ rows: [] }),
  };
};
