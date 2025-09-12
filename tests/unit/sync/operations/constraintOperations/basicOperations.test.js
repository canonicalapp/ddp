/**
 * Unit tests for ConstraintOperations basic operations
 */

import { ConstraintOperations } from '../../../../../src/sync/operations/constraints.js';
import {
  devConstraintsWithSpecialChars,
  foreignKeyConstraint,
  primaryKeyConstraint,
} from '../../../../fixtures/constraintOperations/basicConstraints.js';
import {
  createMockClient,
  createMockOptions,
} from '../../../../fixtures/testUtils.js';

describe('ConstraintOperations - Basic Operations', () => {
  let constraintOps;
  let mockClient;
  let mockOptions;

  beforeEach(() => {
    mockClient = createMockClient();
    mockOptions = createMockOptions();
    constraintOps = new ConstraintOperations(mockClient, mockOptions);
  });

  describe('constructor', () => {
    it('should initialize with client and options', () => {
      expect(constraintOps.client).toBe(mockClient);
      expect(constraintOps.options).toBe(mockOptions);
    });
  });

  describe('getConstraints', () => {
    it('should query for constraints in a schema', async () => {
      const mockConstraints = [primaryKeyConstraint, foreignKeyConstraint];

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
      const mockConstraints = devConstraintsWithSpecialChars;

      mockClient.query.mockResolvedValue({ rows: mockConstraints });

      const result = await constraintOps.getConstraints('test_schema');

      expect(result).toEqual(mockConstraints);
    });
  });

  describe('getIndexes', () => {
    it('should query for indexes in a schema', async () => {
      const mockIndexes = [
        {
          schemaname: 'test_schema',
          tablename: 'users',
          indexname: 'users_email_idx',
          indexdef:
            'CREATE INDEX users_email_idx ON test_schema.users USING btree (email)',
        },
        {
          schemaname: 'test_schema',
          tablename: 'orders',
          indexname: 'orders_user_id_idx',
          indexdef:
            'CREATE INDEX orders_user_id_idx ON test_schema.orders USING btree (user_id)',
        },
      ];

      let queryCalled = false;
      let queryArgs = null;
      mockClient.query = (...args) => {
        queryCalled = true;
        queryArgs = args;
        return Promise.resolve({ rows: mockIndexes });
      };

      const result = await constraintOps.getIndexes('test_schema');

      expect(queryCalled).toBe(true);
      expect(queryArgs[0]).toContain('pg_indexes');
      expect(queryArgs[1]).toEqual(['test_schema']);
      expect(result).toEqual(mockIndexes);
    });

    it('should handle empty results', async () => {
      mockClient.query.mockResolvedValue({ rows: [] });

      const result = await constraintOps.getIndexes('empty_schema');

      expect(result).toEqual([]);
    });

    it('should handle database errors', async () => {
      const error = new Error('Database connection failed');
      mockClient.query.mockRejectedValue(error);

      await expect(constraintOps.getIndexes('test_schema')).rejects.toThrow(
        'Database connection failed'
      );
    });
  });
});
