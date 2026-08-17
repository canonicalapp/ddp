/**
 * Unit tests for ConstraintOperations basic operations
 */

import { ConstraintOperations } from '../../../../src/sync/operations/constraints.ts';
import {
  sourceConstraintsWithSpecialChars,
  foreignKeyConstraint,
  primaryKeyConstraint,
} from '../../../fixtures/constraintOperations/basicConstraints.ts';
import {
  createMockClient,
  createMockOptions,
} from '../../../fixtures/testUtils.ts';

describe('ConstraintOperations - Basic Operations', () => {
  let constraintOps;
  let mockSourceClient;
  let mockTargetClient;
  let mockOptions;

  beforeEach(() => {
    mockSourceClient = createMockClient();
    mockTargetClient = createMockClient();
    mockOptions = createMockOptions();
    constraintOps = new ConstraintOperations(
      mockSourceClient,
      mockTargetClient,
      mockOptions
    );
  });

  describe('constructor', () => {
    it('should initialize with source client, target client and options', () => {
      expect(constraintOps.sourceClient).toBe(mockSourceClient);
      expect(constraintOps.targetClient).toBe(mockTargetClient);
      expect(constraintOps.options).toBe(mockOptions);
    });
  });

  describe('getConstraints', () => {
    it('should query for constraints in a schema', async () => {
      const mockConstraints = [primaryKeyConstraint, foreignKeyConstraint];

      let queryCalled = false;
      let queryArgs = null;
      mockSourceClient.query = (...args) => {
        queryCalled = true;
        queryArgs = args;
        return Promise.resolve({ rows: mockConstraints });
      };

      const result = await constraintOps.getConstraints('source');

      // Verify the query was called with correct parameters
      expect(queryCalled).toBe(true);
      expect(queryArgs[0]).toContain('pg_constraint');
      expect(queryArgs[1]).toEqual(['dev_schema']);
      expect(result).toEqual(mockConstraints);
    });

    it('should aggregate local and referenced columns via conkey/confkey', async () => {
      await constraintOps.getConstraints('source');

      const query = mockSourceClient.query.mock.calls[0][0];
      expect(query).toContain('con.conkey');
      expect(query).toContain('con.confkey');
    });

    it('should order constraints by table name and constraint name', async () => {
      await constraintOps.getConstraints('source');

      const query = mockSourceClient.query.mock.calls[0][0];
      expect(query).toContain('ORDER BY table_name, constraint_name');
    });

    it('should handle empty results', async () => {
      mockTargetClient.query.mockResolvedValue({ rows: [] });

      const result = await constraintOps.getConstraints('target');

      expect(result).toEqual([]);
    });

    it('should handle database errors', async () => {
      const error = new Error('Database connection failed');
      mockSourceClient.query.mockRejectedValue(error);

      await expect(constraintOps.getConstraints('source')).rejects.toThrow(
        'Database connection failed'
      );
    });

    it('should handle constraints with special characters in names', async () => {
      const mockConstraints = sourceConstraintsWithSpecialChars;

      mockSourceClient.query.mockResolvedValue({ rows: mockConstraints });

      const result = await constraintOps.getConstraints('source');

      expect(result).toEqual(mockConstraints);
    });

    it('should pass through a composite foreign key as a single row with positionally-paired columns', async () => {
      // The query aggregates conkey/confkey server-side (via string_agg ... WITH
      // ORDINALITY), so Postgres always returns exactly one row per constraint,
      // with local and referenced columns already paired in declaration order.
      const compositeFkRow = {
        table_name: 'offer_channel_influencers',
        constraint_name: 'offer_channel_influencers_offer_id_channel_id_fkey',
        constraint_type: 'FOREIGN KEY',
        column_name: 'offer_id, channel_id',
        foreign_table_name: 'offer_channels',
        foreign_column_name: 'offer_id, channel_id',
        update_rule: 'NO ACTION',
        delete_rule: 'NO ACTION',
      };

      mockSourceClient.query.mockResolvedValue({ rows: [compositeFkRow] });

      const result = await constraintOps.getConstraints('source');

      expect(result).toEqual([compositeFkRow]);
    });
  });

  describe('getIndexes', () => {
    it('should query for indexes in a schema', async () => {
      const mockIndexes = [
        {
          schemaname: 'dev_schema',
          tablename: 'users',
          indexname: 'users_email_idx',
          indexdef:
            'CREATE INDEX users_email_idx ON dev_schema.users USING btree (email)',
        },
        {
          schemaname: 'dev_schema',
          tablename: 'orders',
          indexname: 'orders_user_id_idx',
          indexdef:
            'CREATE INDEX orders_user_id_idx ON dev_schema.orders USING btree (user_id)',
        },
      ];

      let queryCalled = false;
      let queryArgs = null;
      mockSourceClient.query = (...args) => {
        queryCalled = true;
        queryArgs = args;
        return Promise.resolve({ rows: mockIndexes });
      };

      const result = await constraintOps.getIndexes('source');

      expect(queryCalled).toBe(true);
      expect(queryArgs[0]).toContain('pg_indexes');
      expect(queryArgs[1]).toEqual(['dev_schema']);
      expect(result).toEqual(mockIndexes);
    });

    it('should handle empty results', async () => {
      mockTargetClient.query.mockResolvedValue({ rows: [] });

      const result = await constraintOps.getIndexes('target');

      expect(result).toEqual([]);
    });

    it('should handle database errors', async () => {
      const error = new Error('Database connection failed');
      mockSourceClient.query.mockRejectedValue(error);

      await expect(constraintOps.getIndexes('source')).rejects.toThrow(
        'Database connection failed'
      );
    });
  });
});
