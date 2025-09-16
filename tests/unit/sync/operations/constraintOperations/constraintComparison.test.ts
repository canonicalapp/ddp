/**
 * Unit tests for ConstraintOperations constraint comparison
 */

import { ConstraintOperations } from '../../../../../src/sync/operations/constraints.ts';
import {
  identicalConstraints,
  differentConstraintTypes,
  differentColumnNames,
  differentForeignTables,
  differentUpdateRules,
  differentDeleteRules,
} from '../../../../fixtures/constraintOperations/comparisonData.ts';
import {
  createMockClient,
  createMockOptions,
} from '../../../../fixtures/testUtils.ts';

describe('ConstraintOperations - Constraint Comparison', () => {
  let constraintOps;
  let mockClient;
  let mockOptions;

  beforeEach(() => {
    mockClient = createMockClient();
    mockOptions = createMockOptions();
    constraintOps = new ConstraintOperations(mockClient, mockOptions);
  });

  describe('compareConstraintDefinitions', () => {
    it('should return false for identical constraint definitions', () => {
      const result = constraintOps.compareConstraintDefinitions(
        identicalConstraints.constraint1,
        identicalConstraints.constraint2
      );
      expect(result).toBe(false);
    });

    it('should return true for different constraint types', () => {
      const result = constraintOps.compareConstraintDefinitions(
        differentConstraintTypes.constraint1,
        differentConstraintTypes.constraint2
      );
      expect(result).toBe(true);
    });

    it('should return true for different column names', () => {
      const result = constraintOps.compareConstraintDefinitions(
        differentColumnNames.constraint1,
        differentColumnNames.constraint2
      );
      expect(result).toBe(true);
    });

    it('should return true for different foreign table names', () => {
      const result = constraintOps.compareConstraintDefinitions(
        differentForeignTables.constraint1,
        differentForeignTables.constraint2
      );
      expect(result).toBe(true);
    });

    it('should return true for different update rules', () => {
      const result = constraintOps.compareConstraintDefinitions(
        differentUpdateRules.constraint1,
        differentUpdateRules.constraint2
      );
      expect(result).toBe(true);
    });

    it('should return true for different delete rules', () => {
      const result = constraintOps.compareConstraintDefinitions(
        differentDeleteRules.constraint1,
        differentDeleteRules.constraint2
      );
      expect(result).toBe(true);
    });

    it('should return false if either constraint is null', () => {
      const constraint1 = {
        constraint_name: 'test_constraint',
        constraint_type: 'FOREIGN KEY',
        column_name: 'user_id',
        foreign_table_name: 'users',
        foreign_column_name: 'id',
        update_rule: 'CASCADE',
        delete_rule: 'RESTRICT',
      };

      const result1 = constraintOps.compareConstraintDefinitions(
        constraint1,
        null
      );
      const result2 = constraintOps.compareConstraintDefinitions(
        null,
        constraint1
      );
      const result3 = constraintOps.compareConstraintDefinitions(null, null);

      expect(result1).toBe(false);
      expect(result2).toBe(false);
      expect(result3).toBe(false);
    });
  });
});
