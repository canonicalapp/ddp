/**
 * Target vs shadow schema names for migrate diff and state apply.
 * Target comes from DB env / CLI; shadow from config or DDP_SHADOW_SCHEMA.
 */

import type { IDatabaseConnection } from '@/types/database';

export const DEFAULT_SHADOW_SCHEMA = 'ddp_shadow';

export interface ICatalogSchemaNames {
  targetSchema: string;
  shadowSchema: string;
}

export const resolveCatalogSchemaNames = (
  targetSchema: string,
  shadowSchemaOverride?: string
): ICatalogSchemaNames => {
  const shadow =
    shadowSchemaOverride?.trim() ||
    process.env.DDP_SHADOW_SCHEMA?.trim() ||
    DEFAULT_SHADOW_SCHEMA;

  return {
    targetSchema: targetSchema.trim() || 'public',
    shadowSchema: shadow,
  };
};

export const resolveCatalogSchemaNamesFromConnection = (
  connection: IDatabaseConnection,
  shadowSchemaOverride?: string
): ICatalogSchemaNames => {
  const target = connection.schema?.trim() || 'public';
  return resolveCatalogSchemaNames(target, shadowSchemaOverride);
};
