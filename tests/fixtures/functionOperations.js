/**
 * Mock data fixtures for function operations tests
 */

// Base function factory function
export const createFunction = (overrides = {}) => ({
  routine_name: 'get_user_by_id',
  routine_type: 'FUNCTION',
  specific_name: 'get_user_by_id_1',
  ...overrides,
});

// Basic function data
export const getUserByIdFunction = createFunction();

export const updateUserStatusProcedure = createFunction({
  routine_name: 'update_user_status',
  routine_type: 'PROCEDURE',
  specific_name: 'update_user_status_1',
});

export const testFunction = createFunction({
  routine_name: 'test_function',
  routine_type: 'FUNCTION',
  specific_name: 'test_function_1',
});

// Test scenarios for function operations
export const devFunctionsForAddTest = [
  getUserByIdFunction,
  updateUserStatusProcedure,
];

export const prodFunctionsForAddTest = [getUserByIdFunction];

export const devFunctionsForDropTest = [getUserByIdFunction];

export const prodFunctionsForDropTest = [
  getUserByIdFunction,
  createFunction({
    routine_name: 'old_function',
    routine_type: 'FUNCTION',
    specific_name: 'old_function_1',
  }),
];

export const devFunctionsForModifyTest = [
  getUserByIdFunction,
  updateUserStatusProcedure,
];

export const prodFunctionsForModifyTest = [
  getUserByIdFunction,
  createFunction({
    routine_name: 'update_user_status',
    routine_type: 'PROCEDURE',
    specific_name: 'update_user_status_2', // Different specific name
  }),
];

export const devFunctionsForIdenticalTest = [getUserByIdFunction];

export const prodFunctionsForIdenticalTest = [getUserByIdFunction];

// Edge case data
export const devFunctionsForNewFunctionTest = [
  getUserByIdFunction,
  createFunction({
    routine_name: 'new_function',
    routine_type: 'FUNCTION',
    specific_name: 'new_function_1',
  }),
];

export const prodFunctionsForNewFunctionTest = [getUserByIdFunction];

export const devFunctionsForOldFunctionTest = [getUserByIdFunction];

export const prodFunctionsForOldFunctionTest = [
  getUserByIdFunction,
  createFunction({
    routine_name: 'old_function',
    routine_type: 'FUNCTION',
    specific_name: 'old_function_1',
  }),
];

// Edge case scenarios
export const devFunctionsWithSpecialChars = [
  createFunction({
    routine_name: 'get_user-by_id_with.special@chars',
    routine_type: 'FUNCTION',
    specific_name: 'get_user-by_id_with.special@chars_1',
  }),
];

export const prodFunctionsForSpecialChars = [getUserByIdFunction];

export const devFunctionsWithMalformedData = [
  createFunction({
    // missing other properties
    routine_name: undefined,
    routine_type: undefined,
    specific_name: undefined,
  }),
];

// Complex test scenarios
export const devFunctionsComplexTest = [
  getUserByIdFunction,
  updateUserStatusProcedure,
  createFunction({
    routine_name: 'cleanup_user_data',
    routine_type: 'FUNCTION',
    specific_name: 'cleanup_user_data_1',
  }),
];

export const prodFunctionsComplexTest = [getUserByIdFunction];

export const devFunctionsWithOldFunctions = [getUserByIdFunction];

export const prodFunctionsWithOldFunctions = [
  getUserByIdFunction,
  createFunction({
    routine_name: 'old_function1',
    routine_type: 'FUNCTION',
    specific_name: 'old_function1_1',
  }),
  createFunction({
    routine_name: 'old_function2',
    routine_type: 'PROCEDURE',
    specific_name: 'old_function2_1',
  }),
];

// Function definition data
export const functionDefinitions = {
  getUserByIdFunction: {
    function_definition:
      'CREATE OR REPLACE FUNCTION get_user_by_id(user_id integer) RETURNS TABLE(id integer, name text, email text) AS $$ BEGIN RETURN QUERY SELECT u.id, u.name, u.email FROM users u WHERE u.id = user_id; END; $$ LANGUAGE plpgsql;',
  },
  updateUserStatusProcedure: {
    function_definition:
      'CREATE OR REPLACE PROCEDURE update_user_status(user_id integer, new_status text) AS $$ BEGIN UPDATE users SET status = new_status WHERE id = user_id; END; $$ LANGUAGE plpgsql;',
  },
  testFunction: {
    function_definition:
      'CREATE OR REPLACE FUNCTION test_function() RETURNS integer AS $$ BEGIN RETURN 42; END; $$ LANGUAGE plpgsql;',
  },
};
