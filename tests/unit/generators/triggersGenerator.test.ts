/**
 * Unit tests for triggers generator
 */

import {
  createMockConnection,
  createMockGeneratorOptions,
  createMockTriggerData,
} from '@/fixtures/generatorTestUtils';
import { createMockClient } from '@/fixtures/testUtils';
import { TriggersGenerator } from '@/generators/triggersGenerator';
import type { ITriggerDefinition } from '@/types';

// Mock the IntrospectionService constructor
const mockIntrospectionService = {
  getTables: () => Promise.resolve([]),
  getAllTablesComplete: () => Promise.resolve([]),
  getFunctions: () => Promise.resolve([]),
  getTriggers: () => Promise.resolve([]),
};

describe('Triggers Generator', () => {
  let mockClient: ReturnType<typeof createMockClient>;
  let mockConnection: ReturnType<typeof createMockConnection>;
  let mockOptions: ReturnType<typeof createMockGeneratorOptions>;

  beforeEach(() => {
    mockClient = createMockClient();
    mockConnection = createMockConnection();
    mockOptions = createMockGeneratorOptions();
  });

  describe('constructor', () => {
    it('should initialize with client, connection, and options', () => {
      const generator = new TriggersGenerator(
        mockClient,
        mockConnection,
        mockOptions
      );

      expect(generator).toBeInstanceOf(TriggersGenerator);
    });
  });

  describe('getGeneratorName', () => {
    it('should return correct generator name', () => {
      const generator = new TriggersGenerator(
        mockClient,
        mockConnection,
        mockOptions
      );
      const name = (generator as any).getGeneratorName();

      expect(name).toBe('Triggers Generator');
    });
  });

  describe('shouldSkip', () => {
    it('should not skip when no filter options are set', () => {
      const generator = new TriggersGenerator(
        mockClient,
        mockConnection,
        mockOptions
      );
      const shouldSkip = (
        generator as unknown as { shouldSkip: () => boolean }
      ).shouldSkip();

      expect(shouldSkip).toBe(false);
    });

    it('should skip when schemaOnly is true', () => {
      const optionsWithSchemaOnly = { ...mockOptions, schemaOnly: true };
      const generator = new TriggersGenerator(
        mockClient,
        mockConnection,
        optionsWithSchemaOnly
      );
      const shouldSkip = (
        generator as unknown as { shouldSkip: () => boolean }
      ).shouldSkip();

      expect(shouldSkip).toBe(true);
    });

    it('should skip when procsOnly is true', () => {
      const optionsWithProcsOnly = { ...mockOptions, procsOnly: true };
      const generator = new TriggersGenerator(
        mockClient,
        mockConnection,
        optionsWithProcsOnly
      );
      const shouldSkip = (
        generator as unknown as { shouldSkip: () => boolean }
      ).shouldSkip();

      expect(shouldSkip).toBe(true);
    });

    it('should not skip when triggersOnly is true', () => {
      const optionsWithTriggersOnly = { ...mockOptions, triggersOnly: true };
      const generator = new TriggersGenerator(
        mockClient,
        mockConnection,
        optionsWithTriggersOnly
      );
      const shouldSkip = (
        generator as unknown as { shouldSkip: () => boolean }
      ).shouldSkip();

      expect(shouldSkip).toBe(false);
    });
  });

  describe('validateData', () => {
    it('should not throw error when no triggers found', async () => {
      mockIntrospectionService.getTriggers = () => Promise.resolve([]);

      const generator = new TriggersGenerator(
        mockClient,
        mockConnection,
        mockOptions
      );

      await expect(
        (
          generator as unknown as { validateData: () => Promise<void> }
        ).validateData()
      ).resolves.not.toThrow();
    });

    it('should not throw when triggers are found', async () => {
      // Mock the client query to return trigger data
      mockClient.query.mockResolvedValue({
        rows: [
          {
            trigger_name: 'test_trigger',
            event_object_table: 'test_table',
          },
        ],
      });

      const generator = new TriggersGenerator(
        mockClient,
        mockConnection,
        mockOptions
      );

      await expect(
        (
          generator as unknown as { validateData: () => Promise<void> }
        ).validateData()
      ).resolves.not.toThrow();
    });
  });

  describe('generate', () => {
    it('should generate triggers.sql file with triggers', async () => {
      const generator = new TriggersGenerator(
        mockClient,
        mockConnection,
        mockOptions
      );

      // Mock the introspection service directly
      (generator as any).introspection = {
        getTriggers: () => Promise.resolve([createMockTriggerData()]),
      };

      const result = await (generator as any).generate();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('triggers.sql');
      expect(result[0].content).toContain('-- TRIGGERS');
      expect(result[0].content).toContain('test_trigger');
    });

    it('should handle triggers without conditions', async () => {
      const generator = new TriggersGenerator(
        mockClient,
        mockConnection,
        mockOptions
      );

      // Mock the introspection service directly
      (generator as any).introspection = {
        getTriggers: () =>
          Promise.resolve([
            createMockTriggerData({
              trigger_name: 'simple_trigger',
              action_condition: null,
            }),
          ]),
      };

      const result = await (generator as any).generate();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('triggers.sql');
      expect(result[0].content).toContain('simple_trigger');
    });
  });

  describe('data conversion methods', () => {
    let generator: TriggersGenerator;

    beforeEach(() => {
      generator = new TriggersGenerator(
        mockClient,
        mockConnection,
        mockOptions
      );
    });

    describe('convertToTriggerDefinition', () => {
      it('should convert trigger data correctly', () => {
        const triggerData = {
          trigger_name: 'test_trigger',
          event_object_table: 'test_table',
          event_manipulation: 'INSERT',
          action_timing: 'BEFORE',
          action_statement: 'test_function()',
          action_condition: 'NEW.id > 0',
        };

        const result = (
          generator as unknown as {
            convertToTriggerDefinition: (trigger: any) => ITriggerDefinition;
          }
        ).convertToTriggerDefinition(triggerData);

        expect(result.name).toBe('test_trigger');
        expect(result.table).toBe('test_table');
        expect(result.schema).toBe('public');
        expect(result.event).toBe('INSERT');
        expect(result.timing).toBe('BEFORE');
        expect(result.function).toBe('test_function');
        expect(result.condition).toBe('NEW.id > 0');
        expect(result.comment).toBeUndefined();
      });

      it('should handle trigger without condition', () => {
        const triggerData = {
          trigger_name: 'simple_trigger',
          event_object_table: 'test_table',
          event_manipulation: 'UPDATE',
          action_timing: 'AFTER',
          action_statement: 'simple_function()',
          action_condition: null,
        };

        const result = (
          generator as unknown as {
            convertToTriggerDefinition: (trigger: any) => ITriggerDefinition;
          }
        ).convertToTriggerDefinition(triggerData);

        expect(result.name).toBe('simple_trigger');
        expect(result.condition).toBeUndefined();
      });

      it('should handle trigger without action statement', () => {
        const triggerData = {
          trigger_name: 'test_trigger',
          event_object_table: 'test_table',
          event_manipulation: 'DELETE',
          action_timing: 'BEFORE',
          action_statement: null,
          action_condition: null,
        };

        const result = (
          generator as unknown as {
            convertToTriggerDefinition: (trigger: any) => ITriggerDefinition;
          }
        ).convertToTriggerDefinition(triggerData);

        expect(result.name).toBe('test_trigger');
        expect(result.function).toBe('unknown_function');
      });
    });
  });

  describe('SQL generation methods', () => {
    let generator: TriggersGenerator;

    beforeEach(() => {
      generator = new TriggersGenerator(
        mockClient,
        mockConnection,
        mockOptions
      );
    });

    describe('generateTriggersSQL', () => {
      it('should generate complete triggers SQL', async () => {
        const triggers: ITriggerDefinition[] = [
          {
            name: 'test_trigger',
            table: 'test_table',
            schema: 'public',
            event: 'INSERT',
            timing: 'BEFORE',
            function: 'test_function()',
            condition: undefined,
            comment: undefined,
          },
        ];

        const result = await (
          generator as unknown as {
            generateTriggersSQL: (
              triggers: ITriggerDefinition[]
            ) => Promise<string>;
          }
        ).generateTriggersSQL(triggers);

        expect(result).toContain('-- TRIGGERS');
        expect(result).toContain('-- TRIGGERS FOR TABLE: test_table');
        expect(result).toContain('-- Trigger: test_trigger');
        expect(result).toContain('CREATE TRIGGER test_trigger');
      });
    });

    describe('generateTriggerSQL', () => {
      it('should generate trigger creation SQL', () => {
        const trigger: ITriggerDefinition = {
          name: 'test_trigger',
          table: 'test_table',
          schema: 'public',
          event: 'INSERT',
          timing: 'BEFORE',
          function: 'test_function()',
          condition: 'NEW.id > 0',
          comment: 'Test trigger',
        };

        const result = (
          generator as unknown as {
            generateTriggerSQL: (triggers: ITriggerDefinition[]) => string;
          }
        ).generateTriggerSQL([trigger]);

        expect(result).toContain('-- Trigger: test_trigger');
        expect(result).toContain('-- Test trigger');
        expect(result).toContain('CREATE TRIGGER test_trigger');
        expect(result).toContain('BEFORE INSERT');
        expect(result).toContain('ON public.test_table');
        expect(result).toContain('FOR EACH ROW');
        expect(result).toContain('WHEN (NEW.id > 0)');
        expect(result).toContain(
          'EXECUTE FUNCTION public."test_function()"();'
        );
      });

      it('should generate trigger without condition', () => {
        const trigger: ITriggerDefinition = {
          name: 'simple_trigger',
          table: 'test_table',
          schema: 'public',
          event: 'UPDATE',
          timing: 'AFTER',
          function: 'simple_function()',
          condition: undefined,
        };

        const result = (
          generator as unknown as {
            generateTriggerSQL: (triggers: ITriggerDefinition[]) => string;
          }
        ).generateTriggerSQL([trigger]);

        expect(result).toContain('CREATE TRIGGER simple_trigger');
        expect(result).toContain('AFTER UPDATE');
        expect(result).toContain('ON public.test_table');
        expect(result).toContain('FOR EACH ROW');
        expect(result).not.toContain('WHEN');
        expect(result).toContain(
          'EXECUTE FUNCTION public."simple_function()"();'
        );
      });
    });

    describe('groupTriggersByTable', () => {
      it('should group triggers by table name', () => {
        const triggers: ITriggerDefinition[] = [
          {
            name: 'trigger1',
            table: 'table1',
            schema: 'public',
            event: 'INSERT',
            timing: 'BEFORE',
            function: 'func1()',
            condition: undefined,
            comment: undefined,
          },
          {
            name: 'trigger2',
            table: 'table1',
            schema: 'public',
            event: 'UPDATE',
            timing: 'AFTER',
            function: 'func2()',
            condition: undefined,
            comment: undefined,
          },
          {
            name: 'trigger3',
            table: 'table2',
            schema: 'public',
            event: 'DELETE',
            timing: 'BEFORE',
            function: 'func3()',
            condition: undefined,
            comment: undefined,
          },
        ];

        const result = (generator as any).groupTriggersByTable(triggers);

        expect(result.size).toBe(2);
        expect(result.get('table1')).toHaveLength(2);
        expect(result.get('table2')).toHaveLength(1);
        expect(result.get('table1')[0].name).toBe('trigger1');
        expect(result.get('table1')[1].name).toBe('trigger2');
        expect(result.get('table2')[0].name).toBe('trigger3');
      });
    });
  });
});
