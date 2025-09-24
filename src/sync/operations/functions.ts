/**
 * Function Operations Module
 * Handles stored procedures and functions sync logic
 */

import type { Client } from 'pg';
import { Utils } from '@/utils/formatting';
import type { ILegacySyncOptions, TNullable } from '@/types';

interface IFunctionRow {
  routine_name: string;
  routine_type: string;
  specific_name: string;
  data_type: string;
  routine_definition: TNullable<string>;
}

interface IFunctionDefinition {
  routine_name: string;
  routine_type: string;
  data_type: string;
  routine_definition: TNullable<string>;
}

export class FunctionOperations {
  private client: Client;
  private options: ILegacySyncOptions;

  constructor(client: Client, options: ILegacySyncOptions) {
    this.client = client;
    this.options = options;
  }

  /**
   * Get all functions and procedures from a schema
   */
  async getFunctions(schemaName: string): Promise<IFunctionRow[]> {
    const functionsQuery = `
      SELECT 
        routine_name,
        routine_type,
        specific_name,
        data_type,
        routine_definition
      FROM information_schema.routines 
      WHERE routine_schema = $1 
      AND routine_type IN ('FUNCTION', 'PROCEDURE')
    `;

    const result = await this.client.query(functionsQuery, [schemaName]);
    return result.rows;
  }

  /**
   * Get function/procedure definition from source schema
   */
  async getFunctionDefinition(
    schemaName: string,
    routineName: string,
    routineType: string
  ): Promise<string | null> {
    try {
      // For functions, use pg_get_functiondef to get the complete definition
      if (routineType === 'FUNCTION') {
        const functionDefQuery = `
          SELECT pg_get_functiondef(p.oid) as definition
          FROM pg_proc p
          JOIN pg_namespace n ON p.pronamespace = n.oid
          WHERE n.nspname = $1 AND p.proname = $2
        `;

        const result = await this.client.query(functionDefQuery, [
          schemaName,
          routineName,
        ]);
        return result.rows[0]?.definition ?? null;
      }

      // For procedures, we'll need to reconstruct from information_schema
      // This is a simplified approach - in practice, you might need more complex logic
      const procedureDefQuery = `
        SELECT 
          routine_name,
          routine_type,
          data_type as return_type,
          routine_definition
        FROM information_schema.routines 
        WHERE routine_schema = $1 
        AND routine_name = $2 
        AND routine_type = $3
      `;

      const result = await this.client.query(procedureDefQuery, [
        schemaName,
        routineName,
        routineType,
      ]);
      return result.rows[0]?.routine_definition ?? null;
    } catch (error) {
      console.warn(
        `Failed to get definition for ${routineType} ${routineName}:`,
        error instanceof Error ? error.message : 'Unknown error'
      );
      return null;
    }
  }

