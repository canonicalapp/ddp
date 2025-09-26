/**
 * Test utilities for generator tests
 */

import type { IDatabaseConnection, IGeneratorOptions } from '@/types';

/**
 * Create mock database connection for generator tests
 */
export const createMockConnection = (
  overrides: Partial<IDatabaseConnection> = {}
): IDatabaseConnection => {
  return {
    host: 'localhost',
    port: 5432,
    database: 'testdb',
    user: 'testuser',
    password: 'testpass',
    ...overrides,
  };
};

/**
 * Create mock generator options for testing
 */
export const createMockGeneratorOptions = (
  overrides: Partial<IGeneratorOptions> = {}
): IGeneratorOptions => {
  return {
    output: './output',
    stdout: false,
    schema: 'public',
    schemaOnly: false,
    procsOnly: false,
    triggersOnly: false,
    ...overrides,
  };
};

/**
 * Create mock introspection service for generator tests
 */
export const createMockIntrospectionService = () => {
  return {
    getTables: () => Promise.resolve([]),
    getAllTablesComplete: () => Promise.resolve([]),
    getFunctions: () => Promise.resolve([]),
    getTriggers: () => Promise.resolve([]),
    checkSchemaExists: () => Promise.resolve(true),
  };
};

/**
 * Create mock table data for schema generator tests
 */
export const createMockTableData = (overrides = {}) => ({
  table: {
    table_name: 'users',
    table_schema: 'public',
    table_comment: 'Test table',
    table_type: 'BASE TABLE',
  },
  columns: [
    {
      column_name: 'id',
      data_type: 'integer',
      is_nullable: 'NO',
      column_default: "nextval('users_id_seq'::regclass)",
      character_maximum_length: null,
      numeric_precision: 32,
      numeric_scale: 0,
      is_identity: 'YES',
      identity_generation: 'ALWAYS',
      is_generated: 'NEVER',
    },
    {
      column_name: 'name',
      data_type: 'character varying',
      is_nullable: 'NO',
      column_default: null,
      character_maximum_length: 255,
      numeric_precision: null,
      numeric_scale: null,
      is_identity: 'NO',
      identity_generation: null,
      is_generated: 'NEVER',
    },
  ],
  constraints: [
    {
      constraint_name: 'users_pkey',
      constraint_type: 'PRIMARY KEY',
      table_name: 'users',
      table_schema: 'public',
      column_name: 'id',
      foreign_table_name: null,
      foreign_column_name: null,
      check_clause: null,
      is_deferrable: 'NO',
      initially_deferred: 'NO',
      delete_rule: null,
      update_rule: null,
    },
  ],
  indexes: [
    {
      indexname: 'users_pkey',
      tablename: 'users',
      schemaname: 'public',
      indexdef:
        'CREATE UNIQUE INDEX users_pkey ON public.users USING btree (id)',
      index_type: 'btree',
      estimated_rows: 1000,
      index_size: '8192 bytes',
      index_pages: 1,
      is_unique: true,
      is_primary: true,
    },
  ],
  sequences: [],
  ...overrides,
});

/**
 * Create mock function data for procs generator tests
 */
export const createMockFunctionData = (overrides = {}) => ({
  function_name: 'test_function',
  routine_type: 'FUNCTION',
  function_body: 'BEGIN RETURN 1; END;',
  language_oid: 1,
  language_name: 'plpgsql',
  volatility: 'v',
  security_definer: false,
  is_strict: false,
  returns_set: false,
  cost: 100,
  estimated_rows: 0,
  return_type: 'integer',
  arguments: 'id integer',
  full_definition: 'BEGIN RETURN 1; END;',
  function_comment: 'Test function',
  ...overrides,
});

/**
 * Create mock trigger data for triggers generator tests
 */
export const createMockTriggerData = (overrides = {}) => ({
  trigger_name: 'test_trigger',
  event_object_table: 'users',
  event_object_schema: 'public',
  event_manipulation: 'INSERT',
  action_timing: 'BEFORE',
  action_orientation: 'ROW',
  action_statement: 'test_function()',
  action_condition: null,
  action_order: 1,
  full_definition: 'CREATE TRIGGER test_trigger...',
  trigger_comment: 'Test trigger',
  ...overrides,
});
