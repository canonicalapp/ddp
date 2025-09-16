/**
 * Edge cases and error handling tests
 */

import { Utils } from '@/utils/formatting.ts';
import { ColumnOperations } from '@/sync/operations/columns.ts';
import { TableOperations } from '@/sync/operations/tables.ts';
import { SchemaSyncOrchestrator } from '@/sync/orchestrator.ts';
import {
  corruptedResult,
  createCircularReference,
  createLargeTableList,
  extremeLengthColumn,
  malformedResult,
  nullColumn,
  undefinedColumn,
} from '../../fixtures/edgeCasesData.ts';
import {
  createMockClient,
  createMockOptions,
} from '../../fixtures/testUtils.ts';

describe('Edge Cases and Error Handling', () => {
  let mockClient;
  let mockOptions;

  beforeEach(() => {
    mockClient = createMockClient();
    mockOptions = createMockOptions();
    // Note: jest functions are available within test functions, not in global scope
  });

  describe('Utils Edge Cases', () => {
    describe('generateTimestamp', () => {
      it('should handle system clock changes', () => {
        const timestamp1 = Utils.generateTimestamp();

        // Simulate clock change by mocking Date
        const originalDate = global.Date;
        global.Date = class extends originalDate {
          constructor(...args) {
            if (args.length === 0) {
              super('2024-12-31T23:59:59.999Z');
            } else {
              super(...args);
            }
          }
          static now() {
            return new originalDate('2024-12-31T23:59:59.999Z').getTime();
          }
        };

        const timestamp2 = Utils.generateTimestamp();

        // Restore original Date
        global.Date = originalDate;

        expect(timestamp1).toBeDefined();
        expect(timestamp2).toBeDefined();
        expect(timestamp1).not.toBe(timestamp2);
      });

      it('should handle leap year dates', () => {
        const originalDate = global.Date;
        global.Date = class extends originalDate {
          constructor(...args) {
            if (args.length === 0) {
              super('2024-02-29T12:00:00.000Z');
            } else {
              super(...args);
            }
          }
          static now() {
            return new originalDate('2024-02-29T12:00:00.000Z').getTime();
          }
        };

        const timestamp = Utils.generateTimestamp();

        global.Date = originalDate;

        expect(timestamp).toContain('2024-02-29T12-00-00-000Z');
      });

      it('should handle year 2038 problem', () => {
        const originalDate = global.Date;
        global.Date = class extends originalDate {
          constructor(...args) {
            if (args.length === 0) {
              super('2038-01-19T03:14:07.000Z');
            } else {
              super(...args);
            }
          }
          static now() {
            return new originalDate('2038-01-19T03:14:07.000Z').getTime();
          }
        };

        const timestamp = Utils.generateTimestamp();

        global.Date = originalDate;

        expect(timestamp).toContain('2038-01-19T03-14-07-000Z');
      });
    });

    describe('generateBackupName', () => {
      it('should handle extremely long names', () => {
        const longName = 'a'.repeat(10000);
        const backupName = Utils.generateBackupName(longName);

        expect(backupName).toContain(longName);
        expect(backupName).toContain('_dropped_');
      });

      it('should handle names with null bytes', () => {
        const nameWithNull = 'test\0name';
        const backupName = Utils.generateBackupName(nameWithNull);

        expect(backupName).toContain(nameWithNull);
      });

      it('should handle names with unicode characters', () => {
        const unicodeName = '测试表_表名_with_émojis_🚀';
        const backupName = Utils.generateBackupName(unicodeName);

        expect(backupName).toContain(unicodeName);
      });

      it('should handle empty suffix', () => {
        const backupName = Utils.generateBackupName('test', '');

        expect(backupName).toMatch(
          /^test__\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/
        );
      });
    });

    describe('formatColumnDefinition', () => {
      it('should handle columns with null values', () => {
        const result = Utils.formatColumnDefinition(nullColumn);

        expect(result).toBeDefined();
        expect(result).toContain('null');
      });

      it('should handle columns with undefined values', () => {
        const result = Utils.formatColumnDefinition(undefinedColumn);

        expect(result).toBeDefined();
      });

      it('should handle columns with extreme values', () => {
        const result = Utils.formatColumnDefinition(extremeLengthColumn);

        expect(result).toContain('a'.repeat(1000));
        expect(result).toContain('character varying(999999999)');
      });
    });
  });

  describe('Database Connection Edge Cases', () => {
    it('should handle connection timeout', async () => {
      const timeoutError = new Error('Connection timeout');
      mockClient.connect = () => Promise.reject(timeoutError);

      const orchestrator = new SchemaSyncOrchestrator(mockClient, mockOptions);

      await expect(orchestrator.execute()).rejects.toThrow(
        'Connection timeout'
      );
    });

    it('should handle connection refused', async () => {
      const refusedError = new Error('Connection refused');
      mockClient.connect = () => Promise.reject(refusedError);

      const orchestrator = new SchemaSyncOrchestrator(mockClient, mockOptions);

      await expect(orchestrator.execute()).rejects.toThrow(
        'Connection refused'
      );
    });

    it('should handle authentication failure', async () => {
      const authError = new Error('Authentication failed');
      mockClient.connect = () => Promise.reject(authError);

      const orchestrator = new SchemaSyncOrchestrator(mockClient, mockOptions);

      await expect(orchestrator.execute()).rejects.toThrow(
        'Authentication failed'
      );
    });

    it('should handle database not found', async () => {
      const dbError = new Error('Database does not exist');
      mockClient.connect = () => Promise.reject(dbError);

      const orchestrator = new SchemaSyncOrchestrator(mockClient, mockOptions);

      await expect(orchestrator.execute()).rejects.toThrow(
        'Database does not exist'
      );
    });
  });

  describe('Query Edge Cases', () => {
    it('should handle malformed query results', async () => {
      mockClient.query = () => Promise.resolve({ rows: null });

      const tableOps = new TableOperations(mockClient, mockOptions);

      await expect(tableOps.getTables('test_schema')).rejects.toThrow();
    });

    it('should handle query with no rows property', async () => {
      mockClient.query = () => Promise.resolve({});

      const tableOps = new TableOperations(mockClient, mockOptions);

      await expect(tableOps.getTables('test_schema')).rejects.toThrow();
    });

    it('should handle query returning non-array rows', async () => {
      mockClient.query = () => Promise.resolve({ rows: 'not an array' });

      const tableOps = new TableOperations(mockClient, mockOptions);

      await expect(tableOps.getTables('test_schema')).rejects.toThrow();
    });

    it('should handle extremely large result sets', async () => {
      const largeResult = createLargeTableList(100000);
      mockClient.query = () => Promise.resolve({ rows: largeResult });

      const tableOps = new TableOperations(mockClient, mockOptions);

      const result = await tableOps.getTables('test_schema');
      expect(result).toHaveLength(100000);
    });

    it('should handle query with circular references', async () => {
      const circularResult = createCircularReference();
      mockClient.query = () => Promise.resolve({ rows: [circularResult] });

      const tableOps = new TableOperations(mockClient, mockOptions);

      // Should not throw, but may produce unexpected results
      const result = await tableOps.getTables('test_schema');
      expect(result).toBeDefined();
    });
  });

  describe('Schema Name Edge Cases', () => {
    it('should handle schema names with SQL injection attempts', async () => {
      const maliciousSchema = "'; DROP TABLE users; --";

      // Store the original query function to preserve spy methods
      const originalQuery = mockClient.query;
      mockClient.query = (...args) => {
        originalQuery(...args); // Track the call
        return Promise.resolve({ rows: [] });
      };
      // Preserve the spy methods
      mockClient.query.toHaveBeenCalledWith =
        originalQuery.toHaveBeenCalledWith;
      mockClient.query.toHaveBeenCalledTimes =
        originalQuery.toHaveBeenCalledTimes;

      const tableOps = new TableOperations(mockClient, mockOptions);

      await tableOps.getTables(maliciousSchema);

      // Verify the query was parameterized (not concatenated)
      expect(
        mockClient.query.toHaveBeenCalledWith(expect.stringContaining('$1'), [
          maliciousSchema,
        ])
      ).toBe(true);
    });

    it('should handle schema names with unicode characters', async () => {
      const unicodeSchema = '测试_schema_🚀';

      // Store the original query function to preserve spy methods
      const originalQuery = mockClient.query;
      mockClient.query = (...args) => {
        originalQuery(...args); // Track the call
        return Promise.resolve({ rows: [] });
      };
      // Preserve the spy methods
      mockClient.query.toHaveBeenCalledWith =
        originalQuery.toHaveBeenCalledWith;
      mockClient.query.toHaveBeenCalledTimes =
        originalQuery.toHaveBeenCalledTimes;

      const tableOps = new TableOperations(mockClient, mockOptions);

      await tableOps.getTables(unicodeSchema);

      expect(
        mockClient.query.toHaveBeenCalledWith(expect.any(String), [
          unicodeSchema,
        ])
      ).toBe(true);
    });

    it('should handle extremely long schema names', async () => {
      const longSchema = 'a'.repeat(10000);

      // Store the original query function to preserve spy methods
      const originalQuery = mockClient.query;
      mockClient.query = (...args) => {
        originalQuery(...args); // Track the call
        return Promise.resolve({ rows: [] });
      };
      // Preserve the spy methods
      mockClient.query.toHaveBeenCalledWith =
        originalQuery.toHaveBeenCalledWith;
      mockClient.query.toHaveBeenCalledTimes =
        originalQuery.toHaveBeenCalledTimes;

      const tableOps = new TableOperations(mockClient, mockOptions);

      await tableOps.getTables(longSchema);

      expect(
        mockClient.query.toHaveBeenCalledWith(expect.any(String), [longSchema])
      ).toBe(true);
    });

    it('should handle empty schema names', async () => {
      // Store the original query function to preserve spy methods
      const originalQuery = mockClient.query;
      mockClient.query = (...args) => {
        originalQuery(...args); // Track the call
        return Promise.resolve({ rows: [] });
      };
      // Preserve the spy methods
      mockClient.query.toHaveBeenCalledWith =
        originalQuery.toHaveBeenCalledWith;
      mockClient.query.toHaveBeenCalledTimes =
        originalQuery.toHaveBeenCalledTimes;

      const tableOps = new TableOperations(mockClient, mockOptions);

      await tableOps.getTables('');

      expect(
        mockClient.query.toHaveBeenCalledWith(expect.any(String), [''])
      ).toBe(true);
    });
  });

  describe('Data Type Edge Cases', () => {
    it('should handle unknown data types', async () => {
      const unknownTypeColumn = {
        table_name: 'users',
        column_name: 'id',
        data_type: 'unknown_custom_type',
        character_maximum_length: null,
        is_nullable: 'NO',
        column_default: null,
        ordinal_position: 1,
      };

      mockClient.query = () => Promise.resolve({ rows: [unknownTypeColumn] });

      const columnOps = new ColumnOperations(mockClient, mockOptions);

      const result = await columnOps.getColumns('test_schema');
      expect(result).toContain(unknownTypeColumn);
    });

    it('should handle data types with extreme lengths', async () => {
      const extremeLengthColumn = {
        table_name: 'users',
        column_name: 'id',
        data_type: 'character varying',
        character_maximum_length: 2147483647, // Max int32
        is_nullable: 'NO',
        column_default: null,
        ordinal_position: 1,
      };

      mockClient.query = () => Promise.resolve({ rows: [extremeLengthColumn] });

      const columnOps = new ColumnOperations(mockClient, mockOptions);

      const result = await columnOps.getColumns('test_schema');
      expect(result).toContain(extremeLengthColumn);
    });

    it('should handle data types with negative lengths', async () => {
      const negativeLengthColumn = {
        table_name: 'users',
        column_name: 'id',
        data_type: 'character varying',
        character_maximum_length: -1,
        is_nullable: 'NO',
        column_default: null,
        ordinal_position: 1,
      };

      mockClient.query = () =>
        Promise.resolve({ rows: [negativeLengthColumn] });

      const columnOps = new ColumnOperations(mockClient, mockOptions);

      const result = await columnOps.getColumns('test_schema');
      expect(result).toContain(negativeLengthColumn);
    });
  });

  describe('Memory and Performance Edge Cases', () => {
    it('should handle memory pressure with large datasets', async () => {
      // Simulate memory pressure by creating large objects
      const largeTable = {
        table_name: 'large_table',
        column_name: 'large_column',
        data_type: 'text',
        character_maximum_length: null,
        is_nullable: 'YES',
        column_default: 'a'.repeat(1000000), // 1MB default value
        ordinal_position: 1,
      };

      const largeDataset = Array.from({ length: 1000 }, () => ({
        ...largeTable,
      }));
      mockClient.query = () => Promise.resolve({ rows: largeDataset });

      const columnOps = new ColumnOperations(mockClient, mockOptions);

      const result = await columnOps.getColumns('test_schema');
      expect(result).toHaveLength(1000);
    });

    it('should handle concurrent operations', async () => {
      mockClient.query = () => Promise.resolve({ rows: [] });

      const tableOps = new TableOperations(mockClient, mockOptions);

      // Run multiple operations concurrently
      const promises = Array.from({ length: 100 }, () =>
        tableOps.getTables('test_schema')
      );

      const results = await Promise.all(promises);
      expect(results).toHaveLength(100);
    });

    it('should handle rapid successive calls', async () => {
      // Store the original query function to preserve spy methods
      const originalQuery = mockClient.query;
      mockClient.query = (...args) => {
        originalQuery(...args); // Track the call
        return Promise.resolve({ rows: [] });
      };
      // Preserve the spy methods
      mockClient.query.toHaveBeenCalledWith =
        originalQuery.toHaveBeenCalledWith;
      mockClient.query.toHaveBeenCalledTimes =
        originalQuery.toHaveBeenCalledTimes;

      const tableOps = new TableOperations(mockClient, mockOptions);

      // Make rapid successive calls
      for (let i = 0; i < 1000; i++) {
        await tableOps.getTables('test_schema');
      }

      expect(mockClient.query.toHaveBeenCalledTimes(1000)).toBe(true);
    });
  });

  describe('File System Edge Cases', () => {
    it('should handle file system full error', async () => {
      const error = new Error('No space left on device');

      mockOptions.save = true;
      mockOptions.output = 'test.sql';

      const orchestrator = new SchemaSyncOrchestrator(mockClient, mockOptions);

      // Mock the saveScriptToFile method to throw the error
      orchestrator.saveScriptToFile = () => {
        throw error;
      };

      await expect(orchestrator.execute()).rejects.toThrow(
        'No space left on device'
      );
    });

    it('should handle permission denied error', async () => {
      const error = new Error('Permission denied');

      mockOptions.save = true;
      mockOptions.output = '/root/test.sql';

      const orchestrator = new SchemaSyncOrchestrator(mockClient, mockOptions);

      // Mock the saveScriptToFile method to throw the error
      orchestrator.saveScriptToFile = () => {
        throw error;
      };

      await expect(orchestrator.execute()).rejects.toThrow('Permission denied');
    });

    it('should handle read-only file system', async () => {
      const error = new Error('Read-only file system');

      mockOptions.save = true;
      mockOptions.output = 'test.sql';

      const orchestrator = new SchemaSyncOrchestrator(mockClient, mockOptions);

      // Mock the saveScriptToFile method to throw the error
      orchestrator.saveScriptToFile = () => {
        throw error;
      };

      await expect(orchestrator.execute()).rejects.toThrow(
        'Read-only file system'
      );
    });

    it('should handle extremely long file paths', async () => {
      const error = new Error('File name too long');

      const longPath = `${'a'.repeat(1000)}.sql`;
      mockOptions.save = true;
      mockOptions.output = longPath;

      const orchestrator = new SchemaSyncOrchestrator(mockClient, mockOptions);

      // Mock the saveScriptToFile method to throw the error
      orchestrator.saveScriptToFile = () => {
        throw error;
      };

      await expect(orchestrator.execute()).rejects.toThrow(
        'File name too long'
      );
    });
  });

  describe('Network Edge Cases', () => {
    it('should handle network interruption during query', async () => {
      const networkError = new Error('Network is unreachable');
      mockClient.query = () => Promise.reject(networkError);

      const tableOps = new TableOperations(mockClient, mockOptions);

      await expect(tableOps.getTables('test_schema')).rejects.toThrow(
        'Network is unreachable'
      );
    });

    it('should handle DNS resolution failure', async () => {
      const dnsError = new Error('getaddrinfo ENOTFOUND');
      mockClient.connect = () => Promise.reject(dnsError);

      const orchestrator = new SchemaSyncOrchestrator(mockClient, mockOptions);

      await expect(orchestrator.execute()).rejects.toThrow(
        'getaddrinfo ENOTFOUND'
      );
    });

    it('should handle SSL/TLS errors', async () => {
      const sslError = new Error('SSL connection error');
      mockClient.connect = () => Promise.reject(sslError);

      const orchestrator = new SchemaSyncOrchestrator(mockClient, mockOptions);

      await expect(orchestrator.execute()).rejects.toThrow(
        'SSL connection error'
      );
    });
  });

  describe('Concurrency Edge Cases', () => {
    it('should handle multiple orchestrators with same client', async () => {
      mockClient.query = () => Promise.resolve({ rows: [] });

      const orchestrator1 = new SchemaSyncOrchestrator(mockClient, mockOptions);
      const orchestrator2 = new SchemaSyncOrchestrator(mockClient, mockOptions);

      // Run both orchestrators concurrently
      const [result1, result2] = await Promise.all([
        orchestrator1.execute(),
        orchestrator2.execute(),
      ]);

      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
    });

    it('should handle client connection being closed during operation', async () => {
      mockClient.connect = () => Promise.resolve();
      mockClient.query = () =>
        Promise.reject(new Error('Connection terminated'));
      mockClient.end = () => Promise.resolve();

      const orchestrator = new SchemaSyncOrchestrator(mockClient, mockOptions);

      await expect(orchestrator.execute()).rejects.toThrow(
        'Connection terminated'
      );
    });
  });

  describe('Data Corruption Edge Cases', () => {
    it('should handle corrupted query results', async () => {
      mockClient.query = () => Promise.resolve(corruptedResult);

      const tableOps = new TableOperations(mockClient, mockOptions);

      const result = await tableOps.getTables('test_schema');
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle malformed JSON in query results', async () => {
      mockClient.query = () => Promise.resolve(malformedResult);

      const tableOps = new TableOperations(mockClient, mockOptions);

      const result = await tableOps.getTables('test_schema');
      expect(result).toBeDefined();
    });
  });
});
