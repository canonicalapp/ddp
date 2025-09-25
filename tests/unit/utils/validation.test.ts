/**
 * Unit tests for validation utilities
 */

import {
  validateDatabaseConnection,
  validateSchemaName,
  validateTableName,
  validateFunctionName,
  validateSQLIdentifier,
  validateNotNull,
  validateNonEmptyString,
  validatePositiveInteger,
  validateNonEmptyArray,
  validateRequiredProperties,
  sanitizeSQLIdentifier,
} from '@/utils/validation';
import { ValidationError } from '@/types/errors';

describe('Validation Utilities', () => {
  describe('validateDatabaseConnection', () => {
    it('should validate correct connection parameters', () => {
      const connection = {
        host: 'localhost',
        port: 5432,
        database: 'testdb',
        user: 'testuser',
        password: 'testpass',
        schema: 'public',
      };

      expect(() => validateDatabaseConnection(connection)).not.toThrow();
    });

    it('should validate connection with username instead of user', () => {
      const connection = {
        host: 'localhost',
        port: 5432,
        database: 'testdb',
        username: 'testuser',
        password: 'testpass',
        schema: 'public',
      };

      expect(() => validateDatabaseConnection(connection)).not.toThrow();
    });

    it('should throw ValidationError for missing host', () => {
      const connection = {
        port: 5432,
        database: 'testdb',
        user: 'testuser',
        password: 'testpass',
        schema: 'public',
      };

      expect(() => validateDatabaseConnection(connection)).toThrow(
        ValidationError
      );
    });

    it('should throw ValidationError for invalid port', () => {
      const connection = {
        host: 'localhost',
        port: 0,
        database: 'testdb',
        user: 'testuser',
        password: 'testpass',
        schema: 'public',
      };

      expect(() => validateDatabaseConnection(connection)).toThrow(
        ValidationError
      );
    });

    it('should throw ValidationError for missing database', () => {
      const connection = {
        host: 'localhost',
        port: 5432,
        user: 'testuser',
        password: 'testpass',
        schema: 'public',
      };

      expect(() => validateDatabaseConnection(connection)).toThrow(
        ValidationError
      );
    });

    it('should throw ValidationError for missing user/username', () => {
      const connection = {
        host: 'localhost',
        port: 5432,
        database: 'testdb',
        password: 'testpass',
        schema: 'public',
      };

      expect(() => validateDatabaseConnection(connection)).toThrow(
        ValidationError
      );
    });

    it('should throw ValidationError for missing password', () => {
      const connection = {
        host: 'localhost',
        port: 5432,
        database: 'testdb',
        user: 'testuser',
        schema: 'public',
      };

      expect(() => validateDatabaseConnection(connection)).toThrow(
        ValidationError
      );
    });

    it('should throw ValidationError for missing schema', () => {
      const connection = {
        host: 'localhost',
        port: 5432,
        database: 'testdb',
        user: 'testuser',
        password: 'testpass',
      };

      expect(() => validateDatabaseConnection(connection)).toThrow(
        ValidationError
      );
    });
  });

  describe('validateSchemaName', () => {
    it('should validate correct schema name', () => {
      expect(() => validateSchemaName('public')).not.toThrow();
      expect(() => validateSchemaName('test_schema')).not.toThrow();
      expect(() => validateSchemaName('schema123')).not.toThrow();
    });

    it('should throw ValidationError for empty schema name', () => {
      expect(() => validateSchemaName('')).toThrow(ValidationError);
    });

    it('should throw ValidationError for null schema name', () => {
      expect(() => validateSchemaName(null as any)).toThrow(ValidationError);
    });

    it('should throw ValidationError for schema name too long', () => {
      const longName = 'a'.repeat(64);
      expect(() => validateSchemaName(longName)).toThrow(ValidationError);
    });

    it('should throw ValidationError for invalid characters', () => {
      expect(() => validateSchemaName('test-schema')).toThrow(ValidationError);
      expect(() => validateSchemaName('test.schema')).toThrow(ValidationError);
      expect(() => validateSchemaName('123schema')).toThrow(ValidationError);
    });
  });

  describe('validateTableName', () => {
    it('should validate correct table name', () => {
      expect(() => validateTableName('users')).not.toThrow();
      expect(() => validateTableName('user_profiles')).not.toThrow();
      expect(() => validateTableName('table123')).not.toThrow();
    });

    it('should throw ValidationError for empty table name', () => {
      expect(() => validateTableName('')).toThrow(ValidationError);
    });

    it('should throw ValidationError for table name too long', () => {
      const longName = 'a'.repeat(64);
      expect(() => validateTableName(longName)).toThrow(ValidationError);
    });

    it('should throw ValidationError for invalid characters', () => {
      expect(() => validateTableName('user-profiles')).toThrow(ValidationError);
      expect(() => validateTableName('user.profiles')).toThrow(ValidationError);
      expect(() => validateTableName('123users')).toThrow(ValidationError);
    });
  });

  describe('validateFunctionName', () => {
    it('should validate correct function name', () => {
      expect(() => validateFunctionName('get_user')).not.toThrow();
      expect(() => validateFunctionName('calculate_total')).not.toThrow();
      expect(() => validateFunctionName('func123')).not.toThrow();
    });

    it('should throw ValidationError for empty function name', () => {
      expect(() => validateFunctionName('')).toThrow(ValidationError);
    });

    it('should throw ValidationError for function name too long', () => {
      const longName = 'a'.repeat(64);
      expect(() => validateFunctionName(longName)).toThrow(ValidationError);
    });

    it('should throw ValidationError for invalid characters', () => {
      expect(() => validateFunctionName('get-user')).toThrow(ValidationError);
      expect(() => validateFunctionName('get.user')).toThrow(ValidationError);
      expect(() => validateFunctionName('123func')).toThrow(ValidationError);
    });
  });

  describe('validateSQLIdentifier', () => {
    it('should validate correct identifier', () => {
      expect(() => validateSQLIdentifier('column_name')).not.toThrow();
      expect(() => validateSQLIdentifier('col123')).not.toThrow();
    });

    it('should validate quoted identifier', () => {
      expect(() => validateSQLIdentifier('"column-name"')).not.toThrow();
      expect(() => validateSQLIdentifier('"column.name"')).not.toThrow();
    });

    it('should throw ValidationError for empty identifier', () => {
      expect(() => validateSQLIdentifier('')).toThrow(ValidationError);
    });

    it('should throw ValidationError for identifier too long', () => {
      const longName = 'a'.repeat(64);
      expect(() => validateSQLIdentifier(longName)).toThrow(ValidationError);
    });

    it('should throw ValidationError for invalid characters', () => {
      expect(() => validateSQLIdentifier('col-name')).toThrow(ValidationError);
      expect(() => validateSQLIdentifier('col.name')).toThrow(ValidationError);
      expect(() => validateSQLIdentifier('123col')).toThrow(ValidationError);
    });
  });

  describe('validateNotNull', () => {
    it('should return value if not null or undefined', () => {
      expect(validateNotNull('test', 'value')).toBe('test');
      expect(validateNotNull(123, 'value')).toBe(123);
      expect(validateNotNull(false, 'value')).toBe(false);
    });

    it('should throw ValidationError for null', () => {
      expect(() => validateNotNull(null, 'value')).toThrow(ValidationError);
    });

    it('should throw ValidationError for undefined', () => {
      expect(() => validateNotNull(undefined, 'value')).toThrow(
        ValidationError
      );
    });
  });

  describe('validateNonEmptyString', () => {
    it('should return trimmed string if valid', () => {
      expect(validateNonEmptyString('  test  ', 'value')).toBe('test');
      expect(validateNonEmptyString('test', 'value')).toBe('test');
    });

    it('should throw ValidationError for empty string', () => {
      expect(() => validateNonEmptyString('', 'value')).toThrow(
        ValidationError
      );
    });

    it('should throw ValidationError for whitespace only', () => {
      expect(() => validateNonEmptyString('   ', 'value')).toThrow(
        ValidationError
      );
    });

    it('should throw ValidationError for non-string', () => {
      expect(() => validateNonEmptyString(123, 'value')).toThrow(
        ValidationError
      );
    });
  });

  describe('validatePositiveInteger', () => {
    it('should return number if valid positive integer', () => {
      expect(validatePositiveInteger(123, 'value')).toBe(123);
      expect(validatePositiveInteger('456', 'value')).toBe(456);
    });

    it('should throw ValidationError for zero', () => {
      expect(() => validatePositiveInteger(0, 'value')).toThrow(
        ValidationError
      );
    });

    it('should throw ValidationError for negative number', () => {
      expect(() => validatePositiveInteger(-1, 'value')).toThrow(
        ValidationError
      );
    });

    it('should throw ValidationError for decimal', () => {
      expect(() => validatePositiveInteger(1.5, 'value')).toThrow(
        ValidationError
      );
    });

    it('should throw ValidationError for non-number', () => {
      expect(() => validatePositiveInteger('abc', 'value')).toThrow(
        ValidationError
      );
    });
  });

  describe('validateNonEmptyArray', () => {
    it('should return array if valid', () => {
      const arr = [1, 2, 3];
      expect(validateNonEmptyArray(arr, 'value')).toBe(arr);
    });

    it('should throw ValidationError for empty array', () => {
      expect(() => validateNonEmptyArray([], 'value')).toThrow(ValidationError);
    });

    it('should throw ValidationError for non-array', () => {
      expect(() => validateNonEmptyArray('not array', 'value')).toThrow(
        ValidationError
      );
    });
  });

  describe('validateRequiredProperties', () => {
    it('should return object if all required properties exist', () => {
      const obj = { a: 1, b: 2, c: 3 };
      expect(validateRequiredProperties(obj, ['a', 'b'])).toBe(obj);
    });

    it('should throw ValidationError for missing properties', () => {
      const obj = { a: 1, b: 2 };
      expect(() => validateRequiredProperties(obj, ['a', 'b', 'c'])).toThrow(
        ValidationError
      );
    });

    it('should throw ValidationError for null properties', () => {
      const obj = { a: 1, b: null, c: 3 };
      expect(() => validateRequiredProperties(obj, ['a', 'b', 'c'])).toThrow(
        ValidationError
      );
    });
  });

  describe('sanitizeSQLIdentifier', () => {
    it('should return identifier as-is if valid', () => {
      expect(sanitizeSQLIdentifier('valid_name')).toBe('valid_name');
    });

    it('should return quoted identifier if already quoted', () => {
      expect(sanitizeSQLIdentifier('"quoted-name"')).toBe('"quoted-name"');
    });

    it('should quote identifier with special characters', () => {
      expect(sanitizeSQLIdentifier('column-name')).toBe('"column-name"');
      expect(sanitizeSQLIdentifier('column.name')).toBe('"column.name"');
    });

    it('should quote reserved words', () => {
      expect(sanitizeSQLIdentifier('SELECT')).toBe('"SELECT"');
      expect(sanitizeSQLIdentifier('FROM')).toBe('"FROM"');
    });

    it('should handle empty string', () => {
      expect(sanitizeSQLIdentifier('')).toBe('');
    });

    it('should escape quotes in identifier', () => {
      expect(sanitizeSQLIdentifier('"quoted""name"')).toBe('"quoted""name"');
    });
  });
});
