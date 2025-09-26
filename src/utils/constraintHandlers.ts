/**
 * Constraint Handlers Module
 * Handles constraint operation handlers (create, drop, update)
 */

import type { ILegacySyncOptions, TNullable } from '@/types';
import type { Client } from 'pg';
import { ConstraintDefinitions } from './constraintDefinitions';
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
}

export class ConstraintHandlers {
  private sourceClient: Client;
  private targetClient: Client;
  private options: ILegacySyncOptions;
  private constraintDefinitions: ConstraintDefinitions;

  constructor(
    sourceClient: Client,
    targetClient: Client,
    options: ILegacySyncOptions
  ) {
    this.sourceClient = sourceClient;
    this.targetClient = targetClient;
    this.options = options;
    this.constraintDefinitions = new ConstraintDefinitions(
      sourceClient,
      targetClient,
      options
    );
  }

  /**
   * Handle constraints that have changed
   */
  async handleConstraintsToUpdate(
    sourceConstraints: IConstraintRow[],
    targetConstraints: IConstraintRow[],
    alterStatements: string[]
  ): Promise<void> {
    const constraintsToUpdate = sourceConstraints.filter(sourceConstraint => {
      const targetConstraint = targetConstraints.find(
        p => p.constraint_name === sourceConstraint.constraint_name
      );
      return (
        targetConstraint &&
        this.constraintDefinitions.compareConstraintDefinitions(
          sourceConstraint,
          targetConstraint
        )
      );
    });

    for (const sourceConstraint of constraintsToUpdate) {
      alterStatements.push(
        `-- Constraint ${sourceConstraint.constraint_name} has changed, updating in ${this.options.target}`
      );

      // Generate proper constraint name for dropping
      const properConstraintName = this.generateProperConstraintName(
        sourceConstraint.constraint_name,
        sourceConstraint.constraint_type,
        sourceConstraint.table_name,
        sourceConstraint.column_name ?? ''
      );

      // Drop the existing constraint first
      alterStatements.push(
        `ALTER TABLE ${this.options.target}.${sourceConstraint.table_name} DROP CONSTRAINT IF EXISTS ${properConstraintName};`
      );

      const constraintDefinition =
        await this.constraintDefinitions.getConstraintDefinition(
          this.options.source,
          sourceConstraint.constraint_name,
          sourceConstraint.table_name
        );

      const createStatement =
        this.constraintDefinitions.generateCreateConstraintStatement(
          constraintDefinition,
          this.options.target
        );

      alterStatements.push(createStatement);
      alterStatements.push('');
    }
  }

  /**
   * Handle constraints to drop in target
   */
  async handleConstraintsToDrop(
    sourceConstraints: IConstraintRow[],
    targetConstraints: IConstraintRow[],
    alterStatements: string[]
  ): Promise<void> {
    const constraintsToDrop = targetConstraints.filter(
      p => !sourceConstraints.some(d => d.constraint_name === p.constraint_name)
    );

    for (const constraint of constraintsToDrop) {
      // Generate proper constraint name for dropping
      const properConstraintName = this.generateProperConstraintName(
        constraint.constraint_name,
        constraint.constraint_type,
        constraint.table_name,
        constraint.column_name ?? ''
      );

      alterStatements.push(
        `-- Constraint ${constraint.constraint_name} exists in ${this.options.target} but not in ${this.options.source}`
      );
      alterStatements.push(
        `ALTER TABLE ${this.options.target}.${constraint.table_name} DROP CONSTRAINT IF EXISTS ${properConstraintName};`
      );
    }
  }

  /**
   * Generate a proper constraint name (same logic as ConstraintDefinitions)
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
        return `${tableName}_${columnList}_${constraintType.toLowerCase().replace(/\s+/g, '_')}`;
    }
  }

  /**
   * Handle constraints to create in target
   */
  async handleConstraintsToCreate(
    sourceConstraints: IConstraintRow[],
    targetConstraints: IConstraintRow[],
    alterStatements: string[]
  ): Promise<void> {
    const constraintsToCreate = sourceConstraints.filter(
      d => !targetConstraints.some(p => p.constraint_name === d.constraint_name)
    );

    for (const constraint of constraintsToCreate) {
      alterStatements.push(
        `-- Creating constraint ${constraint.constraint_name} in ${this.options.target}`
      );

      const constraintDefinition =
        await this.constraintDefinitions.getConstraintDefinition(
          this.options.source,
          constraint.constraint_name,
          constraint.table_name
        );

      const createStatement =
        this.constraintDefinitions.generateCreateConstraintStatement(
          constraintDefinition,
          this.options.target
        );

      alterStatements.push(createStatement);
      alterStatements.push('');
    }
  }
}
