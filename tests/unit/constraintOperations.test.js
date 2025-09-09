/**
 * Unit tests for ConstraintOperations module
 */

import { ConstraintOperations } from '../../modules/constraintOperations.js';

describe('ConstraintOperations', () => {
  let constraintOps;
  let mockClient;
  let mockOptions;

  beforeEach(() => {
    mockClient = createMockClient();
    mockOptions = createMockOptions();
    constraintOps = new ConstraintOperations(mockClient, mockOptions);

    // Reset mocks
    // Note: jest functions are available within test functions, not in global scope
  });

  describe('constructor', () => {
    it('should initialize with client and options', () => {
      expect(constraintOps.client).toBe(mockClient);
      expect(constraintOps.options).toBe(mockOptions);
    });
  });

  describe('getConstraints', () => {
    it('should query for constraints in a schema', async () => {
      const mockConstraints = [
        {
          table_name: 'users',
          constraint_name: 'users_pkey',
          constraint_type: 'PRIMARY KEY',
          column_name: 'id',
          foreign_table_name: null,
          foreign_column_name: null,
        },
        {
          table_name: 'orders',
          constraint_name: 'orders_user_id_fkey',
          constraint_type: 'FOREIGN KEY',
          column_name: 'user_id',
          foreign_table_name: 'users',
          foreign_column_name: 'id',
        },
      ];

      let queryCalled = false;
      let queryArgs = null;
      mockClient.query = (...args) => {
        queryCalled = true;
        queryArgs = args;
        return Promise.resolve({ rows: mockConstraints });
      };

      const result = await constraintOps.getConstraints('test_schema');

      // Verify the query was called with correct parameters
      expect(queryCalled).toBe(true);
      expect(queryArgs[0]).toContain('information_schema.table_constraints');
      expect(queryArgs[1]).toEqual(['test_schema']);
      expect(result).toEqual(mockConstraints);
    });

    it('should join with key_column_usage and constraint_column_usage', async () => {
      await constraintOps.getConstraints('test_schema');

      const query = mockClient.query.mock.calls[0][0];
      expect(query).toContain('information_schema.key_column_usage');
      expect(query).toContain('information_schema.constraint_column_usage');
    });

    it('should order constraints by table name and constraint name', async () => {
      await constraintOps.getConstraints('test_schema');

      const query = mockClient.query.mock.calls[0][0];
      expect(query).toContain('ORDER BY tc.table_name, tc.constraint_name');
    });

    it('should handle empty results', async () => {
      mockClient.query.mockResolvedValue({ rows: [] });

      const result = await constraintOps.getConstraints('empty_schema');

      expect(result).toEqual([]);
    });

    it('should handle database errors', async () => {
      const error = new Error('Database connection failed');
      mockClient.query.mockRejectedValue(error);

      await expect(constraintOps.getConstraints('test_schema')).rejects.toThrow(
        'Database connection failed'
      );
    });

    it('should handle constraints with special characters in names', async () => {
      const mockConstraints = [
        {
          table_name: 'user-table_with.special@chars',
          constraint_name: 'user-table_with.special@chars_pkey',
          constraint_type: 'PRIMARY KEY',
          column_name: 'id',
          foreign_table_name: null,
          foreign_column_name: null,
        },
      ];

      mockClient.query.mockResolvedValue({ rows: mockConstraints });

      const result = await constraintOps.getConstraints('test_schema');

      expect(result).toEqual(mockConstraints);
    });
  });

  describe('generateConstraintOperations', () => {
    it('should handle constraints to drop in production', async () => {
      const devConstraints = [
        {
          table_name: 'users',
          constraint_name: 'users_pkey',
          constraint_type: 'PRIMARY KEY',
          column_name: 'id',
          foreign_table_name: null,
          foreign_column_name: null,
        },
      ];
      const prodConstraints = [
        {
          table_name: 'users',
          constraint_name: 'users_pkey',
          constraint_type: 'PRIMARY KEY',
          column_name: 'id',
          foreign_table_name: null,
          foreign_column_name: null,
        },
        {
          table_name: 'users',
          constraint_name: 'old_constraint',
          constraint_type: 'UNIQUE',
          column_name: 'email',
          foreign_table_name: null,
          foreign_column_name: null,
        },
      ];

      mockClient.query
        .mockResolvedValueOnce({ rows: devConstraints })
        .mockResolvedValueOnce({ rows: prodConstraints });

      const result = await constraintOps.generateConstraintOperations();

      expect(result).toContain(
        '-- Constraint old_constraint exists in prod but not in dev'
      );
      expect(result).toContain(
        'ALTER TABLE prod_schema.users DROP CONSTRAINT old_constraint;'
      );
    });

    it('should handle constraints to create in production', async () => {
      const devConstraints = [
        {
          table_name: 'users',
          constraint_name: 'users_pkey',
          constraint_type: 'PRIMARY KEY',
          column_name: 'id',
          foreign_table_name: null,
          foreign_column_name: null,
        },
        {
          table_name: 'orders',
          constraint_name: 'orders_user_id_fkey',
          constraint_type: 'FOREIGN KEY',
          column_name: 'user_id',
          foreign_table_name: 'users',
          foreign_column_name: 'id',
        },
      ];
      const prodConstraints = [
        {
          table_name: 'users',
          constraint_name: 'users_pkey',
          constraint_type: 'PRIMARY KEY',
          column_name: 'id',
          foreign_table_name: null,
          foreign_column_name: null,
        },
      ];

      mockClient.query
        .mockResolvedValueOnce({ rows: devConstraints })
        .mockResolvedValueOnce({ rows: prodConstraints });

      const result = await constraintOps.generateConstraintOperations();

      expect(result).toContain(
        '-- TODO: Create constraint orders_user_id_fkey in prod'
      );
      expect(result).toContain('-- Constraint type: FOREIGN KEY');
      expect(result).toContain('-- Foreign key: user_id -> users.id');
    });

    it('should handle PRIMARY KEY constraints to create', async () => {
      const devConstraints = [
        {
          table_name: 'users',
          constraint_name: 'users_pkey',
          constraint_type: 'PRIMARY KEY',
          column_name: 'id',
          foreign_table_name: null,
          foreign_column_name: null,
        },
      ];
      const prodConstraints = [];

      mockClient.query
        .mockResolvedValueOnce({ rows: devConstraints })
        .mockResolvedValueOnce({ rows: prodConstraints });

      const result = await constraintOps.generateConstraintOperations();

      expect(result).toContain('-- TODO: Create constraint users_pkey in prod');
      expect(result).toContain('-- Constraint type: PRIMARY KEY');
      expect(result).not.toContain('-- Foreign key:');
    });

    it('should handle UNIQUE constraints to create', async () => {
      const devConstraints = [
        {
          table_name: 'users',
          constraint_name: 'users_email_unique',
          constraint_type: 'UNIQUE',
          column_name: 'email',
          foreign_table_name: null,
          foreign_column_name: null,
        },
      ];
      const prodConstraints = [];

      mockClient.query
        .mockResolvedValueOnce({ rows: devConstraints })
        .mockResolvedValueOnce({ rows: prodConstraints });

      const result = await constraintOps.generateConstraintOperations();

      expect(result).toContain(
        '-- TODO: Create constraint users_email_unique in prod'
      );
      expect(result).toContain('-- Constraint type: UNIQUE');
      expect(result).not.toContain('-- Foreign key:');
    });

    it('should handle CHECK constraints to create', async () => {
      const devConstraints = [
        {
          table_name: 'users',
          constraint_name: 'users_age_check',
          constraint_type: 'CHECK',
          column_name: 'age',
          foreign_table_name: null,
          foreign_column_name: null,
        },
      ];
      const prodConstraints = [];

      mockClient.query
        .mockResolvedValueOnce({ rows: devConstraints })
        .mockResolvedValueOnce({ rows: prodConstraints });

      const result = await constraintOps.generateConstraintOperations();

      expect(result).toContain(
        '-- TODO: Create constraint users_age_check in prod'
      );
      expect(result).toContain('-- Constraint type: CHECK');
      expect(result).not.toContain('-- Foreign key:');
    });

    it('should handle identical constraint schemas', async () => {
      const devConstraints = [
        {
          table_name: 'users',
          constraint_name: 'users_pkey',
          constraint_type: 'PRIMARY KEY',
          column_name: 'id',
          foreign_table_name: null,
          foreign_column_name: null,
        },
      ];
      const prodConstraints = [
        {
          table_name: 'users',
          constraint_name: 'users_pkey',
          constraint_type: 'PRIMARY KEY',
          column_name: 'id',
          foreign_table_name: null,
          foreign_column_name: null,
        },
      ];

      mockClient.query
        .mockResolvedValueOnce({ rows: devConstraints })
        .mockResolvedValueOnce({ rows: prodConstraints });

      const result = await constraintOps.generateConstraintOperations();

      expect(result).not.toContain('-- TODO: Create constraint');
      expect(result).not.toContain('ALTER TABLE');
    });

    it('should handle empty schemas', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await constraintOps.generateConstraintOperations();

      expect(result).toEqual([]);
    });

    it('should handle multiple constraints to drop', async () => {
      const devConstraints = [
        {
          table_name: 'users',
          constraint_name: 'users_pkey',
          constraint_type: 'PRIMARY KEY',
          column_name: 'id',
          foreign_table_name: null,
          foreign_column_name: null,
        },
      ];
      const prodConstraints = [
        {
          table_name: 'users',
          constraint_name: 'users_pkey',
          constraint_type: 'PRIMARY KEY',
          column_name: 'id',
          foreign_table_name: null,
          foreign_column_name: null,
        },
        {
          table_name: 'users',
          constraint_name: 'old_constraint1',
          constraint_type: 'UNIQUE',
          column_name: 'email',
          foreign_table_name: null,
          foreign_column_name: null,
        },
        {
          table_name: 'users',
          constraint_name: 'old_constraint2',
          constraint_type: 'CHECK',
          column_name: 'age',
          foreign_table_name: null,
          foreign_column_name: null,
        },
      ];

      mockClient.query
        .mockResolvedValueOnce({ rows: devConstraints })
        .mockResolvedValueOnce({ rows: prodConstraints });

      const result = await constraintOps.generateConstraintOperations();

      expect(
        result.filter(
          line =>
            line.includes('-- Constraint') &&
            line.includes('exists in prod but not in dev')
        ).length
      ).toBe(2);
      expect(
        result.filter(
          line =>
            line.includes('ALTER TABLE') && line.includes('DROP CONSTRAINT')
        ).length
      ).toBe(2);
    });

    it('should handle multiple constraints to create', async () => {
      const devConstraints = [
        {
          table_name: 'users',
          constraint_name: 'users_pkey',
          constraint_type: 'PRIMARY KEY',
          column_name: 'id',
          foreign_table_name: null,
          foreign_column_name: null,
        },
        {
          table_name: 'users',
          constraint_name: 'users_email_unique',
          constraint_type: 'UNIQUE',
          column_name: 'email',
          foreign_table_name: null,
          foreign_column_name: null,
        },
        {
          table_name: 'orders',
          constraint_name: 'orders_user_id_fkey',
          constraint_type: 'FOREIGN KEY',
          column_name: 'user_id',
          foreign_table_name: 'users',
          foreign_column_name: 'id',
        },
      ];
      const prodConstraints = [
        {
          table_name: 'users',
          constraint_name: 'users_pkey',
          constraint_type: 'PRIMARY KEY',
          column_name: 'id',
          foreign_table_name: null,
          foreign_column_name: null,
        },
      ];

      mockClient.query
        .mockResolvedValueOnce({ rows: devConstraints })
        .mockResolvedValueOnce({ rows: prodConstraints });

      const result = await constraintOps.generateConstraintOperations();

      expect(
        result.filter(line => line.includes('-- TODO: Create constraint'))
          .length
      ).toBe(2);
    });

    it('should handle mixed constraint operations', async () => {
      const devConstraints = [
        {
          table_name: 'users',
          constraint_name: 'users_pkey',
          constraint_type: 'PRIMARY KEY',
          column_name: 'id',
          foreign_table_name: null,
          foreign_column_name: null,
        },
        {
          table_name: 'orders',
          constraint_name: 'orders_user_id_fkey',
          constraint_type: 'FOREIGN KEY',
          column_name: 'user_id',
          foreign_table_name: 'users',
          foreign_column_name: 'id',
        },
      ];
      const prodConstraints = [
        {
          table_name: 'users',
          constraint_name: 'users_pkey',
          constraint_type: 'PRIMARY KEY',
          column_name: 'id',
          foreign_table_name: null,
          foreign_column_name: null,
        },
        {
          table_name: 'users',
          constraint_name: 'old_constraint',
          constraint_type: 'UNIQUE',
          column_name: 'email',
          foreign_table_name: null,
          foreign_column_name: null,
        },
      ];

      mockClient.query
        .mockResolvedValueOnce({ rows: devConstraints })
        .mockResolvedValueOnce({ rows: prodConstraints });

      const result = await constraintOps.generateConstraintOperations();

      // Should handle both constraint to drop and constraint to create
      expect(result).toContain(
        '-- Constraint old_constraint exists in prod but not in dev'
      );
      expect(result).toContain(
        '-- TODO: Create constraint orders_user_id_fkey in prod'
      );
    });

    it('should handle database errors', async () => {
      const error = new Error('Database connection failed');
      mockClient.query.mockRejectedValue(error);

      await expect(
        constraintOps.generateConstraintOperations()
      ).rejects.toThrow('Database connection failed');
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle null constraint names', async () => {
      const devConstraints = [
        {
          table_name: 'users',
          constraint_name: null,
          constraint_type: 'PRIMARY KEY',
          column_name: 'id',
          foreign_table_name: null,
          foreign_column_name: null,
        },
      ];
      const prodConstraints = [];

      mockClient.query
        .mockResolvedValueOnce({ rows: devConstraints })
        .mockResolvedValueOnce({ rows: prodConstraints });

      const result = await constraintOps.generateConstraintOperations();
      expect(result).toBeDefined();
    });

    it('should handle constraints with very long names', async () => {
      const longConstraintName = 'a'.repeat(100);
      const devConstraints = [
        {
          table_name: 'users',
          constraint_name: longConstraintName,
          constraint_type: 'UNIQUE',
          column_name: 'email',
          foreign_table_name: null,
          foreign_column_name: null,
        },
      ];
      const prodConstraints = [];

      mockClient.query
        .mockResolvedValueOnce({ rows: devConstraints })
        .mockResolvedValueOnce({ rows: prodConstraints });

      const result = await constraintOps.generateConstraintOperations();

      expect(result).toContain(
        `-- TODO: Create constraint ${longConstraintName} in prod`
      );
    });

    it('should handle malformed constraint data', async () => {
      const devConstraints = [
        {
          table_name: 'users',
          constraint_name: 'test_constraint',
          // missing other properties
        },
      ];
      const prodConstraints = [];

      mockClient.query
        .mockResolvedValueOnce({ rows: devConstraints })
        .mockResolvedValueOnce({ rows: prodConstraints });

      // Should not throw, but may produce unexpected results
      const result = await constraintOps.generateConstraintOperations();
      expect(result).toBeDefined();
    });

    it('should handle constraints with special characters in names', async () => {
      const devConstraints = [
        {
          table_name: 'user-table_with.special@chars',
          constraint_name: 'user-table_with.special@chars_pkey',
          constraint_type: 'PRIMARY KEY',
          column_name: 'id',
          foreign_table_name: null,
          foreign_column_name: null,
        },
      ];
      const prodConstraints = [];

      mockClient.query
        .mockResolvedValueOnce({ rows: devConstraints })
        .mockResolvedValueOnce({ rows: prodConstraints });

      const result = await constraintOps.generateConstraintOperations();

      expect(result).toContain(
        '-- TODO: Create constraint user-table_with.special@chars_pkey in prod'
      );
    });

    it('should handle foreign key constraints with null foreign table info', async () => {
      const devConstraints = [
        {
          table_name: 'orders',
          constraint_name: 'orders_user_id_fkey',
          constraint_type: 'FOREIGN KEY',
          column_name: 'user_id',
          foreign_table_name: null,
          foreign_column_name: null,
        },
      ];
      const prodConstraints = [];

      mockClient.query
        .mockResolvedValueOnce({ rows: devConstraints })
        .mockResolvedValueOnce({ rows: prodConstraints });

      const result = await constraintOps.generateConstraintOperations();

      expect(result).toContain(
        '-- TODO: Create constraint orders_user_id_fkey in prod'
      );
      expect(result).toContain('-- Constraint type: FOREIGN KEY');
      expect(result).not.toContain('-- Foreign key:');
    });

    it('should handle constraints with null column names', async () => {
      const devConstraints = [
        {
          table_name: 'users',
          constraint_name: 'users_pkey',
          constraint_type: 'PRIMARY KEY',
          column_name: null,
          foreign_table_name: null,
          foreign_column_name: null,
        },
      ];
      const prodConstraints = [];

      mockClient.query
        .mockResolvedValueOnce({ rows: devConstraints })
        .mockResolvedValueOnce({ rows: prodConstraints });

      const result = await constraintOps.generateConstraintOperations();

      expect(result).toContain('-- TODO: Create constraint users_pkey in prod');
      expect(result).toContain('-- Constraint type: PRIMARY KEY');
    });
  });
});
