/**
 * Constraint comparison data for different scenarios
 */

import { createConstraint } from './basicConstraints.ts';

export const identicalConstraints = {
  constraint1: createConstraint({
    constraint_name: 'test_constraint',
    constraint_type: 'FOREIGN KEY',
    column_name: 'user_id',
    foreign_table_name: 'users',
    foreign_column_name: 'id',
    update_rule: 'CASCADE',
    delete_rule: 'RESTRICT',
  }),
  constraint2: createConstraint({
    constraint_name: 'test_constraint',
    constraint_type: 'FOREIGN KEY',
    column_name: 'user_id',
    foreign_table_name: 'users',
    foreign_column_name: 'id',
    update_rule: 'CASCADE',
    delete_rule: 'RESTRICT',
  }),
};

export const differentConstraintTypes = {
  constraint1: createConstraint({
    constraint_name: 'test_constraint',
    constraint_type: 'FOREIGN KEY',
    column_name: 'user_id',
    foreign_table_name: 'users',
    foreign_column_name: 'id',
    update_rule: 'CASCADE',
    delete_rule: 'RESTRICT',
  }),
  constraint2: createConstraint({
    constraint_name: 'test_constraint',
    constraint_type: 'UNIQUE',
    column_name: 'user_id',
    foreign_table_name: 'users',
    foreign_column_name: 'id',
    update_rule: 'CASCADE',
    delete_rule: 'RESTRICT',
  }),
};

export const differentColumnNames = {
  constraint1: createConstraint({
    constraint_name: 'test_constraint',
    constraint_type: 'FOREIGN KEY',
    column_name: 'user_id',
    foreign_table_name: 'users',
    foreign_column_name: 'id',
    update_rule: 'CASCADE',
    delete_rule: 'RESTRICT',
  }),
  constraint2: createConstraint({
    constraint_name: 'test_constraint',
    constraint_type: 'FOREIGN KEY',
    column_name: 'order_id',
    foreign_table_name: 'users',
    foreign_column_name: 'id',
    update_rule: 'CASCADE',
    delete_rule: 'RESTRICT',
  }),
};

export const differentForeignTables = {
  constraint1: createConstraint({
    constraint_name: 'test_constraint',
    constraint_type: 'FOREIGN KEY',
    column_name: 'user_id',
    foreign_table_name: 'users',
    foreign_column_name: 'id',
    update_rule: 'CASCADE',
    delete_rule: 'RESTRICT',
  }),
  constraint2: createConstraint({
    constraint_name: 'test_constraint',
    constraint_type: 'FOREIGN KEY',
    column_name: 'user_id',
    foreign_table_name: 'customers',
    foreign_column_name: 'id',
    update_rule: 'CASCADE',
    delete_rule: 'RESTRICT',
  }),
};

export const differentForeignColumns = {
  constraint1: createConstraint({
    constraint_name: 'test_constraint',
    constraint_type: 'FOREIGN KEY',
    column_name: 'user_id',
    foreign_table_name: 'users',
    foreign_column_name: 'id',
    update_rule: 'CASCADE',
    delete_rule: 'RESTRICT',
  }),
  constraint2: createConstraint({
    constraint_name: 'test_constraint',
    constraint_type: 'FOREIGN KEY',
    column_name: 'user_id',
    foreign_table_name: 'users',
    foreign_column_name: 'uuid',
    update_rule: 'CASCADE',
    delete_rule: 'RESTRICT',
  }),
};

export const differentUpdateRules = {
  constraint1: createConstraint({
    constraint_name: 'test_constraint',
    constraint_type: 'FOREIGN KEY',
    column_name: 'user_id',
    foreign_table_name: 'users',
    foreign_column_name: 'id',
    update_rule: 'CASCADE',
    delete_rule: 'RESTRICT',
  }),
  constraint2: createConstraint({
    constraint_name: 'test_constraint',
    constraint_type: 'FOREIGN KEY',
    column_name: 'user_id',
    foreign_table_name: 'users',
    foreign_column_name: 'id',
    update_rule: 'RESTRICT',
    delete_rule: 'RESTRICT',
  }),
};

export const differentDeleteRules = {
  constraint1: createConstraint({
    constraint_name: 'test_constraint',
    constraint_type: 'FOREIGN KEY',
    column_name: 'user_id',
    foreign_table_name: 'users',
    foreign_column_name: 'id',
    update_rule: 'CASCADE',
    delete_rule: 'RESTRICT',
  }),
  constraint2: createConstraint({
    constraint_name: 'test_constraint',
    constraint_type: 'FOREIGN KEY',
    column_name: 'user_id',
    foreign_table_name: 'users',
    foreign_column_name: 'id',
    update_rule: 'CASCADE',
    delete_rule: 'CASCADE',
  }),
};
