import type { SchemaStateKind } from '@/types';

export type ParsedStateCreateInput =
  | {
      type: 'schema';
      schemaKind: SchemaStateKind;
      name: string;
    }
  | {
      type: 'proc';
      name: string;
      procDomain?: string;
    }
  | {
      type: 'trigger';
      name: string;
    };

export interface IStateManifestEntry {
  id: string;
  type: 'schema' | 'proc' | 'trigger';
  kind?: SchemaStateKind;
  name: string;
  path: string;
  domain?: string;
  createdAt: string;
}

export interface IStateManifest {
  version: 1;
  entries: IStateManifestEntry[];
}
