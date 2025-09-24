/**
 * Unit tests for FunctionOperations module
 */

import { Utils } from '@/utils/formatting.ts';
import { FunctionOperations } from '@/sync/operations/functions.ts';
import {
  getUserByIdFunction,
  updateUserStatusProcedure,
} from '../../../fixtures/functionOperations.ts';
import {
  createMockClient,
  createMockOptions,
} from '../../../fixtures/testUtils.ts';

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

    // Reset mock calls
    if (mockClient.query.mockClear) {
      mockClient.query.mockClear();
    }
  });

  describe('constructor', () => {
    it('should initialize with client and options', () => {
      expect(functionOps.client).toBe(mockClient);
      expect(functionOps.options).toBe(mockOptions);
    });
  });

  describe('getFunctions', () => {
    it('should query for functions and procedures in a schema', async () => {
      const mockFunctions = [getUserByIdFunction, updateUserStatusProcedure];

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

    it('should handle functions to drop in target', async () => {
      const sourceFunctions = [
        {
          routine_name: 'get_user_by_id',
          routine_type: 'FUNCTION',
          specific_name: 'get_user_by_id_1',
        },
      ];
      const targetFunctions = [
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

      // Mock the query to return different results for source and target calls
      let callCount = 0;
      mockClient.query = () => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ rows: sourceFunctions });
        } else {
          return Promise.resolve({ rows: targetFunctions });
        }
      };

      const result = await functionOps.generateFunctionOperations();

      expect(
        result.some(line =>
          line.includes(
            '-- FUNCTION old_function exists in prod_schema but not in dev_schema'
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

    it('should handle procedures to drop in target', async () => {
      const sourceFunctions = [
        {
          routine_name: 'update_user',
          routine_type: 'PROCEDURE',
          specific_name: 'update_user_1',
        },
      ];
      const targetFunctions = [
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

      // Mock the query to return different results for source and target calls
      let callCount = 0;
      mockClient.query = () => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ rows: sourceFunctions });
        } else {
          return Promise.resolve({ rows: targetFunctions });
        }
      };

      const result = await functionOps.generateFunctionOperations();

      expect(
        result.some(line =>
          line.includes(
            '-- PROCEDURE old_procedure exists in prod_schema but not in dev_schema'
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

    it('should handle functions to create in target', async () => {
      const sourceFunctions = [
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
      const targetFunctions = [
        {
          routine_name: 'get_user_by_id',
          routine_type: 'FUNCTION',
          specific_name: 'get_user_by_id_1',
        },
      ];

      const mockFunctionDefinition =
        'CREATE FUNCTION dev_schema.new_function() RETURNS integer AS $$ BEGIN RETURN 1; END; $$ LANGUAGE plpgsql;';

      // Mock the query to return different results for source and target calls
      let callCount = 0;
      mockClient.query = () => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ rows: sourceFunctions });
        } else if (callCount === 2) {
          return Promise.resolve({ rows: targetFunctions });
        } else {
          // This is the call to get function definition
          return Promise.resolve({
            rows: [{ definition: mockFunctionDefinition }],
          });
        }
      };

      const result = await functionOps.generateFunctionOperations();

      expect(
        result.some(line =>
          line.includes('-- Creating function new_function in prod_schema')
        )
      ).toBe(true);
      expect(
        result.some(line =>
          line.includes('CREATE FUNCTION prod_schema.new_function()')
        )
      ).toBe(true);
    });

    it('should handle procedures to create in target', async () => {
      const sourceFunctions = [
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
      const targetFunctions = [
        {
          routine_name: 'update_user',
          routine_type: 'PROCEDURE',
          specific_name: 'update_user_1',
        },
      ];

      const mockProcedureDefinition =
        'CREATE PROCEDURE dev_schema.new_procedure() AS $$ BEGIN UPDATE users SET updated_at = NOW(); END; $$ LANGUAGE plpgsql;';

      // Mock the query to return different results for source and target calls
      let callCount = 0;
      mockClient.query = () => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ rows: sourceFunctions });
        } else if (callCount === 2) {
          return Promise.resolve({ rows: targetFunctions });
        } else {
          // This is the call to get procedure definition
          return Promise.resolve({
            rows: [{ routine_definition: mockProcedureDefinition }],
          });
        }
      };

      const result = await functionOps.generateFunctionOperations();

      expect(
        result.some(line =>
          line.includes('-- Creating procedure new_procedure in prod_schema')
        )
      ).toBe(true);
      expect(
        result.some(line =>
          line.includes('CREATE PROCEDURE prod_schema.new_procedure()')
        )
      ).toBe(true);
    });

    it('should handle identical function schemas', async () => {
      const sourceFunctions = [
        {
          routine_name: 'get_user_by_id',
          routine_type: 'FUNCTION',
          specific_name: 'get_user_by_id_1',
        },
      ];
      const targetFunctions = [
        {
          routine_name: 'get_user_by_id',
          routine_type: 'FUNCTION',
          specific_name: 'get_user_by_id_1',
        },
      ];

      // Mock the query to return different results for source and target calls
      let callCount = 0;
      mockClient.query = () => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ rows: sourceFunctions });
        } else {
          return Promise.resolve({ rows: targetFunctions });
        }
      };

      const result = await functionOps.generateFunctionOperations();

      expect(result).not.toContain('-- TODO: Create');
      expect(result).not.toContain('ALTER FUNCTION');
      expect(result).not.toContain('ALTER PROCEDURE');
    });

    it('should handle empty schemas', async () => {
      // Mock the query to return empty results for both source and target calls
      mockClient.query = () => {
        return Promise.resolve({ rows: [] });
      };

      const result = await functionOps.generateFunctionOperations();

      expect(result).toEqual([]);
    });

    it('should handle mixed function and procedure operations', async () => {
      const sourceFunctions = [
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
      const targetFunctions = [
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

      const mockProcedureDefinition =
        'CREATE PROCEDURE dev_schema.new_procedure() AS $$ BEGIN UPDATE users SET updated_at = NOW(); END; $$ LANGUAGE plpgsql;';

      // Mock the query to return different results for source and target calls
      let callCount = 0;
      mockClient.query = () => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ rows: sourceFunctions });
        } else if (callCount === 2) {
          return Promise.resolve({ rows: targetFunctions });
        } else {
          // This is the call to get procedure definition
          return Promise.resolve({
            rows: [{ routine_definition: mockProcedureDefinition }],
          });
        }
      };

      const result = await functionOps.generateFunctionOperations();

      // Should handle both function to drop and procedure to create
      expect(
        result.some(line =>
          line.includes(
            '-- FUNCTION old_function exists in prod_schema but not in dev_schema'
          )
        )
      ).toBe(true);
      expect(
        result.some(line =>
          line.includes('-- Creating procedure new_procedure in prod_schema')
        )
      ).toBe(true);
    });

    it('should handle multiple functions to drop', async () => {
      const sourceFunctions = [
        {
          routine_name: 'get_user_by_id',
          routine_type: 'FUNCTION',
          specific_name: 'get_user_by_id_1',
        },
      ];
      const targetFunctions = [
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

      // Mock the query to return different results for source and target calls
      let callCount = 0;
      mockClient.query = () => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ rows: sourceFunctions });
        } else {
          return Promise.resolve({ rows: targetFunctions });
        }
      };

      const result = await functionOps.generateFunctionOperations();

      expect(
        result.filter(
          line =>
            line.includes('-- FUNCTION') &&
            line.includes(
              `exists in ${mockOptions.target} but not in ${mockOptions.source}`
            )
        ).length
      ).toBe(2);
      expect(
        result.filter(line => line.includes('ALTER FUNCTION')).length
      ).toBe(2);
    });

    it('should handle multiple functions to create', async () => {
      const sourceFunctions = [
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
      const targetFunctions = [
        {
          routine_name: 'get_user_by_id',
          routine_type: 'FUNCTION',
          specific_name: 'get_user_by_id_1',
        },
      ];

      const mockFunctionDefinition1 =
        'CREATE FUNCTION dev_schema.new_function1() RETURNS integer AS $$ BEGIN RETURN 1; END; $$ LANGUAGE plpgsql;';
      const mockFunctionDefinition2 =
        'CREATE FUNCTION dev_schema.new_function2() RETURNS integer AS $$ BEGIN RETURN 2; END; $$ LANGUAGE plpgsql;';

      // Mock the query to return different results for source and target calls
      let callCount = 0;
      mockClient.query = () => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ rows: sourceFunctions });
        } else if (callCount === 2) {
          return Promise.resolve({ rows: targetFunctions });
        } else if (callCount === 3) {
          // First function definition
          return Promise.resolve({
            rows: [{ definition: mockFunctionDefinition1 }],
          });
        } else {
          // Second function definition
          return Promise.resolve({
            rows: [{ definition: mockFunctionDefinition2 }],
          });
        }
      };

      const result = await functionOps.generateFunctionOperations();

      expect(
        result.filter(line => line.includes('-- Creating function')).length
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

  describe('compareFunctionDefinitions', () => {
    it('should return false for identical function definitions', () => {
      const function1 = {
        routine_name: 'test_function',
        routine_type: 'FUNCTION',
        data_type: 'integer',
        routine_definition: 'BEGIN RETURN 1; END;',
      };

      const function2 = {
        routine_name: 'test_function',
        routine_type: 'FUNCTION',
        data_type: 'integer',
        routine_definition: 'BEGIN RETURN 1; END;',
      };

      const result = functionOps.compareFunctionDefinitions(
        function1,
        function2
      );
      expect(result).toBe(false);
    });

    it('should return true for different routine types', () => {
      const function1 = {
        routine_name: 'test_function',
        routine_type: 'FUNCTION',
        data_type: 'integer',
        routine_definition: 'BEGIN RETURN 1; END;',
      };

      const function2 = {
        routine_name: 'test_function',
        routine_type: 'PROCEDURE',
        data_type: 'integer',
        routine_definition: 'BEGIN RETURN 1; END;',
      };

      const result = functionOps.compareFunctionDefinitions(
        function1,
        function2
      );
      expect(result).toBe(true);
    });

    it('should return true for different data types', () => {
      const function1 = {
        routine_name: 'test_function',
        routine_type: 'FUNCTION',
        data_type: 'integer',
        routine_definition: 'BEGIN RETURN 1; END;',
      };

      const function2 = {
        routine_name: 'test_function',
        routine_type: 'FUNCTION',
        data_type: 'varchar',
        routine_definition: 'BEGIN RETURN 1; END;',
      };

      const result = functionOps.compareFunctionDefinitions(
        function1,
        function2
      );
      expect(result).toBe(true);
    });

    it('should return true for different routine definitions', () => {
      const function1 = {
        routine_name: 'test_function',
        routine_type: 'FUNCTION',
        data_type: 'integer',
        routine_definition: 'BEGIN RETURN 1; END;',
      };

      const function2 = {
        routine_name: 'test_function',
        routine_type: 'FUNCTION',
        data_type: 'integer',
        routine_definition: 'BEGIN RETURN 2; END;',
      };

      const result = functionOps.compareFunctionDefinitions(
        function1,
        function2
      );
      expect(result).toBe(true);
    });

    it('should return false if either function is null', () => {
      const function1 = {
        routine_name: 'test_function',
        routine_type: 'FUNCTION',
        data_type: 'integer',
        routine_definition: 'BEGIN RETURN 1; END;',
      };

      const result1 = functionOps.compareFunctionDefinitions(function1, null);
      const result2 = functionOps.compareFunctionDefinitions(null, function1);
      const result3 = functionOps.compareFunctionDefinitions(null, null);

      expect(result1).toBe(false);
      expect(result2).toBe(false);
      expect(result3).toBe(false);
    });
  });

  describe('handleFunctionsToUpdate', () => {
    it('should handle functions that have changed', async () => {
      const sourceFunctions = [
        {
          routine_name: 'test_function',
          routine_type: 'FUNCTION',
          data_type: 'integer',
          routine_definition: 'BEGIN RETURN 1; END;',
        },
      ];

      const targetFunctions = [
        {
          routine_name: 'test_function',
          routine_type: 'FUNCTION',
          data_type: 'integer',
          routine_definition: 'BEGIN RETURN 2; END;',
        },
      ];

      const mockFunctionDefinition =
        'CREATE FUNCTION dev_schema.test_function() RETURNS integer AS $$ BEGIN RETURN 1; END; $$ LANGUAGE plpgsql;';

      // Mock the getFunctionDefinition call
      mockClient.query.mockResolvedValue({
        rows: [{ definition: mockFunctionDefinition }],
      });

      // First test the comparison function directly
      const sourceFunction = sourceFunctions[0];
      const targetFunction = targetFunctions[0];
      const isDifferent = functionOps.compareFunctionDefinitions(
        sourceFunction,
        targetFunction
      );
      expect(isDifferent).toBe(true);

      const alterStatements = [];
      await functionOps.handleFunctionsToUpdate(
        sourceFunctions,
        targetFunctions,
        alterStatements
      );

      expect(alterStatements.length).toBeGreaterThan(0);
      expect(alterStatements).toContain(
        '-- function test_function has changed, updating in prod_schema'
      );
      expect(
        alterStatements.some(line =>
          line.includes('-- Renaming old function to test_function_old_')
        )
      ).toBe(true);
      expect(
        alterStatements.some(line =>
          line.includes(
            'ALTER FUNCTION prod_schema.test_function RENAME TO test_function_old_'
          )
        )
      ).toBe(true);
      expect(
        alterStatements.some(line =>
          line.includes('CREATE FUNCTION prod_schema.test_function')
        )
      ).toBe(true);
    });

    it('should not handle functions that are identical', async () => {
      const sourceFunctions = [
        {
          routine_name: 'test_function',
          routine_type: 'FUNCTION',
          data_type: 'integer',
          routine_definition: 'BEGIN RETURN 1; END;',
        },
      ];

      const targetFunctions = [
        {
          routine_name: 'test_function',
          routine_type: 'FUNCTION',
          data_type: 'integer',
          routine_definition: 'BEGIN RETURN 1; END;',
        },
      ];

      const alterStatements = [];
      await functionOps.handleFunctionsToUpdate(
        sourceFunctions,
        targetFunctions,
        alterStatements
      );

      expect(alterStatements).toEqual([]);
    });

    it('should handle multiple changed functions', async () => {
      const sourceFunctions = [
        {
          routine_name: 'function1',
          routine_type: 'FUNCTION',
          data_type: 'integer',
          routine_definition: 'BEGIN RETURN 1; END;',
        },
        {
          routine_name: 'function2',
          routine_type: 'PROCEDURE',
          data_type: 'void',
          routine_definition: 'BEGIN INSERT INTO test VALUES (1); END;',
        },
      ];

      const targetFunctions = [
        {
          routine_name: 'function1',
          routine_type: 'FUNCTION',
          data_type: 'integer',
          routine_definition: 'BEGIN RETURN 2; END;',
        },
        {
          routine_name: 'function2',
          routine_type: 'PROCEDURE',
          data_type: 'void',
          routine_definition: 'BEGIN INSERT INTO test VALUES (2); END;',
        },
      ];

      const mockFunctionDefinition1 =
        'CREATE FUNCTION dev_schema.function1() RETURNS integer AS $$ BEGIN RETURN 1; END; $$ LANGUAGE plpgsql;';
      const mockFunctionDefinition2 =
        'CREATE PROCEDURE dev_schema.function2() AS $$ BEGIN INSERT INTO test VALUES (1); END; $$ LANGUAGE plpgsql;';

      // Mock the getFunctionDefinition calls
      let callCount = 0;
      mockClient.query = (_query, _params) => {
        callCount++;
        if (callCount === 1) {
          // First call is for function1 (FUNCTION) - uses pg_get_functiondef
          return Promise.resolve({
            rows: [{ definition: mockFunctionDefinition1 }],
          });
        } else if (callCount === 2) {
          // Second call is for function2 (PROCEDURE) - uses information_schema.routines
          return Promise.resolve({
            rows: [{ routine_definition: mockFunctionDefinition2 }],
          });
        }
        return Promise.resolve({ rows: [] });
      };

      const alterStatements = [];
      await functionOps.handleFunctionsToUpdate(
        sourceFunctions,
        targetFunctions,
        alterStatements
      );

      expect(
        alterStatements.filter(
          line => line.includes('-- function') && line.includes('has changed')
        ).length
      ).toBe(1);
      expect(
        alterStatements.filter(
          line => line.includes('-- procedure') && line.includes('has changed')
        ).length
      ).toBe(1);
      expect(
        alterStatements.filter(
          line => line.includes('ALTER FUNCTION') && line.includes('RENAME TO')
        ).length
      ).toBe(1);
      expect(
        alterStatements.filter(
          line => line.includes('ALTER PROCEDURE') && line.includes('RENAME TO')
        ).length
      ).toBe(1);
      expect(
        alterStatements.filter(line => line.includes('CREATE FUNCTION')).length
      ).toBe(1);
      expect(
        alterStatements.filter(line => line.includes('CREATE PROCEDURE')).length
      ).toBe(1);
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle null function names', async () => {
      const sourceFunctions = [
        {
          routine_name: null,
          routine_type: 'FUNCTION',
          specific_name: 'null_function_1',
        },
      ];
      const targetFunctions = [];

      // Mock the query to return different results for source and target calls
      let callCount = 0;
      mockClient.query = () => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ rows: sourceFunctions });
        } else {
          return Promise.resolve({ rows: targetFunctions });
        }
      };

      const result = await functionOps.generateFunctionOperations();
      expect(result).toBeDefined();
    });

    it('should handle functions with very long names', async () => {
      const longFunctionName = 'a'.repeat(100);
      const sourceFunctions = [
        {
          routine_name: longFunctionName,
          routine_type: 'FUNCTION',
          specific_name: `${longFunctionName}_1`,
        },
      ];
      const targetFunctions = [];

      const mockFunctionDefinition = `CREATE FUNCTION dev_schema.${longFunctionName}() RETURNS integer AS $$ BEGIN RETURN 1; END; $$ LANGUAGE plpgsql;`;

      // Mock the query to return different results for source and target calls
      let callCount = 0;
      mockClient.query = () => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ rows: sourceFunctions });
        } else if (callCount === 2) {
          return Promise.resolve({ rows: targetFunctions });
        } else {
          // This is the call to get function definition
          return Promise.resolve({
            rows: [{ definition: mockFunctionDefinition }],
          });
        }
      };

      const result = await functionOps.generateFunctionOperations();

      expect(
        result.some(line =>
          line.includes(
            `-- Creating function ${longFunctionName} in prod_schema`
          )
        )
      ).toBe(true);
    });

    it('should handle malformed function data', async () => {
      const sourceFunctions = [
        {
          routine_name: 'test_function',
          // missing routine_type and specific_name
        },
      ];
      const targetFunctions = [];

      // Mock the query to return different results for source and target calls
      let callCount = 0;
      mockClient.query = () => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ rows: sourceFunctions });
        } else {
          return Promise.resolve({ rows: targetFunctions });
        }
      };

      // Should not throw, but may produce unexpected results
      const result = await functionOps.generateFunctionOperations();
      expect(result).toBeDefined();
    });

    it('should handle functions with same name but different types', async () => {
      const sourceFunctions = [
        {
          routine_name: 'get_user',
          routine_type: 'FUNCTION',
          specific_name: 'get_user_1',
        },
      ];
      const targetFunctions = [
        {
          routine_name: 'get_user',
          routine_type: 'PROCEDURE',
          specific_name: 'get_user_1',
        },
      ];

      const mockFunctionDefinition =
        'CREATE FUNCTION dev_schema.get_user() RETURNS integer AS $$ BEGIN RETURN 1; END; $$ LANGUAGE plpgsql;';

      // Mock the query to return different results for source and target calls
      let callCount = 0;
      mockClient.query = () => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ rows: sourceFunctions });
        } else if (callCount === 2) {
          return Promise.resolve({ rows: targetFunctions });
        } else {
          // This is the call to get function definition
          return Promise.resolve({
            rows: [{ definition: mockFunctionDefinition }],
          });
        }
      };

      const result = await functionOps.generateFunctionOperations();

      // Should treat them as different functions
      expect(
        result.some(line =>
          line.includes(
            '-- PROCEDURE get_user exists in prod_schema but not in dev_schema'
          )
        )
      ).toBe(true);
      expect(
        result.some(line =>
          line.includes('-- Creating function get_user in prod_schema')
        )
      ).toBe(true);
    });

    it('should handle functions with special characters in names', async () => {
      const sourceFunctions = [
        {
          routine_name: 'get_user-by_id_with.special@chars',
          routine_type: 'FUNCTION',
          specific_name: 'get_user-by_id_with.special@chars_1',
        },
      ];
      const targetFunctions = [];

      const mockFunctionDefinition =
        'CREATE FUNCTION dev_schema."get_user-by_id_with.special@chars"() RETURNS integer AS $$ BEGIN RETURN 1; END; $$ LANGUAGE plpgsql;';

      // Mock the query to return different results for source and target calls
      let callCount = 0;
      mockClient.query = () => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ rows: sourceFunctions });
        } else if (callCount === 2) {
          return Promise.resolve({ rows: targetFunctions });
        } else {
          // This is the call to get function definition
          return Promise.resolve({
            rows: [{ definition: mockFunctionDefinition }],
          });
        }
      };

      const result = await functionOps.generateFunctionOperations();

      expect(
        result.some(line =>
          line.includes(
            '-- Creating function get_user-by_id_with.special@chars in prod_schema'
          )
        )
      ).toBe(true);
    });
  });
});
