/**
 * Unit tests for ColumnOperations module
 */

import { Utils } from '../../../../src/utils/formatting.js';
import { ColumnOperations } from '../../../../src/sync/operations/columns.js';
import {
  basicColumn,
  columnsForGrouping,
  columnsWithNullTableNames,
  createColumn,
  dataTypeChangeColumns,
  defaultValueChangeColumns,
  devColumnsForAddTest,
  devColumnsForDropTest,
  devColumnsForIdenticalTest,
  devColumnsForModifyTest,
  devColumnsForNewTableTest,
  devColumnsForOldTableTest,
  devColumnsWithLongName,
  devColumnsWithMalformedData,
  devColumnsWithNullName,
  devColumnsWithSpecialChars,
  dropDefaultColumns,
  dropNotNullColumns,
  multipleChangesColumns,
  nullabilityChangeColumns,
  prodColumnsForAddTest,
  prodColumnsForDropTest,
  prodColumnsForIdenticalTest,
  prodColumnsForLongName,
  prodColumnsForModifyTest,
  prodColumnsForNewTableTest,
  prodColumnsForOldTableTest,
  prodColumnsForSpecialChars,
  singleTableColumns,
} from '../../../fixtures/columnOperations.js';
import {
  createMockClient,
  createMockOptions,
} from '../../../fixtures/testUtils.js';

