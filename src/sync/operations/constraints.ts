/**
 * Constraint Operations Module
 * Main orchestrator for constraint and index operations
 */

import type { Client } from 'pg';
import { ConstraintDefinitions } from '@/utils/constraintDefinitions';
import { ConstraintHandlers } from '@/utils/constraintHandlers';
import { IndexOperations } from './indexes';
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

export class ConstraintOperations {
  private client: Client;
  private options: ILegacySyncOptions;
  private indexOperations: IndexOperations;
  private constraintDefinitions: ConstraintDefinitions;
  private constraintHandlers: ConstraintHandlers;

  constructor(client: Client, options: ILegacySyncOptions) {
    this.client = client;
    this.options = options;
    this.indexOperations = new IndexOperations(client, options);
    this.constraintDefinitions = new ConstraintDefinitions(client, options);
    this.constraintHandlers = new ConstraintHandlers(client, options);
  }

  /**
   * Get all constraints from a schema
   */
  async getConstraints(schemaName: string): Promise<IConstraintRow[]> {
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
      ORDER BY tc.table_name, tc.constraint_name
    `;

    const result = await this.client.query(constraintsQuery, [schemaName]);
    return result.rows;
  }

  /**
   * Get detailed constraint definition from dev schema
   */
  async getConstraintDefinition(
    schemaName: string,
    constraintName: string,
    tableName: string
  ): Promise<TNullable<IConstraintRow[]>> {
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
  }): string {
    return this.constraintDefinitions.generateConstraintClause(params);
  }

  /**
   * Compare two constraint definitions to detect changes
   */
  compareConstraintDefinitions(
    devConstraint: IConstraintRow,
    prodConstraint: IConstraintRow
  ): boolean {
    return this.constraintDefinitions.compareConstraintDefinitions(
      devConstraint,
      prodConstraint
    );
  }

  /**
   * Generate CREATE CONSTRAINT statement
   */
  generateCreateConstraintStatement(
    constraintRows: IConstraintRow[],
    targetSchema: string
  ): string {
    return this.constraintDefinitions.generateCreateConstraintStatement(
      constraintRows,
      targetSchema
    );
  }

  /**
   * Get all indexes from a schema
   */
  async getIndexes(schemaName: string): Promise<unknown[]> {
    return this.indexOperations.getIndexes(schemaName);
  }

  /**
   * Generate CREATE INDEX statement
   */
  generateCreateIndexStatement(indexDef: string, targetSchema: string): string {
    return this.indexOperations.generateCreateIndexStatement(
      indexDef,
      targetSchema
    );
  }

  /**
   * Generate index operations for schema sync
   */
  async generateIndexOperations(): Promise<string[]> {
    return this.indexOperations.generateIndexOperations();
  }

  /**
   * Handle constraints that have changed
   */
  async handleConstraintsToUpdate(
    devConstraints: IConstraintRow[],
    prodConstraints: IConstraintRow[],
    alterStatements: string[]
  ): Promise<void> {
    return this.constraintHandlers.handleConstraintsToUpdate(
      devConstraints,
      prodConstraints,
      alterStatements
    );
  }

  /**
   * Handle constraints to drop in production
   */
  async handleConstraintsToDrop(
    devConstraints: IConstraintRow[],
    prodConstraints: IConstraintRow[],
    alterStatements: string[]
  ): Promise<void> {
    return this.constraintHandlers.handleConstraintsToDrop(
      devConstraints,
      prodConstraints,
      alterStatements
    );
  }

  /**
   * Handle constraints to create in production
   */
  async handleConstraintsToCreate(
    devConstraints: IConstraintRow[],
    prodConstraints: IConstraintRow[],
    alterStatements: string[]
  ): Promise<void> {
    return this.constraintHandlers.handleConstraintsToCreate(
      devConstraints,
      prodConstraints,
      alterStatements
    );
  }

  /**
   * Generate constraint operations for schema sync
   */
  async generateConstraintOperations(): Promise<string[]> {
    const alterStatements: string[] = [];

    const devConstraints = await this.getConstraints(this.options.dev);
    const prodConstraints = await this.getConstraints(this.options.prod);

    await this.handleConstraintsToDrop(
      devConstraints,
      prodConstraints,
      alterStatements
    );
    await this.handleConstraintsToCreate(
      devConstraints,
      prodConstraints,
      alterStatements
    );
    await this.handleConstraintsToUpdate(
      devConstraints,
      prodConstraints,
      alterStatements
    );

    return alterStatements;
  }
}
