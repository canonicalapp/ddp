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
  ISyncOptions,
  ILegacySyncOptions,
  ISyncResult,
  ISyncOperation,
  TSyncOperationType,
  TSyncObjectType,
} from './sync';

// File Types
export type {
  IFileOutputOptions,
  IFileOutputResult,
  TFileFormat,
  TFileEncoding,
} from './file';

// Validation Types
export type {
  IValidationResult,
  IValidationErrorItem,
  TValidationRule,
  TValidationSeverity,
} from './validation';

// Environment Types
export type {
  IEnvironmentConfig,
  TEnvironmentKey,
  TEnvironmentValue,
} from './environment';

// Error Types
export { DDPError, DatabaseError, ValidationError, FileError } from './errors';

export type { TErrorCode, TErrorSeverity } from './errors';

// Utility Types
export type { IComparisonResult } from './utils';
