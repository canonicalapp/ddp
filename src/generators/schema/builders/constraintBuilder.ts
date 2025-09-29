/**
 * Constraint Builder
 * Handles constraint generation and SQL creation
 */

import type { IConstraintInfo } from '@/database/introspection';
import type { IConstraintDefinition } from '@/types';

export class ConstraintBuilder {
  /**
   * Convert introspection constraint data to constraint definition
   */
  convertToConstraintDefinition(
    constraint: IConstraintInfo
  ): IConstraintDefinition {
    return {
      name: constraint.constraint_name,
      type: constraint.constraint_type as
        | 'PRIMARY KEY'
        | 'FOREIGN KEY'
        | 'UNIQUE'
        | 'CHECK'
        | 'NOT NULL',
      columns: constraint.column_names
        ? constraint.column_names.split(',')
        : [],
      references: constraint.foreign_table_name
        ? {
            table: constraint.foreign_table_name,
            column: constraint.foreign_column_name ?? 'id',
          }
        : undefined,
      ...(constraint.check_clause && { checkClause: constraint.check_clause }),
      deferrable: constraint.is_deferrable === 'YES',
      initiallyDeferred: constraint.initially_deferred === 'YES',
      onDelete: constraint.delete_rule as
        | 'CASCADE'
        | 'SET NULL'
        | 'SET DEFAULT'
        | 'RESTRICT'
        | 'NO ACTION',
      onUpdate: constraint.update_rule as
        | 'CASCADE'
        | 'SET NULL'
        | 'SET DEFAULT'
        | 'RESTRICT'
        | 'NO ACTION',
    };
  }

  /**
   * Generate constraint SQL
   */
  generateConstraintSQL(
    constraint: IConstraintDefinition,
    schema: string,
    tableName: string
  ): string {
    const constraintName = this.escapeIdentifier(constraint.name);
    const tableRef = `${this.escapeIdentifier(schema)}.${this.escapeIdentifier(tableName)}`;

    const columns = constraint.columns
      .map(col => this.escapeIdentifier(col))
      .join(', ');

    switch (constraint.type) {
      case 'PRIMARY KEY': {
        return `ALTER TABLE ${tableRef} ADD CONSTRAINT ${constraintName} PRIMARY KEY (${columns});`;
      }

      case 'UNIQUE': {
        return `ALTER TABLE ${tableRef} ADD CONSTRAINT ${constraintName} UNIQUE (${columns});`;
      }

      case 'FOREIGN KEY': {
        if (!constraint.references) {
          return `-- TODO: Foreign key constraint ${constraintName} - missing reference information`;
        }

        const refTable = this.escapeIdentifier(constraint.references.table);
        const refColumn = this.escapeIdentifier(constraint.references.column);

        // Add schema qualification to the referenced table
        const refTableWithSchema = `${this.escapeIdentifier(schema)}.${refTable}`;

        let fkSQL = `ALTER TABLE ${tableRef} ADD CONSTRAINT ${constraintName} FOREIGN KEY (${columns}) REFERENCES ${refTableWithSchema} (${refColumn})`;

        if (constraint.onDelete) {
          fkSQL += ` ON DELETE ${constraint.onDelete}`;
        }

        if (constraint.onUpdate) {
          fkSQL += ` ON UPDATE ${constraint.onUpdate}`;
        }

        if (constraint.deferrable) {
          fkSQL += ' DEFERRABLE';
          if (constraint.initiallyDeferred) {
            fkSQL += ' INITIALLY DEFERRED';
          }
        }

        fkSQL += ';';

        return fkSQL;
      }

      case 'CHECK': {
        const checkClause =
          constraint.checkClause ?? '/* TODO: Add check condition */';

        return `ALTER TABLE ${tableRef} ADD CONSTRAINT ${constraintName} CHECK (${checkClause});`;
      }

      default: {
        return `-- TODO: Unsupported constraint type: ${constraint.type}`;
      }
    }
  }

  /**
   * Escape identifier for SQL
   */
  private escapeIdentifier(identifier: string): string {
    return `"${identifier.replace(/"/g, '""')}"`;
  }
}
