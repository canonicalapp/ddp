/**
 * Unit tests for procs generator
 */

import {
  createMockConnection,
  createMockFunctionData,
  createMockGeneratorOptions,
  createMockIntrospectionService,
} from '@/fixtures/generatorTestUtils';
import { createMockClient } from '@/fixtures/testUtils';
import { ProcsGenerator } from '@/generators/procsGenerator';
import type { IFunctionDefinition, IParameterDefinition } from '@/types';

// Mock IntrospectionService
const mockIntrospectionService = createMockIntrospectionService();

describe('Procs Generator', () => {
  let mockClient: ReturnType<typeof createMockClient>;
  let mockConnection: ReturnType<typeof createMockConnection>;
  let mockOptions: ReturnType<typeof createMockGeneratorOptions>;

  beforeEach(() => {
    mockClient = createMockClient();
    mockConnection = createMockConnection();
    mockOptions = createMockGeneratorOptions();
  });

  describe('constructor', () => {
    it('should initialize with client, connection, and options', () => {
      const generator = new ProcsGenerator(
        mockClient,
        mockConnection,
        mockOptions
      );

      expect(generator).toBeInstanceOf(ProcsGenerator);
    });
  });

  describe('getGeneratorName', () => {
    it('should return correct generator name', () => {
      const generator = new ProcsGenerator(
        mockClient,
        mockConnection,
        mockOptions
      );
      const name = (generator as any).getGeneratorName();

      expect(name).toBe('Procedures Generator');
    });
  });

  describe('shouldSkip', () => {
    it('should not skip when no filter options are set', () => {
      const generator = new ProcsGenerator(
        mockClient,
        mockConnection,
        mockOptions
      );
      const shouldSkip = (generator as any).shouldSkip();

      expect(shouldSkip).toBe(false);
    });

    it('should skip when schemaOnly is true', () => {
      const optionsWithSchemaOnly = { ...mockOptions, schemaOnly: true };
      const generator = new ProcsGenerator(
        mockClient,
        mockConnection,
        optionsWithSchemaOnly
      );
      const shouldSkip = (generator as any).shouldSkip();

      expect(shouldSkip).toBe(true);
    });

    it('should skip when triggersOnly is true', () => {
      const optionsWithTriggersOnly = { ...mockOptions, triggersOnly: true };
      const generator = new ProcsGenerator(
        mockClient,
        mockConnection,
        optionsWithTriggersOnly
      );
      const shouldSkip = (generator as any).shouldSkip();

      expect(shouldSkip).toBe(true);
    });

    it('should not skip when procsOnly is true', () => {
      const optionsWithProcsOnly = { ...mockOptions, procsOnly: true };
      const generator = new ProcsGenerator(
        mockClient,
        mockConnection,
        optionsWithProcsOnly
      );
      const shouldSkip = (generator as any).shouldSkip();

      expect(shouldSkip).toBe(false);
    });
  });

  describe('validateData', () => {
    it('should throw error when no functions found', async () => {
      mockIntrospectionService.getFunctions = () => Promise.resolve([]);

      const generator = new ProcsGenerator(
        mockClient,
        mockConnection,
        mockOptions
      );

      await expect((generator as any).validateData()).rejects.toThrow(
        "No functions or procedures found in schema 'public'"
      );
    });

    it('should not throw when functions are found', async () => {
      // Mock the client query to return function data
      mockClient.query.mockResolvedValue({
        rows: [{ routine_name: 'test_function' }],
      });

      const generator = new ProcsGenerator(
        mockClient,
        mockConnection,
        mockOptions
      );

      await expect(
        (
          generator as unknown as { validateData: () => Promise<void> }
        ).validateData()
      ).resolves.not.toThrow();
    });
  });

  describe('generate', () => {
    it('should generate procs.sql file with functions', async () => {
      // Mock the client query to return function data
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ routine_name: 'get_user_by_id' }] }) // for getFunctions (validateData)
        .mockResolvedValueOnce({ rows: [createMockFunctionData()] }); // for getFunctions (generate)

      const generator = new ProcsGenerator(
        mockClient,
        mockConnection,
        mockOptions
      );
      const result = await (generator as any).generate();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('procs.sql');
      expect(result[0].content).toContain('-- FUNCTIONS AND PROCEDURES');
      expect(result[0].content).toContain('test_function');
    });

    it('should handle functions without comments', async () => {
      // Mock the client query to return function data
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ routine_name: 'simple_function' }] }) // for getFunctions (validateData)
        .mockResolvedValueOnce({
          rows: [
            createMockFunctionData({
              function_name: 'simple_function',
              comment: null,
            }),
          ],
        }); // for getFunctions (generate)

      const generator = new ProcsGenerator(
        mockClient,
        mockConnection,
        mockOptions
      );
      const result = await (generator as any).generate();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('procs.sql');
      expect(result[0].content).toContain('simple_function');
    });
  });

  describe('data conversion methods', () => {
    let generator: ProcsGenerator;

    beforeEach(() => {
      generator = new ProcsGenerator(mockClient, mockConnection, mockOptions);
    });

    describe('convertToFunctionDefinition', () => {
      it('should convert function data correctly', () => {
        const funcData = {
          function_name: 'test_function',
          return_type: 'integer',
          function_body: 'BEGIN RETURN 1; END;',
          function_comment: 'Test function',
          volatility: 'v',
          security_definer: true,
        };

        const result = (
          generator as unknown as {
            convertToFunctionDefinition: (data: any) => IFunctionDefinition;
          }
        ).convertToFunctionDefinition(funcData);

        expect(result.name).toBe('test_function');
        expect(result.schema).toBe('public');
        expect(result.returnType).toBe('integer');
        expect(result.body).toBe('BEGIN RETURN 1; END;');
        expect(result.comment).toBe('Test function');
        expect(result.parameters).toEqual([]);
        expect(result.language).toBe('plpgsql');
        expect(result.volatility).toBe('VOLATILE');
        expect(result.security).toBe('DEFINER');
      });

      it('should handle function without comment', () => {
        const funcData = {
          function_name: 'test_function',
          return_type: 'void',
          function_body: 'BEGIN END;',
          function_comment: null,
        };

        const result = (
          generator as unknown as {
            convertToFunctionDefinition: (data: any) => IFunctionDefinition;
          }
        ).convertToFunctionDefinition(funcData);

        expect(result.name).toBe('test_function');
        expect(result.returnType).toBe('void');
        expect(result.comment).toBeUndefined();
      });

      it('should handle function without definition', () => {
        const funcData = {
          function_name: 'test_function',
          return_type: 'integer',
          function_body: null,
          function_comment: 'Test function',
        };

        const result = (
          generator as unknown as {
            convertToFunctionDefinition: (data: any) => IFunctionDefinition;
          }
        ).convertToFunctionDefinition(funcData);

        expect(result.name).toBe('test_function');
        expect(result.body).toBe('-- Function body not available');
      });
    });
  });

  describe('SQL generation methods', () => {
    let generator: ProcsGenerator;

    beforeEach(() => {
      generator = new ProcsGenerator(mockClient, mockConnection, mockOptions);
    });

    describe('generateProcsSQL', () => {
      it('should generate complete procs SQL', async () => {
        const functions: IFunctionDefinition[] = [
          {
            name: 'test_function',
            schema: 'public',
            parameters: [],
            returnType: 'integer',
            language: 'plpgsql',
            body: 'BEGIN RETURN 1; END;',
            volatility: 'VOLATILE',
            security: 'DEFINER',
            comment: 'Test function',
          },
        ];

        const result = await (
          generator as unknown as {
            generateProcsSQL: (
              functions: IFunctionDefinition[]
            ) => Promise<string>;
          }
        ).generateProcsSQL(functions);

        expect(result).toContain('-- FUNCTIONS AND PROCEDURES');
        expect(result).toContain('-- Function: test_function');
        expect(result).toContain('CREATE OR REPLACE FUNCTION');
      });
    });

    describe('generateFunctionSQL', () => {
      it('should generate function creation SQL', () => {
        const func: IFunctionDefinition = {
          name: 'test_function',
          schema: 'public',
          parameters: [
            {
              name: 'id',
              type: 'integer',
              mode: 'IN',
              defaultValue: undefined,
            },
          ],
          returnType: 'integer',
          language: 'plpgsql',
          body: 'BEGIN RETURN id; END;',
          volatility: 'VOLATILE',
          security: 'DEFINER',
          comment: 'Test function',
        };

        const result = (
          generator as unknown as {
            generateFunctionSQL: (func: IFunctionDefinition) => string;
          }
        ).generateFunctionSQL(func);

        expect(result).toContain('-- Function: test_function');
        expect(result).toContain('-- Test function');
        expect(result).toContain(
          'CREATE OR REPLACE FUNCTION public.test_function'
        );
        expect(result).toContain('id integer');
        expect(result).toContain('RETURNS integer');
        expect(result).toContain('LANGUAGE plpgsql');
        expect(result).toContain('VOLATILE');
        expect(result).toContain('SECURITY DEFINER');
        expect(result).toContain('BEGIN RETURN id; END;');
      });

      it('should generate function without parameters', () => {
        const func: IFunctionDefinition = {
          name: 'simple_function',
          schema: 'public',
          parameters: [],
          returnType: 'void',
          language: 'plpgsql',
          body: 'BEGIN END;',
          volatility: 'VOLATILE',
          security: 'DEFINER',
        };

        const result = (
          generator as unknown as {
            generateFunctionSQL: (func: IFunctionDefinition) => string;
          }
        ).generateFunctionSQL(func);

        expect(result).toContain(
          'CREATE OR REPLACE FUNCTION public.simple_function()'
        );
        // Function without parameters doesn't have RETURNS clause when return type is void
      });
    });

    // Note: generateProcedureSQL is not a public method in ProcsGenerator

    describe('getFunctionType', () => {
      it('should return FUNCTION for all functions', () => {
        const func: IFunctionDefinition = {
          name: 'test_function',
          schema: 'public',
          parameters: [],
          returnType: 'integer',
          language: 'plpgsql',
          body: 'BEGIN RETURN 1; END;',
          volatility: 'VOLATILE',
          security: 'DEFINER',
        };

        const result = (
          generator as unknown as {
            getFunctionType: (func: IFunctionDefinition) => string;
          }
        ).getFunctionType(func);

        expect(result).toBe('FUNCTION');
      });
    });

    describe('generateParameterDefinition', () => {
      it('should generate parameter definition with mode', () => {
        const param = {
          name: 'id',
          type: 'integer',
          mode: 'IN',
          defaultValue: undefined,
        };

        const result = (
          generator as unknown as {
            generateParameterDefinition: (
              param: IParameterDefinition
            ) => string;
          }
        ).generateParameterDefinition(param);

        expect(result).toBe('id integer');
      });

      it('should generate parameter definition with OUT mode', () => {
        const param = {
          name: 'result',
          type: 'integer',
          mode: 'OUT',
          defaultValue: undefined,
        };

        const result = (
          generator as unknown as {
            generateParameterDefinition: (
              param: IParameterDefinition
            ) => string;
          }
        ).generateParameterDefinition(param);

        expect(result).toBe('OUT result integer');
      });

      it('should generate parameter definition with default value', () => {
        const param = {
          name: 'id',
          type: 'integer',
          mode: 'IN',
          defaultValue: '1',
        };

        const result = (
          generator as unknown as {
            generateParameterDefinition: (
              param: IParameterDefinition
            ) => string;
          }
        ).generateParameterDefinition(param);

        expect(result).toBe('id integer DEFAULT 1');
      });
    });

    // Note: separateFunctionsAndProcedures is not a public method in ProcsGenerator
  });
});
