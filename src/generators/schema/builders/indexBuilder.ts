/**
 * Index Builder
 * Handles index generation, parsing, and SQL generation
 */

import type { IIndexDefinition } from '@/types';
import type { IIndexInfo } from '@/database/introspection';

export class IndexBuilder {
  /**
   * Convert introspection index data to index definition
   */
  convertToIndexDefinition(index: IIndexInfo): IIndexDefinition {
    // Extract columns from indexdef
    const columns = this.extractColumnsFromIndexDef(index.indexdef);
    const whereClause = this.extractWhereClause(index.indexdef);

    return {
      name: index.indexname,
      table: index.tablename,
      schema: index.schemaname,
      columns,
      unique: index.is_unique,
      ...(whereClause && { partial: whereClause }),
      method: 'btree', // Default method since index_method is not available
      is_primary: index.is_primary,
    };
  }

  /**
   * Generate SQL for an index
   */
  generateIndexSQL(index: IIndexDefinition, schema: string): string {
    const indexName = this.escapeIdentifier(index.name);
    const tableName = this.escapeIdentifier(index.table);

    const columns = index.columns
      .map(col =>
        this.isComplexExpression(col) ? col : this.escapeIdentifier(col)
      )
      .join(', ');

    let sql = `CREATE`;

    if (index.unique) {
      sql += ` UNIQUE`;
    }

    sql += ` INDEX ${indexName} ON ${this.escapeIdentifier(schema)}.${tableName}`;

    if (index.method && index.method !== 'btree') {
      sql += ` USING ${index.method}`;
    }

    sql += ` (${columns})`;

    if (index.partial) {
      sql += ` WHERE ${index.partial}`;
    }

    sql += ';';

    return sql;
  }

  /**
   * Extract column names from index definition
   */
  private extractColumnsFromIndexDef(indexdef: string): string[] {
    // Extract column names from index definition
    // Example: "CREATE UNIQUE INDEX idx_users_email ON dev.users USING btree (email)"
    // Need to handle nested parentheses properly
    const match = this.extractColumnListFromIndexDef(indexdef);

    if (match) {
      // Parse columns intelligently, handling both simple columns and complex expressions
      return this.parseIndexColumns(match);
    }

    return [];
  }

  /**
   * Extract the column list from index definition, handling nested parentheses
   */
  private extractColumnListFromIndexDef(indexdef: string): string | null {
    // Find the opening parenthesis after USING btree
    const btreeMatch = indexdef.match(/USING btree\s*\(/);

    if (!btreeMatch?.index) return null;

    const startPos = btreeMatch.index + btreeMatch[0].length - 1; // Position of opening (
    let parenCount = 0;
    let i = startPos;

    for (; i < indexdef.length; i++) {
      const char = indexdef[i];
      if (char === '(') {
        parenCount++;
      } else if (char === ')') {
        parenCount--;
        if (parenCount === 0) {
          // Found the matching closing parenthesis
          return indexdef.substring(startPos + 1, i);
        }
      }
    }

    return null;
  }

  /**
   * Parse index columns intelligently, handling both simple columns and complex expressions
   */
  private parseIndexColumns(columnList: string): string[] {
    const columns: string[] = [];
    let current = '';
    let parenCount = 0;
    let inQuotes = false;
    let quoteChar = '';

    for (let i = 0; i < columnList.length; i++) {
      const char = columnList[i];

      if (!inQuotes && (char === '"' || char === "'")) {
        inQuotes = true;
        quoteChar = char;
        current += char;
      } else if (inQuotes && char === quoteChar) {
        inQuotes = false;
        quoteChar = '';
        current += char;
      } else if (!inQuotes && char === '(') {
        parenCount++;
        current += char;
      } else if (!inQuotes && char === ')') {
        parenCount--;
        current += char;
      } else if (!inQuotes && char === ',' && parenCount === 0) {
        // Found a column separator at the top level
        columns.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    // Add the last column
    if (current.trim()) {
      columns.push(current.trim());
    }

    return columns;
  }

  /**
   * Extract WHERE clause from index definition
   */
  private extractWhereClause(indexdef: string): string | undefined {
    // Extract WHERE clause from index definition
    // Example: "CREATE INDEX ... WHERE is_active = true"
    const whereMatch = indexdef.match(/WHERE\s+(.+)$/i);

    return whereMatch?.[1]?.trim();
  }

  /**
   * Check if the column is a complex expression (contains function calls, operators, etc.)
   */
  private isComplexExpression(column: string): boolean {
    // Check if the column is a complex expression (contains function calls, operators, etc.)
    // Simple columns are just identifiers, complex expressions contain parentheses, operators, etc.
    return (
      column.includes('(') ||
      column.includes('::') ||
      column.includes('COALESCE') ||
      column.includes('CASE') ||
      column.includes('+') ||
      column.includes('-') ||
      column.includes('*') ||
      column.includes('/') ||
      column.includes('||')
    );
  }

  /**
   * Escape identifier for SQL
   */
  private escapeIdentifier(identifier: string): string {
    return `"${identifier.replace(/"/g, '""')}"`;
  }
}
