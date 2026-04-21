import type { SchemaStateKind, StateArtifactType } from '@/types';

export const TYPE_ALIASES: Record<string, StateArtifactType> = {
  schema: 'schema',
  sch: 'schema',
  proc: 'proc',
  prc: 'proc',
  trigger: 'trigger',
  trg: 'trigger',
};

export const SCHEMA_KIND_ALIASES: Record<string, SchemaStateKind> = {
  table: 'table',
  tbl: 'table',
  t: 'table',
  index: 'index',
  idx: 'index',
  i: 'index',
  constraint: 'constraint',
  cons: 'constraint',
  c: 'constraint',
  extension: 'extension',
  ext: 'extension',
  view: 'view',
  vw: 'view',
  v: 'view',
  enum: 'enum',
  en: 'enum',
};

export const schemaKindToSubdir = (kind: SchemaStateKind): string => {
  switch (kind) {
    case 'table':
      return 'tables';
    case 'index':
      return 'indexes';
    case 'constraint':
      return 'constraints';
    case 'extension':
      return 'extensions';
    case 'view':
      return 'views';
    case 'enum':
      return 'enums';
    default:
      return 'misc';
  }
};
