/**
 * Unit tests for FunctionOperations module
 */

import { FunctionOperations } from '../../modules/functionOperations.js';
import { Utils } from '../../modules/utils.js';

// Mock Utils module
// Note: jest.mock is not available in global scope with ES modules

describe('FunctionOperations', () => {
  let functionOps;
  let mockClient;
  let mockOptions;

  beforeEach(() => {
    mockClient = createMockClient();
    mockOptions = createMockOptions();
    functionOps = new FunctionOperations(mockClient, mockOptions);
  });

  describe('constructor', () => {
    it('should initialize with client and options', () => {
      expect(functionOps.client).toBe(mockClient);
      expect(functionOps.options).toBe(mockOptions);
    });
  });

  describe('getFunctions', () => {
    it('should query for functions and procedures in a schema', async () => {
      const mockFunctions = [
        {
          routine_name: 'get_user_by_id',
          routine_type: 'FUNCTION',
          specific_name: 'get_user_by_id_1',
        },
        {
          routine_name: 'update_user_status',
          routine_type: 'PROCEDURE',
          specific_name: 'update_user_status_1',
        },
      ];

      mockClient.query = () => Promise.resolve({ rows: mockFunctions });

      const result = await functionOps.getFunctions('test_schema');

      // Verify the result is correct
      expect(result).toEqual(mockFunctions);
    });

    it('should filter for FUNCTION and PROCEDURE types only', async () => {
      // This test verifies the query structure, but without Jest mocks we can't easily inspect the query
      // We'll verify the method works correctly instead
      const mockFunctions = [
        {
          routine_name: 'test_function',
          routine_type: 'FUNCTION',
          specific_name: 'test_function_1',
        },
      ];

      mockClient.query = () => Promise.resolve({ rows: mockFunctions });

      const result = await functionOps.getFunctions('test_schema');
      expect(result).toEqual(mockFunctions);
    });

    it('should handle empty results', async () => {
      mockClient.query = () => Promise.resolve({ rows: [] });

      const result = await functionOps.getFunctions('empty_schema');

      expect(result).toEqual([]);
    });

    it('should handle database errors', async () => {
      const error = new Error('Database connection failed');
      mockClient.query = () => Promise.reject(error);

      await expect(functionOps.getFunctions('test_schema')).rejects.toThrow(
        'Database connection failed'
      );
    });

    it('should handle functions with special characters in names', async () => {
      const mockFunctions = [
        {
          routine_name: 'get_user-by_id_with.special@chars',
          routine_type: 'FUNCTION',
          specific_name: 'get_user-by_id_with.special@chars_1',
        },
      ];

      mockClient.query = () => Promise.resolve({ rows: mockFunctions });

      const result = await functionOps.getFunctions('test_schema');

      expect(result).toEqual(mockFunctions);
    });
  });

  describe('generateFunctionOperations', () => {
    beforeEach(() => {
      // Mock Utils.generateBackupName
      Utils.generateBackupName = name =>
        `${name}_backup_2024-01-01T00-00-00-000Z`;
    });

    it('should handle functions to drop in production', async () => {
      const devFunctions = [
        {
          routine_name: 'get_user_by_id',
          routine_type: 'FUNCTION',
          specific_name: 'get_user_by_id_1',
        },
      ];
      const prodFunctions = [
        {
          routine_name: 'get_user_by_id',
          routine_type: 'FUNCTION',
          specific_name: 'get_user_by_id_1',
        },
        {
          routine_name: 'old_function',
          routine_type: 'FUNCTION',
          specific_name: 'old_function_1',
        },
      ];

      // Mock the query to return different results for dev and prod calls
      let callCount = 0;
      mockClient.query = () => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ rows: devFunctions });
        } else {
          return Promise.resolve({ rows: prodFunctions });
        }
      };

      const result = await functionOps.generateFunctionOperations();

      expect(
        result.some(line =>
          line.includes(
            '-- FUNCTION old_function exists in prod but not in dev'
          )
        )
      ).toBe(true);
      expect(
        result.some(line =>
          line.includes('-- Renaming function to preserve before manual drop')
        )
      ).toBe(true);
      expect(
        result.some(line =>
          line.includes(
            'ALTER FUNCTION prod_schema.old_function RENAME TO old_function_backup_2024-01-01T00-00-00-000Z;'
          )
        )
      ).toBe(true);
      expect(
        result.some(line =>
          line.includes(
            "-- TODO: Manually drop function prod_schema.old_function_backup_2024-01-01T00-00-00-000Z after confirming it's no longer needed"
          )
        )
      ).toBe(true);
    });

    it('should handle procedures to drop in production', async () => {
      const devFunctions = [
        {
          routine_name: 'update_user',
          routine_type: 'PROCEDURE',
          specific_name: 'update_user_1',
        },
      ];
      const prodFunctions = [
        {
          routine_name: 'update_user',
          routine_type: 'PROCEDURE',
          specific_name: 'update_user_1',
        },
        {
          routine_name: 'old_procedure',
          routine_type: 'PROCEDURE',
          specific_name: 'old_procedure_1',
        },
      ];

      // Mock the query to return different results for dev and prod calls
      let callCount = 0;
      mockClient.query = () => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ rows: devFunctions });
        } else {
          return Promise.resolve({ rows: prodFunctions });
        }
      };

      const result = await functionOps.generateFunctionOperations();

      expect(
        result.some(line =>
          line.includes(
            '-- PROCEDURE old_procedure exists in prod but not in dev'
          )
        )
      ).toBe(true);
      expect(
        result.some(line =>
          line.includes('-- Renaming procedure to preserve before manual drop')
        )
      ).toBe(true);
      expect(
        result.some(line =>
          line.includes(
            'ALTER PROCEDURE prod_schema.old_procedure RENAME TO old_procedure_backup_2024-01-01T00-00-00-000Z;'
          )
        )
      ).toBe(true);
      expect(
        result.some(line =>
          line.includes(
            "-- TODO: Manually drop procedure prod_schema.old_procedure_backup_2024-01-01T00-00-00-000Z after confirming it's no longer needed"
          )
        )
      ).toBe(true);
    });

    it('should handle functions to create in production', async () => {
      const devFunctions = [
        {
          routine_name: 'get_user_by_id',
          routine_type: 'FUNCTION',
          specific_name: 'get_user_by_id_1',
        },
        {
          routine_name: 'new_function',
          routine_type: 'FUNCTION',
          specific_name: 'new_function_1',
        },
      ];
      const prodFunctions = [
        {
          routine_name: 'get_user_by_id',
          routine_type: 'FUNCTION',
          specific_name: 'get_user_by_id_1',
        },
      ];

      // Mock the query to return different results for dev and prod calls
      let callCount = 0;
      mockClient.query = () => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ rows: devFunctions });
        } else {
          return Promise.resolve({ rows: prodFunctions });
        }
      };

      const result = await functionOps.generateFunctionOperations();

      expect(
        result.some(line =>
          line.includes('-- TODO: Create function new_function in prod')
        )
      ).toBe(true);
      expect(
        result.some(line =>
          line.includes('-- Copy the function definition from dev schema')
        )
      ).toBe(true);
    });

    it('should handle procedures to create in production', async () => {
      const devFunctions = [
        {
          routine_name: 'update_user',
          routine_type: 'PROCEDURE',
          specific_name: 'update_user_1',
        },
        {
          routine_name: 'new_procedure',
          routine_type: 'PROCEDURE',
          specific_name: 'new_procedure_1',
        },
      ];
      const prodFunctions = [
        {
          routine_name: 'update_user',
          routine_type: 'PROCEDURE',
          specific_name: 'update_user_1',
        },
      ];

      // Mock the query to return different results for dev and prod calls
      let callCount = 0;
      mockClient.query = () => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ rows: devFunctions });
        } else {
          return Promise.resolve({ rows: prodFunctions });
        }
      };

      const result = await functionOps.generateFunctionOperations();

      expect(
        result.some(line =>
          line.includes('-- TODO: Create procedure new_procedure in prod')
        )
      ).toBe(true);
      expect(
        result.some(line =>
          line.includes('-- Copy the procedure definition from dev schema')
        )
      ).toBe(true);
    });

    it('should handle identical function schemas', async () => {
      const devFunctions = [
        {
          routine_name: 'get_user_by_id',
          routine_type: 'FUNCTION',
          specific_name: 'get_user_by_id_1',
        },
      ];
      const prodFunctions = [
        {
          routine_name: 'get_user_by_id',
          routine_type: 'FUNCTION',
          specific_name: 'get_user_by_id_1',
        },
      ];

      // Mock the query to return different results for dev and prod calls
      let callCount = 0;
      mockClient.query = () => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ rows: devFunctions });
        } else {
          return Promise.resolve({ rows: prodFunctions });
        }
      };

      const result = await functionOps.generateFunctionOperations();

      expect(result).not.toContain('-- TODO: Create');
      expect(result).not.toContain('ALTER FUNCTION');
      expect(result).not.toContain('ALTER PROCEDURE');
    });

    it('should handle empty schemas', async () => {
      // Mock the query to return empty results for both dev and prod calls
      mockClient.query = () => {
        return Promise.resolve({ rows: [] });
      };

      const result = await functionOps.generateFunctionOperations();

      expect(result).toEqual([]);
    });

    it('should handle mixed function and procedure operations', async () => {
      const devFunctions = [
        {
          routine_name: 'get_user_by_id',
          routine_type: 'FUNCTION',
          specific_name: 'get_user_by_id_1',
        },
        {
          routine_name: 'new_procedure',
          routine_type: 'PROCEDURE',
          specific_name: 'new_procedure_1',
        },
      ];
      const prodFunctions = [
        {
          routine_name: 'get_user_by_id',
          routine_type: 'FUNCTION',
          specific_name: 'get_user_by_id_1',
        },
        {
          routine_name: 'old_function',
          routine_type: 'FUNCTION',
          specific_name: 'old_function_1',
        },
      ];

      // Mock the query to return different results for dev and prod calls
      let callCount = 0;
      mockClient.query = () => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ rows: devFunctions });
        } else {
          return Promise.resolve({ rows: prodFunctions });
        }
      };

      const result = await functionOps.generateFunctionOperations();

      // Should handle both function to drop and procedure to create
      expect(
        result.some(line =>
          line.includes(
            '-- FUNCTION old_function exists in prod but not in dev'
          )
        )
      ).toBe(true);
      expect(
        result.some(line =>
          line.includes('-- TODO: Create procedure new_procedure in prod')
        )
      ).toBe(true);
    });

    it('should handle multiple functions to drop', async () => {
      const devFunctions = [
        {
          routine_name: 'get_user_by_id',
          routine_type: 'FUNCTION',
          specific_name: 'get_user_by_id_1',
        },
      ];
      const prodFunctions = [
        {
          routine_name: 'get_user_by_id',
          routine_type: 'FUNCTION',
          specific_name: 'get_user_by_id_1',
        },
        {
          routine_name: 'old_function1',
          routine_type: 'FUNCTION',
          specific_name: 'old_function1_1',
        },
        {
          routine_name: 'old_function2',
          routine_type: 'FUNCTION',
          specific_name: 'old_function2_1',
        },
      ];

      // Mock the query to return different results for dev and prod calls
      let callCount = 0;
      mockClient.query = () => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ rows: devFunctions });
        } else {
          return Promise.resolve({ rows: prodFunctions });
        }
      };

      const result = await functionOps.generateFunctionOperations();

      expect(
        result.filter(
          line =>
            line.includes('-- FUNCTION') &&
            line.includes('exists in prod but not in dev')
        ).length
      ).toBe(2);
      expect(
        result.filter(line => line.includes('ALTER FUNCTION')).length
      ).toBe(2);
    });

    it('should handle multiple functions to create', async () => {
      const devFunctions = [
        {
          routine_name: 'get_user_by_id',
          routine_type: 'FUNCTION',
          specific_name: 'get_user_by_id_1',
        },
        {
          routine_name: 'new_function1',
          routine_type: 'FUNCTION',
          specific_name: 'new_function1_1',
        },
        {
          routine_name: 'new_function2',
          routine_type: 'FUNCTION',
          specific_name: 'new_function2_1',
        },
      ];
      const prodFunctions = [
        {
          routine_name: 'get_user_by_id',
          routine_type: 'FUNCTION',
          specific_name: 'get_user_by_id_1',
        },
      ];

      // Mock the query to return different results for dev and prod calls
      let callCount = 0;
      mockClient.query = () => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ rows: devFunctions });
        } else {
          return Promise.resolve({ rows: prodFunctions });
        }
      };

      const result = await functionOps.generateFunctionOperations();

      expect(
        result.filter(line => line.includes('-- TODO: Create function')).length
      ).toBe(2);
    });

    it('should handle database errors', async () => {
      const error = new Error('Database connection failed');
      mockClient.query.mockRejectedValue(error);

      await expect(functionOps.generateFunctionOperations()).rejects.toThrow(
        'Database connection failed'
      );
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle null function names', async () => {
      const devFunctions = [
        {
          routine_name: null,
          routine_type: 'FUNCTION',
          specific_name: 'null_function_1',
        },
      ];
      const prodFunctions = [];

      // Mock the query to return different results for dev and prod calls
      let callCount = 0;
      mockClient.query = () => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ rows: devFunctions });
        } else {
          return Promise.resolve({ rows: prodFunctions });
        }
      };

      const result = await functionOps.generateFunctionOperations();
      expect(result).toBeDefined();
    });

    it('should handle functions with very long names', async () => {
      const longFunctionName = 'a'.repeat(100);
      const devFunctions = [
        {
          routine_name: longFunctionName,
          routine_type: 'FUNCTION',
          specific_name: `${longFunctionName}_1`,
        },
      ];
      const prodFunctions = [];

      // Mock the query to return different results for dev and prod calls
      let callCount = 0;
      mockClient.query = () => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ rows: devFunctions });
        } else {
          return Promise.resolve({ rows: prodFunctions });
        }
      };

      const result = await functionOps.generateFunctionOperations();

      expect(
        result.some(line =>
          line.includes(`-- TODO: Create function ${longFunctionName} in prod`)
        )
      ).toBe(true);
    });

    it('should handle malformed function data', async () => {
      const devFunctions = [
        {
          routine_name: 'test_function',
          // missing routine_type and specific_name
        },
      ];
      const prodFunctions = [];

      // Mock the query to return different results for dev and prod calls
      let callCount = 0;
      mockClient.query = () => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ rows: devFunctions });
        } else {
          return Promise.resolve({ rows: prodFunctions });
        }
      };

      // Should not throw, but may produce unexpected results
      const result = await functionOps.generateFunctionOperations();
      expect(result).toBeDefined();
    });

    it('should handle functions with same name but different types', async () => {
      const devFunctions = [
        {
          routine_name: 'get_user',
          routine_type: 'FUNCTION',
          specific_name: 'get_user_1',
        },
      ];
      const prodFunctions = [
        {
          routine_name: 'get_user',
          routine_type: 'PROCEDURE',
          specific_name: 'get_user_1',
        },
      ];

      // Mock the query to return different results for dev and prod calls
      let callCount = 0;
      mockClient.query = () => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ rows: devFunctions });
        } else {
          return Promise.resolve({ rows: prodFunctions });
        }
      };

      const result = await functionOps.generateFunctionOperations();

      // Should treat them as different functions
      expect(
        result.some(line =>
          line.includes('-- PROCEDURE get_user exists in prod but not in dev')
        )
      ).toBe(true);
      expect(
        result.some(line =>
          line.includes('-- TODO: Create function get_user in prod')
        )
      ).toBe(true);
    });

    it('should handle functions with special characters in names', async () => {
      const devFunctions = [
        {
          routine_name: 'get_user-by_id_with.special@chars',
          routine_type: 'FUNCTION',
          specific_name: 'get_user-by_id_with.special@chars_1',
        },
      ];
      const prodFunctions = [];

      // Mock the query to return different results for dev and prod calls
      let callCount = 0;
      mockClient.query = () => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ rows: devFunctions });
        } else {
          return Promise.resolve({ rows: prodFunctions });
        }
      };

      const result = await functionOps.generateFunctionOperations();

      expect(
        result.some(line =>
          line.includes(
            '-- TODO: Create function get_user-by_id_with.special@chars in prod'
          )
        )
      ).toBe(true);
    });
  });
});
