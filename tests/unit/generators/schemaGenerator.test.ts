/**
 * Unit tests for schema generator
 */

import {
  createMockConnection,
  createMockGeneratorOptions,
  createMockIntrospectionService,
  createMockTableData,
} from '@/fixtures/generatorTestUtils';
import { createMockClient } from '@/fixtures/testUtils';
import { SchemaGenerator } from '@/generators/schemaGenerator';
import type {
  IColumnDefinition,
  IConstraintDefinition,
  IIndexDefinition,
  ITableDefinition,
} from '@/types';

// Mock IntrospectionService
const mockIntrospectionService = createMockIntrospectionService();

// Mock the IntrospectionService class
jest.mock('@/database/introspection', () => ({
  IntrospectionService: jest
    .fn()
    .mockImplementation(() => mockIntrospectionService),
}));

describe('Schema Generator', () => {
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
      const generator = new SchemaGenerator(
        mockClient,
        mockConnection,
        mockOptions
      );

      expect(generator).toBeInstanceOf(SchemaGenerator);
    });
  });

  describe('getGeneratorName', () => {
    it('should return correct generator name', () => {
      const generator = new SchemaGenerator(
        mockClient,
        mockConnection,
        mockOptions
      );
      const name = (generator as any).getGeneratorName();

      expect(name).toBe('Schema Generator');
    });
  });

  describe('shouldSkip', () => {
    it('should not skip when no filter options are set', () => {
      const generator = new SchemaGenerator(
        mockClient,
        mockConnection,
        mockOptions
      );
      const shouldSkip = (generator as any).shouldSkip();

      expect(shouldSkip).toBe(false);
    });

    it('should skip when procsOnly is true', () => {
      const optionsWithProcsOnly = { ...mockOptions, procsOnly: true };
      const generator = new SchemaGenerator(
        mockClient,
        mockConnection,
        optionsWithProcsOnly
      );
      const shouldSkip = (generator as any).shouldSkip();

      expect(shouldSkip).toBe(true);
    });

    it('should skip when triggersOnly is true', () => {
      const optionsWithTriggersOnly = { ...mockOptions, triggersOnly: true };
      const generator = new SchemaGenerator(
        mockClient,
        mockConnection,
        optionsWithTriggersOnly
      );
      const shouldSkip = (generator as any).shouldSkip();

      expect(shouldSkip).toBe(true);
    });

    it('should not skip when schemaOnly is true', () => {
      const optionsWithSchemaOnly = { ...mockOptions, schemaOnly: true };
      const generator = new SchemaGenerator(
        mockClient,
        mockConnection,
        optionsWithSchemaOnly
      );
      const shouldSkip = (generator as any).shouldSkip();

      expect(shouldSkip).toBe(false);
    });
  });

  describe('validateData', () => {
    it('should throw error when no tables found', async () => {
      // Mock schema exists and empty tables response
      mockIntrospectionService.checkSchemaExists = () => Promise.resolve(true);
      mockIntrospectionService.getTables = () => Promise.resolve([]);

      const generator = new SchemaGenerator(
        mockClient,
        mockConnection,
        mockOptions
      );

      await expect((generator as any).validateData()).rejects.toThrow(
        "Schema 'public' exists but contains no tables. Nothing to generate."
      );
    });

    it('should not throw when tables are found', async () => {
      // Mock schema exists and tables response
      mockIntrospectionService.checkSchemaExists = () => Promise.resolve(true);
      mockIntrospectionService.getTables = () =>
        Promise.resolve([{ table_name: 'test_table' }]);

      const generator = new SchemaGenerator(
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
    it('should generate schema.sql file with tables', async () => {
      // Mock schema exists and table data
      mockIntrospectionService.checkSchemaExists = () => Promise.resolve(true);
      mockIntrospectionService.getTables = () =>
        Promise.resolve([{ table_name: 'users' }]);
      mockIntrospectionService.getAllTablesComplete = () =>
        Promise.resolve([createMockTableData()]);

      const generator = new SchemaGenerator(
        mockClient,
        mockConnection,
        mockOptions
      );
      const result = await (generator as any).generate();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('schema.sql');
      expect(result[0].content).toContain('CREATE TABLE public.users');
      expect(result[0].content).toContain('id INTEGER NOT NULL');
      expect(result[0].content).toContain('name CHARACTER VARYING NOT NULL');
      expect(result[0].content).toContain('PRIMARY KEY ()');
    });

    it('should handle tables without constraints and indexes', async () => {
      // Mock schema exists and table data
      mockIntrospectionService.checkSchemaExists = () => Promise.resolve(true);
      mockIntrospectionService.getTables = () =>
        Promise.resolve([{ table_name: 'simple_table' }]);
      mockIntrospectionService.getAllTablesComplete = () =>
        Promise.resolve([
          {
            table: { table_name: 'simple_table', table_schema: 'public' },
            columns: [
              {
                column_name: 'id',
                data_type: 'integer',
                is_nullable: 'YES',
                column_default: null,
                character_maximum_length: null,
                numeric_precision: 32,
                numeric_scale: 0,
                is_identity: 'NO',
                identity_generation: null,
                is_generated: 'NEVER',
              },
            ],
            constraints: [],
            indexes: [],
            sequences: [],
          },
        ]);

      const generator = new SchemaGenerator(
        mockClient,
        mockConnection,
        mockOptions
      );
      const result = await (generator as any).generate();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('schema.sql');
      expect(result[0].content).toContain('CREATE TABLE public.simple_table');
      expect(result[0].content).toContain('id INTEGER');
    });
  });

  describe('data conversion methods', () => {
    let generator: SchemaGenerator;

    beforeEach(() => {
      generator = new SchemaGenerator(mockClient, mockConnection, mockOptions);
    });

    describe('convertToTableDefinition', () => {
      it('should convert table data correctly', () => {
        const tableData = {
          table: {
            table_name: 'test_table',
            table_schema: 'public',
            table_comment: 'Test table comment',
          },
          columns: [],
          constraints: [],
          indexes: [],
          sequences: [],
        };

        const result = (
          generator as unknown as {
            convertToTableDefinition: (data: any) => ITableDefinition;
          }
        ).convertToTableDefinition(tableData);

        expect(result.name).toBe('test_table');
        expect(result.schema).toBe('public');
        expect(result.comment).toBe('Test table comment');
        expect(result.columns).toEqual([]);
        expect(result.constraints).toEqual([]);
        expect(result.indexes).toEqual([]);
      });
    });

    describe('convertToColumnDefinition', () => {
      it('should convert column data correctly', () => {
        const columnData = {
          column_name: 'test_column',
          data_type: 'varchar',
          is_nullable: 'NO',
          column_default: "'default_value'",
          character_maximum_length: 255,
          numeric_precision: null,
          numeric_scale: null,
          is_identity: 'YES',
          identity_generation: 'ALWAYS',
          is_generated: 'NEVER',
        };

        const result = (
          generator as unknown as {
            convertToColumnDefinition: (data: any) => IColumnDefinition;
          }
        ).convertToColumnDefinition(columnData);

        expect(result.name).toBe('test_column');
        expect(result.type).toBe('varchar');
        expect(result.nullable).toBe(false);
        expect(result.defaultValue).toBe("'default_value'");
        expect(result.length).toBe(255);
        expect(result.isIdentity).toBe(true);
        expect(result.identityGeneration).toBe('ALWAYS');
        expect(result.generated).toBe('NEVER');
      });
    });

    describe('convertToConstraintDefinition', () => {
      it('should convert constraint data correctly', () => {
        const constraintData = {
          constraint_name: 'test_constraint',
          constraint_type: 'PRIMARY KEY',
          column_names: 'id, name',
          foreign_table_name: null,
          foreign_column_name: null,
          check_clause: null,
          is_deferrable: 'NO',
          initially_deferred: 'NO',
          delete_rule: null,
          update_rule: null,
        };

        const result = (
          generator as unknown as {
            convertToConstraintDefinition: (data: any) => IConstraintDefinition;
          }
        ).convertToConstraintDefinition(constraintData);

        expect(result.name).toBe('test_constraint');
        expect(result.type).toBe('PRIMARY KEY');
        expect(result.columns).toEqual(['id', ' name']);
        expect(result.references).toBeUndefined();
        expect(result.checkClause).toBeUndefined();
        expect(result.deferrable).toBe(false);
        expect(result.initiallyDeferred).toBe(false);
      });

      it('should convert foreign key constraint correctly', () => {
        const constraintData = {
          constraint_name: 'fk_test',
          constraint_type: 'FOREIGN KEY',
          column_names: 'user_id',
          foreign_table_name: 'users',
          foreign_column_name: 'id',
          check_clause: null,
          is_deferrable: 'YES',
          initially_deferred: 'YES',
          delete_rule: 'CASCADE',
          update_rule: 'RESTRICT',
        };

        const result = (
          generator as unknown as {
            convertToConstraintDefinition: (data: any) => IConstraintDefinition;
          }
        ).convertToConstraintDefinition(constraintData);

        expect(result.name).toBe('fk_test');
        expect(result.type).toBe('FOREIGN KEY');
        expect(result.columns).toEqual(['user_id']);
        expect(result.references).toEqual({
          table: 'users',
          column: 'id',
        });
        expect(result.deferrable).toBe(true);
        expect(result.initiallyDeferred).toBe(true);
        expect(result.onDelete).toBe('CASCADE');
        expect(result.onUpdate).toBe('RESTRICT');
      });
    });

    describe('convertToIndexDefinition', () => {
      it('should convert index data correctly', () => {
        const indexData = {
          indexname: 'test_index',
          tablename: 'test_table',
          schemaname: 'public',
          indexdef:
            'CREATE UNIQUE INDEX test_index ON public.test_table USING btree (id, name)',
          index_type: 'btree',
          estimated_rows: 100,
          index_size: '8kB',
          index_pages: 1,
          is_unique: true,
          is_primary: false,
        };

        const result = (
          generator as unknown as {
            convertToIndexDefinition: (data: any) => IIndexDefinition;
          }
        ).convertToIndexDefinition(indexData);

        expect(result.name).toBe('test_index');
        expect(result.table).toBe('test_table');
        expect(result.schema).toBe('public');
        expect(result.columns).toEqual(['id', 'name']);
        expect(result.unique).toBe(true);
        expect(result.partial).toBeUndefined();
        expect(result.method).toBe('btree');
        expect(result.is_primary).toBe(false);
      });
    });
  });

  describe('SQL generation methods', () => {
    let generator: SchemaGenerator;

    beforeEach(() => {
      generator = new SchemaGenerator(mockClient, mockConnection, mockOptions);
    });

    describe('generateSchemaSQL', () => {
      it('should generate complete schema SQL', async () => {
        const tables: ITableDefinition[] = [
          {
            name: 'users',
            schema: 'public',
            columns: [],
            constraints: [],
            indexes: [],
            sequences: [],
            comment: 'Users table',
          },
        ];

        const result = await (
          generator as unknown as {
            generateSchemaSQL: (tables: ITableDefinition[]) => Promise<string>;
          }
        ).generateSchemaSQL(tables);

        expect(result).toContain('-- SCHEMA DEFINITION');
        expect(result).toContain('-- Table: Users table');
        expect(result).toContain('CREATE TABLE public.users');
      });
    });

    describe('generateTableSQL', () => {
      it('should generate table creation SQL', () => {
        const table: ITableDefinition = {
          name: 'test_table',
          schema: 'public',
          columns: [
            {
              name: 'id',
              type: 'integer',
              nullable: false,
              defaultValue: '1',
            },
          ],
          constraints: [],
          indexes: [],
          comment: 'Test table',
        };

        const result = (
          generator as unknown as {
            generateTableSQL: (table: ITableDefinition) => string;
          }
        ).generateTableSQL(table);

        expect(result).toContain('-- Table: Test table');
        expect(result).toContain('CREATE TABLE public.test_table');
        expect(result).toContain('id INTEGER NOT NULL DEFAULT 1');
      });
    });

    // Note: generateColumnSQL is not a public method in SchemaGenerator

    describe('generateConstraintSQL', () => {
      it('should generate primary key constraint SQL', () => {
        const constraint = {
          name: 'pk_test',
          type: 'PRIMARY KEY',
          columns: ['id'],
        };

        const result = (
          generator as unknown as {
            generateConstraintSQL: (
              constraint: IConstraintDefinition,
              schema: string,
              table: string
            ) => string;
          }
        ).generateConstraintSQL(constraint, 'public', 'test_table');

        expect(result).toContain(
          'ALTER TABLE public.test_table ADD CONSTRAINT pk_test PRIMARY KEY (id)'
        );
      });

      it('should generate foreign key constraint SQL', () => {
        const constraint = {
          name: 'fk_test',
          type: 'FOREIGN KEY',
          columns: ['user_id'],
          references: {
            table: 'users',
            column: 'id',
          },
          onDelete: 'CASCADE',
          onUpdate: 'RESTRICT',
        };

        const result = (
          generator as unknown as {
            generateConstraintSQL: (
              constraint: IConstraintDefinition,
              schema: string,
              table: string
            ) => string;
          }
        ).generateConstraintSQL(constraint, 'public', 'test_table');

        expect(result).toContain(
          'ALTER TABLE public.test_table ADD CONSTRAINT fk_test FOREIGN KEY (user_id)'
        );
        expect(result).toContain('REFERENCES public.users (id)');
        expect(result).toContain('ON DELETE CASCADE');
        expect(result).toContain('ON UPDATE RESTRICT');
      });
    });

    describe('generateIndexSQL', () => {
      it('should generate index creation SQL', () => {
        const index = {
          name: 'idx_test',
          table: 'test_table',
          columns: ['id', 'name'],
          unique: true,
          method: 'btree',
        };

        const result = (
          generator as unknown as {
            generateIndexSQL: (
              index: IIndexDefinition,
              schema: string
            ) => string;
          }
        ).generateIndexSQL(index, 'public');

        expect(result).toContain('CREATE UNIQUE INDEX idx_test');
        expect(result).toContain('ON public.test_table');
        expect(result).toContain('(id, name)');
      });
    });
  });
});
