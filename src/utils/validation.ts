/**
 * Validation utilities for input validation and data integrity checks
 */

import { ValidationError } from '@/types/errors';

/**
 * Validates database connection parameters
 */
export function validateDatabaseConnection(connection: {
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  username?: string;
  password?: string;
  schema?: string;
}): void {
  const errors: string[] = [];

  if (!connection.host || typeof connection.host !== 'string') {
    errors.push('Host is required and must be a string');
  }

  if (
    !connection.port ||
    typeof connection.port !== 'number' ||
    connection.port < 1 ||
    connection.port > 65535
  ) {
    errors.push('Port is required and must be a valid port number (1-65535)');
  }

  if (!connection.database || typeof connection.database !== 'string') {
    errors.push('Database name is required and must be a string');
  }

  const user = connection.user ?? connection.username;
  if (!user || typeof user !== 'string') {
    errors.push('User/username is required and must be a string');
  }

  if (typeof connection.password !== 'string') {
    errors.push('Password must be a string');
  }

  if (!connection.schema || typeof connection.schema !== 'string') {
    errors.push('Schema is required and must be a string');
  }

  if (errors.length > 0) {
    throw new ValidationError(
      `Database connection validation failed: ${errors.join(', ')}`,
      'connection',
      { errors, connection: { ...connection, password: '[REDACTED]' } }
    );
  }
}

/**
 * Validates schema name
 */
export function validateSchemaName(schema: string): void {
  if (!schema || typeof schema !== 'string') {
    throw new ValidationError(
      'Schema name is required and must be a string',
      'schema',
      { schema }
    );
  }

  if (schema.length > 63) {
    throw new ValidationError(
      'Schema name must be 63 characters or less',
      'schema',
      { schema }
    );
  }

  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema)) {
    throw new ValidationError(
      'Schema name must start with a letter or underscore and contain only letters, numbers, and underscores',
      'schema',
      { schema }
    );
  }
}

/**
 * Validates table name
 */
export function validateTableName(tableName: string): void {
  if (!tableName || typeof tableName !== 'string') {
    throw new ValidationError(
      'Table name is required and must be a string',
      'tableName',
      { tableName }
    );
  }

  if (tableName.length > 63) {
    throw new ValidationError(
      'Table name must be 63 characters or less',
      'tableName',
      { tableName }
    );
  }

  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
    throw new ValidationError(
      'Table name must start with a letter or underscore and contain only letters, numbers, and underscores',
      'tableName',
      { tableName }
    );
  }
}

/**
 * Validates function name
 */
export function validateFunctionName(functionName: string): void {
  if (!functionName || typeof functionName !== 'string') {
    throw new ValidationError(
      'Function name is required and must be a string',
      'functionName',
      { functionName }
    );
  }

  if (functionName.length > 63) {
    throw new ValidationError(
      'Function name must be 63 characters or less',
      'functionName',
      { functionName }
    );
  }

  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(functionName)) {
    throw new ValidationError(
      'Function name must start with a letter or underscore and contain only letters, numbers, and underscores',
      'functionName',
      { functionName }
    );
  }
}

/**
 * Validates SQL identifier
 */
export function validateSQLIdentifier(
  identifier: string,
  type: string = 'identifier'
): void {
  if (!identifier || typeof identifier !== 'string') {
    throw new ValidationError(
      `${type} is required and must be a string`,
      type,
      { identifier, type }
    );
  }

  if (identifier.length > 63) {
    throw new ValidationError(`${type} must be 63 characters or less`, type, {
      identifier,
      type,
    });
  }

  // Allow quoted identifiers
  if (identifier.startsWith('"') && identifier.endsWith('"')) {
    return; // Quoted identifiers are allowed
  }

  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) {
    throw new ValidationError(
      `${type} must start with a letter or underscore and contain only letters, numbers, and underscores, or be quoted`,
      type,
      { identifier, type }
    );
  }
}

/**
 * Validates that a value is not null or undefined
 */
