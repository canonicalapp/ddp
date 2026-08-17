/**
 * Constraint Operations Module
 * Main orchestrator for constraint and index operations
 */

import type { ILegacySyncOptions, TArray, TNullable } from '@/types';
import { isDdpDiffIgnoredTable } from '@/sync/ddpInternalSchema';
import {
  type SyncDbSide,
  clientForSyncSide,
  schemaNameForSide,
} from '@/sync/syncClient';
import { ConstraintDefinitions } from '@/utils/constraintDefinitions';
import { ConstraintHandlers } from '@/utils/constraintHandlers';
import type { Client } from 'pg';
import { IndexOperations, type IIndexRow } from './indexes';

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

export class ConstraintOperations {
  private sourceClient: Client;
  private targetClient: Client;
  private options: ILegacySyncOptions;
  private indexOperations: IndexOperations;
  private constraintDefinitions: ConstraintDefinitions;
  private constraintHandlers: ConstraintHandlers;

  constructor(
    sourceClient: Client,
    targetClient: Client,
    options: ILegacySyncOptions
  ) {
    this.sourceClient = sourceClient;
    this.targetClient = targetClient;
    this.options = options;
    this.indexOperations = new IndexOperations(
      sourceClient,
      targetClient,
      options
    );
    this.constraintDefinitions = new ConstraintDefinitions(
      sourceClient,
      targetClient,
      options
    );
    this.constraintHandlers = new ConstraintHandlers(
      sourceClient,
      targetClient,
      options
    );
  }

  /**
   * Get all constraints from a schema on the given database.
   *
   * Reads pg_constraint.conkey/confkey directly (via unnest ... WITH ORDINALITY)
   * instead of joining information_schema.key_column_usage x constraint_column_usage:
   * that join is keyed only on constraint_name, so composite constraints produce a
   * cross product of local x referenced column rows with no positional pairing,
   * silently corrupting which local column maps to which referenced column.
   *
   * A second branch replicates information_schema's synthesized "<table>_<col>_not_null"
   * pseudo CHECK constraints (real Postgres behavior for information_schema.table_constraints,
   * but backed only by pg_attribute.attnotnull, not an actual pg_constraint row) — without
   * it, plain column-level NOT NULL never lines up against an equivalent explicit CHECK
   * constraint on the other side, and notNullCheckEquivalenceKey can't suppress the false
   * "constraint changed" it would otherwise report.
   */
  async getConstraints(side: SyncDbSide) {
    const constraintsQuery = `
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
        AND con.contype IN ('p', 'u', 'f', 'c')

      UNION ALL

      SELECT
        cl.relname AS table_name,
        cl.relname || '_' || att.attname || '_not_null' AS constraint_name,
        'CHECK' AS constraint_type,
        NULL AS column_name,
        NULL AS foreign_table_name,
        NULL AS foreign_column_name,
        NULL AS update_rule,
        NULL AS delete_rule,
        att.attname || ' IS NOT NULL' AS check_clause
      FROM pg_attribute att
      JOIN pg_class cl ON cl.oid = att.attrelid
      JOIN pg_namespace n ON n.oid = cl.relnamespace
      WHERE n.nspname = $1
        AND cl.relkind = 'r'
        AND att.attnum > 0
        AND NOT att.attisdropped
        AND att.attnotnull

      ORDER BY table_name, constraint_name
    `;

    const schemaName = schemaNameForSide(side, this.options);
    const client = clientForSyncSide(
      side,
      this.sourceClient,
      this.targetClient
    );

    const result = await client.query(constraintsQuery, [schemaName]);
    return result.rows as IConstraintRow[];
  }

  /**
   * Get detailed constraint definition from the given database side.
   */
  async getConstraintDefinition(
    side: SyncDbSide,
    constraintName: string,
    tableName: string
  ): Promise<TNullable<TArray<IConstraintRow>>> {
    return this.constraintDefinitions.getConstraintDefinition(
      side,
      constraintName,
      tableName
    );
  }

  /**
   * Generate constraint type specific clause
   */
  generateConstraintClause(params: {
    constraintType: string;
    columns: string;
    foreignTableName?: string | null;
    foreignColumnName?: string | null;
    updateRule?: string | null;
    deleteRule?: string | null;
    targetSchema: string;
  }) {
    return this.constraintDefinitions.generateConstraintClause(params);
  }

  /**
   * Compare two constraint definitions to detect changes
   */
  compareConstraintDefinitions(
    sourceConstraint: IConstraintRow,
    targetConstraint: IConstraintRow
  ) {
    return this.constraintDefinitions.compareConstraintDefinitions(
      sourceConstraint,
      targetConstraint
    );
  }

  /**
   * Generate CREATE CONSTRAINT statement
   */
  generateCreateConstraintStatement(
    constraintRows: TArray<IConstraintRow>,
    targetSchema: string
  ) {
    return this.constraintDefinitions.generateCreateConstraintStatement(
      constraintRows,
      targetSchema
    );
  }

  /**
   * Get all indexes from a schema on the given database.
   */
  async getIndexes(side: SyncDbSide): Promise<TArray<IIndexRow>> {
    return this.indexOperations.getIndexes(side);
  }

  /**
   * Generate CREATE INDEX statement
   */
  generateCreateIndexStatement(indexDef: string, targetSchema: string) {
    return this.indexOperations.generateCreateIndexStatement(
      indexDef,
      targetSchema
    );
  }

  /**
   * Generate index operations for schema sync
   */
  async generateIndexOperations() {
    return this.indexOperations.generateIndexOperations();
  }

  /**
   * Handle constraints that have changed
   */
  async handleConstraintsToUpdate(
    sourceConstraints: TArray<IConstraintRow>,
    targetConstraints: TArray<IConstraintRow>,
    alterStatements: TArray<string>
  ) {
    return this.constraintHandlers.handleConstraintsToUpdate(
      sourceConstraints,
      targetConstraints,
      alterStatements
    );
  }

  /**
   * Handle constraints to drop in target
   */
  async handleConstraintsToDrop(
    sourceConstraints: TArray<IConstraintRow>,
    targetConstraints: TArray<IConstraintRow>,
    alterStatements: TArray<string>
  ) {
    return this.constraintHandlers.handleConstraintsToDrop(
      sourceConstraints,
      targetConstraints,
      alterStatements
    );
  }

  /**
   * Handle constraints to create in target
   */
  async handleConstraintsToCreate(
    sourceConstraints: TArray<IConstraintRow>,
    targetConstraints: TArray<IConstraintRow>,
    alterStatements: TArray<string>
  ) {
    return this.constraintHandlers.handleConstraintsToCreate(
      sourceConstraints,
      targetConstraints,
      alterStatements
    );
  }

  /**
   * Generate constraint operations for schema sync
   */
  async generateConstraintOperations() {
    const alterStatements: TArray<string> = [];

    const keepConstraint = (row: IConstraintRow) =>
      !isDdpDiffIgnoredTable(row.table_name) &&
      !(
        row.foreign_table_name && isDdpDiffIgnoredTable(row.foreign_table_name)
      );

    const sourceConstraints = (await this.getConstraints('source')).filter(
      keepConstraint
    );
    const targetConstraints = (await this.getConstraints('target')).filter(
      keepConstraint
    );

    await this.handleConstraintsToDrop(
      sourceConstraints,
      targetConstraints,
      alterStatements
    );
    await this.handleConstraintsToCreate(
      sourceConstraints,
      targetConstraints,
      alterStatements
    );
    await this.handleConstraintsToUpdate(
      sourceConstraints,
      targetConstraints,
      alterStatements
    );

    return alterStatements;
  }
}
