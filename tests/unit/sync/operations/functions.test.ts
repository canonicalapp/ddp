/**
 * Unit tests for FunctionOperations module
 */

import { Utils } from '@/utils/formatting.ts';
import { FunctionOperations } from '@/sync/operations/functions.ts';
import { APPLICATION_ROUTINES_IN_SCHEMA_QUERY } from '@/sync/routineSql';
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

/** Source catalog + target catalog + trigger dependency probe (generateFunctionOperations). */
function stubRoutineCatalogQueries(
  sourceClient: ReturnType<typeof createMockClient>,
  targetClient: ReturnType<typeof createMockClient>,
  sourceRows: unknown[],
  targetRows: unknown[],
  triggerRefRows: unknown[] = []
) {
  let targetCalls = 0;
  sourceClient.query = () => Promise.resolve({ rows: sourceRows });
  targetClient.query = () => {
    targetCalls += 1;
    if (targetCalls === 1) {
      return Promise.resolve({ rows: targetRows });
    }
    return Promise.resolve({ rows: triggerRefRows });
  };
}

describe('FunctionOperations', () => {
  let functionOps;
  let mockSourceClient;
  let mockTargetClient;
  let mockOptions;

  beforeEach(() => {
    mockSourceClient = createMockClient();
    mockTargetClient = createMockClient();
    mockOptions = createMockOptions();
    functionOps = new FunctionOperations(
      mockSourceClient,
      mockTargetClient,
      mockOptions
    );

    // Reset mock calls
    if (mockSourceClient.query.mockClear) {
      mockSourceClient.query.mockClear();
    }
  });

  describe('constructor', () => {
    it('should initialize with source client, target client and options', () => {
      expect(functionOps.sourceClient).toBe(mockSourceClient);
      expect(functionOps.targetClient).toBe(mockTargetClient);
      expect(functionOps.options).toBe(mockOptions);
    });
  });

  describe('getFunctions', () => {
    it('should query for functions and procedures in a schema', async () => {
      const mockFunctions = [getUserByIdFunction, updateUserStatusProcedure];

      mockSourceClient.query = () => Promise.resolve({ rows: mockFunctions });

      const result = await functionOps.getFunctions('source');

      // Verify the result is correct
      expect(result).toEqual(mockFunctions);
    });

    it('uses application-owned routine query (excludes extension members)', () => {
      expect(APPLICATION_ROUTINES_IN_SCHEMA_QUERY).toContain('pg_depend');
      expect(APPLICATION_ROUTINES_IN_SCHEMA_QUERY).toContain("deptype = 'e'");
      expect(APPLICATION_ROUTINES_IN_SCHEMA_QUERY).not.toContain(
        'information_schema.routines'
      );
    });

    it('should omit preserved dropped routine tombstones', async () => {
      mockSourceClient.query = () =>
        Promise.resolve({
          rows: [
            {
              routine_name: 'fn_dropped_1778247438295',
              routine_type: 'FUNCTION',
              routine_oid: '99',
              identity_arguments: '',
              data_type: 'void',
            },
            {
              routine_name: 'app_fn',
              routine_type: 'FUNCTION',
              routine_oid: '100',
              identity_arguments: 'integer',
              data_type: 'integer',
            },
          ],
        });

      const result = await functionOps.getFunctions('source');
      expect(result.map(r => r.routine_name)).toEqual(['app_fn']);
    });

    it('should handle empty results', async () => {
      mockTargetClient.query = () => Promise.resolve({ rows: [] });

      const result = await functionOps.getFunctions('target');

      expect(result).toEqual([]);
    });

    it('should handle database errors', async () => {
      const error = new Error('Database connection failed');
      mockSourceClient.query = () => Promise.reject(error);

      await expect(functionOps.getFunctions('source')).rejects.toThrow(
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

      mockSourceClient.query = () => Promise.resolve({ rows: mockFunctions });

      const result = await functionOps.getFunctions('source');

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
          routine_oid: '101',
          identity_arguments: 'integer',
          specific_name: 'get_user_by_id_1',
        },
      ];
      const targetFunctions = [
        {
          routine_name: 'get_user_by_id',
          routine_type: 'FUNCTION',
          routine_oid: '101',
          identity_arguments: 'integer',
          specific_name: 'get_user_by_id_1',
        },
        {
          routine_name: 'old_function',
          routine_type: 'FUNCTION',
          routine_oid: '200',
          identity_arguments: 'integer',
          specific_name: 'old_function_1',
        },
      ];

      // Mock the query to return different results for source and target calls
      stubRoutineCatalogQueries(
        mockSourceClient,
        mockTargetClient,
        sourceFunctions,
        targetFunctions
      );

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
          line.includes(
            'DROP FUNCTION IF EXISTS prod_schema.old_function(integer);'
          )
        )
      ).toBe(true);
    });

    it('should not drop extension-owned routines (e.g. pgcrypto)', async () => {
      stubRoutineCatalogQueries(mockSourceClient, mockTargetClient, [], []);

      const result = await functionOps.generateFunctionOperations();

      expect(result.some(line => line.includes('DROP FUNCTION'))).toBe(false);
      expect(result.some(line => line.includes('digest'))).toBe(false);
      expect(result.some(line => line.includes('pgp_sym_encrypt'))).toBe(false);
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
      stubRoutineCatalogQueries(
        mockSourceClient,
        mockTargetClient,
        sourceFunctions,
        targetFunctions
      );

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
          line.includes('DROP PROCEDURE IF EXISTS prod_schema.old_procedure;')
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
      mockSourceClient.query = () => {
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
          line.includes(
            'CREATE OR REPLACE FUNCTION prod_schema.new_function AS'
          )
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
      mockSourceClient.query = () => {
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
          line.includes(
            'CREATE OR REPLACE PROCEDURE prod_schema.new_procedure AS'
          )
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
      stubRoutineCatalogQueries(
        mockSourceClient,
        mockTargetClient,
        sourceFunctions,
        targetFunctions
      );

      const result = await functionOps.generateFunctionOperations();

      expect(result).not.toContain('-- TODO: Create');
      expect(result).not.toContain('ALTER FUNCTION');
      expect(result).not.toContain('ALTER PROCEDURE');
    });

    it('should handle empty schemas', async () => {
      // Mock the query to return empty results for both source and target calls
      mockSourceClient.query = () => {
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
      stubRoutineCatalogQueries(
        mockSourceClient,
        mockTargetClient,
        sourceFunctions,
        targetFunctions
      );

      // Mock the getFunctionDefinition call
      const originalGetFunctionDefinition = functionOps.getFunctionDefinition;
      functionOps.getFunctionDefinition = () =>
        Promise.resolve(mockProcedureDefinition);

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

      // Restore original method
      functionOps.getFunctionDefinition = originalGetFunctionDefinition;
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
      stubRoutineCatalogQueries(
        mockSourceClient,
        mockTargetClient,
        sourceFunctions,
        targetFunctions
      );

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
        result.filter(line => line.includes('DROP FUNCTION IF EXISTS')).length
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
      stubRoutineCatalogQueries(
        mockSourceClient,
        mockTargetClient,
        sourceFunctions,
        targetFunctions
      );

      // Mock the getFunctionDefinition call to return different definitions
      let callCount = 0;
      const originalGetFunctionDefinition = functionOps.getFunctionDefinition;
      functionOps.getFunctionDefinition = () => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(mockFunctionDefinition1);
        } else {
          return Promise.resolve(mockFunctionDefinition2);
        }
      };

      const result = await functionOps.generateFunctionOperations();

      expect(
        result.filter(line => line.includes('-- Creating function')).length
      ).toBe(2);

      // Restore original method
      functionOps.getFunctionDefinition = originalGetFunctionDefinition;
    });

    it('should handle database errors', async () => {
      const error = new Error('Database connection failed');
      mockSourceClient.query.mockRejectedValue(error);

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

      const sourceDef =
        'CREATE FUNCTION dev_schema.test_function() RETURNS integer AS $$ BEGIN RETURN 1; END; $$ LANGUAGE plpgsql;';
      const targetDef =
        'CREATE FUNCTION prod_schema.test_function() RETURNS integer AS $$ BEGIN RETURN 2; END; $$ LANGUAGE plpgsql;';

      mockSourceClient.query = () =>
        Promise.resolve({ rows: [{ definition: sourceDef }] });
      mockTargetClient.query = () =>
        Promise.resolve({ rows: [{ definition: targetDef }] });

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
          line.includes('DROP FUNCTION IF EXISTS prod_schema.test_function')
        )
      ).toBe(false);
      expect(
        alterStatements.some(line =>
          line.includes(
            'CREATE OR REPLACE FUNCTION prod_schema.test_function AS'
          )
        )
      ).toBe(true);
    });

    it('detects body drift when catalog rows have no routine_definition field', async () => {
      const sourceFunctions = [
        {
          routine_name: 'sp_record_sale',
          routine_type: 'PROCEDURE',
          routine_oid: '101',
          identity_arguments: 'IN p_payload jsonb, OUT p_result jsonb',
          data_type: 'jsonb',
        },
      ];
      const targetFunctions = [
        {
          routine_name: 'sp_record_sale',
          routine_type: 'PROCEDURE',
          routine_oid: '202',
          identity_arguments: 'IN p_payload jsonb, OUT p_result jsonb',
          data_type: 'jsonb',
        },
      ];

      const sourceDef =
        'CREATE PROCEDURE ddp_shadow.sp_record_sale(IN p_payload jsonb, OUT p_result jsonb) AS $$ BEGIN /* new */ END; $$';
      const targetDef =
        'CREATE PROCEDURE prod_schema.sp_record_sale(IN p_payload jsonb, OUT p_result jsonb) AS $$ BEGIN /* old */ END; $$';

      mockSourceClient.query = () =>
        Promise.resolve({ rows: [{ definition: sourceDef }] });
      mockTargetClient.query = () =>
        Promise.resolve({ rows: [{ definition: targetDef }] });

      const alterStatements: string[] = [];
      await functionOps.handleFunctionsToUpdate(
        sourceFunctions,
        targetFunctions,
        alterStatements
      );

      expect(
        alterStatements.some(line =>
          line.includes('sp_record_sale has changed, updating in prod_schema')
        )
      ).toBe(true);
      expect(
        alterStatements.some(line => line.includes('CREATE OR REPLACE PROCEDURE'))
      ).toBe(true);
    });

    it('should not handle functions that are identical', async () => {
      const sourceFunctions = [
        {
          routine_name: 'test_function',
          routine_type: 'FUNCTION',
          routine_oid: '1',
          identity_arguments: '',
          data_type: 'integer',
        },
      ];

      const targetFunctions = [
        {
          routine_name: 'test_function',
          routine_type: 'FUNCTION',
          routine_oid: '2',
          identity_arguments: '',
          data_type: 'integer',
        },
      ];

      const sameDef =
        'CREATE FUNCTION prod_schema.test_function() RETURNS integer AS $$ BEGIN RETURN 1; END; $$ LANGUAGE plpgsql;';
      mockSourceClient.query = () =>
        Promise.resolve({ rows: [{ definition: sameDef }] });
      mockTargetClient.query = () =>
        Promise.resolve({ rows: [{ definition: sameDef }] });

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

      const sourceDef1 =
        'CREATE FUNCTION dev_schema.function1() RETURNS integer AS $$ BEGIN RETURN 1; END; $$ LANGUAGE plpgsql;';
      const targetDef1 =
        'CREATE FUNCTION prod_schema.function1() RETURNS integer AS $$ BEGIN RETURN 2; END; $$ LANGUAGE plpgsql;';
      const sourceDef2 =
        'CREATE PROCEDURE dev_schema.function2() AS $$ BEGIN INSERT INTO test VALUES (1); END; $$ LANGUAGE plpgsql;';
      const targetDef2 =
        'CREATE PROCEDURE prod_schema.function2() AS $$ BEGIN INSERT INTO test VALUES (2); END; $$ LANGUAGE plpgsql;';

      mockSourceClient.query = (_query, params) => {
        const name = params?.[1];
        if (name === 'function1') {
          return Promise.resolve({ rows: [{ definition: sourceDef1 }] });
        }
        if (name === 'function2') {
          return Promise.resolve({ rows: [{ definition: sourceDef2 }] });
        }
        return Promise.resolve({ rows: [] });
      };
      mockTargetClient.query = (_query, params) => {
        const name = params?.[1];
        if (name === 'function1') {
          return Promise.resolve({ rows: [{ definition: targetDef1 }] });
        }
        if (name === 'function2') {
          return Promise.resolve({ rows: [{ definition: targetDef2 }] });
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
        alterStatements.filter(line => line.includes('DROP FUNCTION IF EXISTS'))
          .length
      ).toBe(0);
      expect(
        alterStatements.filter(line =>
          line.includes('DROP PROCEDURE IF EXISTS')
        ).length
      ).toBe(0);
      expect(
        alterStatements.filter(line =>
          line.includes('CREATE OR REPLACE FUNCTION prod_schema')
        ).length
      ).toBe(1);
      expect(
        alterStatements.filter(line =>
          line.includes('CREATE OR REPLACE PROCEDURE prod_schema')
        ).length
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
      stubRoutineCatalogQueries(
        mockSourceClient,
        mockTargetClient,
        sourceFunctions,
        targetFunctions
      );

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
      mockSourceClient.query = () => {
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
      stubRoutineCatalogQueries(
        mockSourceClient,
        mockTargetClient,
        sourceFunctions,
        targetFunctions
      );

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
      stubRoutineCatalogQueries(
        mockSourceClient,
        mockTargetClient,
        sourceFunctions,
        targetFunctions
      );

      // Mock the getFunctionDefinition call
      const originalGetFunctionDefinition = functionOps.getFunctionDefinition;
      functionOps.getFunctionDefinition = () =>
        Promise.resolve(mockFunctionDefinition);

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

      // Restore original method
      functionOps.getFunctionDefinition = originalGetFunctionDefinition;
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
      mockSourceClient.query = () => {
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
