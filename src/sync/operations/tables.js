/**
 * Table Operations Module
 * Handles table creation, dropping, and comparison logic
 */

import { Utils } from '../../utils/formatting.js';

export class TableOperations {
  constructor(client, options) {
    this.client = client;
    this.options = options;
  }

  /**
   * Get all tables from a schema
   */
  async getTables(schemaName) {
    const tablesQuery = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = $1 
      AND table_type = 'BASE TABLE'
    `;

    const result = await this.client.query(tablesQuery, [schemaName]);

    // Validate query result structure
    if (!result || typeof result !== 'object') {
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
  async getTableDefinition(schemaName, tableName) {
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
   * Generate CREATE TABLE statement
   */
  generateCreateTableStatement(tableName, columns) {
    if (columns.length === 0) return null;

    const columnDefs = columns
      .map(col => Utils.formatColumnDefinition(col))
      .join(',\n  ');

    return `CREATE TABLE ${this.options.prod}.${tableName} (\n  ${columnDefs}\n);`;
  }

  /**
   * Handle creation of missing tables
   */
  async handleMissingTables(missingTables, alterStatements) {
    for (const table of missingTables) {
      alterStatements.push(`-- Create missing table ${table.table_name}`);

      const columns = await this.getTableDefinition(
        this.options.dev,
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
  handleTablesToDrop(tablesToDrop, alterStatements) {
    for (const table of tablesToDrop) {
      const backupName = Utils.generateBackupName(table.table_name);

      alterStatements.push(
        `-- Table ${table.table_name} exists in prod but not in dev`
      );

      alterStatements.push(
        '-- Renaming table to preserve data before manual drop'
      );

      alterStatements.push(
        `ALTER TABLE ${this.options.prod}.${table.table_name} RENAME TO ${backupName};`
      );

      alterStatements.push(
        `-- TODO: Manually drop table ${this.options.prod}.${backupName} after confirming data is no longer needed`
      );
    }
  }

  /**
   * Generate table operations for schema sync
   */
  async generateTableOperations() {
    const alterStatements = [];

    const devTables = await this.getTables(this.options.dev);
    const prodTables = await this.getTables(this.options.prod);

    // Find missing tables in prod (tables in dev but not in prod)
    const missingTables = devTables.filter(
      d => !prodTables.some(p => p.table_name === d.table_name)
    );

    // Find tables to drop in prod (tables in prod but not in dev)
    const tablesToDrop = prodTables.filter(
      p => !devTables.some(d => d.table_name === p.table_name)
    );

    await this.handleMissingTables(missingTables, alterStatements);
    this.handleTablesToDrop(tablesToDrop, alterStatements);

    return alterStatements;
  }
}
