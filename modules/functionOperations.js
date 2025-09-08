/**
 * Function Operations Module
 * Handles stored procedures and functions sync logic
 */

import {Utils} from './utils.js';

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
        specific_name
      FROM information_schema.routines 
      WHERE routine_schema = $1 
      AND routine_type IN ('FUNCTION', 'PROCEDURE')
    `;

    const result = await this.client.query(functionsQuery, [schemaName]);
    return result.rows;
  }

  /**
   * Generate function operations for schema sync
   */
  async generateFunctionOperations() {
    const alterStatements = [];

    const devFunctions = await this.getFunctions(this.options.dev);
    const prodFunctions = await this.getFunctions(this.options.prod);

    // Find functions to drop in prod (exist in prod but not in dev)
    const functionsToDrop = prodFunctions.filter(
      (p) => !devFunctions.some((d) => d.routine_name === p.routine_name)
    );

    for (const func of functionsToDrop) {
      const backupName = Utils.generateBackupName(func.routine_name);

      alterStatements.push(
        `-- ${func.routine_type} ${func.routine_name} exists in prod but not in dev`
      );
      alterStatements.push(
        `-- Renaming ${func.routine_type.toLowerCase()} to preserve before manual drop`
      );
      alterStatements.push(
        `ALTER ${func.routine_type} ${this.options.prod}.${func.routine_name} RENAME TO ${backupName};`
      );
      alterStatements.push(
        `-- TODO: Manually drop ${func.routine_type.toLowerCase()} ${
          this.options.prod
        }.${backupName} after confirming it's no longer needed`
      );
    }

    // Find functions to create in prod (exist in dev but not in prod)
    const functionsToCreate = devFunctions.filter(
      (d) => !prodFunctions.some((p) => p.routine_name === d.routine_name)
    );

    for (const func of functionsToCreate) {
      alterStatements.push(
        `-- TODO: Create ${func.routine_type.toLowerCase()} ${
          func.routine_name
        } in prod`
      );
      alterStatements.push(
        `-- Copy the ${func.routine_type.toLowerCase()} definition from dev schema`
      );
    }

    return alterStatements;
  }
}
