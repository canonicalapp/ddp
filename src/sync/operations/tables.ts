/**
 * Table Operations Module
 * Handles table creation, dropping, and comparison logic
 */

import type { Client } from 'pg';
import { Utils } from '@/utils/formatting';
import type { ILegacySyncOptions, TNullable } from '@/types';

interface ITableRow {
  table_name: string;
}

interface IColumnRow {
  column_name: string;
  data_type: string;
  character_maximum_length: TNullable<number>;
  is_nullable: 'YES' | 'NO';
  column_default: TNullable<string>;
  ordinal_position: number;
}

export class TableOperations {
  private client: Client;
  private options: ILegacySyncOptions;

  constructor(client: Client, options: ILegacySyncOptions) {
    this.client = client;
    this.options = options;
  }

  /**
   * Get all tables from a schema
   */
  async getTables(schemaName: string): Promise<ITableRow[]> {
    const tablesQuery = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = $1 
      AND table_type = 'BASE TABLE'
    `;

    const result = await this.client.query(tablesQuery, [schemaName]);

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
   * Get table definition from schema
   */
  async getTableDefinition(
    schemaName: string,
    tableName: string
  ): Promise<IColumnRow[]> {
    const tableDefQuery = `
      SELECT 
        column_name,
        data_type,
        character_maximum_length,
        is_nullable,
        column_default,
        ordinal_position
      FROM information_schema.columns 
      WHERE table_schema = $1 AND table_name = $2
      ORDER BY ordinal_position
    `;

    const result = await this.client.query(tableDefQuery, [
      schemaName,
      tableName,
    ]);

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
  generateCreateTableStatement(
    tableName: string,
    columns: IColumnRow[]
  ): string | null {
    if (columns.length === 0) return null;

    const columnDefs = columns
      .map(col => Utils.formatColumnDefinition(this.convertToColumnInfo(col)))
      .join(',\n  ');

    return `CREATE TABLE ${this.options.target}.${tableName} (\n  ${columnDefs}\n);`;
  }

  /**
   * Handle creation of missing tables
   */
  async handleMissingTables(
    missingTables: ITableRow[],
    alterStatements: string[]
  ): Promise<void> {
    for (const table of missingTables) {
      alterStatements.push(`-- Create missing table ${table.table_name}`);

      const columns = await this.getTableDefinition(
        this.options.source,
        table.table_name
      );

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
   * Handle tables that need to be dropped
   */
  handleTablesToDrop(
    tablesToDrop: ITableRow[],
    alterStatements: string[]
  ): void {
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
    }
  }

  /**
   * Generate table operations for schema sync
   */
  async generateTableOperations(): Promise<string[]> {
    const alterStatements: string[] = [];

    const sourceTables = await this.getTables(this.options.source);
    const targetTables = await this.getTables(this.options.target);

    // Find missing tables in target (tables in source but not in target)
    const missingTables = sourceTables.filter(
      d => !targetTables.some(p => p.table_name === d.table_name)
    );

    // Find tables to drop in target (tables in target but not in source)
    const tablesToDrop = targetTables.filter(
      p => !sourceTables.some(d => d.table_name === p.table_name)
    );

    await this.handleMissingTables(missingTables, alterStatements);
    this.handleTablesToDrop(tablesToDrop, alterStatements);

    return alterStatements;
  }
}
