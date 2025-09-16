/**
 * Generator types and interfaces
 */

import type {
  ITableDefinition,
  IFunctionDefinition,
  ITriggerDefinition,
} from './database';

// Generator Types
export interface IGeneratorOptions {
  outputDir: string;
  stdout?: boolean;
  schemaOnly?: boolean;
  procsOnly?: boolean;
  triggersOnly?: boolean;
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
