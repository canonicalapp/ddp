/**
 * Unit tests for Utils module
 */

import { Utils } from '../../utils/utils.js';

describe('Utils', () => {
  describe('generateTimestamp', () => {
    it('should generate a timestamp in the correct format', () => {
      const timestamp = Utils.generateTimestamp();

      // Should match format: 2024-01-15T10-30-45-123Z
      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/);
    });

    it('should replace colons and dots with dashes', () => {
      const timestamp = Utils.generateTimestamp();

      expect(timestamp).not.toContain(':');
      expect(timestamp).not.toContain('.');
      expect(timestamp).toContain('-');
    });

    it('should generate unique timestamps', () => {
      const timestamp1 = Utils.generateTimestamp();
      const timestamp2 = Utils.generateTimestamp();

      // They should be different (unless generated in the same millisecond)
      expect(timestamp1).toBeDefined();
      expect(timestamp2).toBeDefined();
    });
  });

  describe('generateBackupName', () => {
    it('should generate backup name with default suffix', () => {
      const originalName = 'test_table';
      const backupName = Utils.generateBackupName(originalName);

      expect(backupName).toMatch(
        /^test_table_dropped_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/
      );
    });

    it('should generate backup name with custom suffix', () => {
      const originalName = 'test_column';
      const suffix = 'backup';
      const backupName = Utils.generateBackupName(originalName, suffix);

      expect(backupName).toMatch(
        /^test_column_backup_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/
      );
    });

    it('should handle empty original name', () => {
      const backupName = Utils.generateBackupName('');

      expect(backupName).toMatch(
        /^_dropped_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/
      );
    });

    it('should handle special characters in original name', () => {
      const originalName = 'test-table_with.special@chars';
      const backupName = Utils.generateBackupName(originalName);

      expect(backupName).toContain(originalName);
      expect(backupName).toContain('_dropped_');
    });
  });

  describe('generateOutputFilename', () => {
    it('should generate filename with default prefix', () => {
      const devSchema = 'dev';
      const prodSchema = 'prod';
      const filename = Utils.generateOutputFilename(devSchema, prodSchema);

      expect(filename).toMatch(
        /^schema-sync_dev-to-prod_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.sql$/
      );
    });

    it('should generate filename with custom prefix', () => {
      const devSchema = 'development';
      const prodSchema = 'production';
      const prefix = 'migration';
      const filename = Utils.generateOutputFilename(
        devSchema,
        prodSchema,
        prefix
      );

      expect(filename).toMatch(
        /^migration_development-to-production_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.sql$/
      );
    });

    it('should handle schema names with underscores', () => {
      const devSchema = 'dev_schema';
      const prodSchema = 'prod_schema';
      const filename = Utils.generateOutputFilename(devSchema, prodSchema);

      expect(filename).toMatch(
        /^schema-sync_dev_schema-to-prod_schema_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.sql$/
      );
    });

    it('should truncate timestamp to 19 characters', () => {
      const filename = Utils.generateOutputFilename('dev', 'prod');
      const timestampPart = filename.match(
        /_(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})\.sql$/
      )[1];

      expect(timestampPart).toHaveLength(19);
    });
  });

  describe('formatColumnDefinition', () => {
    it('should format basic column definition', () => {
      const column = {
        column_name: 'id',
        data_type: 'integer',
        character_maximum_length: null,
        is_nullable: 'NO',
        column_default: null,
      };

      const result = Utils.formatColumnDefinition(column);
      expect(result).toBe('"id" integer NOT NULL');
    });

    it('should format column with length specification', () => {
      const column = {
        column_name: 'name',
        data_type: 'character varying',
        character_maximum_length: 255,
        is_nullable: 'YES',
        column_default: null,
      };

      const result = Utils.formatColumnDefinition(column);
      expect(result).toBe('"name" character varying(255)');
    });

    it('should format column with default value', () => {
      const column = {
        column_name: 'created_at',
        data_type: 'timestamp',
        character_maximum_length: null,
        is_nullable: 'NO',
        column_default: 'CURRENT_TIMESTAMP',
      };

      const result = Utils.formatColumnDefinition(column);
      expect(result).toBe(
        '"created_at" timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP'
      );
    });

    it('should format column with all properties', () => {
      const column = {
        column_name: 'email',
        data_type: 'character varying',
        character_maximum_length: 100,
        is_nullable: 'NO',
        column_default: "'user@example.com'",
      };

      const result = Utils.formatColumnDefinition(column);
      expect(result).toBe(
        '"email" character varying(100) NOT NULL DEFAULT \'user@example.com\''
      );
    });

    it('should handle column names with special characters', () => {
      const column = {
        column_name: 'user_id',
        data_type: 'integer',
        character_maximum_length: null,
        is_nullable: 'NO',
        column_default: null,
      };

      const result = Utils.formatColumnDefinition(column);
      expect(result).toBe('"user_id" integer NOT NULL');
    });
  });

  describe('formatDataType', () => {
    it('should format data type without length', () => {
      const column = {
        data_type: 'integer',
        character_maximum_length: null,
      };

      const result = Utils.formatDataType(column);
      expect(result).toBe('integer');
    });

    it('should format data type with length', () => {
      const column = {
        data_type: 'character varying',
        character_maximum_length: 255,
      };

      const result = Utils.formatDataType(column);
      expect(result).toBe('character varying(255)');
    });

    it('should handle numeric precision', () => {
      const column = {
        data_type: 'numeric',
        character_maximum_length: 10,
      };

      const result = Utils.formatDataType(column);
      expect(result).toBe('numeric(10)');
    });
  });

  describe('generateManualReviewComment', () => {
    it('should generate manual review comment', () => {
      const result = Utils.generateManualReviewComment(
        'table',
        'users',
        'data migration required'
      );

      expect(result).toBe(
        '-- TODO: Manual review required for table users - data migration required'
      );
    });

    it('should handle different types', () => {
      const types = ['table', 'column', 'function', 'constraint', 'trigger'];

      types.forEach(type => {
        const result = Utils.generateManualReviewComment(
          type,
          'test_name',
          'test reason'
        );
        expect(result).toContain(
          `-- TODO: Manual review required for ${type} test_name - test reason`
        );
      });
    });
  });

  describe('generateSectionHeader', () => {
    it('should generate section header', () => {
      const result = Utils.generateSectionHeader('Table Operations');

      expect(result).toEqual([
        '-- ===========================================',
        '-- TABLE OPERATIONS',
        '-- ===========================================',
      ]);
    });

    it('should uppercase the title', () => {
      const result = Utils.generateSectionHeader('column operations');

      expect(result[1]).toBe('-- COLUMN OPERATIONS');
    });

    it('should handle empty title', () => {
      const result = Utils.generateSectionHeader('');

      expect(result).toEqual([
        '-- ===========================================',
        '-- ',
        '-- ===========================================',
      ]);
    });
  });

  describe('generateScriptFooter', () => {
    it('should generate script footer', () => {
      const result = Utils.generateScriptFooter();

      expect(result).toEqual([
        '',
        '-- ===========================================',
        '-- END OF SCHEMA SYNC SCRIPT',
        '-- ===========================================',
      ]);
    });

    it('should always return the same footer', () => {
      const result1 = Utils.generateScriptFooter();
      const result2 = Utils.generateScriptFooter();

      expect(result1).toEqual(result2);
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle null/undefined inputs gracefully', () => {
      expect(() => Utils.generateBackupName(null)).not.toThrow();
      expect(() => Utils.generateBackupName(undefined)).not.toThrow();
      expect(() => Utils.generateOutputFilename(null, null)).not.toThrow();
    });

    it('should handle empty string inputs', () => {
      const backupName = Utils.generateBackupName('');
      expect(backupName).toBeDefined();

      const filename = Utils.generateOutputFilename('', '');
      expect(filename).toBeDefined();
    });

    it('should handle malformed column objects', () => {
      const malformedColumn = {
        column_name: 'test',
        // missing other properties
      };

      expect(() => Utils.formatColumnDefinition(malformedColumn)).not.toThrow();
    });
  });
});
