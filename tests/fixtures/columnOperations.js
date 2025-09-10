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
export const devColumnsForAddTest = [
  createColumn(),
  createColumn({
    column_name: 'email',
    data_type: 'character varying',
    character_maximum_length: 255,
    ordinal_position: 2,
  }),
];

export const prodColumnsForAddTest = [createColumn()];

export const devColumnsForDropTest = [createColumn()];

export const prodColumnsForDropTest = [
  createColumn(),
  createColumn({
    column_name: 'old_column',
    data_type: 'text',
    is_nullable: 'YES',
    ordinal_position: 2,
  }),
];

export const devColumnsForModifyTest = [
  createColumn({
    column_name: 'name',
    data_type: 'character varying',
    character_maximum_length: 255,
  }),
];

export const prodColumnsForModifyTest = [
  createColumn({
    column_name: 'name',
    data_type: 'text',
    is_nullable: 'YES',
  }),
];

export const devColumnsForIdenticalTest = [createColumn()];

export const prodColumnsForIdenticalTest = [createColumn()];

// Edge case data
export const devColumnsForNewTableTest = [
  createColumn(),
  createColumn({
    table_name: 'new_table',
  }),
];

export const prodColumnsForNewTableTest = [createColumn()];

export const devColumnsForOldTableTest = [createColumn()];

export const prodColumnsForOldTableTest = [
  createColumn(),
  createColumn({
    table_name: 'old_table',
  }),
];

// Edge case scenarios
export const devColumnsWithNullName = [
  createColumn({
    column_name: null,
  }),
];

export const devColumnsWithSpecialChars = [
  createColumn({
    column_name: 'user-id_with.special@chars',
    data_type: 'text',
    is_nullable: 'YES',
  }),
];

export const prodColumnsForSpecialChars = [createColumn()];

export const devColumnsWithLongName = longColumnName => [
  createColumn({
    column_name: longColumnName,
    data_type: 'text',
    is_nullable: 'YES',
  }),
];

export const prodColumnsForLongName = [createColumn()];

export const devColumnsWithMalformedData = [
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
  dev: createColumn({
    column_name: 'name',
    data_type: 'character varying',
    character_maximum_length: 255,
  }),
  prod: createColumn({
    column_name: 'name',
    data_type: 'text',
    character_maximum_length: null,
  }),
};

export const nullabilityChangeColumns = {
  dev: createColumn({
    column_name: 'email',
    data_type: 'text',
    character_maximum_length: null,
  }),
  prod: createColumn({
    column_name: 'email',
    data_type: 'text',
    character_maximum_length: null,
    is_nullable: 'YES',
  }),
};

export const defaultValueChangeColumns = {
  dev: createColumn({
    column_name: 'created_at',
    data_type: 'timestamp',
    column_default: 'CURRENT_TIMESTAMP',
  }),
  prod: createColumn({
    column_name: 'created_at',
    data_type: 'timestamp',
  }),
};

export const multipleChangesColumns = {
  dev: createColumn({
    column_name: 'status',
    data_type: 'character varying',
    character_maximum_length: 20,
    column_default: "'active'",
  }),
  prod: createColumn({
    column_name: 'status',
    data_type: 'text',
    character_maximum_length: null,
    is_nullable: 'YES',
  }),
};

export const dropDefaultColumns = {
  dev: createColumn({
    column_name: 'updated_at',
    data_type: 'timestamp',
    is_nullable: 'YES',
  }),
  prod: createColumn({
    column_name: 'updated_at',
    data_type: 'timestamp',
    is_nullable: 'YES',
    column_default: 'CURRENT_TIMESTAMP',
  }),
};

export const dropNotNullColumns = {
  dev: createColumn({
    column_name: 'description',
    data_type: 'text',
    is_nullable: 'YES',
  }),
  prod: createColumn({
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
