/**
 * Column Operations Module
 * Handles column comparison, addition, modification, and dropping logic
 */

import {Utils} from './utils.js';

export class ColumnOperations {
  constructor(client, options) {
    this.client = client;
    this.options = options;
  }

  /**
   * Get all columns from a schema
   */
  async getColumns(schemaName) {
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
    return result.rows;
  }

  /**
   * Group columns by table name
   */
  groupColumnsByTable(columns) {
    const grouped = {};

    columns.forEach((col) => {
      if (!grouped[col.table_name]) {
        grouped[col.table_name] = [];
      }

      grouped[col.table_name].push(col);
    });

    return grouped;
  }

  /**
   * Generate column definition string
   */
  generateColumnDefinition(column) {
    return Utils.formatColumnDefinition(column);
  }

  /**
   * Generate ALTER COLUMN statement for modifications
   */
  generateAlterColumnStatement(tableName, devCol, prodCol) {
    const devType = devCol.character_maximum_length
      ? `${devCol.data_type}(${devCol.character_maximum_length})`
      : devCol.data_type;
    const prodType = prodCol.character_maximum_length
      ? `${prodCol.data_type}(${prodCol.character_maximum_length})`
      : prodCol.data_type;

    let alterColumn = `ALTER TABLE ${this.options.prod}.${tableName} ALTER COLUMN ${devCol.column_name}`;

    // Handle data type change
    if (devType !== prodType) {
      alterColumn += ` TYPE ${devType}`;
    }

    // Handle nullability change
    if (devCol.is_nullable !== prodCol.is_nullable) {
      if (devCol.is_nullable === 'NO') {
        alterColumn += ` SET NOT NULL`;
      } else {
        alterColumn += ` DROP NOT NULL`;
      }
    }

    // Handle default value change
    if (devCol.column_default !== prodCol.column_default) {
      if (devCol.column_default) {
        alterColumn += ` SET DEFAULT ${devCol.column_default}`;
      } else {
        alterColumn += ` DROP DEFAULT`;
      }
    }

    return alterColumn + ';';
  }

  /**
   * Generate column operations for schema sync
   */
  async generateColumnOperations() {
    const alterStatements = [];

    const devColumns = await this.getColumns(this.options.dev);
    const prodColumns = await this.getColumns(this.options.prod);

    const devColumnsByTable = this.groupColumnsByTable(devColumns);
    const prodColumnsByTable = this.groupColumnsByTable(prodColumns);

    // Find column differences for existing tables
    for (const tableName of Object.keys(devColumnsByTable)) {
      // Only process tables that exist in both schemas
      if (prodColumnsByTable[tableName]) {
        const devTableCols = devColumnsByTable[tableName];
        const prodTableCols = prodColumnsByTable[tableName];

        // Find columns that exist in prod but not in dev (need to be dropped)
        const columnsToDrop = prodTableCols.filter(
          (prodCol) =>
            !devTableCols.some(
              (devCol) => devCol.column_name === prodCol.column_name
            )
        );

        // Handle columns to drop (rename first for data preservation)
        for (const colToDrop of columnsToDrop) {
          const backupName = Utils.generateBackupName(colToDrop.column_name);

          alterStatements.push(
            `-- Column ${colToDrop.column_name} exists in prod but not in dev`
          );
          alterStatements.push(
            `-- Renaming column to preserve data before manual drop`
          );
          alterStatements.push(
            `ALTER TABLE ${this.options.prod}.${tableName} RENAME COLUMN ${colToDrop.column_name} TO ${backupName};`
          );
          alterStatements.push(
            `-- TODO: Manually drop column ${this.options.prod}.${tableName}.${backupName} after confirming data is no longer needed`
          );
        }

        // Process columns that exist in dev
        for (const devCol of devTableCols) {
          const prodCol = prodTableCols.find(
            (p) => p.column_name === devCol.column_name
          );

          if (!prodCol) {
            // Column exists in dev but not in prod - add it
            const columnDef = this.generateColumnDefinition(devCol);
            alterStatements.push(
              `ALTER TABLE ${this.options.prod}.${tableName} ADD COLUMN ${columnDef};`
            );
          } else {
            // Column exists in both, check for differences
            const devType = Utils.formatDataType(devCol);
            const prodType = Utils.formatDataType(prodCol);

            if (
              devType !== prodType ||
              devCol.is_nullable !== prodCol.is_nullable ||
              devCol.column_default !== prodCol.column_default
            ) {
              alterStatements.push(
                `-- Modifying column ${tableName}.${devCol.column_name}`
              );
              alterStatements.push(
                `--   Dev: ${devType} ${
                  devCol.is_nullable === 'NO' ? 'NOT NULL' : ''
                } ${
                  devCol.column_default
                    ? 'DEFAULT ' + devCol.column_default
                    : ''
                }`
              );
              alterStatements.push(
                `--   Prod: ${prodType} ${
                  prodCol.is_nullable === 'NO' ? 'NOT NULL' : ''
                } ${
                  prodCol.column_default
                    ? 'DEFAULT ' + prodCol.column_default
                    : ''
                }`
              );

              const alterStatement = this.generateAlterColumnStatement(
                tableName,
                devCol,
                prodCol
              );
              alterStatements.push(alterStatement);
            }
          }
        }
      }
    }

    return alterStatements;
  }
}
