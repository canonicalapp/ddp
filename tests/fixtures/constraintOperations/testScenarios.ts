/**
 * Test scenarios for constraint operations
 */

import { createConstraint } from './basicConstraints.ts';

// Test scenarios for constraint operations
export const devConstraintsForAddTest = [
  createConstraint(),
  createConstraint({
    table_name: 'orders',
    constraint_name: 'orders_user_id_fkey',
    constraint_type: 'FOREIGN KEY',
    column_name: 'user_id',
    foreign_table_name: 'users',
    foreign_column_name: 'id',
  }),
];

export const prodConstraintsForAddTest = [createConstraint()];

export const devConstraintsForDropTest = [createConstraint()];

export const prodConstraintsForDropTest = [
  createConstraint(),
  createConstraint({
    constraint_name: 'old_constraint',
    constraint_type: 'UNIQUE',
    column_name: 'email',
  }),
];

export const devConstraintsForModifyTest = [
  createConstraint(),
  createConstraint({
    constraint_name: 'users_email_unique',
    constraint_type: 'UNIQUE',
    column_name: 'email',
  }),
];

export const prodConstraintsForModifyTest = [
  createConstraint(),
  createConstraint({
    constraint_name: 'users_email_unique',
    constraint_type: 'UNIQUE',
    column_name: 'email',
    update_rule: 'CASCADE',
  }),
];

export const devConstraintsForIdenticalTest = [createConstraint()];

export const prodConstraintsForIdenticalTest = [createConstraint()];

// Edge case data
export const devConstraintsForNewTableTest = [
  createConstraint(),
  createConstraint({
    table_name: 'new_table',
  }),
];

export const prodConstraintsForNewTableTest = [createConstraint()];

export const devConstraintsForOldTableTest = [createConstraint()];

export const prodConstraintsForOldTableTest = [
  createConstraint(),
  createConstraint({
    table_name: 'old_table',
  }),
];

// Complex test scenarios
export const devConstraintsComplexTest = [
  createConstraint(),
  createConstraint({
    constraint_name: 'users_email_unique',
    constraint_type: 'UNIQUE',
    column_name: 'email',
  }),
  createConstraint({
    table_name: 'orders',
    constraint_name: 'orders_user_id_fkey',
    constraint_type: 'FOREIGN KEY',
    column_name: 'user_id',
    foreign_table_name: 'users',
    foreign_column_name: 'id',
  }),
];

export const prodConstraintsComplexTest = [createConstraint()];

export const devConstraintsWithOldConstraints = [createConstraint()];

export const prodConstraintsWithOldConstraints = [
  createConstraint(),
  createConstraint({
    constraint_name: 'old_constraint1',
    constraint_type: 'UNIQUE',
    column_name: 'email',
  }),
  createConstraint({
    constraint_name: 'old_constraint2',
    constraint_type: 'CHECK',
    column_name: 'age',
  }),
];
