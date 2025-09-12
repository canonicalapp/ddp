/**
 * Constraint Operations Module
 * Main orchestrator for constraint and index operations
 */

import { ConstraintDefinitions } from '../../utils/constraintDefinitions.js';
import { ConstraintHandlers } from '../../utils/constraintHandlers.js';
import { IndexOperations } from './indexes.js';

export class ConstraintOperations {
  constructor(client, options) {
    this.client = client;
    this.options = options;
    this.indexOperations = new IndexOperations(client, options);
    this.constraintDefinitions = new ConstraintDefinitions(client, options);
    this.constraintHandlers = new ConstraintHandlers(client, options);
  }

  /**
   * Get all constraints from a schema
   */
  async getConstraints(schemaName) {
    const constraintsQuery = `
      SELECT 
        tc.table_name,
        tc.constraint_name,
        tc.constraint_type,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints tc
      LEFT JOIN information_schema.key_column_usage kcu 
        ON tc.constraint_name = kcu.constraint_name
      LEFT JOIN information_schema.constraint_column_usage ccu 
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.table_schema = $1
      ORDER BY tc.table_name, tc.constraint_name
    `;

    const result = await this.client.query(constraintsQuery, [schemaName]);
    return result.rows;
  }

  /**
   * Get detailed constraint definition from dev schema
   */
  async getConstraintDefinition(schemaName, constraintName, tableName) {
    return this.constraintDefinitions.getConstraintDefinition(
      schemaName,
      constraintName,
      tableName
    );
  }

  /**
   * Generate constraint type specific clause
   */
  generateConstraintClause(params) {
    return this.constraintDefinitions.generateConstraintClause(params);
  }

  /**
   * Compare two constraint definitions to detect changes
   */
  compareConstraintDefinitions(devConstraint, prodConstraint) {
    return this.constraintDefinitions.compareConstraintDefinitions(
      devConstraint,
      prodConstraint
    );
  }

  /**
   * Generate CREATE CONSTRAINT statement
   */
  generateCreateConstraintStatement(constraintRows, targetSchema) {
    return this.constraintDefinitions.generateCreateConstraintStatement(
      constraintRows,
      targetSchema
    );
  }

  /**
   * Get all indexes from a schema
   */
  async getIndexes(schemaName) {
    return this.indexOperations.getIndexes(schemaName);
  }

  /**
   * Generate CREATE INDEX statement
   */
  generateCreateIndexStatement(indexDef, targetSchema) {
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
    devConstraints,
    prodConstraints,
    alterStatements
  ) {
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
    devConstraints,
    prodConstraints,
    alterStatements
  ) {
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
    devConstraints,
    prodConstraints,
    alterStatements
  ) {
    return this.constraintHandlers.handleConstraintsToCreate(
      devConstraints,
      prodConstraints,
      alterStatements
    );
  }

  /**
   * Generate constraint operations for schema sync
   */
  async generateConstraintOperations() {
    const alterStatements = [];

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