  /**
   * Compare two function definitions to detect changes
   */
  compareFunctionDefinitions(
    sourceFunction: IFunctionDefinition,
    targetFunction: IFunctionDefinition
  ): boolean {
    if (!sourceFunction || !targetFunction) {
      return false;
    }

    // Compare key properties that define function behavior
    const sourceProps = {
      routine_type: sourceFunction.routine_type,
      data_type: sourceFunction.data_type,
      routine_definition: sourceFunction.routine_definition,
    };

    const targetProps = {
      routine_type: targetFunction.routine_type,
      data_type: targetFunction.data_type,
      routine_definition: targetFunction.routine_definition,
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
   * Generate CREATE statement for function/procedure
   */
  generateCreateStatement(
    definition: string | null,
    routineName: string,
    routineType: string,
    targetSchema: string
  ): string {
    if (!definition) {
      return `-- TODO: Could not retrieve definition for ${routineType} ${routineName}`;
    }

    // Replace schema references in the definition
    let createStatement = definition;

    // Replace the original schema with target schema
    createStatement = createStatement.replace(
      new RegExp(`\\b${this.options.source}\\b`, 'g'),
      targetSchema
    );

    // Ensure it's a CREATE statement
    if (!createStatement.trim().toUpperCase().startsWith('CREATE')) {
      createStatement = `CREATE ${routineType} ${targetSchema}.${routineName} AS\n${createStatement}`;
    }

    return createStatement;
  }

  /**
   * Handle functions that have changed
   */
  async handleFunctionsToUpdate(
    sourceFunctions: IFunctionRow[],
    targetFunctions: IFunctionRow[],
    alterStatements: string[]
  ): Promise<void> {
    const functionsToUpdate = sourceFunctions.filter(sourceFunction => {
      const targetFunction = targetFunctions.find(
        p =>
          p.routine_name === sourceFunction.routine_name &&
          p.routine_type === sourceFunction.routine_type
      );
      return (
        targetFunction &&
        this.compareFunctionDefinitions(sourceFunction, targetFunction)
      );
    });

    for (const sourceFunction of functionsToUpdate) {
      alterStatements.push(
        `-- ${sourceFunction.routine_type.toLowerCase()} ${
          sourceFunction.routine_name
        } has changed, updating in ${this.options.target}`
      );

      const oldFunctionName = `${sourceFunction.routine_name}_old_${Date.now()}`;
      alterStatements.push(
        `-- Renaming old ${sourceFunction.routine_type.toLowerCase()} to ${oldFunctionName} for manual review`
      );
      alterStatements.push(
        `ALTER ${sourceFunction.routine_type} ${this.options.target}.${sourceFunction.routine_name} RENAME TO ${oldFunctionName};`
      );

      const definition = await this.getFunctionDefinition(
        this.options.source,
        sourceFunction.routine_name,
        sourceFunction.routine_type
      );

      const createStatement = this.generateCreateStatement(
        definition,
        sourceFunction.routine_name,
        sourceFunction.routine_type,
        this.options.target
      );

      alterStatements.push(createStatement);
      alterStatements.push('');
    }
  }

  /**
   * Generate function operations for schema sync
   */
  async generateFunctionOperations(): Promise<string[]> {
    const alterStatements: string[] = [];

    const sourceFunctions = await this.getFunctions(this.options.source);
    const targetFunctions = await this.getFunctions(this.options.target);

    this.handleFunctionsToDrop(
      alterStatements,
      sourceFunctions,
      targetFunctions
    );
    await this.handleFunctionsToCreate(
      alterStatements,
      sourceFunctions,
      targetFunctions
    );
    await this.handleFunctionsToUpdate(
      sourceFunctions,
      targetFunctions,
      alterStatements
    );

    return alterStatements;
  }

  /**
   * Handle functions that need to be dropped in target
   */
  handleFunctionsToDrop(
    alterStatements: string[],
    sourceFunctions: IFunctionRow[],
    targetFunctions: IFunctionRow[]
  ): void {
    const functionsToDrop = targetFunctions.filter(
      p =>
        !sourceFunctions.some(
          d =>
            d.routine_name === p.routine_name &&
            d.routine_type === p.routine_type
        )
    );

    for (const func of functionsToDrop) {
      const backupName = Utils.generateBackupName(func.routine_name);

      alterStatements.push(
        `-- ${func.routine_type} ${func.routine_name} exists in ${this.options.target} but not in ${this.options.source}`
      );
      alterStatements.push(
        `-- Renaming ${func.routine_type.toLowerCase()} to preserve before manual drop`
      );
      alterStatements.push(
        `ALTER ${func.routine_type} ${this.options.target}.${func.routine_name} RENAME TO ${backupName};`
      );
      alterStatements.push(
        `-- TODO: Manually drop ${func.routine_type.toLowerCase()} ${
          this.options.target
        }.${backupName} after confirming it's no longer needed`
      );
    }
  }

  /**
   * Handle functions that need to be created in target
   */
  async handleFunctionsToCreate(
    alterStatements: string[],
    sourceFunctions: IFunctionRow[],
    targetFunctions: IFunctionRow[]
  ): Promise<void> {
    const functionsToCreate = sourceFunctions.filter(
      d =>
        !targetFunctions.some(
          p =>
            p.routine_name === d.routine_name &&
            p.routine_type === d.routine_type
        )
    );

    for (const func of functionsToCreate) {
      alterStatements.push(
        `-- Creating ${func.routine_type?.toLowerCase() ?? 'function'} ${
          func.routine_name
        } in ${this.options.target}`
      );

      // Get the definition from source schema
      const definition = await this.getFunctionDefinition(
        this.options.source,
        func.routine_name,
        func.routine_type
      );

      // Generate CREATE statement
      const createStatement = this.generateCreateStatement(
        definition,
        func.routine_name,
        func.routine_type,
        this.options.target
      );

      alterStatements.push(createStatement);
      alterStatements.push(''); // Add blank line for readability
    }
  }
}
