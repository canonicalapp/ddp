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
import { EnumOperations } from '@/sync/operations/enums';
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
  private enumOps: EnumOperations;
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
    this.enumOps = new EnumOperations(sourceClient, targetClient, options);
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
  private appendSectionIfNotEmpty(
    alterStatements: string[],
    sectionTitle: string,
    operations: string[] | null | undefined
  ) {
    const safeOperations = Array.isArray(operations) ? operations : [];
    const hasContent = safeOperations.some(
      statement => typeof statement === 'string' && statement.trim().length > 0
    );

    if (!hasContent) {
      return;
    }

    alterStatements.push(...Utils.generateSectionHeader(sectionTitle));
    alterStatements.push(...safeOperations);
    alterStatements.push('');
  }

  async executeAllOperations(alterStatements: string[]) {
    // 1. Handle enum operations (must come before tables/columns that depend on them)
    const enumOps = await this.enumOps.generateEnumOperations();
    this.appendSectionIfNotEmpty(alterStatements, 'ENUM OPERATIONS', enumOps);

    // 2. Handle sequence operations (must come before tables)
    const sequenceOps = await this.sequenceOps.generateSequenceOperations();
    this.appendSectionIfNotEmpty(
      alterStatements,
      'SEQUENCE OPERATIONS',
      sequenceOps
    );

    // 3. Handle table operations
    const tableOps = await this.tableOps.generateTableOperations();
    this.appendSectionIfNotEmpty(alterStatements, 'TABLE OPERATIONS', tableOps);

    // 4. Handle column operations
    const columnOps = await this.columnOps.generateColumnOperations();
    this.appendSectionIfNotEmpty(
      alterStatements,
      'COLUMN OPERATIONS',
      columnOps
    );

    // 5. Handle function operations
    const functionOps = await this.functionOps.generateFunctionOperations();
    this.appendSectionIfNotEmpty(
      alterStatements,
      'FUNCTION/PROCEDURE OPERATIONS',
      functionOps
    );

    // 6. Handle constraint operations
    const constraintOps =
      await this.constraintOps.generateConstraintOperations();
    this.appendSectionIfNotEmpty(
      alterStatements,
      'CONSTRAINT OPERATIONS',
      constraintOps
    );

    // 7. Handle index operations
    const indexOps = await this.indexOps.generateIndexOperations();
    this.appendSectionIfNotEmpty(alterStatements, 'INDEX OPERATIONS', indexOps);

    // 8. Handle trigger operations
    const triggerOps = await this.triggerOps.generateTriggerOperations();
    this.appendSectionIfNotEmpty(
      alterStatements,
      'TRIGGER OPERATIONS',
      triggerOps
    );
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
