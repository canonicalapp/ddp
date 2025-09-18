/**
 * Environment configuration types and interfaces
 */

// Environment Types
export interface IEnvironmentConfig {
  DB_HOST?: string;
  DB_PORT?: string;
  DB_NAME?: string;
  DB_USER?: string;
  DB_PASSWORD?: string;
  DB_SCHEMA?: string;
  SOURCE_DB_HOST?: string;
  SOURCE_DB_PORT?: string;
  SOURCE_DB_NAME?: string;
  SOURCE_DB_USER?: string;
  SOURCE_DB_PASSWORD?: string;
  SOURCE_DB_SCHEMA?: string;
  TARGET_DB_HOST?: string;
  TARGET_DB_PORT?: string;
  TARGET_DB_NAME?: string;
  TARGET_DB_USER?: string;
  TARGET_DB_PASSWORD?: string;
  TARGET_DB_SCHEMA?: string;
}

// Environment Utility Types
export type TEnvironmentKey = keyof IEnvironmentConfig;
export type TEnvironmentValue = string | undefined;
