/**
 * CLI command types and interfaces
 */

// CLI Command Types
export interface IGenCommandOptions {
  env?: string;
  host?: string;
  port?: string;
  database?: string;
  username?: string;
  password?: string;
  schema?: string;
  output?: string;
  stdout?: boolean;
  schemaOnly?: boolean;
  procsOnly?: boolean;
  triggersOnly?: boolean;
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
