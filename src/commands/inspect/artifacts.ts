import type { Client } from 'pg';

export interface IArtifactSummary {
  triggerNames: string[];
  tableNames: string[];
  droppedColumns: Array<{ tableName: string; columnName: string }>;
  totalCount: number;
}

/** Trigger names matching non-destructive renames (`ddp sync` / diff); need table for DROP TRIGGER. */
export const collectPreservedTriggerDropRefs = async (
  client: Client,
  schema: string
): Promise<Array<{ triggerName: string; eventObjectTable: string }>> => {
  const triggerRows = await client.query<{
    trigger_name: string;
    event_object_table: string;
  }>(
    `
      SELECT trigger_name, event_object_table
      FROM information_schema.triggers
      WHERE trigger_schema = $1
        AND trigger_name ~ '_old_[0-9]+$'
      ORDER BY trigger_name
      `,
    [schema]
  );

  return triggerRows.rows.map(row => ({
    triggerName: row.trigger_name,
    eventObjectTable: row.event_object_table,
  }));
};

export const collectPreservedArtifacts = async (
  client: Client,
  schema: string
): Promise<IArtifactSummary> => {
  const [triggerRows, tableRows, columnRows] = await Promise.all([
    client.query<{ trigger_name: string }>(
      `
      SELECT DISTINCT trigger_name
      FROM information_schema.triggers
      WHERE trigger_schema = $1
        AND trigger_name ~ '_old_[0-9]+$'
      ORDER BY trigger_name
      `,
      [schema]
    ),
    client.query<{ table_name: string }>(
      `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = $1
        AND table_type = 'BASE TABLE'
        AND table_name ~ '_dropped_[0-9]+$'
      ORDER BY table_name
      `,
      [schema]
    ),
    client.query<{ table_name: string; column_name: string }>(
      `
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = $1
        AND column_name ~ '_dropped_[0-9]+$'
      ORDER BY table_name, column_name
      `,
      [schema]
    ),
  ]);

  const triggerNames = triggerRows.rows.map(row => row.trigger_name);
  const tableNames = tableRows.rows.map(row => row.table_name);
  const droppedColumns = columnRows.rows.map(row => ({
    tableName: row.table_name,
    columnName: row.column_name,
  }));

  return {
    triggerNames,
    tableNames,
    droppedColumns,
    totalCount: triggerNames.length + tableNames.length + droppedColumns.length,
  };
};

export const formatArtifactNoticeLines = (
  artifacts: IArtifactSummary,
  schema: string
): string[] => {
  if (artifacts.totalCount === 0) {
    return [];
  }

  const preview = [
    artifacts.triggerNames.length > 0
      ? `triggers=${artifacts.triggerNames.length}`
      : '',
    artifacts.tableNames.length > 0
      ? `tables=${artifacts.tableNames.length}`
      : '',
    artifacts.droppedColumns.length > 0
      ? `columns=${artifacts.droppedColumns.length}`
      : '',
  ]
    .filter(Boolean)
    .join(', ');

  return [
    '-- Notice: preserved backup artifacts were found in target schema.',
    `-- Backup summary (${schema}): ${preview}.`,
    '-- Run `ddp inspect` for complete artifact log and cleanup guidance.',
    '-- To remove these tombstones when safe: `ddp apply --prune --dry-run`, then `ddp apply --prune`.',
  ];
};
