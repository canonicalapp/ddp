/**
 * Constraint Handlers Module
 * Handles constraint operation handlers (create, drop, update)
 */

import type { Client } from 'pg';
import { ConstraintDefinitions } from './constraintDefinitions';
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
}

export class ConstraintHandlers {
  private client: Client;
  private options: ILegacySyncOptions;
  private constraintDefinitions: ConstraintDefinitions;

  constructor(client: Client, options: ILegacySyncOptions) {
    this.client = client;
    this.options = options;
    this.constraintDefinitions = new ConstraintDefinitions(client, options);
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

      const oldConstraintName = `${sourceConstraint.constraint_name}_old_${Date.now()}`;
      alterStatements.push(
        `-- Renaming old constraint to ${oldConstraintName} for manual review`
      );

      alterStatements.push(
        `ALTER TABLE ${this.options.target}.${sourceConstraint.table_name} RENAME CONSTRAINT ${sourceConstraint.constraint_name} TO ${oldConstraintName};`
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
      alterStatements.push(
        `-- Constraint ${constraint.constraint_name} exists in ${this.options.target} but not in ${this.options.source}`
      );
      alterStatements.push(
        `ALTER TABLE ${this.options.target}.${constraint.table_name} DROP CONSTRAINT ${constraint.constraint_name};`
      );
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