export function validateNotNull<T>(
  value: T | null | undefined,
  name: string
): T {
  if (value === null || value === undefined) {
    throw new ValidationError(`${name} cannot be null or undefined`, name, {
      name,
      value,
    });
  }
  return value;
}

/**
 * Validates that a value is a non-empty string
 */
export function validateNonEmptyString(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ValidationError(`${name} must be a non-empty string`, name, {
      name,
      value,
    });
  }
  return value.trim();
}

/**
 * Validates that a value is a positive integer
 */
export function validatePositiveInteger(value: unknown, name: string): number {
  const num = Number(value);
  if (!Number.isInteger(num) || num <= 0) {
    throw new ValidationError(`${name} must be a positive integer`, name, {
      name,
      value,
    });
  }
  return num;
}

/**
 * Validates array is not empty
 */
export function validateNonEmptyArray<T>(array: T[], name: string): T[] {
  if (!Array.isArray(array) || array.length === 0) {
    throw new ValidationError(`${name} must be a non-empty array`, name, {
      name,
      array,
    });
  }
  return array;
}

/**
 * Validates that all required properties exist on an object
 */
export function validateRequiredProperties<T extends Record<string, unknown>>(
  obj: T,
  requiredProperties: (keyof T)[]
): T {
  const missing = requiredProperties.filter(
    prop => obj[prop] === undefined || obj[prop] === null
  );

  if (missing.length > 0) {
    throw new ValidationError(
      `Missing required properties: ${missing.join(', ')}`,
      'requiredProperties',
      { missing, object: obj }
    );
  }

  return obj;
}

/**
 * Sanitizes SQL identifier by escaping special characters
 */
export function sanitizeSQLIdentifier(identifier: string): string {
  if (!identifier) return '';

  // If already quoted, return as-is
  if (identifier.startsWith('"') && identifier.endsWith('"')) {
    return identifier;
  }

  // Quote if contains special characters or is a reserved word
  if (
    !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier) ||
    isReservedWord(identifier)
  ) {
    return `"${identifier.replace(/"/g, '""')}"`;
  }

  return identifier;
}

/**
 * Checks if a word is a PostgreSQL reserved word
 */
function isReservedWord(word: string): boolean {
  const reservedWords = new Set([
    'SELECT',
    'FROM',
    'WHERE',
    'INSERT',
    'UPDATE',
    'DELETE',
    'CREATE',
    'DROP',
    'ALTER',
    'TABLE',
    'INDEX',
    'VIEW',
    'FUNCTION',
    'PROCEDURE',
    'TRIGGER',
    'SEQUENCE',
    'SCHEMA',
    'DATABASE',
    'USER',
    'ROLE',
    'GRANT',
    'REVOKE',
    'COMMIT',
    'ROLLBACK',
    'BEGIN',
    'END',
    'IF',
    'ELSE',
    'WHILE',
    'FOR',
    'LOOP',
    'CASE',
    'WHEN',
    'THEN',
    'ELSE',
    'RETURN',
    'DECLARE',
    'BEGIN',
    'END',
    'AS',
    'IS',
    'IN',
    'OUT',
    'INOUT',
    'VARIADIC',
    'DEFAULT',
    'NOT',
    'NULL',
    'TRUE',
    'FALSE',
    'AND',
    'OR',
    'LIKE',
    'ILIKE',
    'IN',
    'EXISTS',
    'BETWEEN',
    'IS',
    'ISNULL',
    'NOTNULL',
    'UNIQUE',
    'PRIMARY',
    'FOREIGN',
    'KEY',
    'REFERENCES',
    'CONSTRAINT',
    'CHECK',
    'UNIQUE',
    'INDEX',
    'CLUSTER',
    'WITH',
    'WITHOUT',
    'CASCADE',
    'RESTRICT',
    'SET',
    'NULL',
    'DEFAULT',
    'ON',
    'OFF',
  ]);

  return reservedWords.has(word.toUpperCase());
}
