import { readFile } from 'fs/promises';
import { TableSorter } from '@/generators/schema/utils/tableSorter';
import type { ITableDefinition } from '@/types';
import { parseStateTableSqlForDependencySort } from '@/commands/migrate/parseStateTableSql';
import type { IStateApplyFile } from '@/types/apply';

interface ITrackedTableFile {
  file: IStateApplyFile;
  originalIndex: number;
}

interface IPreparedGraphRow extends ITrackedTableFile {
  tableName: string;
  referencedTables: string[];
}

const emptyStubBase = (): Omit<ITableDefinition, 'name' | 'constraints'> => ({
  schema: 'public',
  columns: [],
  indexes: [],
  sequences: [],
});

/**
 * Reorders state `schema/tables` apply files using the same dependency sort as `ddp gen`
 * (`TableSorter.sortTablesByDependencies`) on minimal models parsed from SQL.
 * Files that cannot be parsed safely are appended after sorted files, preserving manifest order.
 */
export const reorderTableApplyBucketByDependencies = async (
  tableFiles: IStateApplyFile[]
): Promise<IStateApplyFile[]> => {
  if (tableFiles.length <= 1) {
    return tableFiles;
  }

  const tracked: ITrackedTableFile[] = tableFiles.map(
    (file, originalIndex) => ({
      file,
      originalIndex,
    })
  );

  const prepared: IPreparedGraphRow[] = [];
  const skipped: ITrackedTableFile[] = [];
  const seenTableNames = new Set<string>();

  for (const row of tracked) {
    let sql: string;
    try {
      sql = await readFile(row.file.absolutePath, 'utf8');
    } catch {
      skipped.push(row);
      continue;
    }

    const parsed = parseStateTableSqlForDependencySort(sql);
    if (
      parsed.multipleCreates ||
      parsed.tableName === null ||
      parsed.tableName.length === 0
    ) {
      skipped.push(row);
      continue;
    }

    if (seenTableNames.has(parsed.tableName)) {
      skipped.push(row);
      continue;
    }
    seenTableNames.add(parsed.tableName);

    const referencedTables = parsed.referencedTables.filter(
      ref => ref !== parsed.tableName
    );

    prepared.push({
      ...row,
      tableName: parsed.tableName,
      referencedTables,
    });
  }

  if (prepared.length === 0) {
    return tableFiles;
  }

  const tableSorter = new TableSorter();
  const stubs: ITableDefinition[] = prepared.map(row => ({
    name: row.tableName,
    ...emptyStubBase(),
    constraints: row.referencedTables.map((ref, i) => ({
      name: `_ddp_dep_${i}_${ref}`,
      type: 'FOREIGN KEY' as const,
      columns: ['_'],
      references: { table: ref, column: '_' },
    })),
  }));

  const sortedStubs = tableSorter.sortTablesByDependencies(stubs);
  const fileByTableName = new Map(
    prepared.map(row => [row.tableName, row.file])
  );

  const primary: IStateApplyFile[] = [];
  for (const t of sortedStubs) {
    const f = fileByTableName.get(t.name);
    if (f !== undefined) {
      primary.push(f);
    }
  }

  skipped.sort((a, b) => a.originalIndex - b.originalIndex);

  return [...primary, ...skipped.map(r => r.file)];
};
