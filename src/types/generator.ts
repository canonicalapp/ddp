/**
 * Generator types and interfaces
 */

import type {
  ITableDefinition,
  IFunctionDefinition,
  ITriggerDefinition,
} from './database';

// Base filtering options that can be shared across commands
export interface IObjectFilterOptions {
  schemaOnly?: boolean;
  procsOnly?: boolean;
  triggersOnly?: boolean;
}

// Generator Types
export interface IGeneratorOptions extends IObjectFilterOptions {
  outputDir: string;
  stdout?: boolean;
}

export interface IGeneratorResult {
  success: boolean;
  files?: IGeneratedFile[];
  error?: string;
}

export interface IGeneratedFile {
  name: string;
  content: string;
  path?: string;
}

// Generator Data Types
export type TGeneratorDataType =
  | ITableDefinition
  | IFunctionDefinition
  | ITriggerDefinition;

export type TGeneratorOutputFormat = 'sql' | 'json' | 'yaml';
