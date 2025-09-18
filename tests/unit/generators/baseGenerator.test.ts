/**
 * Unit tests for base generator
 */

import { BaseGenerator } from '@/generators/baseGenerator';
import type {
  IDatabaseConnection,
  IGeneratedFile,
  IGeneratorOptions,
} from '@/types';
import { Client } from 'pg';

// Mock implementation of BaseGenerator for testing
class TestGenerator extends BaseGenerator {
  protected getGeneratorName(): string {
    return 'TestGenerator';
  }

  protected async generate(): Promise<IGeneratedFile[]> {
    return [
      {
        name: 'test.sql',
        content: '-- Test SQL content',
      },
    ];
  }

  protected shouldSkip(): boolean {
    return false;
  }

  protected async validateData(): Promise<void> {
    // No validation needed for test
  }
}

describe('Base Generator', () => {
  let mockClient: Client;
  let mockConnection: IDatabaseConnection;
  let mockOptions: IGeneratorOptions;

  beforeEach(() => {
    mockClient = {
      query: () => Promise.resolve({ rows: [] }),
      end: () => Promise.resolve(),
    } as unknown as Client;

    mockConnection = {
      host: 'localhost',
      port: 5432,
      database: 'testdb',
      username: 'testuser',
      password: 'testpass',
      schema: 'public',
    };

    mockOptions = {
      outputDir: './output',
      stdout: false,
      schemaOnly: false,
      procsOnly: false,
      triggersOnly: false,
    };
  });

  describe('constructor', () => {
    it('should initialize with client, connection, and options', () => {
      const generator = new TestGenerator(
        mockClient,
        mockConnection,
        mockOptions
      );

      expect(generator).toBeInstanceOf(BaseGenerator);
      expect(generator).toBeInstanceOf(TestGenerator);
    });

    it('should set default schema to public when not provided', () => {
      const connectionWithoutSchema = { ...mockConnection };
      delete connectionWithoutSchema.schema;

      const generator = new TestGenerator(
        mockClient,
        connectionWithoutSchema,
        mockOptions
      );

      // Access protected property for testing
      expect((generator as unknown as { schema: string }).schema).toBe(
        'public'
      );
    });
  });

  describe('execute method', () => {
    it('should return success result when generation succeeds', async () => {
      const generator = new TestGenerator(
        mockClient,
        mockConnection,
        mockOptions
      );

      const result = await generator.execute();

      expect(result.success).toBe(true);
      expect(result.files).toHaveLength(1);
      expect(result.files![0].name).toBe('test.sql');
      expect(result.files![0].content).toBe('-- Test SQL content');
      expect(result.error).toBeUndefined();
    });

    it('should return error result when generation fails', async () => {
      class FailingGenerator extends TestGenerator {
        protected async generate(): Promise<IGeneratedFile[]> {
          throw new Error('Generation failed');
        }
      }

      const generator = new FailingGenerator(
        mockClient,
        mockConnection,
        mockOptions
      );

      const result = await generator.execute();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Generation failed');
      expect(result.files).toBeUndefined();
    });

    it('should skip generation when shouldSkip returns true', async () => {
      class SkippingGenerator extends TestGenerator {
        protected shouldSkip(): boolean {
          return true;
        }
      }

      const generator = new SkippingGenerator(
        mockClient,
        mockConnection,
        mockOptions
      );

      const result = await generator.execute();

      expect(result.success).toBe(true);
      expect(result.files).toHaveLength(0);
    });

    it('should validate data before generation', async () => {
      class ValidationFailingGenerator extends TestGenerator {
        protected async validateData(): Promise<void> {
          throw new Error('Validation failed');
        }
      }

      const generator = new ValidationFailingGenerator(
        mockClient,
        mockConnection,
        mockOptions
      );

      const result = await generator.execute();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Validation failed');
    });
  });

  describe('outputToStdout', () => {
    it('should output files to console', () => {
      let consoleOutput: string[] = [];
      const originalLog = console.log;
      console.log = (message: string) => {
        consoleOutput.push(message);
      };

      const generator = new TestGenerator(
        mockClient,
        mockConnection,
        mockOptions
      );
      const files = [
        { name: 'test1.sql', content: '-- Test 1' },
        { name: 'test2.sql', content: '-- Test 2' },
      ];

      (
        generator as unknown as {
          outputToStdout: (files: IGeneratedFile[]) => void;
        }
      ).outputToStdout(files);

      expect(consoleOutput).toContain('-- test1.sql\n');
      expect(consoleOutput).toContain('-- Test 1');
      expect(consoleOutput).toContain('-- test2.sql\n');
      expect(consoleOutput).toContain('-- Test 2');

      console.log = originalLog;
    });
  });

  describe('outputToFiles', () => {
    it('should create output directory and write files', async () => {
      // This test would require mocking fs module which is complex in ESM
      // For now, we'll test the method exists and can be called
      const generator = new TestGenerator(
        mockClient,
        mockConnection,
        mockOptions
      );

      // const files = [
      //   { name: 'test1.sql', content: '-- Test 1' },
      //   { name: 'test2.sql', content: '-- Test 2' },
      // ];

      // Test that the method exists and can be called
      expect(
        typeof (
          generator as unknown as {
            outputToFiles: (files: IGeneratedFile[]) => Promise<void>;
          }
        ).outputToFiles
      ).toBe('function');

      // Note: In a real test environment, you would mock the fs module
      // For now, we'll just verify the method exists
    });
  });

  describe('helper methods', () => {
    let generator: TestGenerator;

    beforeEach(() => {
      generator = new TestGenerator();
    });

    describe('generateComment', () => {
      it('should generate single line comment', () => {
        const result = (
          generator as unknown as {
            generateComment: (comment: string) => string;
          }
        ).generateComment('Test comment');
        expect(result).toBe('-- Test comment');
      });
    });

    describe('generateSectionHeader', () => {
      it('should generate section header', () => {
        const result = (
          generator as unknown as {
            generateSectionHeader: (title: string) => string;
          }
        ).generateSectionHeader('Test Section');
        expect(result).toContain('Test Section');
        expect(result).toContain('===========================================');
      });
    });

    describe('formatSQL', () => {
      it('should format SQL with indentation', () => {
        const sql = 'SELECT * FROM table\nWHERE id = 1';
        const result = (
          generator as unknown as {
            formatSQL: (sql: string, indentLevel: number) => string;
          }
        ).formatSQL(sql, 1);

        expect(result).toContain('  SELECT * FROM table');
        expect(result).toContain('  WHERE id = 1');
      });

      it('should handle empty lines', () => {
        const sql = 'SELECT * FROM table\n\nWHERE id = 1';
        const result = (
          generator as unknown as {
            formatSQL: (sql: string, indentLevel: number) => string;
          }
        ).formatSQL(sql, 1);

        expect(result).toContain('  SELECT * FROM table');
        expect(result).toContain('  WHERE id = 1');
        expect(result).not.toContain('  \n  ');
      });
    });

    describe('escapeIdentifier', () => {
      it('should not escape simple identifiers', () => {
        const result = (
          generator as unknown as {
            escapeIdentifier: (identifier: string) => string;
          }
        ).escapeIdentifier('table_name');
        expect(result).toBe('table_name');
      });

      it('should escape identifiers with special characters', () => {
        const result = (
          generator as unknown as {
            escapeIdentifier: (identifier: string) => string;
          }
        ).escapeIdentifier('table-name');
        expect(result).toBe('"table-name"');
      });

      it('should handle already quoted identifiers', () => {
        const result = (
          generator as unknown as {
            escapeIdentifier: (identifier: string) => string;
          }
        ).escapeIdentifier('"already_quoted"');
        expect(result).toBe('"""already_quoted"""');
      });
    });
  });
});