describe('ColumnOperations', () => {
  let columnOps;
  let mockClient;
  let mockOptions;
  let mockUtils;

  beforeEach(() => {
    mockClient = createMockClient();
    mockOptions = createMockOptions();
    columnOps = new ColumnOperations(mockClient, mockOptions);

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
      formatDataType: col =>
        col.character_maximum_length
          ? `${col.data_type}(${col.character_maximum_length})`
          : col.data_type,
    };

    // Mock the Utils module methods
    Utils.formatColumnDefinition = mockUtils.formatColumnDefinition;
    Utils.generateBackupName = mockUtils.generateBackupName;
    Utils.formatDataType = mockUtils.formatDataType;
  });

  describe('constructor', () => {
    it('should initialize with client and options', () => {
      expect(columnOps.client).toBe(mockClient);
      expect(columnOps.options).toBe(mockOptions);
    });
  });

  describe('getColumns', () => {
    it('should query for columns in a schema', async () => {
      const mockColumns = [basicColumn];

      mockClient.query.mockResolvedValue({ rows: mockColumns });

      const result = await columnOps.getColumns('test_schema');

      // Check that query was called with correct parameters
      const calls = mockClient.query.mock.calls;
      expect(calls.length).toBe(1);
      expect(calls[0][0]).toContain('information_schema.columns');
      expect(calls[0][1]).toEqual(['test_schema']);
      expect(result).toEqual(mockColumns);
    });

    it('should order columns by table name and ordinal position', async () => {
      await columnOps.getColumns('test_schema');

      const query = mockClient.query.mock.calls[0][0];
      expect(query).toContain('ORDER BY table_name, ordinal_position');
    });

    it('should handle empty results', async () => {
      mockClient.query.mockResolvedValue({ rows: [] });

      const result = await columnOps.getColumns('empty_schema');

      expect(result).toEqual([]);
    });

    it('should handle database errors', async () => {
      const error = new Error('Database connection failed');
      mockClient.query.mockRejectedValue(error);

      await expect(columnOps.getColumns('test_schema')).rejects.toThrow(
        'Database connection failed'
      );
    });
  });

  describe('groupColumnsByTable', () => {
    it('should group columns by table name', () => {
      const result = columnOps.groupColumnsByTable(columnsForGrouping);

      expect(result).toEqual({
        users: [
          createColumn(),
          createColumn({
            column_name: 'name',
            data_type: 'character varying',
            character_maximum_length: 255,
          }),
        ],
        orders: [
          createColumn({
            table_name: 'orders',
          }),
          createColumn({
            table_name: 'orders',
            column_name: 'user_id',
            data_type: 'integer',
          }),
        ],
      });
    });

    it('should handle empty columns array', () => {
      const result = columnOps.groupColumnsByTable([]);

      expect(result).toEqual({});
    });

    it('should handle single table', () => {
      const result = columnOps.groupColumnsByTable(singleTableColumns);

      expect(result).toEqual({
        users: [
          createColumn(),
          createColumn({
            column_name: 'name',
            data_type: 'character varying',
            character_maximum_length: 255,
          }),
        ],
      });
    });

    it('should handle columns with null table names', () => {
      const result = columnOps.groupColumnsByTable(columnsWithNullTableNames);

      expect(result).toEqual({
        null: [
          createColumn({
            table_name: null,
          }),
        ],
        users: [
          createColumn({
            column_name: 'name',
            data_type: 'character varying',
            character_maximum_length: 255,
          }),
        ],
      });
    });
  });

  describe('generateColumnDefinition', () => {
    it('should generate column definition using Utils', () => {
      const column = {
        column_name: 'id',
        data_type: 'integer',
        character_maximum_length: null,
        is_nullable: 'NO',
        column_default: null,
      };

      const result = columnOps.generateColumnDefinition(column);

      expect(result).toBeDefined();
      expect(result).toContain('"id"');
      expect(result).toContain('integer');
    });
  });

  describe('generateAlterColumnStatement', () => {
    it('should generate ALTER COLUMN for data type change', () => {
      const result = columnOps.generateAlterColumnStatement(
        'users',
        dataTypeChangeColumns.dev,
        dataTypeChangeColumns.prod
      );

      expect(result).toBe(
        'ALTER TABLE prod_schema.users ALTER COLUMN name TYPE character varying(255);'
      );
    });

    it('should generate ALTER COLUMN for nullability change', () => {
      const result = columnOps.generateAlterColumnStatement(
        'users',
        nullabilityChangeColumns.dev,
        nullabilityChangeColumns.prod
      );

      expect(result).toBe(
        'ALTER TABLE prod_schema.users ALTER COLUMN email SET NOT NULL;'
      );
    });

    it('should generate ALTER COLUMN for default value change', () => {
      const result = columnOps.generateAlterColumnStatement(
        'users',
        defaultValueChangeColumns.dev,
        defaultValueChangeColumns.prod
      );

      expect(result).toBe(
        'ALTER TABLE prod_schema.users ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;'
      );
    });

    it('should generate ALTER COLUMN for multiple changes', () => {
      const result = columnOps.generateAlterColumnStatement(
        'users',
        multipleChangesColumns.dev,
        multipleChangesColumns.prod
      );

      expect(result).toBe(
        "ALTER TABLE prod_schema.users ALTER COLUMN status TYPE character varying(20) SET NOT NULL SET DEFAULT 'active';"
      );
    });

    it('should handle dropping default value', () => {
      const result = columnOps.generateAlterColumnStatement(
        'users',
        dropDefaultColumns.dev,
        dropDefaultColumns.prod
      );

      expect(result).toBe(
        'ALTER TABLE prod_schema.users ALTER COLUMN updated_at DROP DEFAULT;'
      );
    });

    it('should handle dropping NOT NULL constraint', () => {
      const result = columnOps.generateAlterColumnStatement(
        'products',
        dropNotNullColumns.dev,
        dropNotNullColumns.prod
      );

      expect(result).toBe(
        'ALTER TABLE prod_schema.products ALTER COLUMN description DROP NOT NULL;'
      );
    });
  });

  describe('generateColumnOperations', () => {
    it('should add missing columns to production', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: devColumnsForAddTest })
        .mockResolvedValueOnce({ rows: prodColumnsForAddTest });

      const result = await columnOps.generateColumnOperations();

      expect(result).toContain(
        'ALTER TABLE prod_schema.users ADD COLUMN "email" character varying(255) NOT NULL;'
      );
    });

    it('should handle columns to drop in production', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: devColumnsForDropTest })
        .mockResolvedValueOnce({ rows: prodColumnsForDropTest });

      const result = await columnOps.generateColumnOperations();

      expect(result).toContain(
        '-- Column old_column exists in prod but not in dev'
      );
      expect(result).toContain(
        '-- Renaming column to preserve data before manual drop'
      );
      expect(result).toContain(
        'ALTER TABLE prod_schema.users RENAME COLUMN old_column TO old_column_backup_2024-01-01T00-00-00-000Z;'
      );
      expect(result).toContain(
        '-- TODO: Manually drop column prod_schema.users.old_column_backup_2024-01-01T00-00-00-000Z after confirming data is no longer needed'
      );
    });

    it('should handle column modifications', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: devColumnsForModifyTest })
        .mockResolvedValueOnce({ rows: prodColumnsForModifyTest });

      const result = await columnOps.generateColumnOperations();

      expect(result).toContain('-- Modifying column users.name');
      expect(
        result.some(line =>
          line.includes('--   Dev: character varying(255) NOT NULL')
        )
      ).toBe(true);
      expect(result.some(line => line.includes('--   Prod: text'))).toBe(true);
      expect(result).toContain(
        'ALTER TABLE prod_schema.users ALTER COLUMN name TYPE character varying(255) SET NOT NULL;'
      );
    });

    it('should handle identical columns', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: devColumnsForIdenticalTest })
        .mockResolvedValueOnce({ rows: prodColumnsForIdenticalTest });

      const result = await columnOps.generateColumnOperations();

      expect(result).not.toContain('ALTER TABLE');
      expect(result).not.toContain('-- Modifying column');
    });

    it('should handle tables that exist only in development', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: devColumnsForNewTableTest })
        .mockResolvedValueOnce({ rows: prodColumnsForNewTableTest });

      const result = await columnOps.generateColumnOperations();

      // Should only process users table, not new_table
      expect(result).not.toContain('new_table');
    });

    it('should handle tables that exist only in production', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: devColumnsForOldTableTest })
        .mockResolvedValueOnce({ rows: prodColumnsForOldTableTest });

      const result = await columnOps.generateColumnOperations();

      // Should only process users table, not old_table
      expect(result).not.toContain('old_table');
    });

    it('should handle empty schemas', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await columnOps.generateColumnOperations();

      expect(result).toEqual([]);
    });

    it('should handle database errors', async () => {
      const error = new Error('Database connection failed');
      mockClient.query.mockRejectedValue(error);

      await expect(columnOps.generateColumnOperations()).rejects.toThrow(
        'Database connection failed'
      );
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle null column names', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: devColumnsWithNullName })
        .mockResolvedValueOnce({ rows: [] });

      const result = await columnOps.generateColumnOperations();
      expect(result).toBeDefined();
    });

    it('should handle special characters in column names', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: devColumnsWithSpecialChars }) // getColumns for dev
        .mockResolvedValueOnce({ rows: prodColumnsForSpecialChars }); // getColumns for prod

      const result = await columnOps.generateColumnOperations();

      expect(
        result.some(line =>
          line.includes(
            'ALTER TABLE prod_schema.users ADD COLUMN "user-id_with.special@chars" text;'
          )
        )
      ).toBe(true);
    });

    it('should handle very long column names', async () => {
      const longColumnName = 'a'.repeat(100);
      mockClient.query
        .mockResolvedValueOnce({ rows: devColumnsWithLongName(longColumnName) }) // getColumns for dev
        .mockResolvedValueOnce({ rows: prodColumnsForLongName }); // getColumns for prod

      const result = await columnOps.generateColumnOperations();

      expect(
        result.some(line =>
          line.includes(
            `ALTER TABLE prod_schema.users ADD COLUMN "${longColumnName}" text;`
          )
        )
      ).toBe(true);
    });

    it('should handle malformed column data', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: devColumnsWithMalformedData })
        .mockResolvedValueOnce({ rows: [] });

      // Should not throw, but may produce unexpected results
      const result = await columnOps.generateColumnOperations();
      expect(result).toBeDefined();
    });
  });
});
