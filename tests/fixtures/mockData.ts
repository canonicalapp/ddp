/**
 * Mock data fixtures for schema-sync-script tests
 */

export const mockTableData = [
  { table_name: 'users' },
  { table_name: 'orders' },
  { table_name: 'products' },
];

export const mockColumnData = [
  {
    table_name: 'users',
    column_name: 'id',
    data_type: 'integer',
    character_maximum_length: null,
    is_nullable: 'NO',
    column_default: "nextval('users_id_seq'::regclass)",
    ordinal_position: 1,
  },
  {
    table_name: 'users',
    column_name: 'name',
    data_type: 'character varying',
    character_maximum_length: 255,
    is_nullable: 'NO',
    column_default: null,
    ordinal_position: 2,
  },
];

export const mockFunctionData = [
  {
    routine_name: 'get_user_by_id',
    routine_type: 'FUNCTION',
    specific_name: 'get_user_by_id_1',
    data_type: 'integer',
    routine_definition: 'BEGIN RETURN 1; END;',
  },
];

export const mockConstraintData = [
  {
    table_name: 'users',
    constraint_name: 'users_pkey',
    constraint_type: 'PRIMARY KEY',
    column_name: 'id',
    foreign_table_name: null,
    foreign_column_name: null,
  },
];

export const mockTriggerData = [
  {
    trigger_name: 'update_user_timestamp',
    event_manipulation: 'UPDATE',
    event_object_table: 'users',
    action_timing: 'BEFORE',
    action_statement: 'EXECUTE FUNCTION update_modified_column()',
  },
];

export const mockIndexData = [
  {
    schemaname: 'dev_schema',
    tablename: 'users',
    indexname: 'idx_users_email',
    indexdef:
      'CREATE UNIQUE INDEX idx_users_email ON dev_schema.users USING btree (email)',
  },
];

// Function test data
export const devFunctions = [
  {
    routine_name: 'get_user_by_id',
    routine_type: 'FUNCTION',
    specific_name: 'get_user_by_id_1',
    data_type: 'integer',
    routine_definition: 'BEGIN RETURN 1; END;',
  },
  {
    routine_name: 'update_user',
    routine_type: 'PROCEDURE',
    specific_name: 'update_user_1',
    data_type: 'void',
    routine_definition: 'BEGIN UPDATE users SET name = $2 WHERE id = $1; END;',
  },
];

export const prodFunctions = [
  {
    routine_name: 'get_user_by_id',
    routine_type: 'FUNCTION',
    specific_name: 'get_user_by_id_1',
    data_type: 'integer',
    routine_definition: 'BEGIN RETURN 2; END;', // Different definition
  },
  // update_user missing in prod
];

export const mockFunctionDefinitions = [
  'CREATE FUNCTION dev_schema.get_user_by_id() RETURNS integer AS $$ BEGIN RETURN 1; END; $$ LANGUAGE plpgsql;',
  'CREATE PROCEDURE dev_schema.update_user(integer, text) AS $$ BEGIN UPDATE users SET name = $2 WHERE id = $1; END; $$ LANGUAGE plpgsql;',
];

// Trigger test data
export const devTriggers = [
  {
    trigger_name: 'update_user_timestamp',
    event_manipulation: 'UPDATE',
    event_object_table: 'users',
    action_timing: 'BEFORE',
    action_statement: 'EXECUTE FUNCTION update_modified_column()',
    action_orientation: 'ROW',
    action_condition: null,
  },
  {
    trigger_name: 'audit_user_changes',
    event_manipulation: 'INSERT',
    event_object_table: 'users',
    action_timing: 'AFTER',
    action_statement: 'EXECUTE FUNCTION audit_user_insert()',
    action_orientation: 'ROW',
    action_condition: null,
  },
];

export const prodTriggers = [
  {
    trigger_name: 'update_user_timestamp',
    event_manipulation: 'UPDATE',
    event_object_table: 'users',
    action_timing: 'BEFORE',
    action_statement: 'EXECUTE FUNCTION update_modified_column_v2()', // Different function
    action_orientation: 'ROW',
    action_condition: null,
  },
  // audit_user_changes missing in prod
];

export const mockTriggerDefinitions = [
  'CREATE TRIGGER update_user_timestamp BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_modified_column();',
  'CREATE TRIGGER audit_user_changes AFTER INSERT ON users FOR EACH ROW EXECUTE FUNCTION audit_user_insert();',
];

// Constraint test data
export const devConstraints = [
  {
    table_name: 'users',
    constraint_name: 'users_email_unique',
    constraint_type: 'UNIQUE',
    column_name: 'email',
    foreign_table_name: null,
    foreign_column_name: null,
    update_rule: null,
    delete_rule: null,
  },
  {
    table_name: 'orders',
    constraint_name: 'orders_user_id_fkey',
    constraint_type: 'FOREIGN KEY',
    column_name: 'user_id',
    foreign_table_name: 'users',
    foreign_column_name: 'id',
    update_rule: 'CASCADE',
    delete_rule: 'RESTRICT',
  },
];

export const prodConstraints = [
  {
    table_name: 'users',
    constraint_name: 'users_email_unique',
    constraint_type: 'UNIQUE',
    column_name: 'email',
    foreign_table_name: null,
    foreign_column_name: null,
    update_rule: null,
    delete_rule: null,
  },
  // orders_user_id_fkey missing in prod
];

export const mockConstraintDefinitions = [
  {
    constraint_definition:
      'ALTER TABLE users ADD CONSTRAINT users_email_unique UNIQUE (email);',
  },
  {
    constraint_definition:
      'ALTER TABLE orders ADD CONSTRAINT orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT;',
  },
];

// Index test data
export const devIndexes = [
  {
    schemaname: 'dev_schema',
    tablename: 'users',
    indexname: 'idx_users_email',
    indexdef:
      'CREATE UNIQUE INDEX idx_users_email ON dev_schema.users USING btree (email)',
  },
  {
    schemaname: 'dev_schema',
    tablename: 'orders',
    indexname: 'idx_orders_created_at',
    indexdef:
      'CREATE INDEX idx_orders_created_at ON dev_schema.orders USING btree (created_at)',
  },
];

export const prodIndexes = [
  {
    schemaname: 'prod_schema',
    tablename: 'users',
    indexname: 'idx_users_email',
    indexdef:
      'CREATE UNIQUE INDEX idx_users_email ON prod_schema.users USING btree (email)',
  },
  // idx_orders_created_at missing in prod
];
