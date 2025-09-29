/**
 * Table Builder
 * Handles table generation orchestration and SQL creation
 */

import type { ITableDefinition } from '@/types';
import { logError } from '@/utils/logger';
import { validateSchemaName, validateTableName } from '@/utils/validation';
import { ColumnBuilder } from './columnBuilder';
import { ConstraintBuilder } from './constraintBuilder';
import { IndexBuilder } from './indexBuilder';

export class TableBuilder {
  private columnBuilder: ColumnBuilder;
  private constraintBuilder: ConstraintBuilder;
  private indexBuilder: IndexBuilder;

  constructor() {
    this.columnBuilder = new ColumnBuilder();
    this.constraintBuilder = new ConstraintBuilder();
    this.indexBuilder = new IndexBuilder();
  }

  /**
   * Generate complete table SQL including columns, constraints, and indexes
   */
  generateTableSQL(table: ITableDefinition): string {
    try {
      // Validate table definition
      validateTableName(table.name);
      validateSchemaName(table.schema);

      let sql = this.generateSectionHeader(
        `TABLE: ${table.schema}.${table.name}`
      );

      // Table comment
      if (table.comment) {
        sql += this.generateComment(`Table: ${table.comment}`) + '\n';
      }

      // CREATE TABLE statement
      sql += `CREATE TABLE ${this.escapeIdentifier(table.schema)}.${this.escapeIdentifier(table.name)} (\n`;

      // Columns (ensure ordinal order as per CID specification)
      const sortedColumns = [...table.columns].sort(
        (a, b) => a.ordinalPosition - b.ordinalPosition
      );

      const columnDefinitions = sortedColumns.map(col =>
        this.columnBuilder.generateColumnDefinition(col)
      );

      sql += this.formatSQL(columnDefinitions.join(',\n'), 1) + '\n';

      sql += ');\n\n';

      // Table constraints (excluding column-level constraints and self-references)
      const tableConstraints = table.constraints.filter(
        constraint =>
          constraint.type !== 'NOT NULL' &&
          !(
            constraint.type === 'FOREIGN KEY' &&
            constraint.references?.table === table.name
          )
      );

      if (tableConstraints.length > 0) {
        sql += this.generateComment('Table constraints') + '\n';

        // Deduplicate constraints by name to avoid "already exists" errors
        const seenConstraints = new Set<string>();

        for (const constraint of tableConstraints) {
          const constraintKey = `${constraint.name}`;

          if (!seenConstraints.has(constraintKey)) {
            sql +=
              this.constraintBuilder.generateConstraintSQL(
                constraint,
                table.schema,
                table.name
              ) + '\n';

            seenConstraints.add(constraintKey);
          }
        }

        sql += '\n';
      }

      // Indexes (exclude primary key indexes and unique indexes that correspond to unique constraints)
      const uniqueConstraintNames = new Set(
        table.constraints
          .filter(constraint => constraint.type === 'UNIQUE')
          .map(constraint => constraint.name)
      );

      const nonPrimaryIndexes = table.indexes.filter(
        index => !index.is_primary && !uniqueConstraintNames.has(index.name)
      );

      if (nonPrimaryIndexes.length > 0) {
        sql += this.generateComment('Indexes') + '\n';

        // Deduplicate indexes by name
        const seenIndexes = new Set<string>();

        for (const index of nonPrimaryIndexes) {
          const indexKey = `${index.schema ?? table.schema}.${index.name}`;

          if (!seenIndexes.has(indexKey)) {
            sql +=
              this.indexBuilder.generateIndexSQL(index, table.schema) + '\n';

            seenIndexes.add(indexKey);
          }
        }

        sql += '\n';
      }

      return sql;
    } catch (error) {
      logError('Failed to generate table SQL', error as Error, {
        table: table.name,
        schema: table.schema,
      });
      throw error;
    }
  }

  /**
   * Generate section header
   */
  private generateSectionHeader(title: string): string {
    return `-- ================================================\n-- ${title}\n-- ================================================\n\n`;
  }

  /**
   * Generate comment
   */
  private generateComment(comment: string): string {
    return `-- ${comment}`;
  }

  /**
   * Format SQL with proper indentation
   */
  private formatSQL(sql: string, indentLevel: number): string {
    const indent = '  '.repeat(indentLevel);
    return sql
      .split('\n')
      .map(line => (line.trim() ? `${indent}${line}` : line))
      .join('\n');
  }

  /**
   * Escape identifier for SQL
   */
  private escapeIdentifier(identifier: string): string {
    return `"${identifier.replace(/"/g, '""')}"`;
  }
}
