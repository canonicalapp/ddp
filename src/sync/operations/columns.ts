/**
 * Column Operations Module
 * Handles column comparison, addition, modification, and dropping logic
 */

import type { Client } from 'pg';
import { Utils } from '@/utils/formatting';
import type { TRecord, ILegacySyncOptions } from '@/types';

interface ColumnInfo {
  table_name: string;
  column_name: string;
  data_type: string;
  character_maximum_length?: number;
  is_nullable: 'YES' | 'NO';
  column_default?: string;
  ordinal_position: number;
}

export class ColumnOperations {
  private client: Client;
  private options: ILegacySyncOptions;

  constructor(client: Client, options: ILegacySyncOptions) {
    this.client = client;
    this.options = options;
  }

  /**
   * Get all columns from a schema
   */
  async getColumns(schemaName: string): Promise<ColumnInfo[]> {
    const columnsQuery = `
      SELECT 
        table_name, 
        column_name, 
        data_type, 
        character_maximum_length,
        is_nullable, 
        column_default,
        ordinal_position
      FROM information_schema.columns 
      WHERE table_schema = $1 
      ORDER BY table_name, ordinal_position
    `;

    const result = await this.client.query(columnsQuery, [schemaName]);
    return result.rows as ColumnInfo[];
  }

  /**
   * Group columns by table name
   */
  groupColumnsByTable(columns: ColumnInfo[]): Record<string, ColumnInfo[]> {
    const grouped: TRecord<string, ColumnInfo[]> = {};

    columns.forEach(col => {
      grouped[col.table_name] ??= [];
      grouped[col.table_name]?.push(col);
    });

    return grouped;
  }

  /**
   * Generate column definition string
   */
  generateColumnDefinition(column: ColumnInfo): string {
    return Utils.formatColumnDefinition(column);
  }

  /**
   * Generate ALTER COLUMN statement for modifications
   */
  generateAlterColumnStatement(
    tableName: string,
    sourceCol: ColumnInfo,
    targetCol: ColumnInfo
  ): string {
    const sourceType = sourceCol.character_maximum_length
      ? `${sourceCol.data_type}(${sourceCol.character_maximum_length})`
      : sourceCol.data_type;
    const targetType = targetCol.character_maximum_length
      ? `${targetCol.data_type}(${targetCol.character_maximum_length})`
      : targetCol.data_type;

    let alterColumn = `ALTER TABLE ${this.options.target}.${tableName} ALTER COLUMN ${sourceCol.column_name}`;

    // Handle data type change
    if (sourceType !== targetType) {
      alterColumn += ` TYPE ${sourceType}`;
    }

    // Handle nullability change
    if (sourceCol.is_nullable !== targetCol.is_nullable) {
      if (sourceCol.is_nullable === 'NO') {
        alterColumn += ' SET NOT NULL';
      } else {
        alterColumn += ' DROP NOT NULL';
      }
    }

    // Handle default value change
    if (sourceCol.column_default !== targetCol.column_default) {
      if (sourceCol.column_default) {
        alterColumn += ` SET DEFAULT ${sourceCol.column_default}`;
      } else {
        alterColumn += ' DROP DEFAULT';
      }
    }

    return `${alterColumn};`;
  }

  /**
   * Handle columns that need to be dropped
   */
  handleColumnsToDrop(
    tableName: string,
    columnsToDrop: ColumnInfo[],
    alterStatements: string[]
  ): void {
    for (const colToDrop of columnsToDrop) {
      const backupName = Utils.generateBackupName(colToDrop.column_name);

      alterStatements.push(
        `-- Column ${colToDrop.column_name} exists in ${this.options.target} but not in ${this.options.source}`
      );
      alterStatements.push(
        '-- Renaming column to preserve data before manual drop'
      );
      alterStatements.push(
        `ALTER TABLE ${this.options.target}.${tableName} RENAME COLUMN ${colToDrop.column_name} TO ${backupName};`
      );
      alterStatements.push(
        `-- TODO: Manually drop column ${this.options.target}.${tableName}.${backupName} after confirming data is no longer needed`
      );
    }
  }

  /**
   * Handle column modification with detailed comments
   */
  handleColumnModification(
    tableName: string,
    sourceCol: ColumnInfo,
    targetCol: ColumnInfo,
    alterStatements: string[]
  ): void {
    const sourceType = Utils.formatDataType(sourceCol);
    const targetType = Utils.formatDataType(targetCol);

    alterStatements.push(
      `-- Modifying column ${tableName}.${sourceCol.column_name}`
    );
    alterStatements.push(
      `--   ${this.options.source}: ${sourceType} ${
        sourceCol.is_nullable === 'NO' ? 'NOT NULL' : ''
      } ${sourceCol.column_default ? `DEFAULT ${sourceCol.column_default}` : ''}`
    );
    alterStatements.push(
      `--   ${this.options.target}: ${targetType} ${
        targetCol.is_nullable === 'NO' ? 'NOT NULL' : ''
      } ${targetCol.column_default ? `DEFAULT ${targetCol.column_default}` : ''}`
    );

    const alterStatement = this.generateAlterColumnStatement(
      tableName,
      sourceCol,
      targetCol
    );
    alterStatements.push(alterStatement);
  }

  /**
   * Handle columns that need to be added or modified
   */
  handleColumnsToAddOrModify(
    tableName: string,
    sourceTableCols: ColumnInfo[],
    targetTableCols: ColumnInfo[],
    alterStatements: string[]
  ): void {
    for (const sourceCol of sourceTableCols) {
      const targetCol = targetTableCols.find(
        t => t.column_name === sourceCol.column_name
      );

      if (!targetCol) {
        // Column exists in source but not in target - add it
        const columnDef = this.generateColumnDefinition(sourceCol);
        alterStatements.push(
          `ALTER TABLE ${this.options.target}.${tableName} ADD COLUMN ${columnDef};`
        );
      } else {
        // Column exists in both, check for differences
        const sourceType = Utils.formatDataType(sourceCol);
        const targetType = Utils.formatDataType(targetCol);

        if (
          sourceType !== targetType ||
          sourceCol.is_nullable !== targetCol.is_nullable ||
          sourceCol.column_default !== targetCol.column_default
        ) {
          this.handleColumnModification(
            tableName,
            sourceCol,
            targetCol,
            alterStatements
          );
        }
      }
    }
  }

  /**
   * Generate column operations for schema sync
   */
  async generateColumnOperations(): Promise<string[]> {
    const alterStatements: string[] = [];

    const sourceColumns = await this.getColumns(this.options.source);
    const targetColumns = await this.getColumns(this.options.target);

    const sourceColumnsByTable = this.groupColumnsByTable(sourceColumns);
    const targetColumnsByTable = this.groupColumnsByTable(targetColumns);

    // Find column differences for existing tables
    for (const tableName of Object.keys(sourceColumnsByTable)) {
      // Only process tables that exist in both schemas
      if (targetColumnsByTable[tableName]) {
        const sourceTableCols = sourceColumnsByTable[tableName] ?? [];
        const targetTableCols = targetColumnsByTable[tableName] ?? [];

        // Find columns that exist in target but not in source (need to be dropped)
        const columnsToDrop = targetTableCols.filter(
          targetCol =>
            !sourceTableCols.some(
              sourceCol => sourceCol.column_name === targetCol.column_name
            )
        );

        this.handleColumnsToDrop(tableName, columnsToDrop, alterStatements);
        this.handleColumnsToAddOrModify(
          tableName,
          sourceTableCols,
          targetTableCols,
          alterStatements
        );
      }
    }

    return alterStatements;
  }
}
