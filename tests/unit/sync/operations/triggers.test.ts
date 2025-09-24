/**
 * Unit tests for TriggerOperations module
 */

import { TriggerOperations } from '@/sync/operations/triggers.ts';
import {
  createMockClient,
  createMockOptions,
} from '../../../fixtures/testUtils.ts';
import {
  sourceTriggersForAddTest,
  sourceTriggersForDropTest,
  sourceTriggersWithSpecialChars,
  insertTrigger,
  targetTriggersForAddTest,
  targetTriggersForDropTest,
  updateTrigger,
} from '../../../fixtures/triggerOperations.ts';

describe('TriggerOperations', () => {
  let triggerOps;
  let mockClient;
  let mockOptions;

  beforeEach(() => {
    mockClient = createMockClient();
    mockOptions = createMockOptions();
    triggerOps = new TriggerOperations(mockClient, mockOptions);

    // Reset mocks
    // Note: jest functions are available within test functions, not in global scope
  });

  describe('constructor', () => {
    it('should initialize with client and options', () => {
      expect(triggerOps.client).toBe(mockClient);
      expect(triggerOps.options).toBe(mockOptions);
    });
  });

  describe('getTriggers', () => {
    it('should query for triggers in a schema', async () => {
      const mockTriggers = [updateTrigger, insertTrigger];

      let queryCalled = false;
      let queryArgs = null;
      mockClient.query = (...args) => {
        queryCalled = true;
        queryArgs = args;
        return Promise.resolve({ rows: mockTriggers });
      };

      const result = await triggerOps.getTriggers('test_schema');

      // Verify the query was called with correct parameters
      expect(queryCalled).toBe(true);
      expect(queryArgs[0]).toContain('information_schema.triggers');
      expect(queryArgs[1]).toEqual(['test_schema']);
      expect(result).toEqual(mockTriggers);
    });

    it('should order triggers by event object table and trigger name', async () => {
      await triggerOps.getTriggers('test_schema');

      const query = mockClient.query.mock.calls[0][0];
      expect(query).toContain('ORDER BY event_object_table, trigger_name');
    });

    it('should handle empty results', async () => {
      mockClient.query.mockResolvedValue({ rows: [] });

      const result = await triggerOps.getTriggers('empty_schema');

      expect(result).toEqual([]);
    });

    it('should handle database errors', async () => {
      const error = new Error('Database connection failed');
      mockClient.query.mockRejectedValue(error);

      await expect(triggerOps.getTriggers('test_schema')).rejects.toThrow(
        'Database connection failed'
      );
    });

    it('should handle triggers with special characters in names', async () => {
      const mockTriggers = sourceTriggersWithSpecialChars;

      mockClient.query.mockResolvedValue({ rows: mockTriggers });

      const result = await triggerOps.getTriggers('test_schema');

      expect(result).toEqual(mockTriggers);
    });
  });

  describe('generateTriggerOperations', () => {
    it('should handle triggers to drop in target', async () => {
      const sourceTriggers = sourceTriggersForDropTest;
      const targetTriggers = targetTriggersForDropTest;

      mockClient.query
        .mockResolvedValueOnce({ rows: sourceTriggers })
        .mockResolvedValueOnce({ rows: targetTriggers });

      const result = await triggerOps.generateTriggerOperations();

      expect(result).toContain(
        '-- Trigger old_trigger exists in prod_schema but not in dev_schema'
      );
      expect(result).toContain(
        'DROP TRIGGER IF EXISTS old_trigger ON prod_schema.users;'
      );
    });

    it('should handle triggers to create in target', async () => {
      const sourceTriggers = sourceTriggersForAddTest;
      const targetTriggers = targetTriggersForAddTest;

      const mockTriggerDefinition = {
        trigger_name: 'new_trigger',
        event_manipulation: 'INSERT',
        event_object_table: 'orders',
        action_timing: 'AFTER',
        action_statement: 'EXECUTE FUNCTION log_order_creation()',
        action_orientation: 'ROW',
        action_condition: null,
      };

      // Mock the query to return different results for source and target calls
      let callCount = 0;
      mockClient.query = () => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ rows: sourceTriggers });
        } else if (callCount === 2) {
          return Promise.resolve({ rows: targetTriggers });
        } else {
          // This is the call to get trigger definition
          return Promise.resolve({ rows: [mockTriggerDefinition] });
        }
      };

      const result = await triggerOps.generateTriggerOperations();

      expect(result).toContain(
        '-- Creating trigger new_trigger in prod_schema'
      );
      expect(
        result.some(line => line.includes('CREATE TRIGGER new_trigger'))
      ).toBe(true);
      expect(result.some(line => line.includes('AFTER INSERT'))).toBe(true);
      expect(result.some(line => line.includes('ON prod_schema.orders'))).toBe(
        true
      );
      expect(
        result.some(line =>
          line.includes('EXECUTE FUNCTION log_order_creation()')
        )
      ).toBe(true);
    });

    it('should handle triggers with different event manipulations', async () => {
      const sourceTriggers = [
        {
          trigger_name: 'insert_trigger',
          event_manipulation: 'INSERT',
          event_object_table: 'users',
          action_timing: 'BEFORE',
          action_statement: 'EXECUTE FUNCTION validate_user()',
        },
        {
          trigger_name: 'update_trigger',
          event_manipulation: 'UPDATE',
          event_object_table: 'users',
          action_timing: 'AFTER',
          action_statement: 'EXECUTE FUNCTION log_user_changes()',
        },
        {
          trigger_name: 'delete_trigger',
          event_manipulation: 'DELETE',
          event_object_table: 'users',
          action_timing: 'BEFORE',
          action_statement: 'EXECUTE FUNCTION check_user_deletion()',
        },
      ];
      const targetTriggers = [];

      const mockTriggerDefinitions = [
        {
          trigger_name: 'insert_trigger',
          event_manipulation: 'INSERT',
          event_object_table: 'users',
          action_timing: 'BEFORE',
          action_statement: 'EXECUTE FUNCTION validate_user()',
          action_orientation: 'ROW',
          action_condition: null,
        },
        {
          trigger_name: 'update_trigger',
          event_manipulation: 'UPDATE',
          event_object_table: 'users',
          action_timing: 'AFTER',
          action_statement: 'EXECUTE FUNCTION log_user_changes()',
          action_orientation: 'ROW',
          action_condition: null,
        },
        {
          trigger_name: 'delete_trigger',
          event_manipulation: 'DELETE',
          event_object_table: 'users',
          action_timing: 'BEFORE',
          action_statement: 'EXECUTE FUNCTION check_user_deletion()',
          action_orientation: 'ROW',
          action_condition: null,
        },
      ];

      // Mock the query to return different results for source and target calls
      let callCount = 0;
      mockClient.query = () => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ rows: sourceTriggers });
        } else if (callCount === 2) {
          return Promise.resolve({ rows: targetTriggers });
        } else {
          // This is the call to get trigger definition
          const triggerIndex = (callCount - 3) % 3;
          return Promise.resolve({
            rows: [mockTriggerDefinitions[triggerIndex]],
          });
        }
      };

      const result = await triggerOps.generateTriggerOperations();

      expect(result).toContain(
        '-- Creating trigger insert_trigger in prod_schema'
      );
      expect(result).toContain(
        '-- Creating trigger update_trigger in prod_schema'
      );
      expect(result).toContain(
        '-- Creating trigger delete_trigger in prod_schema'
      );
    });

    it('should handle triggers with different action timings', async () => {
      const sourceTriggers = [
        {
          trigger_name: 'before_trigger',
          event_manipulation: 'INSERT',
          event_object_table: 'users',
          action_timing: 'BEFORE',
          action_statement: 'EXECUTE FUNCTION validate_user()',
        },
        {
          trigger_name: 'after_trigger',
          event_manipulation: 'INSERT',
          event_object_table: 'users',
          action_timing: 'AFTER',
          action_statement: 'EXECUTE FUNCTION log_user_creation()',
        },
      ];
      const targetTriggers = [];

      const mockTriggerDefinitions = [
        {
          trigger_name: 'before_trigger',
          event_manipulation: 'INSERT',
          event_object_table: 'users',
          action_timing: 'BEFORE',
          action_statement: 'EXECUTE FUNCTION validate_user()',
          action_orientation: 'ROW',
          action_condition: null,
        },
        {
          trigger_name: 'after_trigger',
          event_manipulation: 'INSERT',
          event_object_table: 'users',
          action_timing: 'AFTER',
          action_statement: 'EXECUTE FUNCTION log_user_creation()',
          action_orientation: 'ROW',
          action_condition: null,
        },
      ];

      // Mock the query to return different results for source and target calls
      let callCount = 0;
      mockClient.query = () => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ rows: sourceTriggers });
        } else if (callCount === 2) {
          return Promise.resolve({ rows: targetTriggers });
        } else {
          // This is the call to get trigger definition
          const triggerIndex = (callCount - 3) % 2;
          return Promise.resolve({
            rows: [mockTriggerDefinitions[triggerIndex]],
          });
        }
      };

      const result = await triggerOps.generateTriggerOperations();

      expect(result).toContain(
        '-- Creating trigger before_trigger in prod_schema'
      );
      expect(result).toContain(
        '-- Creating trigger after_trigger in prod_schema'
      );
    });

    it('should handle identical trigger schemas', async () => {
      const sourceTriggers = [
        {
          trigger_name: 'update_user_timestamp',
          event_manipulation: 'UPDATE',
          event_object_table: 'users',
          action_timing: 'BEFORE',
          action_statement: 'EXECUTE FUNCTION update_modified_column()',
        },
      ];
      const targetTriggers = [
        {
          trigger_name: 'update_user_timestamp',
          event_manipulation: 'UPDATE',
          event_object_table: 'users',
          action_timing: 'BEFORE',
          action_statement: 'EXECUTE FUNCTION update_modified_column()',
        },
      ];

      mockClient.query
        .mockResolvedValueOnce({ rows: sourceTriggers })
        .mockResolvedValueOnce({ rows: targetTriggers });

      const result = await triggerOps.generateTriggerOperations();

      expect(result).not.toContain('-- Creating trigger');
      expect(result).not.toContain('DROP TRIGGER');
    });

    it('should handle empty schemas', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await triggerOps.generateTriggerOperations();

      expect(result).toEqual([]);
    });

    it('should handle multiple triggers to drop', async () => {
      const sourceTriggers = [
        {
          trigger_name: 'update_user_timestamp',
          event_manipulation: 'UPDATE',
          event_object_table: 'users',
          action_timing: 'BEFORE',
          action_statement: 'EXECUTE FUNCTION update_modified_column()',
        },
      ];
      const targetTriggers = [
        {
          trigger_name: 'update_user_timestamp',
          event_manipulation: 'UPDATE',
          event_object_table: 'users',
          action_timing: 'BEFORE',
          action_statement: 'EXECUTE FUNCTION update_modified_column()',
        },
        {
          trigger_name: 'old_trigger1',
          event_manipulation: 'INSERT',
          event_object_table: 'users',
          action_timing: 'AFTER',
          action_statement: 'EXECUTE FUNCTION old_function1()',
        },
        {
          trigger_name: 'old_trigger2',
          event_manipulation: 'DELETE',
          event_object_table: 'users',
          action_timing: 'BEFORE',
          action_statement: 'EXECUTE FUNCTION old_function2()',
        },
      ];

      mockClient.query
        .mockResolvedValueOnce({ rows: sourceTriggers })
        .mockResolvedValueOnce({ rows: targetTriggers });

      const result = await triggerOps.generateTriggerOperations();

      expect(
        result.filter(
          line =>
            line.includes('-- Trigger') &&
            line.includes(
              `exists in ${mockOptions.target} but not in ${mockOptions.source}`
            )
        ).length
      ).toBe(2);
      expect(
        result.filter(line => line.includes('DROP TRIGGER IF EXISTS')).length
      ).toBe(2);
    });

    it('should handle multiple triggers to create', async () => {
      const sourceTriggers = [
        {
          trigger_name: 'update_user_timestamp',
          event_manipulation: 'UPDATE',
          event_object_table: 'users',
          action_timing: 'BEFORE',
          action_statement: 'EXECUTE FUNCTION update_modified_column()',
        },
        {
          trigger_name: 'new_trigger1',
          event_manipulation: 'INSERT',
          event_object_table: 'users',
          action_timing: 'AFTER',
          action_statement: 'EXECUTE FUNCTION log_user_creation()',
        },
        {
          trigger_name: 'new_trigger2',
          event_manipulation: 'DELETE',
          event_object_table: 'users',
          action_timing: 'BEFORE',
          action_statement: 'EXECUTE FUNCTION validate_user_deletion()',
        },
      ];
      const targetTriggers = [
        {
          trigger_name: 'update_user_timestamp',
          event_manipulation: 'UPDATE',
          event_object_table: 'users',
          action_timing: 'BEFORE',
          action_statement: 'EXECUTE FUNCTION update_modified_column()',
        },
      ];

      const mockTriggerDefinitions = [
        {
          trigger_name: 'new_trigger1',
          event_manipulation: 'INSERT',
          event_object_table: 'users',
          action_timing: 'AFTER',
          action_statement: 'EXECUTE FUNCTION log_user_creation()',
          action_orientation: 'ROW',
          action_condition: null,
        },
        {
          trigger_name: 'new_trigger2',
          event_manipulation: 'DELETE',
          event_object_table: 'users',
          action_timing: 'BEFORE',
          action_statement: 'EXECUTE FUNCTION validate_user_deletion()',
          action_orientation: 'ROW',
          action_condition: null,
        },
      ];

      // Mock the query to return different results for source and target calls
      let callCount = 0;
      mockClient.query = () => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ rows: sourceTriggers });
        } else if (callCount === 2) {
          return Promise.resolve({ rows: targetTriggers });
        } else {
          // This is the call to get trigger definition
          const triggerIndex = (callCount - 3) % 2;
          return Promise.resolve({
            rows: [mockTriggerDefinitions[triggerIndex]],
          });
        }
      };

      const result = await triggerOps.generateTriggerOperations();

      expect(
        result.filter(line => line.includes('-- Creating trigger')).length
      ).toBe(2);
    });

    it('should handle mixed trigger operations', async () => {
      const sourceTriggers = [
        {
          trigger_name: 'update_user_timestamp',
          event_manipulation: 'UPDATE',
          event_object_table: 'users',
          action_timing: 'BEFORE',
          action_statement: 'EXECUTE FUNCTION update_modified_column()',
        },
        {
          trigger_name: 'new_trigger',
          event_manipulation: 'INSERT',
          event_object_table: 'orders',
          action_timing: 'AFTER',
          action_statement: 'EXECUTE FUNCTION log_order_creation()',
        },
      ];
      const targetTriggers = [
        {
          trigger_name: 'update_user_timestamp',
          event_manipulation: 'UPDATE',
          event_object_table: 'users',
          action_timing: 'BEFORE',
          action_statement: 'EXECUTE FUNCTION update_modified_column()',
        },
        {
          trigger_name: 'old_trigger',
          event_manipulation: 'DELETE',
          event_object_table: 'users',
          action_timing: 'BEFORE',
          action_statement: 'EXECUTE FUNCTION old_function()',
        },
      ];

      const mockTriggerDefinition = {
        trigger_name: 'new_trigger',
        event_manipulation: 'INSERT',
        event_object_table: 'orders',
        action_timing: 'AFTER',
        action_statement: 'EXECUTE FUNCTION log_order_creation()',
        action_orientation: 'ROW',
        action_condition: null,
      };

      // Mock the query to return different results for source and target calls
      let callCount = 0;
      mockClient.query = () => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ rows: sourceTriggers });
        } else if (callCount === 2) {
          return Promise.resolve({ rows: targetTriggers });
        } else {
          // This is the call to get trigger definition
          return Promise.resolve({ rows: [mockTriggerDefinition] });
        }
      };

      const result = await triggerOps.generateTriggerOperations();

      // Should handle both trigger to drop and trigger to create
      expect(result).toContain(
        '-- Trigger old_trigger exists in prod_schema but not in dev_schema'
      );
      expect(result).toContain(
        '-- Creating trigger new_trigger in prod_schema'
      );
    });

    it('should handle triggers on different tables', async () => {
      const sourceTriggers = [
        {
          trigger_name: 'user_trigger',
          event_manipulation: 'INSERT',
          event_object_table: 'users',
          action_timing: 'AFTER',
          action_statement: 'EXECUTE FUNCTION log_user_creation()',
        },
        {
          trigger_name: 'order_trigger',
          event_manipulation: 'INSERT',
          event_object_table: 'orders',
          action_timing: 'AFTER',
          action_statement: 'EXECUTE FUNCTION log_order_creation()',
        },
      ];
      const targetTriggers = [];

      const mockTriggerDefinitions = [
        {
          trigger_name: 'user_trigger',
          event_manipulation: 'INSERT',
          event_object_table: 'users',
          action_timing: 'AFTER',
          action_statement: 'EXECUTE FUNCTION log_user_creation()',
          action_orientation: 'ROW',
          action_condition: null,
        },
        {
          trigger_name: 'order_trigger',
          event_manipulation: 'INSERT',
          event_object_table: 'orders',
          action_timing: 'AFTER',
          action_statement: 'EXECUTE FUNCTION log_order_creation()',
          action_orientation: 'ROW',
          action_condition: null,
        },
      ];

      // Mock the query to return different results for source and target calls
      let callCount = 0;
      mockClient.query = () => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({ rows: sourceTriggers });
        } else if (callCount === 2) {
          return Promise.resolve({ rows: targetTriggers });
        } else {
          // This is the call to get trigger definition
          const triggerIndex = (callCount - 3) % 2;
          return Promise.resolve({
            rows: [mockTriggerDefinitions[triggerIndex]],
          });
        }
      };

      const result = await triggerOps.generateTriggerOperations();

      expect(result).toContain(
        '-- Creating trigger user_trigger in prod_schema'
      );
      expect(result).toContain(
        '-- Creating trigger order_trigger in prod_schema'
      );
    });

    it('should handle database errors', async () => {
      const error = new Error('Database connection failed');
      mockClient.query.mockRejectedValue(error);

      await expect(triggerOps.generateTriggerOperations()).rejects.toThrow(
        'Database connection failed'
      );
    });
  });

  describe('compareTriggerDefinitions', () => {
    it('should return false for identical trigger definitions', () => {
      const trigger1 = {
        trigger_name: 'test_trigger',
        event_manipulation: 'INSERT',
        action_timing: 'AFTER',
        action_statement: 'EXECUTE FUNCTION test_function()',
        action_orientation: 'ROW',
        action_condition: null,
      };

      const trigger2 = {
        trigger_name: 'test_trigger',
        event_manipulation: 'INSERT',
        action_timing: 'AFTER',
        action_statement: 'EXECUTE FUNCTION test_function()',
        action_orientation: 'ROW',
        action_condition: null,
      };

      const result = triggerOps.compareTriggerDefinitions(trigger1, trigger2);
      expect(result).toBe(false);
    });

    it('should return true for different event manipulation', () => {
      const trigger1 = {
        trigger_name: 'test_trigger',
        event_manipulation: 'INSERT',
        action_timing: 'AFTER',
        action_statement: 'EXECUTE FUNCTION test_function()',
        action_orientation: 'ROW',
        action_condition: null,
      };

      const trigger2 = {
        trigger_name: 'test_trigger',
        event_manipulation: 'UPDATE',
        action_timing: 'AFTER',
        action_statement: 'EXECUTE FUNCTION test_function()',
        action_orientation: 'ROW',
        action_condition: null,
      };

      const result = triggerOps.compareTriggerDefinitions(trigger1, trigger2);
      expect(result).toBe(true);
    });

    it('should return true for different action timing', () => {
      const trigger1 = {
        trigger_name: 'test_trigger',
        event_manipulation: 'INSERT',
        action_timing: 'AFTER',
        action_statement: 'EXECUTE FUNCTION test_function()',
        action_orientation: 'ROW',
        action_condition: null,
      };

      const trigger2 = {
        trigger_name: 'test_trigger',
        event_manipulation: 'INSERT',
        action_timing: 'BEFORE',
        action_statement: 'EXECUTE FUNCTION test_function()',
        action_orientation: 'ROW',
        action_condition: null,
      };

      const result = triggerOps.compareTriggerDefinitions(trigger1, trigger2);
      expect(result).toBe(true);
    });

    it('should return true for different action statements', () => {
      const trigger1 = {
        trigger_name: 'test_trigger',
        event_manipulation: 'INSERT',
        action_timing: 'AFTER',
        action_statement: 'EXECUTE FUNCTION test_function()',
        action_orientation: 'ROW',
        action_condition: null,
      };

      const trigger2 = {
        trigger_name: 'test_trigger',
        event_manipulation: 'INSERT',
        action_timing: 'AFTER',
        action_statement: 'EXECUTE FUNCTION other_function()',
        action_orientation: 'ROW',
        action_condition: null,
      };

      const result = triggerOps.compareTriggerDefinitions(trigger1, trigger2);
      expect(result).toBe(true);
    });

    it('should return true for different action orientation', () => {
      const trigger1 = {
        trigger_name: 'test_trigger',
        event_manipulation: 'INSERT',
        action_timing: 'AFTER',
        action_statement: 'EXECUTE FUNCTION test_function()',
        action_orientation: 'ROW',
        action_condition: null,
      };

      const trigger2 = {
        trigger_name: 'test_trigger',
        event_manipulation: 'INSERT',
        action_timing: 'AFTER',
        action_statement: 'EXECUTE FUNCTION test_function()',
        action_orientation: 'STATEMENT',
        action_condition: null,
      };

      const result = triggerOps.compareTriggerDefinitions(trigger1, trigger2);
      expect(result).toBe(true);
    });

    it('should return true for different action conditions', () => {
      const trigger1 = {
        trigger_name: 'test_trigger',
        event_manipulation: 'INSERT',
        action_timing: 'AFTER',
        action_statement: 'EXECUTE FUNCTION test_function()',
        action_orientation: 'ROW',
        action_condition: null,
      };

      const trigger2 = {
        trigger_name: 'test_trigger',
        event_manipulation: 'INSERT',
        action_timing: 'AFTER',
        action_statement: 'EXECUTE FUNCTION test_function()',
        action_orientation: 'ROW',
        action_condition: 'NEW.status = "active"',
      };

      const result = triggerOps.compareTriggerDefinitions(trigger1, trigger2);
      expect(result).toBe(true);
    });

    it('should return false if either trigger is null', () => {
      const trigger1 = {
        trigger_name: 'test_trigger',
        event_manipulation: 'INSERT',
        action_timing: 'AFTER',
        action_statement: 'EXECUTE FUNCTION test_function()',
        action_orientation: 'ROW',
        action_condition: null,
      };

      const result1 = triggerOps.compareTriggerDefinitions(trigger1, null);
      const result2 = triggerOps.compareTriggerDefinitions(null, trigger1);
      const result3 = triggerOps.compareTriggerDefinitions(null, null);

      expect(result1).toBe(false);
      expect(result2).toBe(false);
      expect(result3).toBe(false);
    });
  });

  describe('handleTriggersToUpdate', () => {
    it('should handle triggers that have changed', async () => {
      const sourceTriggers = [
        {
          trigger_name: 'test_trigger',
          event_manipulation: 'INSERT',
          event_object_table: 'test_table',
          action_timing: 'AFTER',
          action_statement: 'EXECUTE FUNCTION new_function()',
          action_orientation: 'ROW',
          action_condition: null,
        },
      ];

      const targetTriggers = [
        {
          trigger_name: 'test_trigger',
          event_manipulation: 'INSERT',
          event_object_table: 'test_table',
          action_timing: 'AFTER',
          action_statement: 'EXECUTE FUNCTION old_function()',
          action_orientation: 'ROW',
          action_condition: null,
        },
      ];

      // Mock the getTriggerDefinition calls - different data for source vs target
      const sourceTriggerDefinition = {
        trigger_name: 'test_trigger',
        event_manipulation: 'INSERT',
        event_object_table: 'test_table',
        action_timing: 'AFTER',
        action_statement: 'EXECUTE FUNCTION new_function()',
        action_orientation: 'ROW',
        action_condition: null,
      };

      const targetTriggerDefinition = {
        trigger_name: 'test_trigger',
        event_manipulation: 'INSERT',
        event_object_table: 'test_table',
        action_timing: 'AFTER',
        action_statement: 'EXECUTE FUNCTION old_function()',
        action_orientation: 'ROW',
        action_condition: null,
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [sourceTriggerDefinition] })
        .mockResolvedValueOnce({ rows: [targetTriggerDefinition] })
        .mockResolvedValueOnce({ rows: [sourceTriggerDefinition] }); // For CREATE statement generation

      const alterStatements = [];
      await triggerOps.handleTriggersToUpdate(
        sourceTriggers,
        targetTriggers,
        alterStatements
      );

      expect(alterStatements).toContain(
        '-- Trigger test_trigger has changed, updating in prod_schema'
      );
      expect(
        alterStatements.some(line =>
          line.includes('-- Renaming old trigger to test_trigger_old_')
        )
      ).toBe(true);
      expect(
        alterStatements.some(line =>
          line.includes(
            'ALTER TRIGGER test_trigger ON prod_schema.test_table RENAME TO test_trigger_old_'
          )
        )
      ).toBe(true);
      expect(
        alterStatements.some(line =>
          line.includes('CREATE TRIGGER test_trigger')
        )
      ).toBe(true);
    });

    it('should not handle triggers that are identical', async () => {
      const sourceTriggers = [
        {
          trigger_name: 'test_trigger',
          event_manipulation: 'INSERT',
          action_timing: 'AFTER',
          action_statement: 'EXECUTE FUNCTION test_function()',
          action_orientation: 'ROW',
          action_condition: null,
        },
      ];

      const targetTriggers = [
        {
          trigger_name: 'test_trigger',
          event_manipulation: 'INSERT',
          action_timing: 'AFTER',
          action_statement: 'EXECUTE FUNCTION test_function()',
          action_orientation: 'ROW',
          action_condition: null,
        },
      ];

      // Mock the getTriggerDefinition calls - same data for both source and target
      const identicalTriggerDefinition = {
        trigger_name: 'test_trigger',
        event_manipulation: 'INSERT',
        event_object_table: 'test_table',
        action_timing: 'AFTER',
        action_statement: 'EXECUTE FUNCTION test_function()',
        action_orientation: 'ROW',
        action_condition: null,
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [identicalTriggerDefinition] })
        .mockResolvedValueOnce({ rows: [identicalTriggerDefinition] });

      const alterStatements = [];
      await triggerOps.handleTriggersToUpdate(
        sourceTriggers,
        targetTriggers,
        alterStatements
      );

      expect(alterStatements).toEqual([]);
    });

    it('should handle multiple changed triggers', async () => {
      const sourceTriggers = [
        {
          trigger_name: 'trigger1',
          event_manipulation: 'INSERT',
          event_object_table: 'table1',
          action_timing: 'AFTER',
          action_statement: 'EXECUTE FUNCTION new_function1()',
          action_orientation: 'ROW',
          action_condition: null,
        },
        {
          trigger_name: 'trigger2',
          event_manipulation: 'UPDATE',
          event_object_table: 'table2',
          action_timing: 'BEFORE',
          action_statement: 'EXECUTE FUNCTION new_function2()',
          action_orientation: 'ROW',
          action_condition: null,
        },
      ];

      const targetTriggers = [
        {
          trigger_name: 'trigger1',
          event_manipulation: 'INSERT',
          event_object_table: 'table1',
          action_timing: 'AFTER',
          action_statement: 'EXECUTE FUNCTION old_function1()',
          action_orientation: 'ROW',
          action_condition: null,
        },
        {
          trigger_name: 'trigger2',
          event_manipulation: 'UPDATE',
          event_object_table: 'table2',
          action_timing: 'BEFORE',
          action_statement: 'EXECUTE FUNCTION old_function2()',
          action_orientation: 'ROW',
          action_condition: null,
        },
      ];

      const mockTriggerDefinition1 = {
        trigger_name: 'trigger1',
        event_manipulation: 'INSERT',
        event_object_table: 'table1',
        action_timing: 'AFTER',
        action_statement: 'EXECUTE FUNCTION new_function1()',
        action_orientation: 'ROW',
        action_condition: null,
      };

      const mockTriggerDefinition2 = {
        trigger_name: 'trigger2',
        event_manipulation: 'UPDATE',
        event_object_table: 'table2',
        action_timing: 'BEFORE',
        action_statement: 'EXECUTE FUNCTION new_function2()',
        action_orientation: 'ROW',
        action_condition: null,
      };

      // Mock the getTriggerDefinition calls - 4 calls total (2 for comparison + 2 for CREATE)
      mockClient.query
        .mockResolvedValueOnce({ rows: [mockTriggerDefinition1] }) // source trigger1
        .mockResolvedValueOnce({ rows: [mockTriggerDefinition2] }) // target trigger1 (different)
        .mockResolvedValueOnce({ rows: [mockTriggerDefinition1] }) // source trigger2
        .mockResolvedValueOnce({ rows: [mockTriggerDefinition2] }) // target trigger2 (different)
        .mockResolvedValueOnce({ rows: [mockTriggerDefinition1] }) // CREATE trigger1
        .mockResolvedValueOnce({ rows: [mockTriggerDefinition2] }); // CREATE trigger2

      const alterStatements = [];
      await triggerOps.handleTriggersToUpdate(
        sourceTriggers,
        targetTriggers,
        alterStatements
      );

      expect(
        alterStatements.filter(
          line => line.includes('-- Trigger') && line.includes('has changed')
        ).length
      ).toBe(2);
      expect(
        alterStatements.filter(
          line => line.includes('ALTER TRIGGER') && line.includes('RENAME TO')
        ).length
      ).toBe(2);
      expect(
        alterStatements.filter(line => line.includes('CREATE TRIGGER')).length
      ).toBe(2);
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle null trigger names', async () => {
      const sourceTriggers = [
        {
          trigger_name: null,
          event_manipulation: 'INSERT',
          event_object_table: 'users',
          action_timing: 'AFTER',
          action_statement: 'EXECUTE FUNCTION log_user_creation()',
        },
      ];
      const targetTriggers = [];

      mockClient.query
        .mockResolvedValueOnce({ rows: sourceTriggers })
        .mockResolvedValueOnce({ rows: targetTriggers });

      const result = await triggerOps.generateTriggerOperations();
      expect(result).toBeDefined();
    });

    it('should handle triggers with very long names', async () => {
      const longTriggerName = 'a'.repeat(100);
      const sourceTriggers = [
        {
          trigger_name: longTriggerName,
          event_manipulation: 'INSERT',
          event_object_table: 'users',
          action_timing: 'AFTER',
          action_statement: 'EXECUTE FUNCTION log_user_creation()',
        },
      ];
      const targetTriggers = [];

      mockClient.query
        .mockResolvedValueOnce({ rows: sourceTriggers })
        .mockResolvedValueOnce({ rows: targetTriggers });

      const result = await triggerOps.generateTriggerOperations();

      expect(result).toContain(
        `-- Creating trigger ${longTriggerName} in prod_schema`
      );
    });

    it('should handle malformed trigger data', async () => {
      const sourceTriggers = [
        {
          trigger_name: 'test_trigger',
          // missing other properties
        },
      ];
      const targetTriggers = [];

      mockClient.query
        .mockResolvedValueOnce({ rows: sourceTriggers })
        .mockResolvedValueOnce({ rows: targetTriggers });

      // Should not throw, but may produce unexpected results
      const result = await triggerOps.generateTriggerOperations();
      expect(result).toBeDefined();
    });

    it('should handle triggers with special characters in names', async () => {
      const sourceTriggers = [
        {
          trigger_name: 'update_user-table_with.special@chars',
          event_manipulation: 'UPDATE',
          event_object_table: 'user-table_with.special@chars',
          action_timing: 'BEFORE',
          action_statement: 'EXECUTE FUNCTION update_modified_column()',
        },
      ];
      const targetTriggers = [];

      mockClient.query
        .mockResolvedValueOnce({ rows: sourceTriggers })
        .mockResolvedValueOnce({ rows: targetTriggers });

      const result = await triggerOps.generateTriggerOperations();

      expect(result).toContain(
        '-- Creating trigger update_user-table_with.special@chars in prod_schema'
      );
    });

    it('should handle triggers with null event object table', async () => {
      const sourceTriggers = [
        {
          trigger_name: 'test_trigger',
          event_manipulation: 'INSERT',
          event_object_table: null,
          action_timing: 'AFTER',
          action_statement: 'EXECUTE FUNCTION test_function()',
        },
      ];
      const targetTriggers = [];

      mockClient.query
        .mockResolvedValueOnce({ rows: sourceTriggers })
        .mockResolvedValueOnce({ rows: targetTriggers });

      const result = await triggerOps.generateTriggerOperations();

      expect(result).toContain(
        '-- Creating trigger test_trigger in prod_schema'
      );
    });

    it('should handle triggers with null action statement', async () => {
      const sourceTriggers = [
        {
          trigger_name: 'test_trigger',
          event_manipulation: 'INSERT',
          event_object_table: 'users',
          action_timing: 'AFTER',
          action_statement: null,
        },
      ];
      const targetTriggers = [];

      mockClient.query
        .mockResolvedValueOnce({ rows: sourceTriggers })
        .mockResolvedValueOnce({ rows: targetTriggers });

      const result = await triggerOps.generateTriggerOperations();

      expect(result).toContain(
        '-- Creating trigger test_trigger in prod_schema'
      );
    });

    it('should handle triggers with null event manipulation', async () => {
      const sourceTriggers = [
        {
          trigger_name: 'test_trigger',
          event_manipulation: null,
          event_object_table: 'users',
          action_timing: 'AFTER',
          action_statement: 'EXECUTE FUNCTION test_function()',
        },
      ];
      const targetTriggers = [];

      mockClient.query
        .mockResolvedValueOnce({ rows: sourceTriggers })
        .mockResolvedValueOnce({ rows: targetTriggers });

      const result = await triggerOps.generateTriggerOperations();

      expect(result).toContain(
        '-- Creating trigger test_trigger in prod_schema'
      );
    });

    it('should handle triggers with null action timing', async () => {
      const sourceTriggers = [
        {
          trigger_name: 'test_trigger',
          event_manipulation: 'INSERT',
          event_object_table: 'users',
          action_timing: null,
          action_statement: 'EXECUTE FUNCTION test_function()',
        },
      ];
      const targetTriggers = [];

      mockClient.query
        .mockResolvedValueOnce({ rows: sourceTriggers })
        .mockResolvedValueOnce({ rows: targetTriggers });

      const result = await triggerOps.generateTriggerOperations();

      expect(result).toContain(
        '-- Creating trigger test_trigger in prod_schema'
      );
    });
  });
});
