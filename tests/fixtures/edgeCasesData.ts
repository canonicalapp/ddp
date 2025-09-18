/**
 * Mock data fixtures for edge cases and error handling tests
 */

// Edge case column data
export const nullColumn = {
  column_name: null,
  data_type: null,
  character_maximum_length: null,
  is_nullable: null,
  column_default: null,
  ordinal_position: null,
};

export const undefinedColumn = {
  column_name: undefined,
  data_type: undefined,
  character_maximum_length: undefined,
  is_nullable: undefined,
  column_default: undefined,
  ordinal_position: undefined,
};

export const extremeLengthColumn = {
  column_name: 'a'.repeat(1000),
  data_type: 'character varying',
  character_maximum_length: 999999999,
  is_nullable: 'NO',
  column_default: 'a'.repeat(1000),
  ordinal_position: 1,
};

export const unknownTypeColumn = {
  table_name: 'users',
  column_name: 'id',
  data_type: 'unknown_custom_type',
  character_maximum_length: null,
  is_nullable: 'NO',
  column_default: null,
  ordinal_position: 1,
};

export const maxLengthColumn = {
  table_name: 'users',
  column_name: 'id',
  data_type: 'character varying',
  character_maximum_length: 2147483647, // Max int32
  is_nullable: 'NO',
  column_default: null,
  ordinal_position: 1,
};

export const negativeLengthColumn = {
  table_name: 'users',
  column_name: 'id',
  data_type: 'character varying',
  character_maximum_length: -1,
  is_nullable: 'NO',
  column_default: null,
  ordinal_position: 1,
};

// Large dataset for performance testing
export const largeTable = {
  table_name: 'large_table',
  column_name: 'large_column',
  data_type: 'text',
  character_maximum_length: null,
  is_nullable: 'YES',
  column_default: null,
  ordinal_position: 1,
};

export const createLargeDataset = (size = 1000) =>
  Array.from({ length: size }, () => ({ ...largeTable }));

export const createLargeTableList = (size = 100000) =>
  Array.from({ length: size }, (_, i) => ({
    table_name: `table_${i}`,
  }));

// Circular reference data
export const createCircularReference = () => {
  const circularResult = { table_name: 'test' };
  circularResult.self = circularResult;
  return circularResult;
};

// Corrupted data
export const corruptedResult = {
  rows: [
    { table_name: 'users' },
    null,
    undefined,
    { table_name: null },
    { table_name: '' },
    { table_name: 123 },
    { table_name: {} },
    { table_name: [] },
  ],
};

export const malformedResult = {
  rows: [{ table_name: 'users', metadata: '{"invalid": json}' }],
};

// Edge case table data
export const emptyTable = { table_name: '' };
export const nullTable = { table_name: null };
export const numericTable = { table_name: 123 };
export const objectTable = { table_name: {} };
export const arrayTable = { table_name: [] };

// Edge case function data
export const emptyFunction = {
  routine_name: '',
  routine_type: 'FUNCTION',
  specific_name: '',
  data_type: '',
  routine_definition: '',
};

export const nullFunction = {
  routine_name: null,
  routine_type: null,
  specific_name: null,
  data_type: null,
  routine_definition: null,
};

// Edge case constraint data
export const emptyConstraint = {
  table_name: '',
  constraint_name: '',
  constraint_type: '',
  column_name: '',
  foreign_table_name: null,
  foreign_column_name: null,
};

export const nullConstraint = {
  table_name: null,
  constraint_name: null,
  constraint_type: null,
  column_name: null,
  foreign_table_name: null,
  foreign_column_name: null,
};

// Edge case trigger data
export const emptyTrigger = {
  trigger_name: '',
  event_manipulation: '',
  event_object_table: '',
  action_timing: '',
  action_statement: '',
  action_orientation: null,
  action_condition: null,
};

export const nullTrigger = {
  trigger_name: null,
  event_manipulation: null,
  event_object_table: null,
  action_timing: null,
  action_statement: null,
  action_orientation: null,
  action_condition: null,
};

// Special characters and encoding data
export const specialCharsData = {
  table_name: 'table-with_special.chars@domain',
  column_name: 'column_with-special.chars@domain',
  constraint_name: 'constraint-with_special.chars@domain',
  trigger_name: 'trigger-with_special.chars@domain',
  function_name: 'function-with_special.chars@domain',
};

// Unicode and internationalization data
export const unicodeData = {
  table_name: '表_テーブル_테이블',
  column_name: '列_カラム_컬럼',
  constraint_name: '制約_制約_제약',
  trigger_name: 'トリガー_트리거',
  function_name: '関数_함수',
};

// Very long names
export const createLongName = (prefix, length = 1000) =>
  `${prefix}_${'a'.repeat(length)}`;

export const longTableName = createLongName('table', 1000);
export const longColumnName = createLongName('column', 1000);
export const longConstraintName = createLongName('constraint', 1000);
export const longTriggerName = createLongName('trigger', 1000);
export const longFunctionName = createLongName('function', 1000);

// Boundary values
export const boundaryValues = {
  maxInt32: 2147483647,
  minInt32: -2147483648,
  maxSafeInteger: Number.MAX_SAFE_INTEGER,
  minSafeInteger: Number.MIN_SAFE_INTEGER,
  maxStringLength: 65535, // Common database limit
  maxTableNameLength: 63, // PostgreSQL limit
  maxColumnNameLength: 63, // PostgreSQL limit
};

// Error scenarios
export const errorScenarios = {
  connectionTimeout: new Error('Connection timeout'),
  queryTimeout: new Error('Query timeout'),
  permissionDenied: new Error('Permission denied'),
  tableNotFound: new Error('Table not found'),
  columnNotFound: new Error('Column not found'),
  constraintNotFound: new Error('Constraint not found'),
  triggerNotFound: new Error('Trigger not found'),
  functionNotFound: new Error('Function not found'),
  invalidSchema: new Error('Invalid schema'),
  invalidDataType: new Error('Invalid data type'),
  constraintViolation: new Error('Constraint violation'),
  deadlock: new Error('Deadlock detected'),
  outOfMemory: new Error('Out of memory'),
  diskFull: new Error('Disk full'),
  networkError: new Error('Network error'),
};
