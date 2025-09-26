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
export const sourceTriggersWithDifferences = [
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

export const targetTriggersWithDifferences = [
  {
    trigger_name: 'update_user_timestamp',
    event_manipulation: 'UPDATE',
    event_object_table: 'users',
    action_timing: 'BEFORE',
    action_statement: 'EXECUTE FUNCTION update_modified_column_v2()', // Different function
    action_orientation: 'ROW',
    action_condition: null,
  },
  // audit_user_changes missing in target
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
export const createMockResponses = (sourceData, targetData) => {
  const {
    tables: sourceTables = [],
    columns: sourceColumns = [],
    functions: sourceFunctions = [],
    constraints: sourceConstraints = [],
    triggers: sourceTriggers = [],
    sequences: sourceSequences = [],
  } = sourceData;
  const {
    tables: targetTables = [],
    columns: targetColumns = [],
    functions: targetFunctions = [],
    constraints: targetConstraints = [],
    triggers: targetTriggers = [],
    sequences: targetSequences = [],
  } = targetData;

  return [
    { rows: sourceSequences }, // source sequences
    { rows: targetSequences }, // target sequences
    { rows: sourceTables }, // source tables
    { rows: targetTables }, // target tables
    { rows: sourceColumns }, // source columns
    { rows: targetColumns }, // target columns
    { rows: sourceFunctions }, // source functions
    { rows: targetFunctions }, // target functions
    { rows: sourceConstraints }, // source constraints
    { rows: targetConstraints }, // target constraints
    { rows: [] }, // source indexes
    { rows: [] }, // target indexes
    { rows: sourceTriggers }, // source triggers
    { rows: targetTriggers }, // target triggers
  ];
};

// Test scenarios
export const identicalSchemasScenario = {
  source: {
    tables: basicTables,
    columns: basicColumns,
    functions: basicFunctions,
    constraints: basicConstraints,
    triggers: basicTriggers,
  },
  target: {
    tables: basicTables,
    columns: basicColumns,
    functions: basicFunctions,
    constraints: basicConstraints,
    triggers: basicTriggers,
  },
};

export const missingTableScenario = {
  source: {
    tables: basicTables,
    columns: basicColumns,
    functions: [],
    constraints: [],
    triggers: [],
    sequences: [],
  },
  target: {
    tables: singleTable,
    columns: simpleColumns,
    functions: [],
    constraints: [],
    triggers: [],
    sequences: [],
  },
};

export const functionDifferencesScenario = {
  source: {
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
    sequences: [],
  },
  target: {
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
    sequences: [],
  },
};

export const triggerDifferencesScenario = {
  source: {
    tables: [],
    columns: [],
    functions: [],
    constraints: [],
    triggers: sourceTriggersWithDifferences,
  },
  target: {
    tables: [],
    columns: [],
    functions: [],
    constraints: [],
    triggers: targetTriggersWithDifferences,
  },
};

export const performanceTestScenario = {
  source: {
    tables: largeTableList,
    columns: largeColumnList,
    functions: [],
    constraints: [],
    triggers: [],
  },
  target: {
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
