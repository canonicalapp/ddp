/**
 * Constraint Handlers Module
 * Handles constraint operation handlers (create, drop, update)
 */

import type { ILegacySyncOptions, TNullable } from '@/types';
import type { Client } from 'pg';
import { ConstraintDefinitions } from './constraintDefinitions';
import {
  collectNotNullCheckKeys,
  notNullCheckEquivalenceKey,
} from './constraintNotNullEquivalence';
import { Utils } from './formatting';

const quotePgIdent = (ident: string): string =>
  `"${ident.replace(/"/g, '""')}"`;

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

/** Lower sorts earlier. FKs must run after PK/UNIQUE on referenced tables. */
const CONSTRAINT_CREATE_PHASE: Record<string, number> = {
  'PRIMARY KEY': 0,
  UNIQUE: 1,
  CHECK: 2,
  'FOREIGN KEY': 3,
};

function constraintCreateSortKey(row: IConstraintRow): number {
  return CONSTRAINT_CREATE_PHASE[row.constraint_type] ?? 99;
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

      const targetConstraint = targetConstraints.find(
        p => p.constraint_name === sourceConstraint.constraint_name
      );
      const dropName = quotePgIdent(
        targetConstraint?.constraint_name ?? sourceConstraint.constraint_name
      );
      alterStatements.push(
        `ALTER TABLE ${this.options.target}.${sourceConstraint.table_name} DROP CONSTRAINT IF EXISTS ${dropName};`
      );

      const constraintDefinition =
        await this.constraintDefinitions.getConstraintDefinition(
          'source',
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
    const sourceNotNullKeys = collectNotNullCheckKeys(sourceConstraints);

    const constraintsToDrop = targetConstraints.filter(p => {
      if (
        sourceConstraints.some(d => d.constraint_name === p.constraint_name)
      ) {
        return false;
      }
      const nnKey = notNullCheckEquivalenceKey(
        p.table_name,
        p.constraint_type,
        p.check_clause ?? null,
        p.column_name ?? null
      );
      if (nnKey && sourceNotNullKeys.has(nnKey)) {
        return false;
      }
      return true;
    });

    const emittedDropSql = new Set<string>();

    for (const constraint of constraintsToDrop) {
      const dropSql = `ALTER TABLE ${this.options.target}.${constraint.table_name} DROP CONSTRAINT IF EXISTS ${quotePgIdent(constraint.constraint_name)};`;

      if (emittedDropSql.has(dropSql)) {
        continue;
      }
      emittedDropSql.add(dropSql);

      alterStatements.push(
        `-- Constraint ${constraint.constraint_name} exists in ${this.options.target} but not in ${this.options.source}`
      );
      alterStatements.push(dropSql);
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
    const targetNotNullKeys = collectNotNullCheckKeys(targetConstraints);

    const constraintsToCreate = sourceConstraints.filter(d => {
      if (
        targetConstraints.some(p => p.constraint_name === d.constraint_name)
      ) {
        return false;
      }
      const nnKey = notNullCheckEquivalenceKey(
        d.table_name,
        d.constraint_type,
        d.check_clause ?? null,
        d.column_name ?? null
      );
      if (nnKey && targetNotNullKeys.has(nnKey)) {
        return false;
      }
      return true;
    });

    constraintsToCreate.sort((a, b) => {
      const pa = constraintCreateSortKey(a);
      const pb = constraintCreateSortKey(b);
      if (pa !== pb) return pa - pb;
      const byTable = a.table_name.localeCompare(b.table_name);
      if (byTable !== 0) return byTable;
      return a.constraint_name.localeCompare(b.constraint_name);
    });

    for (const constraint of constraintsToCreate) {
      alterStatements.push(
        `-- Creating constraint ${constraint.constraint_name} in ${this.options.target}`
      );

      const constraintDefinition =
        await this.constraintDefinitions.getConstraintDefinition(
          'source',
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
