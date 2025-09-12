/**
 * Function Operations Module
 * Handles stored procedures and functions sync logic
 */

import { Utils } from '../../utils/formatting.js';

export class FunctionOperations {
  constructor(client, options) {
    this.client = client;
    this.options = options;
  }

  /**
   * Get all functions and procedures from a schema
   */
  async getFunctions(schemaName) {
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
   * Get function/procedure definition from dev schema
   */
  async getFunctionDefinition(schemaName, routineName, routineType) {
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
        return result.rows[0]?.definition || null;
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
      return result.rows[0]?.routine_definition || null;
    } catch (error) {
      console.warn(
        `Failed to get definition for ${routineType} ${routineName}:`,
        error.message
      );
      return null;
    }
  }

  /**
   * Compare two function definitions to detect changes
   */
  compareFunctionDefinitions(devFunction, prodFunction) {
    if (!devFunction || !prodFunction) {
      return false;
    }

    // Compare key properties that define function behavior
    const devProps = {
      routine_type: devFunction.routine_type,
      data_type: devFunction.data_type,
      routine_definition: devFunction.routine_definition,
    };

    const prodProps = {
      routine_type: prodFunction.routine_type,
      data_type: prodFunction.data_type,
      routine_definition: prodFunction.routine_definition,
    };

    // Compare each property
    for (const [key, devValue] of Object.entries(devProps)) {
      const prodValue = prodProps[key];
      if (devValue !== prodValue) {
        return true; // Found a difference
      }
    }

    return false; // No differences found
  }

  /**
   * Generate CREATE statement for function/procedure
   */
  generateCreateStatement(definition, routineName, routineType, targetSchema) {
    if (!definition) {
      return `-- TODO: Could not retrieve definition for ${routineType} ${routineName}`;
    }

    // Replace schema references in the definition
    let createStatement = definition;

    // Replace the original schema with target schema
    createStatement = createStatement.replace(
      new RegExp(`\\b${this.options.dev}\\b`, 'g'),
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
  async handleFunctionsToUpdate(devFunctions, prodFunctions, alterStatements) {
    const functionsToUpdate = devFunctions.filter(devFunction => {
      const prodFunction = prodFunctions.find(
        p =>
          p.routine_name === devFunction.routine_name &&
          p.routine_type === devFunction.routine_type
      );
      return (
        prodFunction &&
        this.compareFunctionDefinitions(devFunction, prodFunction)
      );
    });

    for (const devFunction of functionsToUpdate) {
      alterStatements.push(
        `-- ${(devFunction.routine_type || 'FUNCTION').toLowerCase()} ${
          devFunction.routine_name
        } has changed, updating in prod`
      );

      const oldFunctionName = `${devFunction.routine_name}_old_${Date.now()}`;
      alterStatements.push(
        `-- Renaming old ${(devFunction.routine_type || 'FUNCTION').toLowerCase()} to ${oldFunctionName} for manual review`
      );
      alterStatements.push(
        `ALTER ${devFunction.routine_type} ${this.options.prod}.${devFunction.routine_name} RENAME TO ${oldFunctionName};`
      );

      const definition = await this.getFunctionDefinition(
        this.options.dev,
        devFunction.routine_name,
        devFunction.routine_type
      );

      const createStatement = this.generateCreateStatement(
        definition,
        devFunction.routine_name,
        devFunction.routine_type,
        this.options.prod
      );

      alterStatements.push(createStatement);
      alterStatements.push('');
    }
  }

  /**
   * Generate function operations for schema sync
   */
  async generateFunctionOperations() {
    const alterStatements = [];

    const devFunctions = await this.getFunctions(this.options.dev);
    const prodFunctions = await this.getFunctions(this.options.prod);

    this.handleFunctionsToDrop(alterStatements, devFunctions, prodFunctions);
    await this.handleFunctionsToCreate(
      alterStatements,
      devFunctions,
      prodFunctions
    );
    await this.handleFunctionsToUpdate(
      devFunctions,
      prodFunctions,
      alterStatements
    );

    return alterStatements;
  }

  /**
   * Handle functions that need to be dropped in prod
   */
  handleFunctionsToDrop(alterStatements, devFunctions, prodFunctions) {
    const functionsToDrop = prodFunctions.filter(
      p =>
        !devFunctions.some(
          d =>
            d.routine_name === p.routine_name &&
            d.routine_type === p.routine_type
        )
    );

    for (const func of functionsToDrop) {
      const backupName = Utils.generateBackupName(func.routine_name);

      alterStatements.push(
        `-- ${func.routine_type} ${func.routine_name} exists in prod but not in dev`
      );
      alterStatements.push(
        `-- Renaming ${func.routine_type?.toLowerCase()} to preserve before manual drop`
      );
      alterStatements.push(
        `ALTER ${func.routine_type} ${this.options.prod}.${func.routine_name} RENAME TO ${backupName};`
      );
      alterStatements.push(
        `-- TODO: Manually drop ${(func.routine_type || 'FUNCTION').toLowerCase()} ${
          this.options.prod
        }.${backupName} after confirming it's no longer needed`
      );
    }
  }

  /**
   * Handle functions that need to be created in prod
   */
  async handleFunctionsToCreate(alterStatements, devFunctions, prodFunctions) {
    const functionsToCreate = devFunctions.filter(
      d =>
        !prodFunctions.some(
          p =>
            p.routine_name === d.routine_name &&
            p.routine_type === d.routine_type
        )
    );

    for (const func of functionsToCreate) {
      alterStatements.push(
        `-- Creating ${(func.routine_type || 'FUNCTION').toLowerCase()} ${
          func.routine_name
        } in prod`
      );

      // Get the definition from dev schema
      const definition = await this.getFunctionDefinition(
        this.options.dev,
        func.routine_name,
        func.routine_type
      );

      // Generate CREATE statement
      const createStatement = this.generateCreateStatement(
        definition,
        func.routine_name,
        func.routine_type,
        this.options.prod
      );

      alterStatements.push(createStatement);
      alterStatements.push(''); // Add blank line for readability
    }
  }
}
