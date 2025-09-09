/**
 * Unit tests for ColumnOperations module
 */

import { ColumnOperations } from '../../modules/columnOperations.js';
import { Utils } from '../../modules/utils.js';

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
      const mockColumns = [
        {
          table_name: 'users',
          column_name: 'id',
          data_type: 'integer',
          character_maximum_length: null,
          is_nullable: 'NO',
          column_default: "nextval('users_id_seq'::regclass)",
          ordinal_position: 1,
        },
      ];

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
      const columns = [
        { table_name: 'users', column_name: 'id' },
        { table_name: 'users', column_name: 'name' },
        { table_name: 'orders', column_name: 'id' },
        { table_name: 'orders', column_name: 'user_id' },
      ];

      const result = columnOps.groupColumnsByTable(columns);

      expect(result).toEqual({
        users: [
          { table_name: 'users', column_name: 'id' },
          { table_name: 'users', column_name: 'name' },
        ],
        orders: [
          { table_name: 'orders', column_name: 'id' },
          { table_name: 'orders', column_name: 'user_id' },
        ],
      });
    });

    it('should handle empty columns array', () => {
      const result = columnOps.groupColumnsByTable([]);

      expect(result).toEqual({});
    });

    it('should handle single table', () => {
      const columns = [
        { table_name: 'users', column_name: 'id' },
        { table_name: 'users', column_name: 'name' },
      ];

      const result = columnOps.groupColumnsByTable(columns);

      expect(result).toEqual({
        users: [
          { table_name: 'users', column_name: 'id' },
          { table_name: 'users', column_name: 'name' },
        ],
      });
    });

    it('should handle columns with null table names', () => {
      const columns = [
        { table_name: null, column_name: 'id' },
        { table_name: 'users', column_name: 'name' },
      ];

      const result = columnOps.groupColumnsByTable(columns);

      expect(result).toEqual({
        null: [{ table_name: null, column_name: 'id' }],
        users: [{ table_name: 'users', column_name: 'name' }],
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
      const devCol = {
        column_name: 'name',
        data_type: 'character varying',
        character_maximum_length: 255,
        is_nullable: 'NO',
        column_default: null,
      };
      const prodCol = {
        column_name: 'name',
        data_type: 'text',
        character_maximum_length: null,
        is_nullable: 'NO',
        column_default: null,
      };

      const result = columnOps.generateAlterColumnStatement(
        'users',
        devCol,
        prodCol
      );

      expect(result).toBe(
        'ALTER TABLE prod_schema.users ALTER COLUMN name TYPE character varying(255);'
      );
    });

    it('should generate ALTER COLUMN for nullability change', () => {
      const devCol = {
        column_name: 'email',
        data_type: 'text',
        character_maximum_length: null,
        is_nullable: 'NO',
        column_default: null,
      };
      const prodCol = {
        column_name: 'email',
        data_type: 'text',
        character_maximum_length: null,
        is_nullable: 'YES',
        column_default: null,
      };

      const result = columnOps.generateAlterColumnStatement(
        'users',
        devCol,
        prodCol
      );

      expect(result).toBe(
        'ALTER TABLE prod_schema.users ALTER COLUMN email SET NOT NULL;'
      );
    });

    it('should generate ALTER COLUMN for default value change', () => {
      const devCol = {
        column_name: 'created_at',
        data_type: 'timestamp',
        character_maximum_length: null,
        is_nullable: 'NO',
        column_default: 'CURRENT_TIMESTAMP',
      };
      const prodCol = {
        column_name: 'created_at',
        data_type: 'timestamp',
        character_maximum_length: null,
        is_nullable: 'NO',
        column_default: null,
      };

      const result = columnOps.generateAlterColumnStatement(
        'users',
        devCol,
        prodCol
      );

      expect(result).toBe(
        'ALTER TABLE prod_schema.users ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;'
      );
    });

    it('should generate ALTER COLUMN for multiple changes', () => {
      const devCol = {
        column_name: 'status',
        data_type: 'character varying',
        character_maximum_length: 20,
        is_nullable: 'NO',
        column_default: "'active'",
      };
      const prodCol = {
        column_name: 'status',
        data_type: 'text',
        character_maximum_length: null,
        is_nullable: 'YES',
        column_default: null,
      };

      const result = columnOps.generateAlterColumnStatement(
        'users',
        devCol,
        prodCol
      );

      expect(result).toBe(
        "ALTER TABLE prod_schema.users ALTER COLUMN status TYPE character varying(20) SET NOT NULL SET DEFAULT 'active';"
      );
    });

    it('should handle dropping default value', () => {
      const devCol = {
        column_name: 'updated_at',
        data_type: 'timestamp',
        character_maximum_length: null,
        is_nullable: 'YES',
        column_default: null,
      };
      const prodCol = {
        column_name: 'updated_at',
        data_type: 'timestamp',
        character_maximum_length: null,
        is_nullable: 'YES',
        column_default: 'CURRENT_TIMESTAMP',
      };

      const result = columnOps.generateAlterColumnStatement(
        'users',
        devCol,
        prodCol
      );

      expect(result).toBe(
        'ALTER TABLE prod_schema.users ALTER COLUMN updated_at DROP DEFAULT;'
      );
    });

    it('should handle dropping NOT NULL constraint', () => {
      const devCol = {
        column_name: 'description',
        data_type: 'text',
        character_maximum_length: null,
        is_nullable: 'YES',
        column_default: null,
      };
      const prodCol = {
        column_name: 'description',
        data_type: 'text',
        character_maximum_length: null,
        is_nullable: 'NO',
        column_default: null,
      };

      const result = columnOps.generateAlterColumnStatement(
        'products',
        devCol,
        prodCol
      );

      expect(result).toBe(
        'ALTER TABLE prod_schema.products ALTER COLUMN description DROP NOT NULL;'
      );
    });
  });

  describe('generateColumnOperations', () => {
    it('should add missing columns to production', async () => {
      const devColumns = [
        {
          table_name: 'users',
          column_name: 'id',
          data_type: 'integer',
          character_maximum_length: null,
          is_nullable: 'NO',
          column_default: null,
          ordinal_position: 1,
        },
        {
          table_name: 'users',
          column_name: 'email',
          data_type: 'character varying',
          character_maximum_length: 255,
          is_nullable: 'NO',
          column_default: null,
          ordinal_position: 2,
        },
      ];
      const prodColumns = [
        {
          table_name: 'users',
          column_name: 'id',
          data_type: 'integer',
          character_maximum_length: null,
          is_nullable: 'NO',
          column_default: null,
          ordinal_position: 1,
        },
      ];

      mockClient.query
        .mockResolvedValueOnce({ rows: devColumns })
        .mockResolvedValueOnce({ rows: prodColumns });

      const result = await columnOps.generateColumnOperations();

      expect(result).toContain(
        'ALTER TABLE prod_schema.users ADD COLUMN "email" character varying(255) NOT NULL;'
      );
    });

    it('should handle columns to drop in production', async () => {
      const devColumns = [
        {
          table_name: 'users',
          column_name: 'id',
          data_type: 'integer',
          character_maximum_length: null,
          is_nullable: 'NO',
          column_default: null,
          ordinal_position: 1,
        },
      ];
      const prodColumns = [
        {
          table_name: 'users',
          column_name: 'id',
          data_type: 'integer',
          character_maximum_length: null,
          is_nullable: 'NO',
          column_default: null,
          ordinal_position: 1,
        },
        {
          table_name: 'users',
          column_name: 'old_column',
          data_type: 'text',
          character_maximum_length: null,
          is_nullable: 'YES',
          column_default: null,
          ordinal_position: 2,
        },
      ];

      mockClient.query
        .mockResolvedValueOnce({ rows: devColumns })
        .mockResolvedValueOnce({ rows: prodColumns });

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
      const devColumns = [
        {
          table_name: 'users',
          column_name: 'name',
          data_type: 'character varying',
          character_maximum_length: 255,
          is_nullable: 'NO',
          column_default: null,
          ordinal_position: 1,
        },
      ];
      const prodColumns = [
        {
          table_name: 'users',
          column_name: 'name',
          data_type: 'text',
          character_maximum_length: null,
          is_nullable: 'YES',
          column_default: null,
          ordinal_position: 1,
        },
      ];

      mockClient.query
        .mockResolvedValueOnce({ rows: devColumns })
        .mockResolvedValueOnce({ rows: prodColumns });

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
      const devColumns = [
        {
          table_name: 'users',
          column_name: 'id',
          data_type: 'integer',
          character_maximum_length: null,
          is_nullable: 'NO',
          column_default: null,
          ordinal_position: 1,
        },
      ];
      const prodColumns = [
        {
          table_name: 'users',
          column_name: 'id',
          data_type: 'integer',
          character_maximum_length: null,
          is_nullable: 'NO',
          column_default: null,
          ordinal_position: 1,
        },
      ];

      mockClient.query
        .mockResolvedValueOnce({ rows: devColumns })
        .mockResolvedValueOnce({ rows: prodColumns });

      const result = await columnOps.generateColumnOperations();

      expect(result).not.toContain('ALTER TABLE');
      expect(result).not.toContain('-- Modifying column');
    });

    it('should handle tables that exist only in development', async () => {
      const devColumns = [
        {
          table_name: 'users',
          column_name: 'id',
          data_type: 'integer',
          character_maximum_length: null,
          is_nullable: 'NO',
          column_default: null,
          ordinal_position: 1,
        },
        {
          table_name: 'new_table',
          column_name: 'id',
          data_type: 'integer',
          character_maximum_length: null,
          is_nullable: 'NO',
          column_default: null,
          ordinal_position: 1,
        },
      ];
      const prodColumns = [
        {
          table_name: 'users',
          column_name: 'id',
          data_type: 'integer',
          character_maximum_length: null,
          is_nullable: 'NO',
          column_default: null,
          ordinal_position: 1,
        },
      ];

      mockClient.query
        .mockResolvedValueOnce({ rows: devColumns })
        .mockResolvedValueOnce({ rows: prodColumns });

      const result = await columnOps.generateColumnOperations();

      // Should only process users table, not new_table
      expect(result).not.toContain('new_table');
    });

    it('should handle tables that exist only in production', async () => {
      const devColumns = [
        {
          table_name: 'users',
          column_name: 'id',
          data_type: 'integer',
          character_maximum_length: null,
          is_nullable: 'NO',
          column_default: null,
          ordinal_position: 1,
        },
      ];
      const prodColumns = [
        {
          table_name: 'users',
          column_name: 'id',
          data_type: 'integer',
          character_maximum_length: null,
          is_nullable: 'NO',
          column_default: null,
          ordinal_position: 1,
        },
        {
          table_name: 'old_table',
          column_name: 'id',
          data_type: 'integer',
          character_maximum_length: null,
          is_nullable: 'NO',
          column_default: null,
          ordinal_position: 1,
        },
      ];

      mockClient.query
        .mockResolvedValueOnce({ rows: devColumns })
        .mockResolvedValueOnce({ rows: prodColumns });

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
      const devColumns = [
        {
          table_name: 'users',
          column_name: null,
          data_type: 'integer',
          character_maximum_length: null,
          is_nullable: 'NO',
          column_default: null,
          ordinal_position: 1,
        },
      ];
      const prodColumns = [];

      mockClient.query
        .mockResolvedValueOnce({ rows: devColumns })
        .mockResolvedValueOnce({ rows: prodColumns });

      const result = await columnOps.generateColumnOperations();
      expect(result).toBeDefined();
    });

    it('should handle special characters in column names', async () => {
      const devColumns = [
        {
          table_name: 'users',
          column_name: 'user-id_with.special@chars',
          data_type: 'text',
          character_maximum_length: null,
          is_nullable: 'YES',
          column_default: null,
          ordinal_position: 1,
        },
      ];
      const prodColumns = [
        {
          table_name: 'users',
          column_name: 'id',
          data_type: 'integer',
          character_maximum_length: null,
          is_nullable: 'NO',
          column_default: null,
          ordinal_position: 1,
        },
      ];

      mockClient.query
        .mockResolvedValueOnce({ rows: devColumns }) // getColumns for dev
        .mockResolvedValueOnce({ rows: prodColumns }); // getColumns for prod

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
      const devColumns = [
        {
          table_name: 'users',
          column_name: longColumnName,
          data_type: 'text',
          character_maximum_length: null,
          is_nullable: 'YES',
          column_default: null,
          ordinal_position: 1,
        },
      ];
      const prodColumns = [
        {
          table_name: 'users',
          column_name: 'id',
          data_type: 'integer',
          character_maximum_length: null,
          is_nullable: 'NO',
          column_default: null,
          ordinal_position: 1,
        },
      ];

      mockClient.query
        .mockResolvedValueOnce({ rows: devColumns }) // getColumns for dev
        .mockResolvedValueOnce({ rows: prodColumns }); // getColumns for prod

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
      const devColumns = [
        {
          table_name: 'users',
          column_name: 'id',
          // missing other properties
        },
      ];
      const prodColumns = [];

      mockClient.query
        .mockResolvedValueOnce({ rows: devColumns })
        .mockResolvedValueOnce({ rows: prodColumns });

      // Should not throw, but may produce unexpected results
      const result = await columnOps.generateColumnOperations();
      expect(result).toBeDefined();
    });
  });
});
