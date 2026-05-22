/**
 * Table Operations Module
 * Handles table creation, dropping, and comparison logic
 */

import type { ILegacySyncOptions, ITableDefinition, TArray, TNullable } from '@/types';
import { TableSorter } from '@/generators/schema/utils/tableSorter';
import { isDdpDiffIgnoredTable } from '@/sync/ddpInternalSchema';
import {
  getPendingTableRemovals,
  resolveRemovedTableStrategy,
} from '@/sync/pendingTableRemoval';
import {
  type SyncDbSide,
  clientForSyncSide,
  schemaNameForSide,
} from '@/sync/syncClient';
import { Utils } from '@/utils/formatting';
import type { Client } from 'pg';

interface ITableRow {
  table_name: string;
}

interface IColumnRow {
  column_name: string;
  data_type: string;
  resolved_type?: string;
  character_maximum_length: TNullable<number>;
  is_nullable: 'YES' | 'NO';
  column_default: TNullable<string>;
  ordinal_position: number;
}

export class TableOperations {
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

  /**
   * Get all tables from a schema on the given database (source vs target).
   */
  async getTables(side: SyncDbSide): Promise<TArray<ITableRow>> {
    const tablesQuery = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = $1 
      AND table_type = 'BASE TABLE'
    `;

    const schemaName = schemaNameForSide(side, this.options);
    const client = clientForSyncSide(
      side,
      this.sourceClient,
      this.targetClient
    );
    const result = await client.query(tablesQuery, [schemaName]);

    // Validate query result structure
    if (typeof result !== 'object') {
      throw new Error('Invalid query result: result is not an object');
    }

    if (!('rows' in result)) {
      throw new Error('Invalid query result: missing rows property');
    }

    if (!Array.isArray(result.rows)) {
      throw new Error('Invalid query result: rows is not an array');
    }

    return result.rows;
  }

  /**
   * Get table definition from schema on the given database.
   */
  async getTableDefinition(
    side: SyncDbSide,
    tableName: string
  ): Promise<TArray<IColumnRow>> {
    const tableDefQuery = `
      SELECT 
        column_name,
        data_type,
        pg_catalog.format_type(a.atttypid, a.atttypmod) AS resolved_type,
        character_maximum_length,
        is_nullable,
        column_default,
        ordinal_position
      FROM information_schema.columns c
      JOIN pg_catalog.pg_namespace n ON n.nspname = c.table_schema
      JOIN pg_catalog.pg_class cls ON cls.relname = c.table_name AND cls.relnamespace = n.oid
      JOIN pg_catalog.pg_attribute a ON a.attrelid = cls.oid AND a.attname = c.column_name
      WHERE c.table_schema = $1 AND c.table_name = $2
      ORDER BY ordinal_position
    `;

    const schemaName = schemaNameForSide(side, this.options);
    const client = clientForSyncSide(
      side,
      this.sourceClient,
      this.targetClient
    );
    const result = await client.query(tableDefQuery, [schemaName, tableName]);

    return result.rows;
  }

  /**
   * Convert IColumnRow to ColumnInfo format expected by Utils
   */
  private convertToColumnInfo(column: IColumnRow) {
    const result: {
      column_name: string;
      data_type: string;
      is_nullable: 'YES' | 'NO';
      character_maximum_length?: number;
      column_default?: string;
    } = {
      column_name: column.column_name,
      data_type: column.data_type,
      ...(column.resolved_type && { resolved_type: column.resolved_type }),
      is_nullable: column.is_nullable,
    };

    if (column.character_maximum_length !== null) {
      result.character_maximum_length = column.character_maximum_length;
    }

    if (column.column_default !== null) {
      result.column_default = column.column_default;
    }

    return result;
  }

  /**
   * Generate CREATE TABLE statement
   */
  generateCreateTableStatement(tableName: string, columns: TArray<IColumnRow>) {
    if (columns.length === 0) return null;

    const columnDefs = columns
      .map(col =>
        Utils.formatColumnDefinition(
          this.convertToColumnInfo(col),
          this.options.target
        )
      )
      .join(',\n  ');

    return `CREATE TABLE IF NOT EXISTS ${this.options.target}.${tableName} (\n  ${columnDefs}\n);`;
  }

  /**
   * Handle creation of missing tables
   */
  async handleMissingTables(
    missingTables: ITableRow[],
    alterStatements: string[]
  ) {
    for (const table of missingTables) {
      alterStatements.push(`-- Create missing table ${table.table_name}`);

      const columns = await this.getTableDefinition('source', table.table_name);

      const createStatement = this.generateCreateTableStatement(
        table.table_name,
        columns
      );

      if (createStatement) {
        alterStatements.push(createStatement);
      }
    }
  }

  /**
   * FK edges among tables slated for removal (child table_name → parent referenced).
   */
  private async getIntraRemovalForeignKeyRefs(
    tableNames: ReadonlySet<string>
  ): Promise<Map<string, Set<string>>> {
    const refsByTable = new Map<string, Set<string>>();
    if (tableNames.size === 0) {
      return refsByTable;
    }

    const schemaName = schemaNameForSide('target', this.options);
    const names = [...tableNames];
    const query = `
      SELECT DISTINCT
        tc.table_name AS child_table,
        ccu.table_name AS parent_table
      FROM information_schema.table_constraints tc
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_schema = tc.constraint_schema
        AND ccu.constraint_name = tc.constraint_name
      WHERE tc.table_schema = $1
        AND tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_name = ANY($2::text[])
        AND ccu.table_name = ANY($2::text[])
    `;

    const client = clientForSyncSide(
      'target',
      this.sourceClient,
      this.targetClient
    );
    const result = await client.query(query, [schemaName, names]);

    for (const row of result.rows as Array<{
      child_table: string;
      parent_table: string;
    }>) {
      if (row.child_table === row.parent_table) {
        continue;
      }
      const existing = refsByTable.get(row.child_table) ?? new Set<string>();
      existing.add(row.parent_table);
      refsByTable.set(row.child_table, existing);
    }

    return refsByTable;
  }

  async sortTablesToDropForCascadeAsync(
    tablesToDrop: TArray<ITableRow>
  ): Promise<ITableRow[]> {
    if (tablesToDrop.length <= 1) {
      return [...tablesToDrop];
    }

    const names = new Set(tablesToDrop.map(t => t.table_name));
    const refsByTable = await this.getIntraRemovalForeignKeyRefs(names);
    const emptyStubBase = (): Omit<ITableDefinition, 'name' | 'constraints'> => ({
      schema: 'public',
      columns: [],
      indexes: [],
      sequences: [],
    });

    const stubs: ITableDefinition[] = tablesToDrop.map(row => {
      const referenced = [...(refsByTable.get(row.table_name) ?? [])];
      return {
        name: row.table_name,
        ...emptyStubBase(),
        constraints: referenced.map((ref, i) => ({
          name: `_ddp_drop_dep_${i}_${ref}`,
          type: 'FOREIGN KEY' as const,
          columns: ['_'],
          references: { table: ref, column: '_' },
        })),
      };
    });

    const tableSorter = new TableSorter();
    const parentBeforeChild = tableSorter.sortTablesByDependencies(stubs);
    const childBeforeParent = [...parentBeforeChild].reverse();

    const byName = new Map(tablesToDrop.map(t => [t.table_name, t]));
    const ordered: ITableRow[] = [];
    const seen = new Set<string>();

    for (const stub of childBeforeParent) {
      const row = byName.get(stub.name);
      if (row) {
        ordered.push(row);
        seen.add(row.table_name);
      }
    }

    for (const row of tablesToDrop) {
      if (!seen.has(row.table_name)) {
        ordered.push(row);
      }
    }

    return ordered;
  }

  /**
   * Rename-first preservation for removed tables (non-destructive policy).
   */
  handleTablesToDropWithPreserveRename(
    tablesToDrop: TArray<ITableRow>,
    alterStatements: TArray<string>
  ) {
    for (const table of tablesToDrop) {
      const backupName = Utils.generateBackupName(table.table_name);

      alterStatements.push(
        `-- Table ${table.table_name} exists in ${this.options.target} but not in ${this.options.source}`
      );
      alterStatements.push(
        '-- Renaming table to preserve data before manual drop'
      );
      alterStatements.push(
        `ALTER TABLE ${this.options.target}.${table.table_name} RENAME TO ${backupName};`
      );
      alterStatements.push(
        `-- TODO: Manually drop table ${this.options.target}.${backupName} after confirming data is no longer needed`
      );
      alterStatements.push('');
    }
  }

  /**
   * DROP TABLE ... CASCADE for tables removed from desired schema (FK-safe order).
   */
  handleTablesToDropWithCascade(
    tablesToDrop: TArray<ITableRow>,
    alterStatements: TArray<string>
  ) {
    if (tablesToDrop.length > 0) {
      const names = tablesToDrop.map(t => t.table_name).join(', ');
      alterStatements.push(
        `-- Removing ${tablesToDrop.length} table(s) absent from source (child → parent order): ${names}`
      );
      alterStatements.push('');
    }

    for (const table of tablesToDrop) {
      alterStatements.push(
        `-- Table ${table.table_name} exists in ${this.options.target} but not in ${this.options.source}`
      );
      alterStatements.push(
        '-- Removing table and dependent constraints/indexes via CASCADE'
      );
      alterStatements.push(
        `DROP TABLE IF EXISTS ${this.options.target}.${table.table_name} CASCADE;`
      );
      alterStatements.push('');
    }
  }

  /**
   * Tables present on target but absent from source (removed from desired schema).
   */
  async getTablesToDrop(): Promise<TArray<ITableRow>> {
    const sourceTables = await this.getTables('source');
    const targetTables = await this.getTables('target');

    return targetTables.filter(
      p =>
        !isDdpDiffIgnoredTable(p.table_name) &&
        !sourceTables.some(d => d.table_name === p.table_name)
    );
  }

  /**
   * Create tables that exist in source but not target.
   * Removed-table handling runs in `generateRemovedTableOperations` (final section).
   */
  async generateTableOperations() {
    const alterStatements: string[] = [];

    const sourceTables = await this.getTables('source');
    const targetTables = await this.getTables('target');

    const missingTables = sourceTables.filter(
      d =>
        !isDdpDiffIgnoredTable(d.table_name) &&
        !targetTables.some(p => p.table_name === d.table_name)
    );

    await this.handleMissingTables(missingTables, alterStatements);

    return alterStatements;
  }

  private async resolveTablesPendingRemoval(): Promise<TArray<ITableRow>> {
    const cached = getPendingTableRemovals(this.options);
    if (cached.size > 0) {
      const targetTables = await this.getTables('target');
      return targetTables.filter(t => cached.has(t.table_name));
    }
    return this.getTablesToDrop();
  }

  /**
   * Final section: CASCADE drops (default) or rename-first preservation.
   */
  async generateRemovedTableOperations() {
    const alterStatements: string[] = [];
    const tablesToDrop = await this.resolveTablesPendingRemoval();
    if (tablesToDrop.length === 0) {
      return alterStatements;
    }

    const strategy = resolveRemovedTableStrategy(this.options);
    if (strategy === 'preserve-rename') {
      this.handleTablesToDropWithPreserveRename(tablesToDrop, alterStatements);
      return alterStatements;
    }

    const ordered = await this.sortTablesToDropForCascadeAsync(tablesToDrop);
    this.handleTablesToDropWithCascade(ordered, alterStatements);
    return alterStatements;
  }

  /** @deprecated Use `generateRemovedTableOperations` */
  async generateRemovedTableCascadeDrops() {
    return this.generateRemovedTableOperations();
  }
}
