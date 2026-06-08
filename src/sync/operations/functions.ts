/**
 * Function Operations Module
 * Handles stored procedures and functions sync logic
 */

import type { ILegacySyncOptions, TNullable } from '@/types';
import {
  type SyncDbSide,
  clientForSyncSide,
  schemaNameForSide,
} from '@/sync/syncClient';
import {
  APPLICATION_ROUTINES_IN_SCHEMA_QUERY,
  APPLICATION_ROUTINES_IN_SCHEMAS_QUERY,
  formatRoutineDropStatement,
  mergeRoutinesByLogicalKey,
  routineIdentityKey,
  type IRoutineIdentity,
} from '@/sync/routineSql';
import { isPreservedDroppedArtifactName } from '@/utils/preservedArtifacts';
import type { Client } from 'pg';

interface IFunctionRow extends IRoutineIdentity {
  specific_name?: string;
  data_type: string;
  routine_definition?: TNullable<string>;
}

interface IFunctionDefinition {
  routine_name: string;
  routine_type: string;
  data_type: string;
  routine_definition?: TNullable<string>;
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
   * Get all functions and procedures from a schema on the given database.
   */
  /**
   * Routines referenced by any trigger (any table schema). Never auto-drop these.
   */
  async getTriggerReferencedRoutineKeys(
    side: SyncDbSide
  ): Promise<Set<string>> {
    const client = clientForSyncSide(
      side,
      this.sourceClient,
      this.targetClient
    );
    const result = await client.query<{
      routine_type: string;
      routine_name: string;
      identity_arguments: string | null;
    }>(`
      SELECT DISTINCT
        CASE p.prokind
          WHEN 'p' THEN 'PROCEDURE'
          ELSE 'FUNCTION'
        END AS routine_type,
        p.proname AS routine_name,
        pg_get_function_identity_arguments(p.oid) AS identity_arguments
      FROM pg_trigger t
      JOIN pg_proc p ON p.oid = t.tgfoid
    `);

    const keys = new Set<string>();
    for (const row of result.rows) {
      keys.add(
        routineIdentityKey(row, {
          useCatalogOid: this.useCatalogOidForRoutineMatch(),
        })
      );
    }
    return keys;
  }

  private isCrossSchemaCatalog(): boolean {
    return this.options.source !== this.options.target;
  }

  private schemasForSide(side: SyncDbSide): string[] {
    if (side === 'target') {
      return [this.options.target];
    }
    return [this.options.source];
  }

  async getFunctions(side: SyncDbSide): Promise<IFunctionRow[]> {
    const client = clientForSyncSide(
      side,
      this.sourceClient,
      this.targetClient
    );
    const schemas = this.schemasForSide(side);

    const result = await client.query<IFunctionRow>(
      schemas.length === 1
        ? APPLICATION_ROUTINES_IN_SCHEMA_QUERY
        : APPLICATION_ROUTINES_IN_SCHEMAS_QUERY,
      [schemas.length === 1 ? schemas[0] : schemas]
    );

    const filtered = result.rows.filter(
      row => !isPreservedDroppedArtifactName(row.routine_name)
    );

    return mergeRoutinesByLogicalKey(filtered, {
      useCatalogOid: !this.isCrossSchemaCatalog(),
    });
  }

  /** True if the same logical routine (name + type + args) exists in the given schema. */
  private async routineExistsInSchema(
    side: SyncDbSide,
    schemaName: string,
    candidate: IFunctionRow
  ): Promise<boolean> {
    const client = clientForSyncSide(
      side,
      this.sourceClient,
      this.targetClient
    );
    const result = await client.query<{ exists: boolean }>(
      `
      SELECT EXISTS (
        SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = $1
          AND p.proname = $2
          AND CASE p.prokind WHEN 'p' THEN 'PROCEDURE' ELSE 'FUNCTION' END = $3
          AND pg_get_function_identity_arguments(p.oid) IS NOT DISTINCT FROM $4
          AND NOT EXISTS (
            SELECT 1 FROM pg_depend d
            WHERE d.classid = 'pg_proc'::regclass
              AND d.objid = p.oid
              AND d.deptype = 'e'
          )
      ) AS exists
      `,
      [
        schemaName,
        candidate.routine_name,
        candidate.routine_type,
        candidate.identity_arguments ?? '',
      ]
    );
    return result.rows[0]?.exists === true;
  }

  private useCatalogOidForRoutineMatch(): boolean {
    return this.options.source === this.options.target;
  }

  private routineKey(routine: IFunctionRow): string {
    return routineIdentityKey(routine, {
      useCatalogOid: this.useCatalogOidForRoutineMatch(),
    });
  }

  private findMatchingRoutine(
    routines: IFunctionRow[],
    candidate: IFunctionRow
  ): IFunctionRow | undefined {
    const key = this.routineKey(candidate);
    const direct = routines.find(r => this.routineKey(r) === key);
    if (direct) {
      return direct;
    }
    return undefined;
  }

  /**
   * Desired-state match: shadow materialization first, then same logical routine in shadow schema.
   */
  private async findDesiredRoutineMatch(
    sourceRoutines: IFunctionRow[],
    targetRoutine: IFunctionRow
  ): Promise<IFunctionRow | undefined> {
    const direct = this.findMatchingRoutine(sourceRoutines, targetRoutine);
    if (direct) {
      return direct;
    }
    if (!this.isCrossSchemaCatalog()) {
      return undefined;
    }
    const inShadow = await this.routineExistsInSchema(
      'source',
      this.options.source,
      targetRoutine
    );
    if (inShadow) {
      return targetRoutine;
    }
    return undefined;
  }

