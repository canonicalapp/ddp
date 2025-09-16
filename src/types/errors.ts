/**
 * Error types and classes
 */

// Base Error Class
export class DDPError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'DDPError';
  }
}

// Specific Error Classes
export class DatabaseError extends DDPError {
  constructor(
    message: string,
    public query?: string,
    details?: Record<string, unknown>
  ) {
    super(message, 'DATABASE_ERROR', details);
    this.name = 'DatabaseError';
  }
}

export class ValidationError extends DDPError {
  constructor(
    message: string,
    public field: string,
    details?: Record<string, unknown>
  ) {
    super(message, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

export class FileError extends DDPError {
  constructor(
    message: string,
    public filePath: string,
    details?: Record<string, unknown>
  ) {
    super(message, 'FILE_ERROR', details);
    this.name = 'FileError';
  }
}

// Error Utility Types
export type TErrorCode =
  | 'DATABASE_ERROR'
  | 'VALIDATION_ERROR'
  | 'FILE_ERROR'
  | 'UNKNOWN_ERROR';
export type TErrorSeverity = 'low' | 'medium' | 'high' | 'critical';
