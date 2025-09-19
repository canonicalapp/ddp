/**
 * File-Based Sync Orchestrator
 * Compares generated schema files instead of live databases
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { Utils } from '@/utils/formatting';

interface FileSyncOptions {
  sourceDir: string;
  targetDir: string;
  output?: string;
  dryRun?: boolean;
}

interface SchemaFiles {
  schema?: string;
  procs?: string;
  triggers?: string;
}

export class FileSyncOrchestrator {
  private options: FileSyncOptions;

  constructor(options: FileSyncOptions) {
    this.options = options;
  }

  /**
   * Execute file-based schema sync
   */
  async execute(): Promise<string> {
    try {
      console.log('DDP FILE SYNC - Comparing generated schema files...');
      console.log(`Source: ${this.options.sourceDir}`);
      console.log(`Target: ${this.options.targetDir}`);
      console.log(`Output: ${this.options.output ?? 'alter.sql'}`);

      // Load schema files from both directories
      const sourceFiles = this.loadSchemaFiles(this.options.sourceDir);
      const targetFiles = this.loadSchemaFiles(this.options.targetDir);

      // Generate sync script
      const alterStatements = await this.generateFileSyncScript(
        sourceFiles,
        targetFiles
      );
      const script = alterStatements.join('\n');

      // Handle output
      if (this.options.output) {
        this.saveScriptToFile(script, this.options.output);
      } else {
        console.log(script);
      }

      return script;
    } catch (error) {
      console.error('File sync execution failed:', error);
      throw error;
    }
  }

  /**
   * Load schema files from a directory
   */
  private loadSchemaFiles(dir: string): SchemaFiles {
    const files: SchemaFiles = {};

    // Load schema.sql
    const schemaPath = join(dir, 'schema.sql');
    if (existsSync(schemaPath)) {
      files.schema = readFileSync(schemaPath, 'utf8');
    }

    // Load procs.sql
    const procsPath = join(dir, 'procs.sql');
    if (existsSync(procsPath)) {
      files.procs = readFileSync(procsPath, 'utf8');
    }

    // Load triggers.sql
    const triggersPath = join(dir, 'triggers.sql');
    if (existsSync(triggersPath)) {
      files.triggers = readFileSync(triggersPath, 'utf8');
    }

    return files;
  }

  /**
   * Generate sync script by comparing schema files
   */
  private async generateFileSyncScript(
    sourceFiles: SchemaFiles,
    targetFiles: SchemaFiles
  ): Promise<string[]> {
    const alterStatements: string[] = [];

    // Header
    alterStatements.push(
      ...Utils.generateSectionHeader('FILE-BASED SCHEMA SYNC')
    );
    alterStatements.push(`-- Generated: ${new Date().toISOString()}`);
    alterStatements.push(`-- Source: ${this.options.sourceDir}`);
    alterStatements.push(`-- Target: ${this.options.targetDir}`);
    alterStatements.push('');

    // Compare schema files
    if (sourceFiles.schema && targetFiles.schema) {
      alterStatements.push(
        ...this.compareSchemaFiles(sourceFiles.schema, targetFiles.schema)
      );
    }

    // Compare procs files
    if (sourceFiles.procs && targetFiles.procs) {
      alterStatements.push(
        ...this.compareProcsFiles(sourceFiles.procs, targetFiles.procs)
      );
    }

    // Compare triggers files
    if (sourceFiles.triggers && targetFiles.triggers) {
      alterStatements.push(
        ...this.compareTriggersFiles(sourceFiles.triggers, targetFiles.triggers)
      );
    }

    // Footer
    alterStatements.push('');
    alterStatements.push(
      ...Utils.generateSectionHeader('END OF FILE-BASED SYNC SCRIPT')
    );

    return alterStatements;
  }

  /**
   * Compare schema.sql files
   */
  private compareSchemaFiles(
    sourceSchema: string,
    targetSchema: string
  ): string[] {
    const statements: string[] = [];

    statements.push(...Utils.generateSectionHeader('SCHEMA COMPARISON'));

    // Parse tables from both schemas
    const sourceTables = this.parseTablesFromSchema(sourceSchema);
    const targetTables = this.parseTablesFromSchema(targetSchema);

    // Find differences
    const sourceTableNames = new Set(sourceTables.map(t => t.name));
    const targetTableNames = new Set(targetTables.map(t => t.name));

    // Tables in source but not in target (need to be created)
    for (const tableName of sourceTableNames) {
      if (!targetTableNames.has(tableName)) {
        const table = sourceTables.find(t => t.name === tableName);
        if (table) {
          statements.push(`-- TODO: Create table ${tableName}`);
          statements.push(table.definition);
        }
      }
    }

    // Tables in target but not in source (need to be dropped)
    for (const tableName of targetTableNames) {
      if (!sourceTableNames.has(tableName)) {
        statements.push(
          `-- TODO: Drop table ${tableName} (exists in target but not in source)`
        );
        statements.push(`-- DROP TABLE ${tableName};`);
      }
    }

    return statements;
  }

  /**
   * Compare procs.sql files
   */
  private compareProcsFiles(
    sourceProcs: string,
    targetProcs: string
  ): string[] {
    const statements: string[] = [];

    statements.push(...Utils.generateSectionHeader('PROCEDURES COMPARISON'));

    // Parse functions from both files
    const sourceFunctions = this.parseFunctionsFromProcs(sourceProcs);
    const targetFunctions = this.parseFunctionsFromProcs(targetProcs);

    // Find differences
    const sourceFunctionNames = new Set(sourceFunctions.map(f => f.name));
    const targetFunctionNames = new Set(targetFunctions.map(f => f.name));

    // Functions in source but not in target
    for (const funcName of sourceFunctionNames) {
      if (!targetFunctionNames.has(funcName)) {
        const func = sourceFunctions.find(f => f.name === funcName);
        if (func) {
          statements.push(`-- TODO: Create function ${funcName}`);
          statements.push(func.definition);
        }
      }
    }

    // Functions in target but not in source
    for (const funcName of targetFunctionNames) {
      if (!sourceFunctionNames.has(funcName)) {
        statements.push(
          `-- TODO: Drop function ${funcName} (exists in target but not in source)`
        );
        statements.push(`-- DROP FUNCTION ${funcName};`);
      }
    }

    return statements;
  }

  /**
   * Compare triggers.sql files
   */
  private compareTriggersFiles(
    sourceTriggers: string,
    targetTriggers: string
  ): string[] {
    const statements: string[] = [];

    statements.push(...Utils.generateSectionHeader('TRIGGERS COMPARISON'));

    // Parse triggers from both files
    const sourceTriggersList = this.parseTriggersFromFile(sourceTriggers);
    const targetTriggersList = this.parseTriggersFromFile(targetTriggers);

    // Find differences
    const sourceTriggerNames = new Set(sourceTriggersList.map(t => t.name));
    const targetTriggerNames = new Set(targetTriggersList.map(t => t.name));

    // Triggers in source but not in target
    for (const triggerName of sourceTriggerNames) {
      if (!targetTriggerNames.has(triggerName)) {
        const trigger = sourceTriggersList.find(t => t.name === triggerName);
        if (trigger) {
          statements.push(`-- TODO: Create trigger ${triggerName}`);
          statements.push(trigger.definition);
        }
      }
    }

    // Triggers in target but not in source
    for (const triggerName of targetTriggerNames) {
      if (!sourceTriggerNames.has(triggerName)) {
        statements.push(
          `-- TODO: Drop trigger ${triggerName} (exists in target but not in source)`
        );
        statements.push(`-- DROP TRIGGER ${triggerName};`);
      }
    }

    return statements;
  }

  /**
   * Parse tables from schema.sql content
   */
  private parseTablesFromSchema(
    schemaContent: string
  ): Array<{ name: string; definition: string }> {
    const tables: Array<{ name: string; definition: string }> = [];

    // Simple regex to find CREATE TABLE statements
    const createTableRegex = /CREATE TABLE\s+(\w+)\s*\([^;]+\);/g;
    let match;

    while ((match = createTableRegex.exec(schemaContent)) !== null) {
      const tableName = match[1];
      const definition = match[0];
      if (tableName && definition) {
        tables.push({ name: tableName, definition });
      }
    }

    return tables;
  }

  /**
   * Parse functions from procs.sql content
   */
  private parseFunctionsFromProcs(
    procsContent: string
  ): Array<{ name: string; definition: string }> {
    const functions: Array<{ name: string; definition: string }> = [];

    // Simple regex to find CREATE FUNCTION statements
    const createFunctionRegex =
      /CREATE\s+(?:OR REPLACE\s+)?(?:FUNCTION|PROCEDURE)\s+(\w+)\s*\([^;]+\)/g;
    let match;

    while ((match = createFunctionRegex.exec(procsContent)) !== null) {
      const funcName = match[1];
      const definition = match[0];
      if (funcName && definition) {
        functions.push({ name: funcName, definition });
      }
    }

    return functions;
  }

  /**
   * Parse triggers from triggers.sql content
   */
  private parseTriggersFromFile(
    triggersContent: string
  ): Array<{ name: string; definition: string }> {
    const triggers: Array<{ name: string; definition: string }> = [];

    // Simple regex to find CREATE TRIGGER statements
    const createTriggerRegex =
      /CREATE\s+(?:OR REPLACE\s+)?TRIGGER\s+(\w+)\s+[^;]+;/g;
    let match;

    while ((match = createTriggerRegex.exec(triggersContent)) !== null) {
      const triggerName = match[1];
      const definition = match[0];
      if (triggerName && definition) {
        triggers.push({ name: triggerName, definition });
      }
    }

    return triggers;
  }

  /**
   * Save script to file
   */
  private saveScriptToFile(script: string, filename: string): void {
    try {
      // Ensure output directory exists
      const outputDir = dirname(filename);
      if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true });
      }

      writeFileSync(filename, script, 'utf8');
      console.log(`📄 Generated: ${filename}`);
    } catch (error) {
      console.error('Failed to save script to file:', error);
      throw error;
    }
  }
}
