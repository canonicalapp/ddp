/**
 * Trigger Operations Module
 * Handles triggers sync logic
 */

import type { ILegacySyncOptions, TArray, TNullable } from '@/types';
import { isDdpDiffIgnoredTable } from '@/sync/ddpInternalSchema';
import { shouldSkipPerObjectDropsOnRemovedTable } from '@/sync/pendingTableRemoval';
import {
  type SyncDbSide,
  clientForSyncSide,
  schemaNameForSide,
} from '@/sync/syncClient';
import type { Client } from 'pg';
import { Utils } from '@/utils/formatting';

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
   * Get all triggers from a schema on the given database.
   */
  async getTriggers(side: SyncDbSide): Promise<TArray<ITriggerRow>> {
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

    const schemaName = schemaNameForSide(side, this.options);
    const client = clientForSyncSide(
      side,
      this.sourceClient,
      this.targetClient
    );

    const result = await client.query(triggersQuery, [schemaName]);
    return result.rows;
  }

  /**
   * Get detailed trigger definition from the given database side.
   */
  async getTriggerDefinition(
    side: SyncDbSide,
    triggerName: string,
    tableName: string
  ): Promise<TNullable<ITriggerDefinition>> {
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

      const schemaName = schemaNameForSide(side, this.options);
      const client = clientForSyncSide(
        side,
        this.sourceClient,
        this.targetClient
      );

      const result = await client.query(triggerDefQuery, [
        schemaName,
        triggerName,
        tableName,
      ]);

      if (result.rows.length === 0) {
        return null;
      }

      return result.rows[0];
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
    sourceTrigger: ITriggerDefinition | null | undefined,
    targetTrigger: ITriggerDefinition | null | undefined
  ): boolean {
    if (!sourceTrigger || !targetTrigger) {
      return false;
    }

    const normalizeText = (value: string | null | undefined): string =>
      (value ?? '').trim().replace(/\s+/g, ' ');

    /** PG 11–13 used EXECUTE PROCEDURE; newer catalogs often say EXECUTE FUNCTION for the same trigger. */
    const normalizeActionStatement = (
      value: string | null | undefined
    ): string => {
      let s = normalizeText(value).replace(/;\s*$/, '');
      s = s.replace(/EXECUTE\s+PROCEDURE/gi, 'EXECUTE FUNCTION');
      // Optional schema qualifier on the routine name (same object either way)
      s = s.replace(/(EXECUTE\s+FUNCTION\s+)public\./gi, '$1');
      return s.toLowerCase();
    };

    const normalizeEnumish = (value: string | null | undefined): string =>
      normalizeText(value).toLowerCase();

    const sourceProps = {
      event_manipulation: normalizeEnumish(sourceTrigger.event_manipulation),
      action_timing: normalizeEnumish(sourceTrigger.action_timing),
      action_statement: normalizeActionStatement(
        sourceTrigger.action_statement
      ),
      action_orientation: normalizeEnumish(sourceTrigger.action_orientation),
      action_condition: normalizeText(sourceTrigger.action_condition),
    };

    const targetProps = {
      event_manipulation: normalizeEnumish(targetTrigger.event_manipulation),
      action_timing: normalizeEnumish(targetTrigger.action_timing),
      action_statement: normalizeActionStatement(
        targetTrigger.action_statement
      ),
      action_orientation: normalizeEnumish(targetTrigger.action_orientation),
      action_condition: normalizeText(targetTrigger.action_condition),
    };

    for (const [key, sourceValue] of Object.entries(sourceProps)) {
      const targetValue = targetProps[key as keyof typeof targetProps];
      if (sourceValue !== targetValue) {
        return true;
      }
    }

    return false;
  }

  /**
   * Generate CREATE TRIGGER statement for multi-event triggers
   */
  generateCreateTriggerStatement(
    triggerGroup: ITriggerRow[],
    targetSchema: string
  ) {
    if (triggerGroup.length === 0) {
      return `-- TODO: Could not retrieve definition for trigger`;
    }

    const firstTrigger = triggerGroup[0];

    if (!firstTrigger) {
      return `-- TODO: Could not retrieve definition for trigger`;
    }

    const {
      trigger_name,
      event_object_table,
      action_timing,
      action_statement,
    } = firstTrigger;

    // Get all event manipulations for this trigger
    const events = triggerGroup.map(t => t.event_manipulation).join(' OR ');

    // Build the CREATE TRIGGER statement
    let createStatement = `CREATE OR REPLACE TRIGGER ${trigger_name}\n`;
    createStatement += `  ${action_timing} ${events}\n`;
    createStatement += `  ON ${targetSchema}.${event_object_table}\n`;

    // Add default orientation (ROW is the default in PostgreSQL)
    createStatement += `  FOR EACH ROW\n`;

    // Add action statement (action_statement already includes EXECUTE)
    // Replace schema references in action statement
    let actionStatement = action_statement;
    if (actionStatement) {
      actionStatement = actionStatement.replace(
        new RegExp(`\\b${this.options.source}\\b`, 'g'),
        targetSchema
      );
    }
    createStatement += `  ${actionStatement};`;

    return createStatement;
  }

  /**
   * Handle triggers to drop in target
   */
  private isPreservedOldTriggerName(triggerName: string) {
    return /_old_\d+$/.test(triggerName);
  }

  async handleTriggersToDrop(
    sourceTriggers: ITriggerRow[],
    targetTriggers: ITriggerRow[],
    alterStatements: string[]
  ) {
    const triggersToDrop = targetTriggers.filter(
      p =>
        !this.isPreservedOldTriggerName(p.trigger_name) &&
        !sourceTriggers.some(d => d.trigger_name === p.trigger_name)
    );

    for (const trigger of triggersToDrop) {
      if (
        shouldSkipPerObjectDropsOnRemovedTable(
          this.options,
          trigger.event_object_table
        )
      ) {
        continue;
      }

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
  ) {
    // Group triggers by name to handle multi-event triggers
    const groupedSourceTriggers = this.groupTriggersByName(sourceTriggers);
    const groupedTargetTriggers = this.groupTriggersByName(targetTriggers);

    const triggersToCreate: string[] = [];

    for (const [triggerName] of groupedSourceTriggers) {
      const targetTriggerGroup = groupedTargetTriggers.get(triggerName);

      if (!targetTriggerGroup) {
        triggersToCreate.push(triggerName);
      }
    }

    for (const triggerName of triggersToCreate) {
      const sourceTriggerGroup = groupedSourceTriggers.get(triggerName);
      if (!sourceTriggerGroup) continue;

      alterStatements.push(
        `-- Creating trigger ${triggerName} in ${this.options.target}`
      );

      const createStatement = this.generateCreateTriggerStatement(
        sourceTriggerGroup,
        this.options.target
      );

      alterStatements.push(createStatement);
      alterStatements.push('');
    }
  }

  /**
   * Group triggers by name to handle multi-event triggers
   */
  private groupTriggersByName(
    triggers: ITriggerRow[]
  ): Map<string, ITriggerRow[]> {
    const grouped = new Map<string, ITriggerRow[]>();

    for (const trigger of triggers) {
      const existing = grouped.get(trigger.trigger_name) ?? [];

      existing.push(trigger);
      grouped.set(trigger.trigger_name, existing);
    }

    return grouped;
  }

  /**
   * Handle triggers that have changed
   */
  async handleTriggersToUpdate(
    sourceTriggers: ITriggerRow[],
    targetTriggers: ITriggerRow[],
    alterStatements: string[]
  ) {
    // Group triggers by name to handle multi-event triggers
    const groupedSourceTriggers = this.groupTriggersByName(sourceTriggers);
    const groupedTargetTriggers = this.groupTriggersByName(targetTriggers);

    const triggersToUpdate: string[] = [];

    for (const [triggerName, sourceTriggerGroup] of groupedSourceTriggers) {
      const targetTriggerGroup = groupedTargetTriggers.get(triggerName);

      if (!targetTriggerGroup) continue;

      // Get detailed definitions for comparison
      const sourceFirstTrigger = sourceTriggerGroup[0];
      const targetFirstTrigger = targetTriggerGroup[0];

      if (!sourceFirstTrigger || !targetFirstTrigger) continue;

      const sourceDefinition = await this.getTriggerDefinition(
        'source',
        triggerName,
        sourceFirstTrigger.event_object_table
      );
      const targetDefinition = await this.getTriggerDefinition(
        'target',
        triggerName,
        targetFirstTrigger.event_object_table
      );

      if (
        sourceDefinition &&
        targetDefinition &&
        this.compareTriggerDefinitions(sourceDefinition, targetDefinition)
      ) {
        triggersToUpdate.push(triggerName);
      }
    }

    for (const triggerName of triggersToUpdate) {
      const sourceTriggerGroup = groupedSourceTriggers.get(triggerName);

      if (!sourceTriggerGroup) continue;

      alterStatements.push(
        `-- Trigger ${triggerName} has changed, updating in ${this.options.target}`
      );

      const sourceFirstTrigger = sourceTriggerGroup[0];

      if (!sourceFirstTrigger) continue;

      if (
        shouldSkipPerObjectDropsOnRemovedTable(
          this.options,
          sourceFirstTrigger.event_object_table
        )
      ) {
        continue;
      }

      const oldTriggerName = `${triggerName}_old_${Utils.generateTimestamp()}`;
      alterStatements.push(
        `-- Renaming old trigger to ${oldTriggerName} for manual review`
      );
      alterStatements.push(
        `ALTER TRIGGER ${triggerName} ON ${this.options.target}.${sourceFirstTrigger.event_object_table} RENAME TO ${oldTriggerName};`
      );

      const createStatement = this.generateCreateTriggerStatement(
        sourceTriggerGroup,
        this.options.target
      );

      alterStatements.push(createStatement);
      alterStatements.push('');
    }
  }

  /**
   * Generate trigger operations for schema sync
   */
  async generateTriggerOperations() {
    const alterStatements: string[] = [];

    const keep = (t: ITriggerRow) =>
      !isDdpDiffIgnoredTable(t.event_object_table);
    const sourceTriggers = (await this.getTriggers('source')).filter(keep);
    const targetTriggers = (await this.getTriggers('target')).filter(keep);

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
