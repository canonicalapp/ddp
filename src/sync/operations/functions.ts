/**
 * Function Operations Module
 * Handles stored procedures and functions sync logic
 */

import type { ILegacySyncOptions, TNullable } from '@/types';
import { Utils } from '@/utils/formatting';
import type { Client } from 'pg';

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

    // Use the appropriate client based on schema
    const client =
      schemaName === this.options.source
        ? this.sourceClient
        : this.targetClient;

    const result = await client.query(functionsQuery, [schemaName]);

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
      // Use pg_get_functiondef to get the complete definition for both functions and procedures
      const functionDefQuery = `
        SELECT pg_get_functiondef(p.oid) as definition
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = $1 AND p.proname = $2
        LIMIT 1
      `;

      // Use the appropriate client based on schema
      const client =
        schemaName === this.options.source
          ? this.sourceClient
          : this.targetClient;

      const result = await client.query(functionDefQuery, [
        schemaName,
        routineName,
      ]);

      const definition = result.rows[0]?.definition;

      if (definition) {
        return definition;
      }

      // Fallback to information_schema if pg_get_functiondef fails
      const fallbackQuery = `
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

      const fallbackResult = await client.query(fallbackQuery, [
        schemaName,
        routineName,
        routineType,
      ]);

      return fallbackResult.rows[0]?.routine_definition ?? null;
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
  ) {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!sourceFunction || !targetFunction) {
      return false;
    }

    // Compare key properties that define function behavior
    const sourceProps = {
      routine_type: sourceFunction.routine_type,
      data_type: sourceFunction.data_type,
      routine_definition: this.normalizeFunctionDefinition(
        sourceFunction.routine_definition ?? ''
      ),
    };

    const targetProps = {
      routine_type: targetFunction.routine_type,
      data_type: targetFunction.data_type,
      routine_definition: this.normalizeFunctionDefinition(
        targetFunction.routine_definition ?? ''
      ),
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
   * Normalize function definition by replacing schema references
   */
  private normalizeFunctionDefinition(definition: string) {
    if (!definition) return definition;

    // Replace schema references with a placeholder to normalize comparison
    return definition
      .replace(/\b(dev|prod)\./g, 'SCHEMA.')
      .replace(/\b(dev|prod)\b/g, 'SCHEMA');
  }

  /**
   * Generate CREATE statement for function/procedure
   */
  generateCreateStatement(
    definition: string | null,
    routineName: string,
    routineType: string,
    targetSchema: string
  ) {
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

    // Clean up the definition - remove any malformed parts
    createStatement = this.cleanFunctionDefinition(
      createStatement,
      routineType
    );

    // Ensure it's a CREATE statement
    if (!createStatement.trim().toUpperCase().startsWith('CREATE')) {
      createStatement = `CREATE OR REPLACE ${routineType} ${targetSchema}.${routineName} AS\n${createStatement}`;
    }

    // Ensure proper function syntax
    if (routineType === 'FUNCTION' && !createStatement.includes('AS')) {
      createStatement = createStatement.replace(
        new RegExp(
          `CREATE OR REPLACE FUNCTION ${targetSchema}\\.${routineName}\\b`
        ),
        `CREATE OR REPLACE FUNCTION ${targetSchema}.${routineName} AS`
      );
    }

    // Ensure proper procedure syntax
    if (routineType === 'PROCEDURE' && !createStatement.includes('AS')) {
      createStatement = createStatement.replace(
        new RegExp(
          `CREATE OR REPLACE PROCEDURE ${targetSchema}\\.${routineName}\\b`
        ),
        `CREATE OR REPLACE PROCEDURE ${targetSchema}.${routineName} AS`
      );
    }

    // Ensure the statement ends with a semicolon
    if (!createStatement.trim().endsWith(';')) {
      createStatement += ';';
    }

    return createStatement;
  }

  /**
   * Clean up function definition to remove malformed parts
   */
  private cleanFunctionDefinition(definition: string, _routineType: string) {
    let cleaned = definition;

    // Remove any lines that don't belong to the function definition
    const lines = cleaned.split('\n');
    const cleanedLines: string[] = [];
    let inFunctionBody = false;
    let dollarQuoteCount = 0;
    let foundEnd = false;

    for (const line of lines) {
      const trimmedLine = line.trim();

      // Skip empty lines at the beginning
      if (!inFunctionBody && !trimmedLine) {
        continue;
      }

      // Check if we're starting the function body
      if (trimmedLine.includes('AS') || trimmedLine.includes('$$')) {
        inFunctionBody = true;
      }

      // Count dollar quotes to track function body
      if (inFunctionBody) {
        dollarQuoteCount += (trimmedLine.match(/\$\$/g) ?? []).length;

        // If we have an even number of $$, we've found the end
        if (dollarQuoteCount > 0 && dollarQuoteCount % 2 === 0) {
          foundEnd = true;
        }
      }

      // Stop if we hit another CREATE statement (malformed definition)
      if (trimmedLine.startsWith('CREATE') && cleanedLines.length > 0) {
        break;
      }

      // Stop if we've found the end of the function
      if (foundEnd && trimmedLine.startsWith('CREATE')) {
        break;
      }

      cleanedLines.push(line);
    }

    return cleanedLines.join('\n');
  }

  /**
   * Handle functions that have changed
   */
  async handleFunctionsToUpdate(
    sourceFunctions: IFunctionRow[],
    targetFunctions: IFunctionRow[],
    alterStatements: string[]
  ) {
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
        `-- ${sourceFunction.routine_type.toLowerCase() || 'function'} ${
          sourceFunction.routine_name
        } has changed, updating in ${this.options.target}`
      );

      const oldFunctionName = `${sourceFunction.routine_name}_old_${Utils.generateTimestamp()}`;
      alterStatements.push(
        `-- Renaming old ${sourceFunction.routine_type.toLowerCase() || 'function'} to ${oldFunctionName} for manual review`
      );
      alterStatements.push(
        `ALTER ${sourceFunction.routine_type.toLowerCase() === 'procedure' ? 'PROCEDURE' : 'FUNCTION'} ${this.options.target}.${sourceFunction.routine_name} RENAME TO ${oldFunctionName};`
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
  async generateFunctionOperations() {
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
  ) {
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
        `-- Renaming ${func.routine_type.toLowerCase() || 'function'} to preserve before manual drop`
      );
      alterStatements.push(
        `ALTER ${func.routine_type.toLowerCase() === 'procedure' ? 'PROCEDURE' : 'FUNCTION'} ${this.options.target}.${func.routine_name} RENAME TO ${backupName};`
      );
      alterStatements.push(
        `-- TODO: Manually drop ${func.routine_type.toLowerCase() || 'function'} ${
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
  ) {
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
        `-- Creating ${(func.routine_type || 'function').toLowerCase()} ${
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