  /**
   * Resolve catalog schema for a routine row (shadow vs target layout).
   */
  private schemaForRoutine(side: SyncDbSide, routine: IRoutineIdentity): string {
    return (
      routine.routine_schema?.trim() ||
      schemaNameForSide(side, this.options)
    );
  }

  /**
   * Full routine body from pg_get_functiondef (correct overload by identity args).
   */
  async getFunctionDefinition(
    side: SyncDbSide,
    routine: IRoutineIdentity
  ): Promise<string | null> {
    const schemaName = this.schemaForRoutine(side, routine);
    const client = clientForSyncSide(
      side,
      this.sourceClient,
      this.targetClient
    );

    try {
      const functionDefQuery = `
        SELECT pg_get_functiondef(p.oid) AS definition
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = $1
          AND p.proname = $2
          AND CASE p.prokind WHEN 'p' THEN 'PROCEDURE' ELSE 'FUNCTION' END = $3
          AND pg_get_function_identity_arguments(p.oid) IS NOT DISTINCT FROM $4
        LIMIT 1
      `;

      const result = await client.query<{ definition: string }>(
        functionDefQuery,
        [
          schemaName,
          routine.routine_name,
          routine.routine_type,
          routine.identity_arguments ?? '',
        ]
      );

      const definition = result.rows[0]?.definition;
      if (definition) {
        return definition;
      }
    } catch (error) {
      console.warn(
        `pg_get_functiondef failed for ${routine.routine_type} ${schemaName}.${routine.routine_name}:`,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }

    try {
      const fallbackResult = await client.query<{ routine_definition: string }>(
        `
        SELECT routine_definition
        FROM information_schema.routines
        WHERE routine_schema = $1
          AND routine_name = $2
          AND routine_type = $3
        LIMIT 1
        `,
        [schemaName, routine.routine_name, routine.routine_type]
      );

      return fallbackResult.rows[0]?.routine_definition ?? null;
    } catch (error) {
      console.warn(
        `Failed to get definition for ${routine.routine_type} ${schemaName}.${routine.routine_name}:`,
        error instanceof Error ? error.message : 'Unknown error'
      );
      return null;
    }
  }

  /**
   * Compare bodies from the database (catalog rows do not carry definitions).
   */
  private async routineBodiesDiffer(
    sourceRoutine: IFunctionRow,
    targetRoutine: IFunctionRow
  ): Promise<boolean> {
    const [sourceDef, targetDef] = await Promise.all([
      this.getFunctionDefinition('source', sourceRoutine),
      this.getFunctionDefinition('target', targetRoutine),
    ]);

    if (sourceDef === null && targetDef === null) {
      return false;
    }
    if (sourceDef === null || targetDef === null) {
      return true;
    }

    return (
      this.normalizeFunctionDefinition(sourceDef) !==
      this.normalizeFunctionDefinition(targetDef)
    );
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
    if (!definition) {
      return definition;
    }

    let normalized = definition;
    const schemas = [
      this.options.source,
      this.options.target,
      'dev',
      'prod',
      'public',
      'ddp_shadow',
    ];
    for (const schema of schemas) {
      if (!schema) {
        continue;
      }
      const escaped = schema.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      normalized = normalized.replace(
        new RegExp(`\\b${escaped}\\.`, 'g'),
        'SCHEMA.'
      );
      normalized = normalized.replace(
        new RegExp(`\\b${escaped}\\b`, 'g'),
        'SCHEMA'
      );
    }
    return normalized;
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
    for (const sourceFunction of sourceFunctions) {
      const targetFunction = this.findMatchingRoutine(
        targetFunctions,
        sourceFunction
      );
      if (!targetFunction) {
        continue;
      }

      const bodyChanged = await this.routineBodiesDiffer(
        sourceFunction,
        targetFunction
      );
      if (!bodyChanged) {
        continue;
      }

      alterStatements.push(
        `-- ${sourceFunction.routine_type.toLowerCase() || 'function'} ${
          sourceFunction.routine_name
        } has changed, updating in ${this.options.target}`
      );

      const definition = await this.getFunctionDefinition(
        'source',
        sourceFunction
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

    const sourceFunctions = await this.getFunctions('source');
    const targetFunctions = await this.getFunctions('target');
    const triggerReferencedKeys =
      await this.getTriggerReferencedRoutineKeys('target');

    await this.handleFunctionsToDrop(
      alterStatements,
      sourceFunctions,
      targetFunctions,
      triggerReferencedKeys
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
  async handleFunctionsToDrop(
    alterStatements: string[],
    sourceFunctions: IFunctionRow[],
    targetFunctions: IFunctionRow[],
    triggerReferencedKeys: Set<string>
  ) {
    const functionsToDrop: IFunctionRow[] = [];
    for (const p of targetFunctions) {
      if (triggerReferencedKeys.has(this.routineKey(p))) {
        continue;
      }
      const desired = await this.findDesiredRoutineMatch(sourceFunctions, p);
      if (!desired) {
        functionsToDrop.push(p);
      }
    }

    const emittedDrop = new Set<string>();
    for (const func of functionsToDrop) {
      const dropKey = this.routineKey(func);
      if (emittedDrop.has(dropKey)) {
        continue;
      }
      emittedDrop.add(dropKey);

      alterStatements.push(
        `-- ${func.routine_type} ${func.routine_name} exists in ${this.options.target} but not in ${this.options.source}`
      );
      alterStatements.push(formatRoutineDropStatement(this.options.target, func));
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
      d => !this.findMatchingRoutine(targetFunctions, d)
    );

    for (const func of functionsToCreate) {
      alterStatements.push(
        `-- Creating ${(func.routine_type || 'function').toLowerCase()} ${
          func.routine_name
        } in ${this.options.target}`
      );

      // Get the definition from source schema
      const definition = await this.getFunctionDefinition('source', func);

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
