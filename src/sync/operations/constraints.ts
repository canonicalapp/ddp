/**
 * Constraint Operations Module
 * Main orchestrator for constraint and index operations
 */

import type { ILegacySyncOptions, TArray, TNullable } from '@/types';
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
   * Get all constraints from a schema
   */
  async getConstraints(schemaName: string) {
    const constraintsQuery = `
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
        AND tc.constraint_type IN ('PRIMARY KEY', 'UNIQUE', 'FOREIGN KEY', 'CHECK')
      ORDER BY tc.table_name, tc.constraint_name
    `;

    // Use the appropriate client based on schema
    const client =
      schemaName === this.options.source
        ? this.sourceClient
        : this.targetClient;

    const result = await client.query(constraintsQuery, [schemaName]);

    // Deduplicate constraint rows by constraint_name
    const uniqueConstraints = new Map<string, IConstraintRow>();

    for (const row of result.rows) {
      const key = `${row.constraint_name}_${row.table_name}`;
      if (!uniqueConstraints.has(key)) {
        uniqueConstraints.set(key, row);
      }
    }

    return Array.from(uniqueConstraints.values());
  }

  /**
   * Get detailed constraint definition from source schema
   */
  async getConstraintDefinition(
    schemaName: string,
    constraintName: string,
    tableName: string
  ): Promise<TNullable<TArray<IConstraintRow>>> {
    return this.constraintDefinitions.getConstraintDefinition(
      schemaName,
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
   * Get all indexes from a schema
   */
  async getIndexes(schemaName: string): Promise<TArray<IIndexRow>> {
    return this.indexOperations.getIndexes(schemaName);
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

    const sourceConstraints = await this.getConstraints(this.options.source);
    const targetConstraints = await this.getConstraints(this.options.target);

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
