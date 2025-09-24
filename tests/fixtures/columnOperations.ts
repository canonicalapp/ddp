/**
 * Mock data fixtures for column operations tests
 */

// Base column factory function
export const createColumn = (overrides = {}) => ({
  table_name: 'users',
  column_name: 'id',
  data_type: 'integer',
  character_maximum_length: null,
  is_nullable: 'NO',
  column_default: null,
  ordinal_position: 1,
  ...overrides,
});

// Basic column data - using factory with specific overrides
export const basicColumn = createColumn({
  column_default: "nextval('users_id_seq'::regclass)",
});

export const emailColumn = createColumn({
  column_name: 'email',
  data_type: 'character varying',
  character_maximum_length: 255,
  ordinal_position: 2,
});

export const nameColumn = createColumn({
  column_name: 'name',
  data_type: 'character varying',
  character_maximum_length: 255,
});

export const textColumn = createColumn({
  column_name: 'description',
  data_type: 'text',
  is_nullable: 'YES',
  ordinal_position: 3,
});

export const timestampColumn = createColumn({
  column_name: 'created_at',
  data_type: 'timestamp',
  column_default: 'CURRENT_TIMESTAMP',
  ordinal_position: 4,
});

export const updatedAtColumn = createColumn({
  column_name: 'updated_at',
  data_type: 'timestamp',
  is_nullable: 'YES',
  column_default: 'CURRENT_TIMESTAMP',
  ordinal_position: 5,
});

export const statusColumn = createColumn({
  column_name: 'status',
  data_type: 'character varying',
  character_maximum_length: 20,
  column_default: "'active'",
  ordinal_position: 6,
});

// Test scenarios for column operations
export const sourceColumnsForAddTest = [
  createColumn(),
  createColumn({
    column_name: 'email',
    data_type: 'character varying',
    character_maximum_length: 255,
    ordinal_position: 2,
  }),
];

export const targetColumnsForAddTest = [createColumn()];

export const sourceColumnsForDropTest = [createColumn()];

export const targetColumnsForDropTest = [
  createColumn(),
  createColumn({
    column_name: 'old_column',
    data_type: 'text',
    is_nullable: 'YES',
    ordinal_position: 2,
  }),
];

export const sourceColumnsForModifyTest = [
  createColumn({
    column_name: 'name',
    data_type: 'character varying',
    character_maximum_length: 255,
  }),
];

export const targetColumnsForModifyTest = [
  createColumn({
    column_name: 'name',
    data_type: 'text',
    is_nullable: 'YES',
  }),
];

export const sourceColumnsForIdenticalTest = [createColumn()];

export const targetColumnsForIdenticalTest = [createColumn()];

// Edge case data
export const sourceColumnsForNewTableTest = [
  createColumn(),
  createColumn({
    table_name: 'new_table',
  }),
];

export const targetColumnsForNewTableTest = [createColumn()];

export const sourceColumnsForOldTableTest = [createColumn()];

export const targetColumnsForOldTableTest = [
  createColumn(),
  createColumn({
    table_name: 'old_table',
  }),
];

// Edge case scenarios
export const sourceColumnsWithNullName = [
  createColumn({
    column_name: null,
  }),
];

export const sourceColumnsWithSpecialChars = [
  createColumn({
    column_name: 'user-id_with.special@chars',
    data_type: 'text',
    is_nullable: 'YES',
  }),
];

export const targetColumnsForSpecialChars = [createColumn()];

export const sourceColumnsWithLongName = longColumnName => [
  createColumn({
    column_name: longColumnName,
    data_type: 'text',
    is_nullable: 'YES',
  }),
];

export const targetColumnsForLongName = [createColumn()];

export const sourceColumnsWithMalformedData = [
  createColumn({
    // missing other properties - only has table_name and column_name
    data_type: undefined,
    character_maximum_length: undefined,
    is_nullable: undefined,
    column_default: undefined,
    ordinal_position: undefined,
  }),
];

// Column comparison data for different scenarios
export const dataTypeChangeColumns = {
  source: createColumn({
    column_name: 'name',
    data_type: 'character varying',
    character_maximum_length: 255,
  }),
  target: createColumn({
    column_name: 'name',
    data_type: 'text',
    character_maximum_length: null,
  }),
};

export const nullabilityChangeColumns = {
  source: createColumn({
    column_name: 'email',
    data_type: 'text',
    character_maximum_length: null,
  }),
  target: createColumn({
    column_name: 'email',
    data_type: 'text',
    character_maximum_length: null,
    is_nullable: 'YES',
  }),
};

export const defaultValueChangeColumns = {
  source: createColumn({
    column_name: 'created_at',
    data_type: 'timestamp',
    column_default: 'CURRENT_TIMESTAMP',
  }),
  target: createColumn({
    column_name: 'created_at',
    data_type: 'timestamp',
  }),
};

export const multipleChangesColumns = {
  source: createColumn({
    column_name: 'status',
    data_type: 'character varying',
    character_maximum_length: 20,
    column_default: "'active'",
  }),
  target: createColumn({
    column_name: 'status',
    data_type: 'text',
    character_maximum_length: null,
    is_nullable: 'YES',
  }),
};

export const dropDefaultColumns = {
  source: createColumn({
    column_name: 'updated_at',
    data_type: 'timestamp',
    is_nullable: 'YES',
  }),
  target: createColumn({
    column_name: 'updated_at',
    data_type: 'timestamp',
    is_nullable: 'YES',
    column_default: 'CURRENT_TIMESTAMP',
  }),
};

export const dropNotNullColumns = {
  source: createColumn({
    column_name: 'description',
    data_type: 'text',
    is_nullable: 'YES',
  }),
  target: createColumn({
    column_name: 'description',
    data_type: 'text',
  }),
};

// Grouping test data
export const columnsForGrouping = [
  createColumn(),
  createColumn({
    column_name: 'name',
    data_type: 'character varying',
    character_maximum_length: 255,
  }),
  createColumn({
    table_name: 'orders',
  }),
  createColumn({
    table_name: 'orders',
    column_name: 'user_id',
    data_type: 'integer',
  }),
];

export const singleTableColumns = [
  createColumn(),
  createColumn({
    column_name: 'name',
    data_type: 'character varying',
    character_maximum_length: 255,
  }),
];

export const columnsWithNullTableNames = [
  createColumn({
    table_name: null,
  }),
  createColumn({
    column_name: 'name',
    data_type: 'character varying',
    character_maximum_length: 255,
  }),
];
