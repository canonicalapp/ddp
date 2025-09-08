/**
 * Schema Sync Orchestrator
 * Coordinates all schema sync operations
 */

import {TableOperations} from './tableOperations.js';
import {ColumnOperations} from './columnOperations.js';
import {FunctionOperations} from './functionOperations.js';
import {ConstraintOperations} from './constraintOperations.js';
import {TriggerOperations} from './triggerOperations.js';
import {Utils} from './utils.js';
import {writeFileSync, mkdirSync} from 'fs';
import {dirname} from 'path';

export class SchemaSyncOrchestrator {
  constructor(client, options) {
    this.client = client;
    this.options = options;

    // Initialize all operation modules
    this.tableOps = new TableOperations(client, options);
    this.columnOps = new ColumnOperations(client, options);
    this.functionOps = new FunctionOperations(client, options);
    this.constraintOps = new ConstraintOperations(client, options);
    this.triggerOps = new TriggerOperations(client, options);
  }

  /**
   * Generate complete schema sync script
   */
  async generateSyncScript() {
    const alterStatements = [];

    // Add header
    alterStatements.push('-- ===========================================');
    alterStatements.push('-- Schema Sync Script');
    alterStatements.push(`-- Dev Schema: ${this.options.dev}`);
    alterStatements.push(`-- Prod Schema: ${this.options.prod}`);
    alterStatements.push(`-- Generated: ${new Date().toISOString()}`);
    alterStatements.push('-- ===========================================');
    alterStatements.push('');

    try {
      // 1. Handle table operations
      alterStatements.push(...Utils.generateSectionHeader('TABLE OPERATIONS'));
      const tableOps = await this.tableOps.generateTableOperations();
      alterStatements.push(...tableOps);
      alterStatements.push('');

      // 2. Handle column operations
      alterStatements.push(...Utils.generateSectionHeader('COLUMN OPERATIONS'));
      const columnOps = await this.columnOps.generateColumnOperations();
      alterStatements.push(...columnOps);
      alterStatements.push('');

      // 3. Handle function operations
      alterStatements.push(
        ...Utils.generateSectionHeader('FUNCTION/PROCEDURE OPERATIONS')
      );
      const functionOps = await this.functionOps.generateFunctionOperations();
      alterStatements.push(...functionOps);
      alterStatements.push('');

      // 4. Handle constraint operations
      alterStatements.push(
        ...Utils.generateSectionHeader('CONSTRAINT/INDEX OPERATIONS')
      );
      const constraintOps =
        await this.constraintOps.generateConstraintOperations();
      alterStatements.push(...constraintOps);
      alterStatements.push('');

      // 5. Handle trigger operations
      alterStatements.push(
        ...Utils.generateSectionHeader('TRIGGER OPERATIONS')
      );
      const triggerOps = await this.triggerOps.generateTriggerOperations();
      alterStatements.push(...triggerOps);
      alterStatements.push('');

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
    return Utils.generateOutputFilename(this.options.dev, this.options.prod);
  }

  /**
   * Save script to file
   */
  saveScriptToFile(script, filename) {
    try {
      // Ensure output directory exists
      const outputDir = dirname(filename);
      if (outputDir !== '.') {
        mkdirSync(outputDir, {recursive: true});
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
      // Establish connection
      await this.client.connect();

      // Generate sync script
      const alterStatements = await this.generateSyncScript();
      const script = alterStatements.join('\n');

      // Handle output based on options
      if (this.options.save) {
        // Save to file
        const filename = this.options.output || this.generateOutputFilename();
        this.saveScriptToFile(script, filename);
      } else {
        // Output to console
        console.log(script);
      }
    } catch (error) {
      console.error('Schema sync execution failed:', error);
      throw error;
    } finally {
      // Close connection
      await this.client.end();
    }
  }
}
