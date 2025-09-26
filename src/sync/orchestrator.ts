/**
 * Schema Sync Orchestrator
 * Coordinates all schema sync operations
 */

import { mkdirSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import type { Client } from 'pg';
import { Utils } from '@/utils/formatting';
import { ColumnOperations } from '@/sync/operations/columns';
import { ConstraintOperations } from '@/sync/operations/constraints';
import { FunctionOperations } from '@/sync/operations/functions';
import { IndexOperations } from '@/sync/operations/indexes';
import { SequenceOperations } from '@/sync/operations/sequences';
import { TableOperations } from '@/sync/operations/tables';
import { TriggerOperations } from '@/sync/operations/triggers';

interface SyncOptions {
  conn: string;
  source: string;
  target: string;
  targetConn: string;
  output?: string;
  dryRun?: boolean;
  save?: boolean;
  [key: string]: unknown;
}

export class SchemaSyncOrchestrator {
  private sourceClient: Client;
  private targetClient: Client;
  private options: SyncOptions;
  private tableOps: TableOperations;
  private columnOps: ColumnOperations;
  private functionOps: FunctionOperations;
  private constraintOps: ConstraintOperations;
  private indexOps: IndexOperations;
  private sequenceOps: SequenceOperations;
  private triggerOps: TriggerOperations;

  constructor(
    sourceClient: Client,
    targetClient: Client,
    options: SyncOptions
  ) {
    this.sourceClient = sourceClient;
    this.targetClient = targetClient;
    this.options = options;

    // Initialize all operation modules with both clients
    this.tableOps = new TableOperations(sourceClient, targetClient, options);
    this.columnOps = new ColumnOperations(sourceClient, targetClient, options);
    this.functionOps = new FunctionOperations(
      sourceClient,
      targetClient,
      options
    );
    this.constraintOps = new ConstraintOperations(
      sourceClient,
      targetClient,
      options
    );
    this.indexOps = new IndexOperations(sourceClient, targetClient, options);
    this.sequenceOps = new SequenceOperations(
      sourceClient,
      targetClient,
      options
    );
    this.triggerOps = new TriggerOperations(
      sourceClient,
      targetClient,
      options
    );
  }

  /**
   * Execute all schema operations and collect results
   */
  async executeAllOperations(alterStatements: string[]) {
    // 1. Handle sequence operations (must come before tables)
    alterStatements.push(...Utils.generateSectionHeader('SEQUENCE OPERATIONS'));
    const sequenceOps = await this.sequenceOps.generateSequenceOperations();
    alterStatements.push(...sequenceOps);
    alterStatements.push('');

    // 2. Handle table operations
    alterStatements.push(...Utils.generateSectionHeader('TABLE OPERATIONS'));
    const tableOps = await this.tableOps.generateTableOperations();
    alterStatements.push(...tableOps);
    alterStatements.push('');

    // 3. Handle column operations
    alterStatements.push(...Utils.generateSectionHeader('COLUMN OPERATIONS'));
    const columnOps = await this.columnOps.generateColumnOperations();
    alterStatements.push(...columnOps);
    alterStatements.push('');

    // 4. Handle function operations
    alterStatements.push(
      ...Utils.generateSectionHeader('FUNCTION/PROCEDURE OPERATIONS')
    );
    const functionOps = await this.functionOps.generateFunctionOperations();
    alterStatements.push(...functionOps);
    alterStatements.push('');

    // 5. Handle constraint operations
    alterStatements.push(
      ...Utils.generateSectionHeader('CONSTRAINT OPERATIONS')
    );
    const constraintOps =
      await this.constraintOps.generateConstraintOperations();
    alterStatements.push(...constraintOps);
    alterStatements.push('');

    // 6. Handle index operations
    alterStatements.push(...Utils.generateSectionHeader('INDEX OPERATIONS'));
    const indexOps = await this.indexOps.generateIndexOperations();
    alterStatements.push(...indexOps);
    alterStatements.push('');

    // 7. Handle trigger operations
    alterStatements.push(...Utils.generateSectionHeader('TRIGGER OPERATIONS'));
    const triggerOps = await this.triggerOps.generateTriggerOperations();
    alterStatements.push(...triggerOps);
    alterStatements.push('');
  }

  /**
   * Generate complete schema sync script
   */
  async generateSyncScript() {
    const alterStatements: string[] = [];

    // Add header
    alterStatements.push('-- ===========================================');
    alterStatements.push('-- Schema Sync Script');
    alterStatements.push(`-- Source Schema: ${this.options.source}`);
    alterStatements.push(`-- Target Schema: ${this.options.target}`);
    alterStatements.push(`-- Generated: ${new Date().toISOString()}`);
    alterStatements.push('-- ===========================================');
    alterStatements.push('');

    try {
      await this.executeAllOperations(alterStatements);

      // Add footer
      alterStatements.push(...Utils.generateScriptFooter());

      return alterStatements;
    } catch (error) {
      console.error('Error generating sync script:', error);
      throw error;
    }
  }

  /**
   * Generate output filename with timestamp
   */
  generateOutputFilename() {
    return Utils.generateOutputFilename(
      this.options.source,
      this.options.target
    );
  }

  /**
   * Save script to file
   */
  saveScriptToFile(script: string, filename: string) {
    try {
      // Ensure output directory exists
      const outputDir = dirname(filename);
      if (outputDir !== '.') {
        mkdirSync(outputDir, { recursive: true });
      }

      // Write file
      writeFileSync(filename, script, 'utf8');
      console.log(`✅ Schema sync script saved to: ${filename}`);
    } catch (error) {
      console.error('❌ Error saving script to file:', error);
      throw error;
    }
  }

  /**
   * Execute the schema sync process
   */
  async execute() {
    try {
      // Establish connections
      await this.sourceClient.connect();
      await this.targetClient.connect();

      // Generate sync script
      const alterStatements = await this.generateSyncScript();
      const script = alterStatements.join('\n');

      // Handle output based on options
      if (this.options.output) {
        // Save to file with specified filename
        const filename = this.options.output;
        this.saveScriptToFile(script, filename);
      } else if (this.options.save) {
        // Save to file with auto-generated filename
        const filename = this.generateOutputFilename();
        this.saveScriptToFile(script, filename);
      } else {
        // Output to console
        console.log(script);
      }

      return script;
    } catch (error) {
      console.error('Schema sync execution failed:', error);
      throw error;
    } finally {
      // Close connections
      await this.sourceClient.end();
      await this.targetClient.end();
    }
  }
}
