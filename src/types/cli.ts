/**
 * CLI command types and interfaces
 */

import type { IObjectFilterOptions } from './generator';

// Base database connection options
export interface IDatabaseConnectionOptions {
  env?: string;
  host?: string;
  port?: string;
  database?: string;
  username?: string;
  password?: string;
  schema?: string;
}

// CLI Command Types
export interface IGenCommandOptions
  extends IDatabaseConnectionOptions,
    IObjectFilterOptions {
  output?: string;
  stdout?: boolean;
}

export interface ISyncCommandOptions {
  env?: string;
  sourceHost?: string;
  sourcePort?: string;
  sourceDatabase?: string;
  sourceUsername?: string;
  sourcePassword?: string;
  sourceSchema?: string;
  targetHost?: string;
  targetPort?: string;
  targetDatabase?: string;
  targetUsername?: string;
  targetPassword?: string;
  targetSchema?: string;
  output?: string;
  dryRun?: boolean;
}
