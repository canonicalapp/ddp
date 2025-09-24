/**
 * Constraint Definitions Module
 * Handles constraint definition, comparison, and generation logic
 */

import type { Client } from 'pg';
import type { ILegacySyncOptions, TNullable } from '@/types';

interface IConstraintRow {
  table_name: string;
  constraint_name: string;
  constraint_type: string;
  column_name: TNullable<string>;
  foreign_table_name: TNullable<string>;
  foreign_column_name: TNullable<string>;
  update_rule: TNullable<string>;
  delete_rule: TNullable<string>;
  check_clause?: TNullable<string>;
}

interface IConstraintClauseParams {
  constraintType: string;
  columns: string;
  foreignTableName?: TNullable<string>;
  foreignColumnName?: TNullable<string>;
  updateRule?: TNullable<string>;
  deleteRule?: TNullable<string>;
  checkClause?: TNullable<string>;
  targetSchema: string;
}

export class ConstraintDefinitions {
  private client: Client;
  private options: ILegacySyncOptions;

  constructor(client: Client, options: ILegacySyncOptions) {
    this.client = client;
    this.options = options;
  }

  /**
   * Get detailed constraint definition from source schema
   */
  async getConstraintDefinition(
    schemaName: string,
    constraintName: string,
    tableName: string
  ): Promise<IConstraintRow[] | null> {
    try {
      const constraintDefQuery = `
        SELECT 
          tc.table_name,
          tc.constraint_name,
          tc.constraint_type,
          kcu.column_name,
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name,
          rc.update_rule,
          rc.delete_rule,
          cc.check_clause
        FROM information_schema.table_constraints tc
        LEFT JOIN information_schema.key_column_usage kcu 
          ON tc.constraint_name = kcu.constraint_name
        LEFT JOIN information_schema.constraint_column_usage ccu 
          ON ccu.constraint_name = tc.constraint_name
        LEFT JOIN information_schema.referential_constraints rc
          ON tc.constraint_name = rc.constraint_name
        LEFT JOIN information_schema.check_constraints cc
          ON tc.constraint_name = cc.constraint_name
        WHERE tc.table_schema = $1 
        AND tc.constraint_name = $2
        AND tc.table_name = $3
        ORDER BY kcu.ordinal_position
      `;

      const result = await this.client.query(constraintDefQuery, [
        schemaName,
        constraintName,
        tableName,
      ]);
      return result.rows;
    } catch (error) {
      console.warn(
        `Failed to get definition for constraint ${constraintName}:`,
        error instanceof Error ? error.message : 'Unknown error'
      );
      return null;
    }
  }

  /**
   * Generate constraint type specific clause
   */
  generateConstraintClause(params: IConstraintClauseParams): string {
    const {
      constraintType,
      columns,
      foreignTableName,
      foreignColumnName,
      updateRule,
      deleteRule,
      targetSchema,
    } = params;

    switch (constraintType) {
      case 'PRIMARY KEY':
        return ` PRIMARY KEY (${columns})`;

      case 'UNIQUE':
        return ` UNIQUE (${columns})`;

      case 'FOREIGN KEY': {
        if (!foreignTableName || !foreignColumnName) {
          return ` /* TODO: Foreign key missing reference table/column */`;
        }

        let clause = ` FOREIGN KEY (${columns}) REFERENCES ${targetSchema}.${foreignTableName}(${foreignColumnName})`;
        if (updateRule && updateRule !== 'NO ACTION') {
          clause += ` ON UPDATE ${updateRule}`;
        }
        if (deleteRule && deleteRule !== 'NO ACTION') {
          clause += ` ON DELETE ${deleteRule}`;
        }
        return clause;
      }

      case 'CHECK': {
        if (!params.checkClause) {
          return ` /* TODO: CHECK constraint missing condition */`;
        }
        return ` CHECK (${params.checkClause})`;
      }

      case 'EXCLUDE':
        return ` EXCLUDE (${columns})`;

      default:
        return ` /* TODO: Unsupported constraint type: ${constraintType} */`;
    }
  }

  /**
   * Compare two constraint definitions to detect changes
   */
  compareConstraintDefinitions(
    sourceConstraint: IConstraintRow,
    targetConstraint: IConstraintRow
  ): boolean {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!sourceConstraint || !targetConstraint) {
      return false;
    }

    // Compare key properties that define constraint behavior
    const sourceProps = {
      constraint_type: sourceConstraint.constraint_type,
      column_name: sourceConstraint.column_name,
      foreign_table_name: sourceConstraint.foreign_table_name,
      foreign_column_name: sourceConstraint.foreign_column_name,
      update_rule: sourceConstraint.update_rule,
      delete_rule: sourceConstraint.delete_rule,
    };

    const targetProps = {
      constraint_type: targetConstraint.constraint_type,
      column_name: targetConstraint.column_name,
      foreign_table_name: targetConstraint.foreign_table_name,
      foreign_column_name: targetConstraint.foreign_column_name,
      update_rule: targetConstraint.update_rule,
      delete_rule: targetConstraint.delete_rule,
    };

    // Compare each property
    for (const [key, sourceValue] of Object.entries(sourceProps)) {
      const targetValue = targetProps[key as keyof typeof targetProps];
      if (sourceValue !== targetValue) {
        return true; // Found a difference
      }
    }

    return false; // No differences found
  }

  /**
   * Generate CREATE CONSTRAINT statement
   */
  generateCreateConstraintStatement(
    constraintRows: IConstraintRow[] | null,
    targetSchema: string
  ): string {
    if (!constraintRows || constraintRows.length === 0) {
      return `-- TODO: Could not retrieve definition for constraint`;
    }

    const firstRow = constraintRows[0];
    if (!firstRow) {
      return `-- TODO: Could not retrieve definition for constraint`;
    }

    const {
      table_name,
      constraint_name,
      constraint_type,
      foreign_table_name,
      foreign_column_name,
      update_rule,
      delete_rule,
      check_clause,
    } = firstRow;

    // Get all columns for multi-column constraints
    const columns = constraintRows
      .map(row => row.column_name)
      .filter((name): name is string => Boolean(name))
      .join(', ');

    const baseStatement = `ALTER TABLE ${targetSchema}.${table_name} ADD CONSTRAINT ${constraint_name}`;
    const constraintClause = this.generateConstraintClause({
      constraintType: constraint_type,
      columns,
      foreignTableName: foreign_table_name,
      foreignColumnName: foreign_column_name,
      updateRule: update_rule,
      deleteRule: delete_rule,
      checkClause: check_clause ?? null,
      targetSchema,
    });

    return `${baseStatement}${constraintClause};`;
  }
}
