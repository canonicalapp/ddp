/**
 * Unit tests for TableOperations module
 */

import { Utils } from '@/utils/formatting.ts';
import { TableOperations } from '@/sync/operations/tables.ts';
import {
  sourceTablesForAddTest,
  sourceTablesForDropTest,
  mockColumns,
  ordersTable,
  targetTablesForAddTest,
  targetTablesForDropTest,
  usersTable,
} from '../../../fixtures/tableOperations.ts';
import {
  createMockClient,
  createMockOptions,
} from '../../../fixtures/testUtils.ts';

describe('TableOperations', () => {
  let tableOps;
  let mockSourceClient;
  let mockTargetClient;
  let mockOptions;
  let mockUtils;

  beforeEach(() => {
    mockSourceClient = createMockClient();
    mockTargetClient = createMockClient();
    mockOptions = createMockOptions();
    tableOps = new TableOperations(
      mockSourceClient,
      mockTargetClient,
      mockOptions
    );

    // Create mock Utils functions
    mockUtils = {
      formatColumnDefinition: col =>
        `"${col.column_name}" ${col.data_type}${
          col.character_maximum_length
            ? `(${col.character_maximum_length})`
            : ''
        }${col.is_nullable === 'NO' ? ' NOT NULL' : ''}${
          col.column_default ? ` DEFAULT ${col.column_default}` : ''
        }`,
      generateBackupName: name => `${name}_backup_2024-01-01T00-00-00-000Z`,
    };

    // Mock the Utils module methods
    Utils.formatColumnDefinition = mockUtils.formatColumnDefinition;
    Utils.generateBackupName = mockUtils.generateBackupName;
  });

  describe('constructor', () => {
    it('should initialize with source client, target client and options', () => {
      expect(tableOps.sourceClient).toBe(mockSourceClient);
      expect(tableOps.targetClient).toBe(mockTargetClient);
      expect(tableOps.options).toBe(mockOptions);
    });
  });

  describe('getTables', () => {
    it('should query for tables in a schema', async () => {
      const mockTables = [usersTable, ordersTable];

      mockSourceClient.query.mockResolvedValue({ rows: mockTables });

      const result = await tableOps.getTables('dev_schema');

      // Check that query was called with correct parameters
      const calls = mockSourceClient.query.mock.calls;
      expect(calls.length).toBe(1);
      expect(calls[0][0]).toContain('information_schema.tables');
      expect(calls[0][1]).toEqual(['dev_schema']);
      expect(result).toEqual(mockTables);
    });

    it('should filter for BASE TABLE type only', async () => {
      await tableOps.getTables('dev_schema');

      const query = mockSourceClient.query.mock.calls[0][0];
      expect(query).toContain("table_type = 'BASE TABLE'");
    });

    it('should handle empty results', async () => {
      mockSourceClient.query.mockResolvedValue({ rows: [] });

      const result = await tableOps.getTables('dev_schema');

      expect(result).toEqual([]);
    });

    it('should handle database errors', async () => {
      const error = new Error('Database connection failed');
      mockSourceClient.query.mockRejectedValue(error);

      await expect(tableOps.getTables('dev_schema')).rejects.toThrow(
        'Database connection failed'
      );
    });
  });

  describe('getTableDefinition', () => {
    it('should query for table columns', async () => {
      const mockColumns = [
        {
          column_name: 'id',
          data_type: 'integer',
          character_maximum_length: null,
          is_nullable: 'NO',
          column_default: "nextval('users_id_seq'::regclass)",
          ordinal_position: 1,
        },
        {
          column_name: 'name',
          data_type: 'character varying',
          character_maximum_length: 255,
          is_nullable: 'NO',
          column_default: null,
          ordinal_position: 2,
        },
      ];

      mockSourceClient.query.mockResolvedValue({ rows: mockColumns });

      const result = await tableOps.getTableDefinition('dev_schema', 'users');

      // Check that query was called with correct parameters
      const calls = mockSourceClient.query.mock.calls;
      expect(calls.length).toBe(1);
      expect(calls[0][0]).toContain('information_schema.columns');
      expect(calls[0][1]).toEqual(['dev_schema', 'users']);
      expect(result).toEqual(mockColumns);
    });

    it('should order columns by ordinal position', async () => {
      await tableOps.getTableDefinition('dev_schema', 'users');

      const query = mockSourceClient.query.mock.calls[0][0];
      expect(query).toContain('ORDER BY ordinal_position');
    });

    it('should handle table not found', async () => {
      mockSourceClient.query.mockResolvedValue({ rows: [] });

      const result = await tableOps.getTableDefinition(
        'dev_schema',
        'nonexistent'
      );

      expect(result).toEqual([]);
    });
  });

  describe('generateCreateTableStatement', () => {
    it('should generate CREATE TABLE statement', () => {
      const columns = [
        {
          column_name: 'id',
          data_type: 'integer',
          character_maximum_length: null,
          is_nullable: 'NO',
          column_default: "nextval('users_id_seq'::regclass)",
        },
        {
          column_name: 'name',
          data_type: 'character varying',
          character_maximum_length: 255,
          is_nullable: 'NO',
          column_default: null,
        },
      ];

      const result = tableOps.generateCreateTableStatement('users', columns);

      expect(result).toContain('CREATE TABLE IF NOT EXISTS prod_schema.users');
      expect(result).toContain(
        '"id" integer NOT NULL DEFAULT nextval(\'users_id_seq\'::regclass)'
      );
      expect(result).toContain('"name" character varying(255) NOT NULL');
    });

    it('should return null for empty columns array', () => {
      const result = tableOps.generateCreateTableStatement('users', []);

      expect(result).toBeNull();
    });

    it('should use production schema from options', () => {
      const columns = [
        {
          column_name: 'id',
          data_type: 'integer',
          character_maximum_length: null,
          is_nullable: 'NO',
          column_default: null,
        },
      ];

      const result = tableOps.generateCreateTableStatement('users', columns);

      expect(result).toContain('CREATE TABLE IF NOT EXISTS prod_schema.users');
    });

    it('should format columns with proper indentation', () => {
      const columns = [
        {
          column_name: 'id',
          data_type: 'integer',
          character_maximum_length: null,
          is_nullable: 'NO',
          column_default: null,
        },
        {
          column_name: 'name',
          data_type: 'text',
          character_maximum_length: null,
          is_nullable: 'YES',
          column_default: null,
        },
      ];

      const result = tableOps.generateCreateTableStatement('users', columns);

      expect(result).toContain('(\n  "id" integer NOT NULL,\n  "name" text\n)');
    });
  });

  describe('generateTableOperations', () => {
    it('should create missing tables in target', async () => {
      const sourceTables = sourceTablesForAddTest;
      const targetTables = targetTablesForAddTest;

      mockSourceClient.query.mockResolvedValue({ rows: sourceTables });
      mockTargetClient.query.mockResolvedValue({ rows: targetTables });
      mockSourceClient.query.mockResolvedValue({ rows: mockColumns }); // getTableDefinition for orders

      const result = await tableOps.generateTableOperations();

      expect(result).toContain('-- Create missing table orders');
      expect(
        result.some(line =>
          line.includes('CREATE TABLE IF NOT EXISTS prod_schema.orders')
        )
      ).toBe(true);
    });

    it('should handle tables to drop in target', async () => {
      const sourceTables = sourceTablesForDropTest;
      const targetTables = targetTablesForDropTest;

      mockSourceClient.query.mockResolvedValue({ rows: sourceTables });
      mockTargetClient.query.mockResolvedValue({ rows: targetTables });

      const result = await tableOps.generateTableOperations();

      expect(result).toContain(
        '-- Table old_table exists in prod_schema but not in dev_schema'
      );
      expect(result).toContain(
        '-- Renaming table to preserve data before manual drop'
      );
      expect(result).toContain(
        'ALTER TABLE prod_schema.old_table RENAME TO old_table_backup_2024-01-01T00-00-00-000Z;'
      );
      expect(result).toContain(
        '-- TODO: Manually drop table prod_schema.old_table_backup_2024-01-01T00-00-00-000Z after confirming data is no longer needed'
      );
    });

    it('should handle identical schemas', async () => {
      const sourceTables = [{ table_name: 'users' }];
      const targetTables = [{ table_name: 'users' }];

      mockSourceClient.query.mockResolvedValue({ rows: sourceTables });
      mockTargetClient.query.mockResolvedValue({ rows: targetTables });

      const result = await tableOps.generateTableOperations();

      expect(result).not.toContain('-- Create missing table');
      expect(result).not.toContain('-- Table');
      expect(result).not.toContain('RENAME TO');
    });

    it('should handle empty schemas', async () => {
      mockSourceClient.query.mockResolvedValue({ rows: [] });
      mockTargetClient.query.mockResolvedValue({ rows: [] });

      const result = await tableOps.generateTableOperations();

      expect(result).toEqual([]);
    });

    it('should handle multiple missing tables', async () => {
      const sourceTables = [
        { table_name: 'users' },
        { table_name: 'orders' },
        { table_name: 'products' },
      ];
      const targetTables = [{ table_name: 'users' }];
      const mockColumns = [
        {
          column_name: 'id',
          data_type: 'integer',
          character_maximum_length: null,
          is_nullable: 'NO',
          column_default: null,
          ordinal_position: 1,
        },
      ];

      mockSourceClient.query.mockResolvedValue({ rows: sourceTables });
      mockTargetClient.query.mockResolvedValue({ rows: targetTables });
      mockSourceClient.query
        .mockResolvedValueOnce({ rows: mockColumns }) // orders
        .mockResolvedValueOnce({ rows: mockColumns }); // products

      const result = await tableOps.generateTableOperations();

      expect(result).toContain('-- Create missing table orders');
      expect(result).toContain('-- Create missing table products');
      expect(result.filter(line => line.includes('CREATE TABLE')).length).toBe(
        2
      );
    });

    it('should handle multiple tables to drop', async () => {
      const sourceTables = [{ table_name: 'users' }];
      const targetTables = [
        { table_name: 'users' },
        { table_name: 'old_table1' },
        { table_name: 'old_table2' },
      ];

      mockSourceClient.query.mockResolvedValue({ rows: sourceTables });
      mockTargetClient.query.mockResolvedValue({ rows: targetTables });

      const result = await tableOps.generateTableOperations();

      expect(
        result.filter(
          line =>
            line.includes('-- Table') &&
            line.includes(
              `exists in ${mockOptions.target} but not in ${mockOptions.source}`
            )
        ).length
      ).toBe(2);
      expect(result.filter(line => line.includes('RENAME TO')).length).toBe(2);
    });

    it('should handle database errors during table operations', async () => {
      const error = new Error('Database connection failed');
      mockSourceClient.query.mockRejectedValue(error);

      await expect(tableOps.generateTableOperations()).rejects.toThrow(
        'Database connection failed'
      );
    });

    it('should handle errors during table definition retrieval', async () => {
      const sourceTables = [{ table_name: 'users' }];
      const targetTables = [];
      const error = new Error('Table not found');

      mockSourceClient.query.mockResolvedValue({ rows: sourceTables });
      mockTargetClient.query.mockResolvedValue({ rows: targetTables });
      mockSourceClient.query.mockRejectedValueOnce(error);

      await expect(tableOps.generateTableOperations()).rejects.toThrow(
        'Table not found'
      );
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle null table names', async () => {
      const sourceTables = [{ table_name: null }];
      const targetTables = [];

      mockSourceClient.query.mockResolvedValue({ rows: sourceTables });
      mockTargetClient.query.mockResolvedValue({ rows: targetTables });

      // Should not throw, but may produce unexpected results
      const result = await tableOps.generateTableOperations();
      expect(result).toBeDefined();
    });

    it('should handle special characters in table names', async () => {
      const sourceTables = [{ table_name: 'user-table_with.special@chars' }];
      const targetTables = [];
      const mockColumns = [
        {
          column_name: 'id',
          data_type: 'integer',
          character_maximum_length: null,
          is_nullable: 'NO',
          column_default: null,
          ordinal_position: 1,
        },
      ];

      mockSourceClient.query.mockResolvedValue({ rows: sourceTables });
      mockTargetClient.query.mockResolvedValue({ rows: targetTables });
      mockSourceClient.query.mockResolvedValue({ rows: mockColumns });

      const result = await tableOps.generateTableOperations();

      expect(result).toContain(
        '-- Create missing table user-table_with.special@chars'
      );
      expect(
        result.some(line =>
          line.includes(
            'CREATE TABLE IF NOT EXISTS prod_schema.user-table_with.special@chars'
          )
        )
      ).toBe(true);
    });

    it('should handle very long table names', async () => {
      const longTableName = 'a'.repeat(100);
      const sourceTables = [{ table_name: longTableName }];
      const targetTables = [];
      const mockColumns = [
        {
          column_name: 'id',
          data_type: 'integer',
          character_maximum_length: null,
          is_nullable: 'NO',
          column_default: null,
          ordinal_position: 1,
        },
      ];

      mockSourceClient.query.mockResolvedValue({ rows: sourceTables });
      mockTargetClient.query.mockResolvedValue({ rows: targetTables });
      mockSourceClient.query.mockResolvedValue({ rows: mockColumns });

      const result = await tableOps.generateTableOperations();

      expect(result).toContain(`-- Create missing table ${longTableName}`);
    });
  });
});
