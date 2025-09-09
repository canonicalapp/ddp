/**
 * Unit tests for TriggerOperations module
 */

import { TriggerOperations } from '../../modules/triggerOperations.js';

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
      const mockTriggers = [
        {
          trigger_name: 'update_user_timestamp',
          event_manipulation: 'UPDATE',
          event_object_table: 'users',
          action_timing: 'BEFORE',
          action_statement: 'EXECUTE FUNCTION update_modified_column()',
        },
        {
          trigger_name: 'audit_user_changes',
          event_manipulation: 'INSERT',
          event_object_table: 'users',
          action_timing: 'AFTER',
          action_statement: 'EXECUTE FUNCTION audit_user_changes()',
        },
      ];

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
      const mockTriggers = [
        {
          trigger_name: 'update_user-table_with.special@chars',
          event_manipulation: 'UPDATE',
          event_object_table: 'user-table_with.special@chars',
          action_timing: 'BEFORE',
          action_statement: 'EXECUTE FUNCTION update_modified_column()',
        },
      ];

      mockClient.query.mockResolvedValue({ rows: mockTriggers });

      const result = await triggerOps.getTriggers('test_schema');

      expect(result).toEqual(mockTriggers);
    });
  });

  describe('generateTriggerOperations', () => {
    it('should handle triggers to drop in production', async () => {
      const devTriggers = [
        {
          trigger_name: 'update_user_timestamp',
          event_manipulation: 'UPDATE',
          event_object_table: 'users',
          action_timing: 'BEFORE',
          action_statement: 'EXECUTE FUNCTION update_modified_column()',
        },
      ];
      const prodTriggers = [
        {
          trigger_name: 'update_user_timestamp',
          event_manipulation: 'UPDATE',
          event_object_table: 'users',
          action_timing: 'BEFORE',
          action_statement: 'EXECUTE FUNCTION update_modified_column()',
        },
        {
          trigger_name: 'old_trigger',
          event_manipulation: 'INSERT',
          event_object_table: 'users',
          action_timing: 'AFTER',
          action_statement: 'EXECUTE FUNCTION old_function()',
        },
      ];

      mockClient.query
        .mockResolvedValueOnce({ rows: devTriggers })
        .mockResolvedValueOnce({ rows: prodTriggers });

      const result = await triggerOps.generateTriggerOperations();

      expect(result).toContain(
        '-- Trigger old_trigger exists in prod but not in dev'
      );
      expect(result).toContain(
        'DROP TRIGGER IF EXISTS old_trigger ON prod_schema.users;'
      );
    });

    it('should handle triggers to create in production', async () => {
      const devTriggers = [
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
      const prodTriggers = [
        {
          trigger_name: 'update_user_timestamp',
          event_manipulation: 'UPDATE',
          event_object_table: 'users',
          action_timing: 'BEFORE',
          action_statement: 'EXECUTE FUNCTION update_modified_column()',
        },
      ];

      mockClient.query
        .mockResolvedValueOnce({ rows: devTriggers })
        .mockResolvedValueOnce({ rows: prodTriggers });

      const result = await triggerOps.generateTriggerOperations();

      expect(result).toContain('-- TODO: Create trigger new_trigger in prod');
      expect(result).toContain('-- Trigger: AFTER INSERT ON orders');
      expect(result).toContain(
        '-- Action: EXECUTE FUNCTION log_order_creation()'
      );
    });

    it('should handle triggers with different event manipulations', async () => {
      const devTriggers = [
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
      const prodTriggers = [];

      mockClient.query
        .mockResolvedValueOnce({ rows: devTriggers })
        .mockResolvedValueOnce({ rows: prodTriggers });

      const result = await triggerOps.generateTriggerOperations();

      expect(result).toContain('-- Trigger: BEFORE INSERT ON users');
      expect(result).toContain('-- Trigger: AFTER UPDATE ON users');
      expect(result).toContain('-- Trigger: BEFORE DELETE ON users');
    });

    it('should handle triggers with different action timings', async () => {
      const devTriggers = [
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
      const prodTriggers = [];

      mockClient.query
        .mockResolvedValueOnce({ rows: devTriggers })
        .mockResolvedValueOnce({ rows: prodTriggers });

      const result = await triggerOps.generateTriggerOperations();

      expect(result).toContain('-- Trigger: BEFORE INSERT ON users');
      expect(result).toContain('-- Trigger: AFTER INSERT ON users');
    });

    it('should handle identical trigger schemas', async () => {
      const devTriggers = [
        {
          trigger_name: 'update_user_timestamp',
          event_manipulation: 'UPDATE',
          event_object_table: 'users',
          action_timing: 'BEFORE',
          action_statement: 'EXECUTE FUNCTION update_modified_column()',
        },
      ];
      const prodTriggers = [
        {
          trigger_name: 'update_user_timestamp',
          event_manipulation: 'UPDATE',
          event_object_table: 'users',
          action_timing: 'BEFORE',
          action_statement: 'EXECUTE FUNCTION update_modified_column()',
        },
      ];

      mockClient.query
        .mockResolvedValueOnce({ rows: devTriggers })
        .mockResolvedValueOnce({ rows: prodTriggers });

      const result = await triggerOps.generateTriggerOperations();

      expect(result).not.toContain('-- TODO: Create trigger');
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
      const devTriggers = [
        {
          trigger_name: 'update_user_timestamp',
          event_manipulation: 'UPDATE',
          event_object_table: 'users',
          action_timing: 'BEFORE',
          action_statement: 'EXECUTE FUNCTION update_modified_column()',
        },
      ];
      const prodTriggers = [
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
        .mockResolvedValueOnce({ rows: devTriggers })
        .mockResolvedValueOnce({ rows: prodTriggers });

      const result = await triggerOps.generateTriggerOperations();

      expect(
        result.filter(
          line =>
            line.includes('-- Trigger') &&
            line.includes('exists in prod but not in dev')
        ).length
      ).toBe(2);
      expect(
        result.filter(line => line.includes('DROP TRIGGER IF EXISTS')).length
      ).toBe(2);
    });

    it('should handle multiple triggers to create', async () => {
      const devTriggers = [
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
      const prodTriggers = [
        {
          trigger_name: 'update_user_timestamp',
          event_manipulation: 'UPDATE',
          event_object_table: 'users',
          action_timing: 'BEFORE',
          action_statement: 'EXECUTE FUNCTION update_modified_column()',
        },
      ];

      mockClient.query
        .mockResolvedValueOnce({ rows: devTriggers })
        .mockResolvedValueOnce({ rows: prodTriggers });

      const result = await triggerOps.generateTriggerOperations();

      expect(
        result.filter(line => line.includes('-- TODO: Create trigger')).length
      ).toBe(2);
    });

    it('should handle mixed trigger operations', async () => {
      const devTriggers = [
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
      const prodTriggers = [
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

      mockClient.query
        .mockResolvedValueOnce({ rows: devTriggers })
        .mockResolvedValueOnce({ rows: prodTriggers });

      const result = await triggerOps.generateTriggerOperations();

      // Should handle both trigger to drop and trigger to create
      expect(result).toContain(
        '-- Trigger old_trigger exists in prod but not in dev'
      );
      expect(result).toContain('-- TODO: Create trigger new_trigger in prod');
    });

    it('should handle triggers on different tables', async () => {
      const devTriggers = [
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
      const prodTriggers = [];

      mockClient.query
        .mockResolvedValueOnce({ rows: devTriggers })
        .mockResolvedValueOnce({ rows: prodTriggers });

      const result = await triggerOps.generateTriggerOperations();

      expect(result).toContain('-- Trigger: AFTER INSERT ON users');
      expect(result).toContain('-- Trigger: AFTER INSERT ON orders');
    });

    it('should handle database errors', async () => {
      const error = new Error('Database connection failed');
      mockClient.query.mockRejectedValue(error);

      await expect(triggerOps.generateTriggerOperations()).rejects.toThrow(
        'Database connection failed'
      );
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle null trigger names', async () => {
      const devTriggers = [
        {
          trigger_name: null,
          event_manipulation: 'INSERT',
          event_object_table: 'users',
          action_timing: 'AFTER',
          action_statement: 'EXECUTE FUNCTION log_user_creation()',
        },
      ];
      const prodTriggers = [];

      mockClient.query
        .mockResolvedValueOnce({ rows: devTriggers })
        .mockResolvedValueOnce({ rows: prodTriggers });

      const result = await triggerOps.generateTriggerOperations();
      expect(result).toBeDefined();
    });

    it('should handle triggers with very long names', async () => {
      const longTriggerName = 'a'.repeat(100);
      const devTriggers = [
        {
          trigger_name: longTriggerName,
          event_manipulation: 'INSERT',
          event_object_table: 'users',
          action_timing: 'AFTER',
          action_statement: 'EXECUTE FUNCTION log_user_creation()',
        },
      ];
      const prodTriggers = [];

      mockClient.query
        .mockResolvedValueOnce({ rows: devTriggers })
        .mockResolvedValueOnce({ rows: prodTriggers });

      const result = await triggerOps.generateTriggerOperations();

      expect(result).toContain(
        `-- TODO: Create trigger ${longTriggerName} in prod`
      );
    });

    it('should handle malformed trigger data', async () => {
      const devTriggers = [
        {
          trigger_name: 'test_trigger',
          // missing other properties
        },
      ];
      const prodTriggers = [];

      mockClient.query
        .mockResolvedValueOnce({ rows: devTriggers })
        .mockResolvedValueOnce({ rows: prodTriggers });

      // Should not throw, but may produce unexpected results
      const result = await triggerOps.generateTriggerOperations();
      expect(result).toBeDefined();
    });

    it('should handle triggers with special characters in names', async () => {
      const devTriggers = [
        {
          trigger_name: 'update_user-table_with.special@chars',
          event_manipulation: 'UPDATE',
          event_object_table: 'user-table_with.special@chars',
          action_timing: 'BEFORE',
          action_statement: 'EXECUTE FUNCTION update_modified_column()',
        },
      ];
      const prodTriggers = [];

      mockClient.query
        .mockResolvedValueOnce({ rows: devTriggers })
        .mockResolvedValueOnce({ rows: prodTriggers });

      const result = await triggerOps.generateTriggerOperations();

      expect(result).toContain(
        '-- TODO: Create trigger update_user-table_with.special@chars in prod'
      );
      expect(result).toContain(
        '-- Trigger: BEFORE UPDATE ON user-table_with.special@chars'
      );
    });

    it('should handle triggers with null event object table', async () => {
      const devTriggers = [
        {
          trigger_name: 'test_trigger',
          event_manipulation: 'INSERT',
          event_object_table: null,
          action_timing: 'AFTER',
          action_statement: 'EXECUTE FUNCTION test_function()',
        },
      ];
      const prodTriggers = [];

      mockClient.query
        .mockResolvedValueOnce({ rows: devTriggers })
        .mockResolvedValueOnce({ rows: prodTriggers });

      const result = await triggerOps.generateTriggerOperations();

      expect(result).toContain('-- TODO: Create trigger test_trigger in prod');
      expect(result).toContain('-- Trigger: AFTER INSERT ON null');
    });

    it('should handle triggers with null action statement', async () => {
      const devTriggers = [
        {
          trigger_name: 'test_trigger',
          event_manipulation: 'INSERT',
          event_object_table: 'users',
          action_timing: 'AFTER',
          action_statement: null,
        },
      ];
      const prodTriggers = [];

      mockClient.query
        .mockResolvedValueOnce({ rows: devTriggers })
        .mockResolvedValueOnce({ rows: prodTriggers });

      const result = await triggerOps.generateTriggerOperations();

      expect(result).toContain('-- TODO: Create trigger test_trigger in prod');
      expect(result).toContain('-- Action: null');
    });

    it('should handle triggers with null event manipulation', async () => {
      const devTriggers = [
        {
          trigger_name: 'test_trigger',
          event_manipulation: null,
          event_object_table: 'users',
          action_timing: 'AFTER',
          action_statement: 'EXECUTE FUNCTION test_function()',
        },
      ];
      const prodTriggers = [];

      mockClient.query
        .mockResolvedValueOnce({ rows: devTriggers })
        .mockResolvedValueOnce({ rows: prodTriggers });

      const result = await triggerOps.generateTriggerOperations();

      expect(result).toContain('-- TODO: Create trigger test_trigger in prod');
      expect(result).toContain('-- Trigger: AFTER null ON users');
    });

    it('should handle triggers with null action timing', async () => {
      const devTriggers = [
        {
          trigger_name: 'test_trigger',
          event_manipulation: 'INSERT',
          event_object_table: 'users',
          action_timing: null,
          action_statement: 'EXECUTE FUNCTION test_function()',
        },
      ];
      const prodTriggers = [];

      mockClient.query
        .mockResolvedValueOnce({ rows: devTriggers })
        .mockResolvedValueOnce({ rows: prodTriggers });

      const result = await triggerOps.generateTriggerOperations();

      expect(result).toContain('-- TODO: Create trigger test_trigger in prod');
      expect(result).toContain('-- Trigger: null INSERT ON users');
    });
  });
});
