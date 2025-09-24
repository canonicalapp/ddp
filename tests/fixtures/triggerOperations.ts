/**
 * Mock data fixtures for trigger operations tests
 */

// Base trigger factory function
export const createTrigger = (overrides = {}) => ({
  trigger_name: 'update_user_timestamp',
  event_manipulation: 'UPDATE',
  event_object_table: 'users',
  action_timing: 'BEFORE',
  action_statement: 'EXECUTE FUNCTION update_modified_column()',
  ...overrides,
});

// Basic trigger data
export const updateTrigger = createTrigger();

export const insertTrigger = createTrigger({
  trigger_name: 'audit_user_changes',
  event_manipulation: 'INSERT',
  action_timing: 'AFTER',
  action_statement: 'EXECUTE FUNCTION audit_user_changes()',
});

export const deleteTrigger = createTrigger({
  trigger_name: 'cleanup_user_data',
  event_manipulation: 'DELETE',
  action_timing: 'AFTER',
  action_statement: 'EXECUTE FUNCTION cleanup_user_data()',
});

// Test scenarios for trigger operations
export const sourceTriggersForAddTest = [
  createTrigger(),
  createTrigger({
    trigger_name: 'new_trigger',
    event_manipulation: 'INSERT',
    event_object_table: 'orders',
    action_timing: 'AFTER',
    action_statement: 'EXECUTE FUNCTION log_order_creation()',
  }),
];

export const targetTriggersForAddTest = [createTrigger()];

export const sourceTriggersForDropTest = [createTrigger()];

export const targetTriggersForDropTest = [
  createTrigger(),
  createTrigger({
    trigger_name: 'old_trigger',
    event_manipulation: 'UPDATE',
    action_timing: 'BEFORE',
    action_statement: 'EXECUTE FUNCTION old_function()',
  }),
];

export const sourceTriggersForModifyTest = [
  createTrigger(),
  createTrigger({
    trigger_name: 'audit_user_changes',
    event_manipulation: 'INSERT',
    action_timing: 'AFTER',
    action_statement: 'EXECUTE FUNCTION audit_user_changes()',
  }),
];

export const targetTriggersForModifyTest = [
  createTrigger(),
  createTrigger({
    trigger_name: 'audit_user_changes',
    event_manipulation: 'INSERT',
    action_timing: 'BEFORE', // Different timing
    action_statement: 'EXECUTE FUNCTION audit_user_changes()',
  }),
];

export const sourceTriggersForIdenticalTest = [createTrigger()];

export const targetTriggersForIdenticalTest = [createTrigger()];

// Edge case data
export const sourceTriggersForNewTableTest = [
  createTrigger(),
  createTrigger({
    event_object_table: 'new_table',
  }),
];

export const targetTriggersForNewTableTest = [createTrigger()];

export const sourceTriggersForOldTableTest = [createTrigger()];

export const targetTriggersForOldTableTest = [
  createTrigger(),
  createTrigger({
    event_object_table: 'old_table',
  }),
];

// Edge case scenarios
export const sourceTriggersWithSpecialChars = [
  createTrigger({
    trigger_name: 'update_user-table_with.special@chars',
    event_object_table: 'user-table_with.special@chars',
  }),
];

export const targetTriggersForSpecialChars = [createTrigger()];

export const sourceTriggersWithMalformedData = [
  createTrigger({
    // missing other properties
    event_manipulation: undefined,
    event_object_table: undefined,
    action_timing: undefined,
    action_statement: undefined,
  }),
];

// Complex test scenarios
export const sourceTriggersComplexTest = [
  createTrigger(),
  createTrigger({
    trigger_name: 'audit_user_changes',
    event_manipulation: 'INSERT',
    action_timing: 'AFTER',
    action_statement: 'EXECUTE FUNCTION audit_user_changes()',
  }),
  createTrigger({
    trigger_name: 'cleanup_user_data',
    event_manipulation: 'DELETE',
    action_timing: 'AFTER',
    action_statement: 'EXECUTE FUNCTION cleanup_user_data()',
  }),
];

export const targetTriggersComplexTest = [createTrigger()];

export const sourceTriggersWithOldTriggers = [createTrigger()];

export const targetTriggersWithOldTriggers = [
  createTrigger(),
  createTrigger({
    trigger_name: 'old_trigger1',
    event_manipulation: 'UPDATE',
    action_timing: 'BEFORE',
    action_statement: 'EXECUTE FUNCTION old_function1()',
  }),
  createTrigger({
    trigger_name: 'old_trigger2',
    event_manipulation: 'INSERT',
    action_timing: 'AFTER',
    action_statement: 'EXECUTE FUNCTION old_function2()',
  }),
];

// Trigger definition data
export const triggerDefinitions = {
  updateTrigger: {
    trigger_definition:
      'CREATE TRIGGER update_user_timestamp BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_modified_column();',
  },
  insertTrigger: {
    trigger_definition:
      'CREATE TRIGGER audit_user_changes AFTER INSERT ON users FOR EACH ROW EXECUTE FUNCTION audit_user_changes();',
  },
  deleteTrigger: {
    trigger_definition:
      'CREATE TRIGGER cleanup_user_data AFTER DELETE ON users FOR EACH ROW EXECUTE FUNCTION cleanup_user_data();',
  },
};
