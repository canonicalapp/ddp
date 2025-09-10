/**
 * Mock data fixtures for integration tests
 */

// Basic table data
export const basicTables = [{ table_name: 'users' }, { table_name: 'orders' }];

export const singleTable = [{ table_name: 'users' }];

export const emptyTables = [];

// Basic column data
export const basicColumns = [
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
  {
    table_name: 'users',
    column_name: 'email',
    data_type: 'character varying',
    character_maximum_length: 255,
    is_nullable: 'NO',
    column_default: null,
    ordinal_position: 3,
  },
];

export const simpleColumns = [
  {
    table_name: 'users',
    column_name: 'id',
    data_type: 'integer',
    character_maximum_length: null,
    is_nullable: 'NO',
    column_default: null,
    ordinal_position: 1,
  },
];

// Basic function data
export const basicFunctions = [
  {
    routine_name: 'get_user_by_id',
    routine_type: 'FUNCTION',
    specific_name: 'get_user_by_id_1',
    data_type: 'integer',
    routine_definition: 'BEGIN RETURN 1; END;',
  },
];

// Basic constraint data
export const basicConstraints = [
  {
    table_name: 'users',
    constraint_name: 'users_pkey',
    constraint_type: 'PRIMARY KEY',
    column_name: 'id',
    foreign_table_name: null,
    foreign_column_name: null,
  },
];

// Basic trigger data
export const basicTriggers = [
  {
    trigger_name: 'update_user_timestamp',
    event_manipulation: 'UPDATE',
    event_object_table: 'users',
    action_timing: 'BEFORE',
    action_statement: 'EXECUTE FUNCTION update_modified_column()',
  },
];

// Complex trigger data for testing differences
export const devTriggersWithDifferences = [
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
    action_statement: 'EXECUTE FUNCTION audit_user_changes()',
    action_orientation: 'ROW',
    action_condition: null,
  },
];

export const prodTriggersWithDifferences = [
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

// Large dataset for performance testing
export const largeTableList = Array.from({ length: 100 }, (_, i) => ({
  table_name: `table_${i + 1}`,
}));

export const largeColumnList = Array.from({ length: 500 }, (_, i) => ({
  table_name: `table_${Math.floor(i / 5) + 1}`,
  column_name: `column_${(i % 5) + 1}`,
  data_type: 'integer',
  character_maximum_length: null,
  is_nullable: 'YES',
  column_default: null,
  ordinal_position: (i % 5) + 1,
}));

// Mock responses for different test scenarios
export const createMockResponses = (devData, prodData) => {
  const {
    tables: devTables = [],
    columns: devColumns = [],
    functions: devFunctions = [],
    constraints: devConstraints = [],
    triggers: devTriggers = [],
  } = devData;
  const {
    tables: prodTables = [],
    columns: prodColumns = [],
    functions: prodFunctions = [],
    constraints: prodConstraints = [],
    triggers: prodTriggers = [],
  } = prodData;

  return [
    { rows: devTables }, // dev tables
    { rows: prodTables }, // prod tables
    { rows: devColumns }, // dev columns
    { rows: prodColumns }, // prod columns
    { rows: devFunctions }, // dev functions
    { rows: prodFunctions }, // prod functions
    { rows: devConstraints }, // dev constraints
    { rows: prodConstraints }, // prod constraints
    { rows: devTriggers }, // dev triggers
    { rows: prodTriggers }, // prod triggers
    { rows: [] }, // dev indexes
    { rows: [] }, // prod indexes
  ];
};

// Test scenarios
export const identicalSchemasScenario = {
  dev: {
    tables: basicTables,
    columns: basicColumns,
    functions: basicFunctions,
    constraints: basicConstraints,
    triggers: basicTriggers,
  },
  prod: {
    tables: basicTables,
    columns: basicColumns,
    functions: basicFunctions,
    constraints: basicConstraints,
    triggers: basicTriggers,
  },
};

export const missingTableScenario = {
  dev: {
    tables: basicTables,
    columns: basicColumns,
    functions: [],
    constraints: [],
    triggers: [],
  },
  prod: {
    tables: singleTable,
    columns: simpleColumns,
    functions: [],
    constraints: [],
    triggers: [],
  },
};

export const functionDifferencesScenario = {
  dev: {
    tables: [],
    columns: [],
    functions: [
      {
        routine_name: 'get_user_by_id',
        routine_type: 'FUNCTION',
        specific_name: 'get_user_by_id_1',
        data_type: 'integer',
        routine_definition: 'BEGIN RETURN 1; END;',
      },
    ],
    constraints: [],
    triggers: [],
  },
  prod: {
    tables: [],
    columns: [],
    functions: [
      {
        routine_name: 'get_user_by_id',
        routine_type: 'FUNCTION',
        specific_name: 'get_user_by_id_1',
        data_type: 'integer',
        routine_definition: 'BEGIN RETURN 2; END;', // Different definition
      },
    ],
    constraints: [],
    triggers: [],
  },
};

export const triggerDifferencesScenario = {
  dev: {
    tables: [],
    columns: [],
    functions: [],
    constraints: [],
    triggers: devTriggersWithDifferences,
  },
  prod: {
    tables: [],
    columns: [],
    functions: [],
    constraints: [],
    triggers: prodTriggersWithDifferences,
  },
};

export const performanceTestScenario = {
  dev: {
    tables: largeTableList,
    columns: largeColumnList,
    functions: [],
    constraints: [],
    triggers: [],
  },
  prod: {
    tables: largeTableList,
    columns: largeColumnList,
    functions: [],
    constraints: [],
    triggers: [],
  },
};

// Mock query responses for specific test cases
export const createQueryMock = responses => {
  let callCount = 0;
  return (..._args) => {
    const response = responses[callCount] || { rows: [] };
    callCount++;
    return Promise.resolve(response);
  };
};

// Error scenarios
export const connectionError = new Error('Connection refused');
export const scriptError = new Error('Script generation failed');
export const queryError = new Error('Database query failed');
