/**
 * Constraint Definitions Module
 * Handles constraint definition, comparison, and generation logic
 */

import consola from 'consola';
import type { ILegacySyncOptions, TNullable } from '@/types';
import {
  type SyncDbSide,
  clientForSyncSide,
  schemaNameForSide,
} from '@/sync/syncClient';
import type { Client } from 'pg';
import {
  normalizeCheckClauseForCompare,
  normalizeConstraintColumnList,
  normalizeReferentialAction,
} from './constraintEquivalence';
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
   * Get detailed constraint definition from the given database side.
   *
   * Reads pg_constraint.conkey/confkey directly (via unnest ... WITH ORDINALITY)
   * instead of joining information_schema.key_column_usage x constraint_column_usage:
   * that join is keyed only on constraint_name, so composite constraints produce a
   * cross product of local x referenced column rows with no positional pairing,
   * silently corrupting which local column maps to which referenced column.
   * Always resolves to at most one row per constraint.
   */
  async getConstraintDefinition(
    side: SyncDbSide,
    constraintName: string,
    tableName: string
  ): Promise<IConstraintRow[] | null> {
    try {
      const constraintDefQuery = `
        SELECT
          cl.relname AS table_name,
          con.conname AS constraint_name,
          CASE con.contype
            WHEN 'p' THEN 'PRIMARY KEY'
            WHEN 'u' THEN 'UNIQUE'
            WHEN 'f' THEN 'FOREIGN KEY'
            WHEN 'c' THEN 'CHECK'
            ELSE con.contype::text
          END AS constraint_type,
          (
            SELECT string_agg(att.attname, ', ' ORDER BY ord.n)
            FROM unnest(con.conkey) WITH ORDINALITY AS ord(attnum, n)
            JOIN pg_attribute att
              ON att.attrelid = con.conrelid AND att.attnum = ord.attnum
          ) AS column_name,
          fcl.relname AS foreign_table_name,
          (
            SELECT string_agg(fatt.attname, ', ' ORDER BY ord.n)
            FROM unnest(con.confkey) WITH ORDINALITY AS ord(attnum, n)
            JOIN pg_attribute fatt
              ON fatt.attrelid = con.confrelid AND fatt.attnum = ord.attnum
          ) AS foreign_column_name,
          CASE con.confupdtype
            WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT' WHEN 'c' THEN 'CASCADE'
            WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT'
          END AS update_rule,
          CASE con.confdeltype
            WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT' WHEN 'c' THEN 'CASCADE'
            WHEN 'n' THEN 'SET NULL' WHEN 'd' THEN 'SET DEFAULT'
          END AS delete_rule,
          cc.check_clause
        FROM pg_constraint con
        JOIN pg_class cl ON cl.oid = con.conrelid
        JOIN pg_namespace n ON n.oid = cl.relnamespace
        LEFT JOIN pg_class fcl ON fcl.oid = con.confrelid
        LEFT JOIN information_schema.check_constraints cc
          ON cc.constraint_schema = n.nspname AND cc.constraint_name = con.conname
        WHERE n.nspname = $1
          AND con.conname = $2
          AND cl.relname = $3
      `;

      const schemaName = schemaNameForSide(side, this.options);
      const client = clientForSyncSide(
        side,
        this.sourceClient,
        this.targetClient
      );

      const result = await client.query(constraintDefQuery, [
        schemaName,
        constraintName,
        tableName,
      ]);
      return result.rows;
    } catch (error) {
      consola.warn(
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
    if (!sourceConstraint || !targetConstraint) {
      return false;
    }

    if (sourceConstraint.table_name !== targetConstraint.table_name) {
      return true;
    }

    if (sourceConstraint.constraint_type !== targetConstraint.constraint_type) {
      return true;
    }

    if (sourceConstraint.constraint_type === 'CHECK') {
      return (
        normalizeCheckClauseForCompare(sourceConstraint.check_clause) !==
        normalizeCheckClauseForCompare(targetConstraint.check_clause)
      );
    }

    if (
      normalizeConstraintColumnList(sourceConstraint.column_name) !==
      normalizeConstraintColumnList(targetConstraint.column_name)
    ) {
      return true;
    }

    if (sourceConstraint.constraint_type === 'FOREIGN KEY') {
      if (
        sourceConstraint.foreign_table_name !==
        targetConstraint.foreign_table_name
      ) {
        return true;
      }
      if (
        sourceConstraint.foreign_column_name !==
        targetConstraint.foreign_column_name
      ) {
        return true;
      }
      if (
        normalizeReferentialAction(sourceConstraint.update_rule) !==
        normalizeReferentialAction(targetConstraint.update_rule)
      ) {
        return true;
      }
      if (
        normalizeReferentialAction(sourceConstraint.delete_rule) !==
        normalizeReferentialAction(targetConstraint.delete_rule)
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Generate CREATE CONSTRAINT statement.
   *
   * `getConstraintDefinition` resolves to at most one row per constraint, with
   * `column_name` / `foreign_column_name` already aggregated in the correct
   * positional order (see its query), so no further merging is needed here.
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

    const columns = firstRow.column_name ?? '';

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
