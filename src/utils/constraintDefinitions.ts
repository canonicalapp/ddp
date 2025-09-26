/**
 * Constraint Definitions Module
 * Handles constraint definition, comparison, and generation logic
 */

import type { ILegacySyncOptions, TNullable } from '@/types';
import type { Client } from 'pg';
import { Utils } from './formatting';

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
  private sourceClient: Client;
  private targetClient: Client;
  private options: ILegacySyncOptions;

  constructor(
    sourceClient: Client,
    targetClient: Client,
    options: ILegacySyncOptions
  ) {
    this.sourceClient = sourceClient;
    this.targetClient = targetClient;
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

      // Use the appropriate client based on schema
      const client =
        schemaName === this.options.source
          ? this.sourceClient
          : this.targetClient;

      const result = await client.query(constraintDefQuery, [
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

    // Get all columns for multi-column constraints (deduplicated)
    const columns = constraintRows
      .map(row => row.column_name)
      .filter((name): name is string => Boolean(name))
      .filter((name, index, array) => array.indexOf(name) === index) // Remove duplicates
      .join(', ');

    // Generate a proper constraint name if the original is numeric or invalid
    const properConstraintName = this.generateProperConstraintName(
      constraint_name,
      constraint_type,
      table_name,
      columns
    );

    const baseStatement = `ALTER TABLE ${targetSchema}.${table_name} ADD CONSTRAINT ${properConstraintName}`;

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

  /**
   * Generate a proper constraint name
   * Uses consistent naming strategy with gen command
   */
  private generateProperConstraintName(
    originalName: string,
    constraintType: string,
    tableName: string,
    columns: string
  ): string {
    // Always use the original name if it exists and is valid
    if (
      originalName &&
      originalName.length <= 63 &&
      /^[a-zA-Z_]/.test(originalName) &&
      !/^\d+/.test(originalName)
    ) {
      return originalName;
    }

    // Generate a descriptive name based on constraint type and columns
    const columnList = columns
      ? columns.replace(/\s+/g, '_').toLowerCase()
      : 'col';

    switch (constraintType) {
      case 'PRIMARY KEY':
        return `${tableName}_pkey`;
      case 'UNIQUE':
        return `${tableName}_${columnList}_key`;
      case 'FOREIGN KEY':
        return `${tableName}_${columnList}_fkey`;
      case 'CHECK': {
        // For CHECK constraints, include timestamp to ensure uniqueness
        const timestamp = Utils.generateTimestamp();

        return `${tableName}_${columnList}_check_${timestamp}`;
      }
      default:
        return `${tableName}_${columnList}_${(constraintType || 'unknown').toLowerCase().replace(/\s+/g, '_')}`;
    }
  }
}
