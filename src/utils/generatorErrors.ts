/**
 * Custom error classes for generator operations
 */

export class GeneratorError extends Error {
  public readonly code: string;
  public readonly context?: Record<string, unknown> | undefined;

  constructor(
    message: string,
    code: string,
    context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'GeneratorError';
    this.code = code;
    this.context = context;

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, GeneratorError);
    }
  }
}

export class SchemaGeneratorError extends GeneratorError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'SCHEMA_GENERATOR_ERROR', context);
    this.name = 'SchemaGeneratorError';
  }
}

export class ProcsGeneratorError extends GeneratorError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'PROCS_GENERATOR_ERROR', context);
    this.name = 'ProcsGeneratorError';
  }
}

export class TriggersGeneratorError extends GeneratorError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'TRIGGERS_GENERATOR_ERROR', context);
    this.name = 'TriggersGeneratorError';
  }
}

export class DatabaseConnectionError extends GeneratorError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'DATABASE_CONNECTION_ERROR', context);
    this.name = 'DatabaseConnectionError';
  }
}

export class IntrospectionError extends GeneratorError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'INTROSPECTION_ERROR', context);
    this.name = 'IntrospectionError';
  }
}

/**
 * Error codes for different types of failures
 */
export const ERROR_CODES = {
  // Database connection errors
  CONNECTION_FAILED: 'CONNECTION_FAILED',
  AUTHENTICATION_FAILED: 'AUTHENTICATION_FAILED',
  SCHEMA_NOT_FOUND: 'SCHEMA_NOT_FOUND',

  // Validation errors
  INVALID_SCHEMA: 'INVALID_SCHEMA',
  INVALID_TABLE: 'INVALID_TABLE',
  INVALID_FUNCTION: 'INVALID_FUNCTION',
  INVALID_TRIGGER: 'INVALID_TRIGGER',

  // Generation errors
  GENERATION_FAILED: 'GENERATION_FAILED',
  SQL_SYNTAX_ERROR: 'SQL_SYNTAX_ERROR',
  MISSING_DEPENDENCY: 'MISSING_DEPENDENCY',

  // Introspection errors
  INTROSPECTION_FAILED: 'INTROSPECTION_FAILED',
  QUERY_FAILED: 'QUERY_FAILED',
  DATA_CORRUPTION: 'DATA_CORRUPTION',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
