/**
 * Main types export file
 * Re-exports all types and interfaces from modular type files
 */

export type * from './app';

// Database Types
export type {
  IDatabaseConnection,
  IDatabaseConfig,
  IColumnDefinition,
  IConstraintDefinition,
  IIndexDefinition,
  ISequenceDefinition,
  ITableDefinition,
  IFunctionDefinition,
  IFunctionParameter,
  ITriggerDefinition,
  TDatabaseObjectType,
  TSQLDialect,
} from './database';

// CLI Types
export type {
  IGenCommandOptions,
  ISyncCommandOptions,
  IDatabaseConnectionOptions,
} from './cli';

// Generator Types
export type {
  IGeneratorOptions,
  IGeneratorResult,
  IGeneratedFile,
  TGeneratorDataType,
  TGeneratorOutputFormat,
  IObjectFilterOptions,
} from './generator';

// Sync Types
export type {
  ILegacySyncOptions,
  TSyncOperationType,
  TSyncObjectType,
} from './sync';

// Validation Types - Removed unused types

// Environment Types - Removed unused types

// Error Types
export { DDPError, DatabaseError, ValidationError, FileError } from './errors';

export type { TErrorCode, TErrorSeverity } from './errors';

// Utility Types - Removed unused types
