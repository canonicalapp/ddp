/**
 * Unit tests for ConstraintOperations index operations
 */

import { ConstraintOperations } from '../../../../../src/sync/operations/constraints.ts';
import {
  createMockClient,
  createMockOptions,
} from '../../../../fixtures/testUtils.ts';

describe('ConstraintOperations - Index Operations', () => {
  let constraintOps;
  let mockClient;
  let mockOptions;

  beforeEach(() => {
    mockClient = createMockClient();
    mockOptions = createMockOptions();
    constraintOps = new ConstraintOperations(mockClient, mockOptions);
  });

  describe('generateCreateIndexStatement', () => {
    it('should generate CREATE INDEX statement with schema replacement', () => {
      const indexDef =
        'CREATE INDEX users_email_idx ON dev_schema.users USING btree (email)';
      const result = constraintOps.generateCreateIndexStatement(
        indexDef,
        'prod_schema'
      );

      expect(result).toContain(
        'CREATE INDEX prod_schema.users_email_idx ON prod_schema.users'
      );
      expect(result).toContain('USING btree (email)');
      expect(result).toContain(';');
    });

    it('should handle UNIQUE indexes', () => {
      const indexDef =
        'CREATE UNIQUE INDEX users_email_unique ON dev_schema.users USING btree (email)';
      const result = constraintOps.generateCreateIndexStatement(
        indexDef,
        'prod_schema'
      );

      expect(result).toContain(
        'CREATE UNIQUE INDEX prod_schema.users_email_unique ON prod_schema.users'
      );
    });

    it('should handle complex index definitions', () => {
      const indexDef =
        "CREATE INDEX complex_idx ON dev_schema.orders USING btree (user_id, created_at DESC) WHERE status = 'active'";
      const result = constraintOps.generateCreateIndexStatement(
        indexDef,
        'prod_schema'
      );

      expect(result).toContain(
        'CREATE INDEX prod_schema.complex_idx ON prod_schema.orders'
      );
      expect(result).toContain('USING btree (user_id, created_at DESC)');
      expect(result).toContain("WHERE status = 'active'");
    });
  });

  describe('generateIndexOperations', () => {
    it('should handle indexes to drop in production', async () => {
      const devIndexes = [
        {
          schemaname: 'dev_schema',
          tablename: 'users',
          indexname: 'users_email_idx',
          indexdef:
            'CREATE INDEX users_email_idx ON dev_schema.users USING btree (email)',
        },
      ];
      const prodIndexes = [
        {
          schemaname: 'prod_schema',
          tablename: 'users',
          indexname: 'users_email_idx',
          indexdef:
            'CREATE INDEX users_email_idx ON prod_schema.users USING btree (email)',
        },
        {
          schemaname: 'prod_schema',
          tablename: 'users',
          indexname: 'old_index',
          indexdef:
            'CREATE INDEX old_index ON prod_schema.users USING btree (name)',
        },
      ];

      mockClient.query
        .mockResolvedValueOnce({ rows: devIndexes })
        .mockResolvedValueOnce({ rows: prodIndexes });

      const result = await constraintOps.generateIndexOperations();

      expect(result).toContain(
        '-- Index old_index exists in prod but not in dev'
      );
      expect(result).toContain('DROP INDEX prod_schema.old_index;');
    });

    it('should handle indexes to create in production', async () => {
      const devIndexes = [
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
      const prodIndexes = [
        {
          schemaname: 'prod_schema',
          tablename: 'users',
          indexname: 'users_email_idx',
          indexdef:
            'CREATE INDEX users_email_idx ON prod_schema.users USING btree (email)',
        },
      ];

      mockClient.query
        .mockResolvedValueOnce({ rows: devIndexes })
        .mockResolvedValueOnce({ rows: prodIndexes });

      const result = await constraintOps.generateIndexOperations();

      expect(result).toContain('-- Creating index orders_user_id_idx in prod');
      expect(
        result.some(line =>
          line.includes(
            'CREATE INDEX prod_schema.orders_user_id_idx ON prod_schema.orders'
          )
        )
      ).toBe(true);
    });

    it('should handle identical index schemas', async () => {
      const devIndexes = [
        {
          schemaname: 'dev_schema',
          tablename: 'users',
          indexname: 'users_email_idx',
          indexdef:
            'CREATE INDEX users_email_idx ON dev_schema.users USING btree (email)',
        },
      ];
      const prodIndexes = [
        {
          schemaname: 'prod_schema',
          tablename: 'users',
          indexname: 'users_email_idx',
          indexdef:
            'CREATE INDEX users_email_idx ON prod_schema.users USING btree (email)',
        },
      ];

      mockClient.query
        .mockResolvedValueOnce({ rows: devIndexes })
        .mockResolvedValueOnce({ rows: prodIndexes });

      const result = await constraintOps.generateIndexOperations();

      expect(result).not.toContain('-- Creating index');
      expect(result).not.toContain('DROP INDEX');
    });

    it('should handle empty schemas', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await constraintOps.generateIndexOperations();

      expect(result).toEqual([]);
    });

    it('should handle multiple index operations', async () => {
      const devIndexes = [
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
      const prodIndexes = [
        {
          schemaname: 'prod_schema',
          tablename: 'users',
          indexname: 'old_index1',
          indexdef:
            'CREATE INDEX old_index1 ON prod_schema.users USING btree (name)',
        },
        {
          schemaname: 'prod_schema',
          tablename: 'users',
          indexname: 'old_index2',
          indexdef:
            'CREATE INDEX old_index2 ON prod_schema.users USING btree (age)',
        },
      ];

      mockClient.query
        .mockResolvedValueOnce({ rows: devIndexes })
        .mockResolvedValueOnce({ rows: prodIndexes });

      const result = await constraintOps.generateIndexOperations();

      expect(
        result.filter(
          line =>
            line.includes('-- Index') &&
            line.includes('exists in prod but not in dev')
        ).length
      ).toBe(2);
      expect(
        result.filter(line => line.includes('-- Creating index')).length
      ).toBe(2);
    });

    it('should handle database errors', async () => {
      const error = new Error('Database connection failed');
      mockClient.query.mockRejectedValue(error);

      await expect(constraintOps.generateIndexOperations()).rejects.toThrow(
        'Database connection failed'
      );
    });
  });
});
