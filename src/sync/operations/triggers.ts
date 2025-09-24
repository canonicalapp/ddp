/**
 * Trigger Operations Module
 * Handles triggers sync logic
 */

import type { Client } from 'pg';
import type { ILegacySyncOptions } from '@/types';

interface ITriggerRow {
  trigger_name: string;
  event_manipulation: string;
  event_object_table: string;
  action_timing: string;
  action_statement: string;
}

interface ITriggerDefinition {
  trigger_name: string;
  event_manipulation: string;
  event_object_table: string;
  action_timing: string;
  action_statement: string;
  action_orientation: string | null;
  action_condition: string | null;
}

export class TriggerOperations {
  private client: Client;
  private options: ILegacySyncOptions;

  constructor(client: Client, options: ILegacySyncOptions) {
    this.client = client;
    this.options = options;
  }

  /**
   * Get all triggers from a schema
   */
  async getTriggers(schemaName: string): Promise<ITriggerRow[]> {
    const triggersQuery = `
      SELECT 
        trigger_name,
        event_manipulation,
        event_object_table,
        action_timing,
        action_statement
      FROM information_schema.triggers 
      WHERE trigger_schema = $1
      ORDER BY event_object_table, trigger_name
    `;

    const result = await this.client.query(triggersQuery, [schemaName]);
    return result.rows;
  }

