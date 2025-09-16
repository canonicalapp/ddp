/**
 * Unit tests for ConstraintOperations constraint generation
 */

import { ConstraintOperations } from '../../../../../src/sync/operations/constraints.ts';
import {
  checkConstraint,
  primaryKeyConstraint,
  uniqueConstraint,
} from '../../../../fixtures/constraintOperations/basicConstraints.ts';
import { constraintDefinitions } from '../../../../fixtures/constraintOperations/constraintDefinitions.ts';
import {
  devConstraintsComplexTest,
  devConstraintsForAddTest,
  devConstraintsForDropTest,
  devConstraintsForIdenticalTest,
  devConstraintsWithOldConstraints,
  prodConstraintsComplexTest,
  prodConstraintsForAddTest,
  prodConstraintsForDropTest,
  prodConstraintsForIdenticalTest,
  prodConstraintsWithOldConstraints,
} from '../../../../fixtures/constraintOperations/testScenarios.ts';
import {
  createMockClient,
  createMockOptions,
} from '../../../../fixtures/testUtils.ts';

describe('ConstraintOperations - Constraint Generation', () => {
  let constraintOps;
  let mockClient;
  let mockOptions;

  beforeEach(() => {
    mockClient = createMockClient();
    mockOptions = createMockOptions();
    constraintOps = new ConstraintOperations(mockClient, mockOptions);
  });

  describe('generateConstraintOperations', () => {
    it('should handle constraints to drop in production', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: devConstraintsForDropTest })
        .mockResolvedValueOnce({ rows: prodConstraintsForDropTest });

      const result = await constraintOps.generateConstraintOperations();

      expect(result).toContain(
        '-- Constraint old_constraint exists in prod but not in dev'
      );
      expect(result).toContain(
        'ALTER TABLE prod_schema.users DROP CONSTRAINT old_constraint;'
      );
    });

    it('should handle constraints to create in production', async () => {
      const devConstraints = devConstraintsForAddTest;
      const prodConstraints = prodConstraintsForAddTest;

      const mockConstraintDefinition = [constraintDefinitions.foreignKey];

      // Mock the query to return different results for dev and prod calls
      let callCount = 0;
      mockClient.query = () => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ rows: devConstraints });
        } else if (callCount === 2) {
          return Promise.resolve({ rows: prodConstraints });
        } else {
          // This is the call to get constraint definition
          return Promise.resolve({ rows: mockConstraintDefinition });
        }
      };

      const result = await constraintOps.generateConstraintOperations();

      expect(result).toContain(
        '-- Creating constraint orders_user_id_fkey in prod'
      );
      expect(
        result.some(line =>
          line.includes(
            'ALTER TABLE prod_schema.orders ADD CONSTRAINT orders_user_id_fkey'
          )
        )
      ).toBe(true);
      expect(
        result.some(line =>
          line.includes(
            'FOREIGN KEY (user_id) REFERENCES prod_schema.users(id)'
          )
        )
      ).toBe(true);
      expect(result.some(line => line.includes('ON UPDATE CASCADE'))).toBe(
        true
      );
      expect(result.some(line => line.includes('ON DELETE RESTRICT'))).toBe(
        true
      );
    });

    it('should handle PRIMARY KEY constraints to create', async () => {
      const devConstraints = [primaryKeyConstraint];
      const prodConstraints = [];

      const mockConstraintDefinition = [constraintDefinitions.primaryKey];

      // Mock the query to return different results for dev and prod calls
      let callCount = 0;
      mockClient.query = () => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ rows: devConstraints });
        } else if (callCount === 2) {
          return Promise.resolve({ rows: prodConstraints });
        } else {
          // This is the call to get constraint definition
          return Promise.resolve({ rows: mockConstraintDefinition });
        }
      };

      const result = await constraintOps.generateConstraintOperations();

      expect(result).toContain('-- Creating constraint users_pkey in prod');
      expect(
        result.some(line =>
          line.includes(
            'ALTER TABLE prod_schema.users ADD CONSTRAINT users_pkey PRIMARY KEY (id)'
          )
        )
      ).toBe(true);
    });

    it('should handle UNIQUE constraints to create', async () => {
      const devConstraints = [uniqueConstraint];
      const prodConstraints = [];

      const mockConstraintDefinition = [constraintDefinitions.unique];

      // Mock the query to return different results for dev and prod calls
      let callCount = 0;
      mockClient.query = () => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ rows: devConstraints });
        } else if (callCount === 2) {
          return Promise.resolve({ rows: prodConstraints });
        } else {
          // This is the call to get constraint definition
          return Promise.resolve({ rows: mockConstraintDefinition });
        }
      };

      const result = await constraintOps.generateConstraintOperations();

      expect(result).toContain(
        '-- Creating constraint users_email_unique in prod'
      );
      expect(
        result.some(line =>
          line.includes(
            'ALTER TABLE prod_schema.users ADD CONSTRAINT users_email_unique UNIQUE (email)'
          )
        )
      ).toBe(true);
    });

    it('should handle CHECK constraints to create', async () => {
      const devConstraints = [checkConstraint];
      const prodConstraints = [];

      const mockConstraintDefinition = [constraintDefinitions.check];

      // Mock the query to return different results for dev and prod calls
      let callCount = 0;
      mockClient.query = () => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ rows: devConstraints });
        } else if (callCount === 2) {
          return Promise.resolve({ rows: prodConstraints });
        } else {
          // This is the call to get constraint definition
          return Promise.resolve({ rows: mockConstraintDefinition });
        }
      };

      const result = await constraintOps.generateConstraintOperations();

      expect(result).toContain(
        '-- Creating constraint users_age_check in prod'
      );
      expect(
        result.some(line =>
          line.includes(
            'ALTER TABLE prod_schema.users ADD CONSTRAINT users_age_check CHECK'
          )
        )
      ).toBe(true);
    });

    it('should handle identical constraint schemas', async () => {
      const devConstraints = devConstraintsForIdenticalTest;
      const prodConstraints = prodConstraintsForIdenticalTest;

      mockClient.query
        .mockResolvedValueOnce({ rows: devConstraints })
        .mockResolvedValueOnce({ rows: prodConstraints });

      const result = await constraintOps.generateConstraintOperations();

      expect(result).not.toContain('-- Creating constraint');
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
      const devConstraints = devConstraintsWithOldConstraints;
      const prodConstraints = prodConstraintsWithOldConstraints;

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
      const devConstraints = devConstraintsComplexTest;
      const prodConstraints = prodConstraintsComplexTest;

      mockClient.query
        .mockResolvedValueOnce({ rows: devConstraints })
        .mockResolvedValueOnce({ rows: prodConstraints });

      const result = await constraintOps.generateConstraintOperations();

      expect(
        result.filter(line => line.includes('-- Creating constraint')).length
      ).toBe(2);
    });

    it('should handle mixed constraint operations', async () => {
      const devConstraints = devConstraintsComplexTest;
      const prodConstraints = prodConstraintsWithOldConstraints;

      mockClient.query
        .mockResolvedValueOnce({ rows: devConstraints })
        .mockResolvedValueOnce({ rows: prodConstraints });

      const result = await constraintOps.generateConstraintOperations();

      // Should handle both constraint to drop and constraint to create
      expect(result).toContain(
        '-- Constraint old_constraint1 exists in prod but not in dev'
      );
      expect(result).toContain(
        '-- Creating constraint orders_user_id_fkey in prod'
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

  describe('handleConstraintsToUpdate', () => {
    it('should handle constraints that have changed', async () => {
      const devConstraints = [
        {
          constraint_name: 'test_constraint',
          table_name: 'test_table',
          constraint_type: 'FOREIGN KEY',
          column_name: 'user_id',
          foreign_table_name: 'users',
          foreign_column_name: 'id',
          update_rule: 'CASCADE',
          delete_rule: 'RESTRICT',
        },
      ];

      const prodConstraints = [
        {
          constraint_name: 'test_constraint',
          table_name: 'test_table',
          constraint_type: 'FOREIGN KEY',
          column_name: 'user_id',
          foreign_table_name: 'users',
          foreign_column_name: 'id',
          update_rule: 'SET NULL',
          delete_rule: 'RESTRICT',
        },
      ];

      const mockConstraintDefinition = [
        {
          constraint_name: 'test_constraint',
          table_name: 'test_table',
          constraint_type: 'FOREIGN KEY',
          column_name: 'user_id',
          foreign_table_name: 'users',
          foreign_column_name: 'id',
          update_rule: 'CASCADE',
          delete_rule: 'RESTRICT',
        },
      ];

      // Mock the getConstraintDefinition call
      mockClient.query.mockResolvedValue({ rows: mockConstraintDefinition });

      const alterStatements = [];
      await constraintOps.handleConstraintsToUpdate(
        devConstraints,
        prodConstraints,
        alterStatements
      );

      expect(alterStatements).toContain(
        '-- Constraint test_constraint has changed, updating in prod'
      );
      expect(
        alterStatements.some(line =>
          line.includes('-- Renaming old constraint to test_constraint_old_')
        )
      ).toBe(true);
      expect(
        alterStatements.some(line =>
          line.includes(
            'ALTER TABLE prod_schema.test_table RENAME CONSTRAINT test_constraint TO test_constraint_old_'
          )
        )
      ).toBe(true);
      expect(
        alterStatements.some(line =>
          line.includes(
            'ALTER TABLE prod_schema.test_table ADD CONSTRAINT test_constraint'
          )
        )
      ).toBe(true);
    });

    it('should not handle constraints that are identical', async () => {
      const devConstraints = [
        {
          constraint_name: 'test_constraint',
          constraint_type: 'FOREIGN KEY',
          column_name: 'user_id',
          foreign_table_name: 'users',
          foreign_column_name: 'id',
          update_rule: 'CASCADE',
          delete_rule: 'RESTRICT',
        },
      ];

      const prodConstraints = [
        {
          constraint_name: 'test_constraint',
          constraint_type: 'FOREIGN KEY',
          column_name: 'user_id',
          foreign_table_name: 'users',
          foreign_column_name: 'id',
          update_rule: 'CASCADE',
          delete_rule: 'RESTRICT',
        },
      ];

      const alterStatements = [];
      await constraintOps.handleConstraintsToUpdate(
        devConstraints,
        prodConstraints,
        alterStatements
      );

      expect(alterStatements).toEqual([]);
    });

    it('should handle multiple changed constraints', async () => {
      const devConstraints = [
        {
          constraint_name: 'constraint1',
          table_name: 'table1',
          constraint_type: 'FOREIGN KEY',
          column_name: 'user_id',
          foreign_table_name: 'users',
          foreign_column_name: 'id',
          update_rule: 'CASCADE',
          delete_rule: 'RESTRICT',
        },
        {
          constraint_name: 'constraint2',
          table_name: 'table2',
          constraint_type: 'UNIQUE',
          column_name: 'email',
          foreign_table_name: null,
          foreign_column_name: null,
          update_rule: null,
          delete_rule: null,
        },
      ];

      const prodConstraints = [
        {
          constraint_name: 'constraint1',
          table_name: 'table1',
          constraint_type: 'FOREIGN KEY',
          column_name: 'user_id',
          foreign_table_name: 'users',
          foreign_column_name: 'id',
          update_rule: 'SET NULL',
          delete_rule: 'RESTRICT',
        },
        {
          constraint_name: 'constraint2',
          table_name: 'table2',
          constraint_type: 'UNIQUE',
          column_name: 'username',
          foreign_table_name: null,
          foreign_column_name: null,
          update_rule: null,
          delete_rule: null,
        },
      ];

      const mockConstraintDefinition1 = [
        {
          constraint_name: 'constraint1',
          table_name: 'table1',
          constraint_type: 'FOREIGN KEY',
          column_name: 'user_id',
          foreign_table_name: 'users',
          foreign_column_name: 'id',
          update_rule: 'CASCADE',
          delete_rule: 'RESTRICT',
        },
      ];

      const mockConstraintDefinition2 = [
        {
          constraint_name: 'constraint2',
          table_name: 'table2',
          constraint_type: 'UNIQUE',
          column_name: 'email',
          foreign_table_name: null,
          foreign_column_name: null,
          update_rule: null,
          delete_rule: null,
        },
      ];

      // Mock the getConstraintDefinition calls
      mockClient.query
        .mockResolvedValueOnce({ rows: mockConstraintDefinition1 })
        .mockResolvedValueOnce({ rows: mockConstraintDefinition2 });

      const alterStatements = [];
      await constraintOps.handleConstraintsToUpdate(
        devConstraints,
        prodConstraints,
        alterStatements
      );

      expect(
        alterStatements.filter(
          line => line.includes('-- Constraint') && line.includes('has changed')
        ).length
      ).toBe(2);
      expect(
        alterStatements.filter(
          line =>
            line.includes('ALTER TABLE') && line.includes('RENAME CONSTRAINT')
        ).length
      ).toBe(2);
      expect(
        alterStatements.filter(
          line =>
            line.includes('ALTER TABLE') && line.includes('ADD CONSTRAINT')
        ).length
      ).toBe(2);
    });
  });
});
