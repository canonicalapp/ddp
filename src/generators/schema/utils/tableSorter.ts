/**
 * Table Sorter
 * Handles table dependency sorting and ordering
 */

import type { ITableDefinition } from '@/types';

export class TableSorter {
  /**
   * Sort tables alphabetically by name
   */
  sortTablesAlphabetically(tables: ITableDefinition[]): ITableDefinition[] {
    return [...tables].sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Sort tables by dependencies (parent tables before child tables)
   * Uses topological sort to handle circular dependencies
   */
  sortTablesByDependencies(tables: ITableDefinition[]): ITableDefinition[] {
    const sorted: ITableDefinition[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (table: ITableDefinition) => {
      if (visiting.has(table.name)) {
        // Circular dependency detected - add anyway
        return;
      }

      if (visited.has(table.name)) {
        return;
      }

      visiting.add(table.name);

      // Find tables this table depends on (via foreign keys)
      const dependencies = tables.filter(
        otherTable =>
          otherTable.name !== table.name &&
          table.constraints.some(
            constraint =>
              constraint.type === 'FOREIGN KEY' &&
              constraint.references?.table === otherTable.name
          )
      );

      // Visit dependencies first
      for (const dep of dependencies) {
        visit(dep);
      }

      visiting.delete(table.name);
      visited.add(table.name);
      sorted.push(table);
    };

    for (const table of tables) {
      visit(table);
    }

    return sorted;
  }

  /**
   * Extract all sequences from tables, deduplicated and sorted
   */
  extractAllSequences(tables: ITableDefinition[]) {
    const allSequences = [];
    const seen = new Set<string>();

    for (const table of tables) {
      for (const sequence of table.sequences) {
        const key = `${sequence.schema}.${sequence.name}`;

        if (!seen.has(key)) {
          allSequences.push(sequence);
          seen.add(key);
        }
      }
    }

    return allSequences.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Extract self-referencing constraints from tables
   * Only extracts FOREIGN KEY constraints that reference the same table
   */
  extractSelfReferencingConstraints(tables: ITableDefinition[]) {
    const selfReferencingConstraints = [];

    for (const table of tables) {
      for (const constraint of table.constraints) {
        if (
          constraint.type === 'FOREIGN KEY' &&
          constraint.references?.table === table.name
        ) {
          selfReferencingConstraints.push({
            constraint,
            schema: table.schema,
            tableName: table.name,
          });
        }
      }
    }

    return selfReferencingConstraints;
  }
}
