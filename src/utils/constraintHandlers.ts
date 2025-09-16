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
    devConstraints: IConstraintRow[],
    prodConstraints: IConstraintRow[],
    alterStatements: string[]
  ): Promise<void> {
    const constraintsToUpdate = devConstraints.filter(devConstraint => {
      const prodConstraint = prodConstraints.find(
        p => p.constraint_name === devConstraint.constraint_name
      );
      return (
        prodConstraint &&
        this.constraintDefinitions.compareConstraintDefinitions(
          devConstraint,
          prodConstraint
        )
      );
    });

    for (const devConstraint of constraintsToUpdate) {
      alterStatements.push(
        `-- Constraint ${devConstraint.constraint_name} has changed, updating in prod`
      );

      const oldConstraintName = `${devConstraint.constraint_name}_old_${Date.now()}`;
      alterStatements.push(
        `-- Renaming old constraint to ${oldConstraintName} for manual review`
      );
      alterStatements.push(
        `ALTER TABLE ${this.options.prod}.${devConstraint.table_name} RENAME CONSTRAINT ${devConstraint.constraint_name} TO ${oldConstraintName};`
      );

      const constraintDefinition =
        await this.constraintDefinitions.getConstraintDefinition(
          this.options.dev,
          devConstraint.constraint_name,
          devConstraint.table_name
        );

      const createStatement =
        this.constraintDefinitions.generateCreateConstraintStatement(
          constraintDefinition,
          this.options.prod
        );

      alterStatements.push(createStatement);
      alterStatements.push('');
    }
  }

  /**
   * Handle constraints to drop in production
   */
  async handleConstraintsToDrop(
    devConstraints: IConstraintRow[],
    prodConstraints: IConstraintRow[],
    alterStatements: string[]
  ): Promise<void> {
    const constraintsToDrop = prodConstraints.filter(
      p => !devConstraints.some(d => d.constraint_name === p.constraint_name)
    );

    for (const constraint of constraintsToDrop) {
      alterStatements.push(
        `-- Constraint ${constraint.constraint_name} exists in prod but not in dev`
      );
      alterStatements.push(
        `ALTER TABLE ${this.options.prod}.${constraint.table_name} DROP CONSTRAINT ${constraint.constraint_name};`
      );
    }
  }

  /**
   * Handle constraints to create in production
   */
  async handleConstraintsToCreate(
    devConstraints: IConstraintRow[],
    prodConstraints: IConstraintRow[],
    alterStatements: string[]
  ): Promise<void> {
    const constraintsToCreate = devConstraints.filter(
      d => !prodConstraints.some(p => p.constraint_name === d.constraint_name)
    );

    for (const constraint of constraintsToCreate) {
      alterStatements.push(
        `-- Creating constraint ${constraint.constraint_name} in prod`
      );

      const constraintDefinition =
        await this.constraintDefinitions.getConstraintDefinition(
          this.options.dev,
          constraint.constraint_name,
          constraint.table_name
        );

      const createStatement =
        this.constraintDefinitions.generateCreateConstraintStatement(
          constraintDefinition,
          this.options.prod
        );

      alterStatements.push(createStatement);
      alterStatements.push('');
    }
  }
}
