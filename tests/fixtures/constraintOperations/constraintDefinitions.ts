/**
 * Constraint definition data
 */

export const constraintDefinitions = {
  primaryKey: {
    table_name: 'users',
    constraint_name: 'users_pkey',
    constraint_type: 'PRIMARY KEY',
    column_name: 'id',
    foreign_table_name: null,
    foreign_column_name: null,
    update_rule: null,
    delete_rule: null,
  },
  foreignKey: {
    table_name: 'orders',
    constraint_name: 'orders_user_id_fkey',
    constraint_type: 'FOREIGN KEY',
    column_name: 'user_id',
    foreign_table_name: 'users',
    foreign_column_name: 'id',
    update_rule: 'CASCADE',
    delete_rule: 'RESTRICT',
  },
  unique: {
    table_name: 'users',
    constraint_name: 'users_email_unique',
    constraint_type: 'UNIQUE',
    column_name: 'email',
    foreign_table_name: null,
    foreign_column_name: null,
    update_rule: null,
    delete_rule: null,
  },
  check: {
    table_name: 'users',
    constraint_name: 'users_age_check',
    constraint_type: 'CHECK',
    column_name: 'age',
    foreign_table_name: null,
    foreign_column_name: null,
    update_rule: null,
    delete_rule: null,
    check_clause: 'age >= 0',
  },
};
