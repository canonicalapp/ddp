/**
 * Basic constraint data fixtures
 */

// Base constraint factory function
export const createConstraint = (overrides = {}) => ({
  table_name: 'users',
  constraint_name: 'users_pkey',
  constraint_type: 'PRIMARY KEY',
  column_name: 'id',
  foreign_table_name: null,
  foreign_column_name: null,
  update_rule: null,
  delete_rule: null,
  ...overrides,
});

// Basic constraint data
export const primaryKeyConstraint = createConstraint();

export const foreignKeyConstraint = createConstraint({
  table_name: 'orders',
  constraint_name: 'orders_user_id_fkey',
  constraint_type: 'FOREIGN KEY',
  column_name: 'user_id',
  foreign_table_name: 'users',
  foreign_column_name: 'id',
});

export const uniqueConstraint = createConstraint({
  constraint_name: 'users_email_unique',
  constraint_type: 'UNIQUE',
  column_name: 'email',
});

export const checkConstraint = createConstraint({
  constraint_name: 'users_age_check',
  constraint_type: 'CHECK',
  column_name: 'age',
});

// Edge case data
export const devConstraintsWithSpecialChars = [
  createConstraint({
    table_name: 'user-table_with.special@chars',
    constraint_name: 'user-table_with.special@chars_pkey',
  }),
];

export const prodConstraintsForSpecialChars = [createConstraint()];

export const devConstraintsWithMalformedData = [
  createConstraint({
    // missing other properties
    constraint_type: undefined,
    column_name: undefined,
    foreign_table_name: undefined,
    foreign_column_name: undefined,
  }),
];
