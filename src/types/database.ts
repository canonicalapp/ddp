/**
 * Database-related types and interfaces
 */

import type { TOptional } from './app';

// Database Connection Types
export interface IDatabaseConnection {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  schema?: string;
}

export interface IDatabaseConfig extends IDatabaseConnection {
  connectionString?: string;
}

// Database Schema Types
export interface IColumnDefinition {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue?: string;
  length?: number;
  precision?: number;
  scale?: number;
  isIdentity?: boolean;
  identityGeneration?: 'ALWAYS' | 'BY DEFAULT' | undefined;
  generated?: 'ALWAYS' | 'BY DEFAULT' | 'NEVER' | undefined;
  ordinalPosition: number;
}

export interface IConstraintDefinition {
  name: string;
  type: 'PRIMARY KEY' | 'FOREIGN KEY' | 'UNIQUE' | 'CHECK' | 'NOT NULL';
  columns: string[];
  references?:
    | {
        table: string;
        column: string;
      }
    | undefined;
  checkClause?: string;
  deferrable?: boolean;
  initiallyDeferred?: boolean;
  onDelete?: 'CASCADE' | 'SET NULL' | 'SET DEFAULT' | 'RESTRICT' | 'NO ACTION';
  onUpdate?: 'CASCADE' | 'SET NULL' | 'SET DEFAULT' | 'RESTRICT' | 'NO ACTION';
}

export interface IIndexDefinition {
  name: string;
  table: string;
  columns: string[];
  unique: boolean;
  partial?: string;
  method?: 'btree' | 'hash' | 'gist' | 'gin' | 'spgist' | 'brin';
}

export interface ITableDefinition {
  name: string;
  schema: string;
  columns: IColumnDefinition[];
  constraints: IConstraintDefinition[];
  indexes: IIndexDefinition[];
  comment?: TOptional<string>;
}

export interface IFunctionDefinition {
  name: string;
  schema: string;
  parameters: IFunctionParameter[];
  returnType: string;
  language: string;
  body: string;
  volatility: 'VOLATILE' | 'STABLE' | 'IMMUTABLE';
  security: 'DEFINER' | 'INVOKER';
  comment?: TOptional<string>;
}

export interface IFunctionParameter {
  name: string;
  type: string;
  mode: 'IN' | 'OUT' | 'INOUT' | 'VARIADIC';
  defaultValue?: string;
}

export interface ITriggerDefinition {
  name: string;
  table: string;
  schema: string;
  event: 'INSERT' | 'UPDATE' | 'DELETE' | 'TRUNCATE';
  timing: 'BEFORE' | 'AFTER' | 'INSTEAD OF';
  function: string;
  condition?: string;
  comment?: TOptional<string>;
}

// Database Utility Types
export type TDatabaseObjectType =
  | 'TABLE'
  | 'FUNCTION'
  | 'TRIGGER'
  | 'INDEX'
  | 'CONSTRAINT'
  | 'COLUMN';
export type TSQLDialect = 'postgresql' | 'mysql' | 'sqlite' | 'mssql';
