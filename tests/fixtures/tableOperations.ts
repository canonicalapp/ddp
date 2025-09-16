/**
 * Mock data fixtures for table operations tests
 */

// Base table factory function
export const createTable = (overrides = {}) => ({
  table_name: 'users',
  ...overrides,
});

// Basic table data
export const usersTable = createTable();

export const ordersTable = createTable({
  table_name: 'orders',
});

export const productsTable = createTable({
  table_name: 'products',
});

// Test scenarios for table operations
export const devTablesForAddTest = [usersTable, ordersTable];

export const prodTablesForAddTest = [usersTable];

export const devTablesForDropTest = [usersTable];

export const prodTablesForDropTest = [
  usersTable,
  createTable({
    table_name: 'old_table',
  }),
];

export const devTablesForIdenticalTest = [usersTable];

export const prodTablesForIdenticalTest = [usersTable];

// Edge case data
export const devTablesForNewTableTest = [
  usersTable,
  createTable({
    table_name: 'new_table',
  }),
];

export const prodTablesForNewTableTest = [usersTable];

export const devTablesForOldTableTest = [usersTable];

export const prodTablesForOldTableTest = [
  usersTable,
  createTable({
    table_name: 'old_table',
  }),
];

// Edge case scenarios
export const devTablesWithSpecialChars = [
  createTable({
    table_name: 'user-table_with.special@chars',
  }),
];

export const prodTablesForSpecialChars = [usersTable];

export const devTablesWithMalformedData = [
  createTable({
    // missing other properties
    table_name: undefined,
  }),
];

// Complex test scenarios
export const devTablesComplexTest = [usersTable, ordersTable, productsTable];

export const prodTablesComplexTest = [usersTable];

export const devTablesWithOldTables = [usersTable];

export const prodTablesWithOldTables = [
  usersTable,
  createTable({
    table_name: 'old_table1',
  }),
  createTable({
    table_name: 'old_table2',
  }),
];

// Column data for table creation
export const mockColumns = [
  {
    column_name: 'id',
    data_type: 'integer',
    character_maximum_length: null,
    is_nullable: 'NO',
    column_default: "nextval('users_id_seq'::regclass)",
    ordinal_position: 1,
  },
  {
    column_name: 'name',
    data_type: 'character varying',
    character_maximum_length: 255,
    is_nullable: 'YES',
    column_default: null,
    ordinal_position: 2,
  },
  {
    column_name: 'email',
    data_type: 'character varying',
    character_maximum_length: 255,
    is_nullable: 'NO',
    column_default: null,
    ordinal_position: 3,
  },
  {
    column_name: 'created_at',
    data_type: 'timestamp with time zone',
    character_maximum_length: null,
    is_nullable: 'NO',
    column_default: 'now()',
    ordinal_position: 4,
  },
];

export const mockColumnsForOrders = [
  {
    column_name: 'id',
    data_type: 'integer',
    character_maximum_length: null,
    is_nullable: 'NO',
    column_default: "nextval('orders_id_seq'::regclass)",
    ordinal_position: 1,
  },
  {
    column_name: 'user_id',
    data_type: 'integer',
    character_maximum_length: null,
    is_nullable: 'NO',
    column_default: null,
    ordinal_position: 2,
  },
  {
    column_name: 'product_name',
    data_type: 'character varying',
    character_maximum_length: 255,
    is_nullable: 'NO',
    column_default: null,
    ordinal_position: 3,
  },
  {
    column_name: 'amount',
    data_type: 'numeric',
    character_maximum_length: null,
    is_nullable: 'NO',
    column_default: null,
    ordinal_position: 4,
  },
  {
    column_name: 'created_at',
    data_type: 'timestamp with time zone',
    character_maximum_length: null,
    is_nullable: 'NO',
    column_default: 'now()',
    ordinal_position: 5,
  },
];

// Table definition data
export const tableDefinitions = {
  usersTable: {
    table_definition:
      "CREATE TABLE users (\n  id integer NOT NULL DEFAULT nextval('users_id_seq'::regclass),\n  name character varying(255),\n  email character varying(255) NOT NULL,\n  created_at timestamp with time zone NOT NULL DEFAULT now()\n);",
  },
  ordersTable: {
    table_definition:
      "CREATE TABLE orders (\n  id integer NOT NULL DEFAULT nextval('orders_id_seq'::regclass),\n  user_id integer NOT NULL,\n  product_name character varying(255) NOT NULL,\n  amount numeric NOT NULL,\n  created_at timestamp with time zone NOT NULL DEFAULT now()\n);",
  },
};
