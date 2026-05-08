import type { ParsedStateCreateInput } from '../../types/state';
import type { SchemaStateKind } from '@/types';
import { resolveDdpConfig } from '@/utils/ddpConfig';

const KNOWN_SCHEMA_KINDS: SchemaStateKind[] = [
  'table',
  'index',
  'constraint',
  'extension',
  'view',
  'enum',
];

const sanitizeAllowedSchemaKinds = (
  configuredKinds: string[] | undefined,
  defaults: SchemaStateKind[]
): SchemaStateKind[] => {
  if (!configuredKinds || configuredKinds.length === 0) {
    return defaults;
  }

  const sanitized = configuredKinds.filter(kind =>
    KNOWN_SCHEMA_KINDS.includes(kind as SchemaStateKind)
  ) as SchemaStateKind[];

  return sanitized.length > 0 ? sanitized : defaults;
};

export const getStatePolicy = async (): Promise<{
  strictMode: boolean;
  namePattern: RegExp;
  allowedSchemaKinds: SchemaStateKind[];
  legacyMode: boolean;
}> => {
  const defaults = {
    strictMode: true,
    namePattern: /^[a-z][a-z0-9_]*$/,
    allowedSchemaKinds: KNOWN_SCHEMA_KINDS,
    legacyMode: false,
  };

  const resolved = await resolveDdpConfig();
  if (!resolved) {
    return defaults;
  }

  const cfg = resolved.config;
  const strictMode = cfg.statePolicy?.strictMode ?? defaults.strictMode;
  const legacyMode = cfg.compat?.legacyMode ?? defaults.legacyMode;
  const allowedSchemaKinds = sanitizeAllowedSchemaKinds(
    cfg.statePolicy?.allowedSchemaKinds,
    defaults.allowedSchemaKinds
  );
  const namePattern = new RegExp(
    cfg.statePolicy?.namePattern ?? '^[a-z][a-z0-9_]*$'
  );

  return { strictMode, namePattern, allowedSchemaKinds, legacyMode };
};

export const enforcePolicy = (
  parsed: ParsedStateCreateInput,
  logicalName: string,
  policy: {
    strictMode: boolean;
    namePattern: RegExp;
    allowedSchemaKinds: SchemaStateKind[];
    legacyMode: boolean;
  }
): void => {
  if (!policy.strictMode || policy.legacyMode) {
    return;
  }

  if (!policy.namePattern.test(logicalName)) {
    throw new Error(
      `Name "${logicalName}" violates strict naming policy (${policy.namePattern.source})`
    );
  }

  if (
    parsed.type === 'schema' &&
    !policy.allowedSchemaKinds.includes(parsed.schemaKind)
  ) {
    throw new Error(
      `Schema kind "${parsed.schemaKind}" is not allowed by strict policy`
    );
  }
};
