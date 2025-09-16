/**
 * Index Operations Module
 * Handles index-related operations for schema sync
 */

import type { Client } from 'pg';

interface SyncOptions {
  conn: string;
  dev: string;
  prod: string;
  targetConn: string;
  output?: string;
  dryRun?: boolean;
  save?: boolean;
  [key: string]: unknown;
}

interface IIndexRow {
  schemaname: string;
  tablename: string;
  indexname: string;
  indexdef: string;
}

interface IParsedIndexDefinition {
  uniqueKeyword: string;
  indexName: string;
  tableName: string;
  restOfDefinition: string;
}

export class IndexOperations {
  private client: Client;
  private options: SyncOptions;

  constructor(client: Client, options: SyncOptions) {
    this.client = client;
    this.options = options;
  }

  /**
   * Get all indexes from a schema
   */
  async getIndexes(schemaName: string): Promise<IIndexRow[]> {
    const indexesQuery = `
      SELECT 
        schemaname,
        tablename,
        indexname,
        indexdef
      FROM pg_indexes 
      WHERE schemaname = $1
      ORDER BY tablename, indexname
    `;

    const result = await this.client.query(indexesQuery, [schemaName]);
    return result.rows;
  }

  /**
   * Parse index definition to extract components
   */
  private parseIndexDefinition(
    indexDef: string
  ): IParsedIndexDefinition | null {
    const isUnique = indexDef.includes('UNIQUE');
    const uniqueKeyword = isUnique ? 'UNIQUE ' : '';

    // Try to match with schema prefix first
    let indexMatch = indexDef.match(
      /CREATE\s+(?:UNIQUE\s+)?INDEX\s+([^.]+)\.([^.]+)\s+ON\s+([^.]+)\.([^.]+)/
    );

    if (indexMatch) {
      const [, , indexName, , tableName] = indexMatch;
      if (indexName && tableName) {
        const restOfDefinition = indexDef.substring(
          indexDef.indexOf(tableName) + tableName.length
        );
        return { uniqueKeyword, indexName, tableName, restOfDefinition };
      }
    }

    // Try to match without schema prefix
    indexMatch = indexDef.match(
      /CREATE\s+(?:UNIQUE\s+)?INDEX\s+([^\s]+)\s+ON\s+([^.]+)\.([^.]+)/
    );

    if (indexMatch) {
      const [, indexName, , tableName] = indexMatch;
      if (indexName && tableName) {
        const restOfDefinition = indexDef.substring(
          indexDef.indexOf(tableName) + tableName.length
        );
        return { uniqueKeyword, indexName, tableName, restOfDefinition };
      }
    }

    return null;
  }

  /**
   * Generate CREATE INDEX statement using fallback method
   */
  private generateFallbackIndexStatement(
    indexDef: string,
    targetSchema: string
  ): string {
    const replaced = indexDef.replace(
      /CREATE\s+(?:UNIQUE\s+)?INDEX\s+[^.]+\.[^.]+\s+ON\s+[^.]+\.[^.]+/,
      match => {
        const parts = match.split(/\s+/);
        const uniqueKeyword = parts[1] === 'UNIQUE' ? 'UNIQUE ' : '';
        const indexNamePart = parts[uniqueKeyword ? 2 : 1];
        const tableNamePart = parts[parts.length - 1];
        const indexName = indexNamePart?.split('.')[1] ?? 'unknown_index';
        const tableName = tableNamePart?.split('.')[1] ?? 'unknown_table';
        return `CREATE ${uniqueKeyword}INDEX ${targetSchema}.${indexName} ON ${targetSchema}.${tableName}`;
      }
    );
    return `${replaced};`;
  }

  /**
   * Generate CREATE INDEX statement
   */
  generateCreateIndexStatement(indexDef: string, targetSchema: string): string {
    if (!indexDef) {
      return `-- TODO: Could not retrieve index definition`;
    }

    const parsed = this.parseIndexDefinition(indexDef);

    if (parsed) {
      const { uniqueKeyword, indexName, tableName, restOfDefinition } = parsed;
      return `CREATE ${uniqueKeyword}INDEX ${targetSchema}.${indexName} ON ${targetSchema}.${tableName}${restOfDefinition};`;
    }

    return this.generateFallbackIndexStatement(indexDef, targetSchema);
  }

  /**
   * Generate index operations for schema sync
   */
  async generateIndexOperations(): Promise<string[]> {
    const alterStatements: string[] = [];

    const devIndexes = await this.getIndexes(this.options.dev);
    const prodIndexes = await this.getIndexes(this.options.prod);

    // Find indexes to drop in prod (exist in prod but not in dev)
    const indexesToDrop = prodIndexes.filter(
      p => !devIndexes.some(d => d.indexname === p.indexname)
    );

    for (const index of indexesToDrop) {
      alterStatements.push(
        `-- Index ${index.indexname} exists in prod but not in dev`
      );
      alterStatements.push(
        `DROP INDEX ${this.options.prod}.${index.indexname};`
      );
    }

    // Find indexes to create in prod (exist in dev but not in prod)
    const indexesToCreate = devIndexes.filter(
      d => !prodIndexes.some(p => p.indexname === d.indexname)
    );

    for (const index of indexesToCreate) {
      alterStatements.push(`-- Creating index ${index.indexname} in prod`);

      // Generate CREATE statement
      const createStatement = this.generateCreateIndexStatement(
        index.indexdef,
        this.options.prod
      );

      alterStatements.push(createStatement);
      alterStatements.push(''); // Add blank line for readability
    }

    return alterStatements;
  }
}