  /**
   * Get detailed trigger definition from source schema
   */
  async getTriggerDefinition(
    schemaName: string,
    triggerName: string,
    tableName: string
  ): Promise<ITriggerDefinition | null> {
    try {
      // Get more detailed trigger information including the function it calls
      const triggerDefQuery = `
        SELECT 
          t.trigger_name,
          t.event_manipulation,
          t.event_object_table,
          t.action_timing,
          t.action_statement,
          t.action_orientation,
          t.action_condition
        FROM information_schema.triggers t
        WHERE t.trigger_schema = $1 
        AND t.trigger_name = $2
        AND t.event_object_table = $3
      `;

      const result = await this.client.query(triggerDefQuery, [
        schemaName,
        triggerName,
        tableName,
      ]);

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0] as ITriggerDefinition;
    } catch (error) {
      console.warn(
        `Failed to get definition for trigger ${triggerName}:`,
        error instanceof Error ? error.message : 'Unknown error'
      );
      return null;
    }
  }

  /**
   * Compare two trigger definitions to detect changes
   */
  compareTriggerDefinitions(
    sourceTrigger: ITriggerDefinition,
    targetTrigger: ITriggerDefinition
  ): boolean {
    if (!sourceTrigger || !targetTrigger) {
      return false;
    }

    // Compare key properties that define trigger behavior
    const sourceProps = {
      event_manipulation: sourceTrigger.event_manipulation,
      action_timing: sourceTrigger.action_timing,
      action_statement: sourceTrigger.action_statement,
      action_orientation: sourceTrigger.action_orientation,
      action_condition: sourceTrigger.action_condition,
    };

    const targetProps = {
      event_manipulation: targetTrigger.event_manipulation,
      action_timing: targetTrigger.action_timing,
      action_statement: targetTrigger.action_statement,
      action_orientation: targetTrigger.action_orientation,
      action_condition: targetTrigger.action_condition,
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
   * Generate CREATE TRIGGER statement
   */
  generateCreateTriggerStatement(
    trigger: ITriggerDefinition | null,
    targetSchema: string
  ): string {
    if (!trigger) {
      return `-- TODO: Could not retrieve definition for trigger`;
    }

    const {
      trigger_name,
      event_manipulation,
      event_object_table,
      action_timing,
      action_statement,
      action_orientation,
      action_condition,
    } = trigger;

    // Build the CREATE TRIGGER statement
    let createStatement = `CREATE TRIGGER ${trigger_name}\n`;
    createStatement += `  ${action_timing} ${event_manipulation}\n`;
    createStatement += `  ON ${targetSchema}.${event_object_table}\n`;

    // Add orientation if specified
    if (action_orientation) {
      createStatement += `  FOR EACH ${action_orientation}\n`;
    }

    // Add condition if specified
    if (action_condition) {
      createStatement += `  WHEN (${action_condition})\n`;
    }

    // Add action statement (action_statement already includes EXECUTE)
    createStatement += `  ${action_statement};`;

    return createStatement;
  }

  /**
   * Handle triggers to drop in target
   */
  async handleTriggersToDrop(
    sourceTriggers: ITriggerRow[],
    targetTriggers: ITriggerRow[],
    alterStatements: string[]
  ): Promise<void> {
    const triggersToDrop = targetTriggers.filter(
      p => !sourceTriggers.some(d => d.trigger_name === p.trigger_name)
    );

    for (const trigger of triggersToDrop) {
      alterStatements.push(
        `-- Trigger ${trigger.trigger_name} exists in ${this.options.target} but not in ${this.options.source}`
      );
      alterStatements.push(
        `DROP TRIGGER IF EXISTS ${trigger.trigger_name} ON ${this.options.target}.${trigger.event_object_table};`
      );
    }
  }

  /**
   * Handle triggers to create in target
   */
  async handleTriggersToCreate(
    sourceTriggers: ITriggerRow[],
    targetTriggers: ITriggerRow[],
    alterStatements: string[]
  ): Promise<void> {
    const triggersToCreate = sourceTriggers.filter(
      d => !targetTriggers.some(p => p.trigger_name === d.trigger_name)
    );

    for (const trigger of triggersToCreate) {
      alterStatements.push(
        `-- Creating trigger ${trigger.trigger_name} in ${this.options.target}`
      );

      const triggerDefinition = await this.getTriggerDefinition(
        this.options.source,
        trigger.trigger_name,
        trigger.event_object_table
      );

      const createStatement = this.generateCreateTriggerStatement(
        triggerDefinition,
        this.options.target
      );

      alterStatements.push(createStatement);
      alterStatements.push('');
    }
  }

  /**
   * Handle triggers that have changed
   */
  async handleTriggersToUpdate(
    sourceTriggers: ITriggerRow[],
    targetTriggers: ITriggerRow[],
    alterStatements: string[]
  ): Promise<void> {
    const triggersToUpdate: ITriggerRow[] = [];

    for (const sourceTrigger of sourceTriggers) {
      const targetTrigger = targetTriggers.find(
        t => t.trigger_name === sourceTrigger.trigger_name
      );

      if (!targetTrigger) continue;

      // Get detailed definitions for comparison
      const sourceDefinition = await this.getTriggerDefinition(
        this.options.source,
        sourceTrigger.trigger_name,
        sourceTrigger.event_object_table
      );
      const targetDefinition = await this.getTriggerDefinition(
        this.options.target,
        targetTrigger.trigger_name,
        targetTrigger.event_object_table
      );

      if (
        sourceDefinition &&
        targetDefinition &&
        this.compareTriggerDefinitions(sourceDefinition, targetDefinition)
      ) {
        triggersToUpdate.push(sourceTrigger);
      }
    }

    for (const sourceTrigger of triggersToUpdate) {
      alterStatements.push(
        `-- Trigger ${sourceTrigger.trigger_name} has changed, updating in ${this.options.target}`
      );

      const oldTriggerName = `${sourceTrigger.trigger_name}_old_${Date.now()}`;
      alterStatements.push(
        `-- Renaming old trigger to ${oldTriggerName} for manual review`
      );
      alterStatements.push(
        `ALTER TRIGGER ${sourceTrigger.trigger_name} ON ${this.options.target}.${sourceTrigger.event_object_table} RENAME TO ${oldTriggerName};`
      );

      const triggerDefinition = await this.getTriggerDefinition(
        this.options.source,
        sourceTrigger.trigger_name,
        sourceTrigger.event_object_table
      );

      const createStatement = this.generateCreateTriggerStatement(
        triggerDefinition,
        this.options.target
      );

      alterStatements.push(createStatement);
      alterStatements.push('');
    }
  }

  /**
   * Generate trigger operations for schema sync
   */
  async generateTriggerOperations(): Promise<string[]> {
    const alterStatements: string[] = [];

    const sourceTriggers = await this.getTriggers(this.options.source);
    const targetTriggers = await this.getTriggers(this.options.target);

    await this.handleTriggersToDrop(
      sourceTriggers,
      targetTriggers,
      alterStatements
    );
    await this.handleTriggersToCreate(
      sourceTriggers,
      targetTriggers,
      alterStatements
    );
    await this.handleTriggersToUpdate(
      sourceTriggers,
      targetTriggers,
      alterStatements
    );

    return alterStatements;
  }
}
