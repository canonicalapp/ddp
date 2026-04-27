import type { ILegacySyncOptions, TArray } from '@/types';
import {
  type SyncDbSide,
  clientForSyncSide,
  schemaNameForSide,
} from '@/sync/syncClient';
import type { Client } from 'pg';

interface IEnumLabelRow {
  enum_name: string;
  enum_schema: string;
  enum_label: string;
  sort_order: number;
}

interface IEnumType {
  name: string;
  schema: string;
  labels: string[];
}

const escapeIdent = (identifier: string): string =>
  `"${identifier.replace(/"/g, '""')}"`;

const escapeLiteral = (value: string): string =>
  `'${value.replace(/'/g, "''")}'`;

const enumKey = (name: string): string => name;

export class EnumOperations {
  private sourceClient: Client;
  private targetClient: Client;
  private options: ILegacySyncOptions;

  constructor(
    sourceClient: Client,
    targetClient: Client,
    options: ILegacySyncOptions
  ) {
    this.sourceClient = sourceClient;
    this.targetClient = targetClient;
    this.options = options;
  }

  async getEnums(side: SyncDbSide): Promise<TArray<IEnumType>> {
    const schemaName = schemaNameForSide(side, this.options);
    const client = clientForSyncSide(
      side,
      this.sourceClient,
      this.targetClient
    );

    const query = `
      SELECT
        t.typname AS enum_name,
        n.nspname AS enum_schema,
        e.enumlabel AS enum_label,
        e.enumsortorder AS sort_order
      FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
      JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE t.typtype = 'e'
        AND n.nspname = $1
      ORDER BY enum_name, sort_order
    `;

    const result = await client.query<IEnumLabelRow>(query, [schemaName]);
    const grouped = new Map<string, IEnumType>();

    for (const row of result.rows) {
      const key = enumKey(row.enum_name);
      const existing = grouped.get(key);
      if (existing) {
        existing.labels.push(row.enum_label);
      } else {
        grouped.set(key, {
          name: row.enum_name,
          schema: row.enum_schema,
          labels: [row.enum_label],
        });
      }
    }

    return [...grouped.values()];
  }

  async generateEnumOperations(): Promise<string[]> {
    const statements: string[] = [];
    const sourceEnums = await this.getEnums('source');
    const targetEnums = await this.getEnums('target');

    const targetByKey = new Map(
      targetEnums.map(e => [enumKey(e.name), e] as const)
    );
    const sourceByKey = new Map(
      sourceEnums.map(e => [enumKey(e.name), e] as const)
    );

    for (const sourceEnum of sourceEnums) {
      const key = enumKey(sourceEnum.name);
      const targetEnum = targetByKey.get(key);
      const enumRef = `${escapeIdent(this.options.target)}.${escapeIdent(sourceEnum.name)}`;

      if (!targetEnum) {
        const labelsSql = sourceEnum.labels.map(escapeLiteral).join(', ');
        statements.push(`CREATE TYPE ${enumRef} AS ENUM (${labelsSql});`);
        continue;
      }

      const targetLabelSet = new Set(targetEnum.labels);
      for (const label of sourceEnum.labels) {
        if (!targetLabelSet.has(label)) {
          statements.push(
            `ALTER TYPE ${enumRef} ADD VALUE IF NOT EXISTS ${escapeLiteral(label)};`
          );
        }
      }
    }

    for (const targetEnum of targetEnums) {
      const key = enumKey(targetEnum.name);
      if (!sourceByKey.has(key)) {
        statements.push(
          `-- TODO: Enum ${this.options.target}.${targetEnum.name} exists in target only; drop manually after validating dependencies.`
        );
      }
    }

    return statements;
  }
}
