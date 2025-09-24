/**
 * Test scenarios for constraint operations
 */

import { createConstraint } from './basicConstraints.ts';

// Test scenarios for constraint operations
export const sourceConstraintsForAddTest = [
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

export const targetConstraintsForAddTest = [createConstraint()];

export const sourceConstraintsForDropTest = [createConstraint()];

export const targetConstraintsForDropTest = [
  createConstraint(),
  createConstraint({
    constraint_name: 'old_constraint',
    constraint_type: 'UNIQUE',
    column_name: 'email',
  }),
];

export const sourceConstraintsForModifyTest = [
  createConstraint(),
  createConstraint({
    constraint_name: 'users_email_unique',
    constraint_type: 'UNIQUE',
    column_name: 'email',
  }),
];

export const targetConstraintsForModifyTest = [
  createConstraint(),
  createConstraint({
    constraint_name: 'users_email_unique',
    constraint_type: 'UNIQUE',
    column_name: 'email',
    update_rule: 'CASCADE',
  }),
];

export const sourceConstraintsForIdenticalTest = [createConstraint()];

export const targetConstraintsForIdenticalTest = [createConstraint()];

// Edge case data
export const sourceConstraintsForNewTableTest = [
  createConstraint(),
  createConstraint({
    table_name: 'new_table',
  }),
];

export const targetConstraintsForNewTableTest = [createConstraint()];

export const sourceConstraintsForOldTableTest = [createConstraint()];

export const targetConstraintsForOldTableTest = [
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

export const sourceConstraintsWithOldConstraints = [createConstraint()];

export const targetConstraintsWithOldConstraints = [
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
