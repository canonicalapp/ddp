/**
 * Trigger Operations Module
 * Handles triggers sync logic
 */

export class TriggerOperations {
  constructor(client, options) {
    this.client = client;
    this.options = options;
  }

  /**
   * Get all triggers from a schema
   */
  async getTriggers(schemaName) {
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
   * Get detailed trigger definition from dev schema
   */
  async getTriggerDefinition(schemaName, triggerName, tableName) {
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
      return result.rows[0] || null;
    } catch (error) {
      console.warn(
        `Failed to get definition for trigger ${triggerName}:`,
        error.message
      );
      return null;
    }
  }

  /**
   * Compare two trigger definitions to detect changes
   */
  compareTriggerDefinitions(devTrigger, prodTrigger) {
    if (!devTrigger || !prodTrigger) {
      return false;
    }

    // Compare key properties that define trigger behavior
    const devProps = {
      event_manipulation: devTrigger.event_manipulation,
      action_timing: devTrigger.action_timing,
      action_statement: devTrigger.action_statement,
      action_orientation: devTrigger.action_orientation,
      action_condition: devTrigger.action_condition,
    };

    const prodProps = {
      event_manipulation: prodTrigger.event_manipulation,
      action_timing: prodTrigger.action_timing,
      action_statement: prodTrigger.action_statement,
      action_orientation: prodTrigger.action_orientation,
      action_condition: prodTrigger.action_condition,
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
   * Generate CREATE TRIGGER statement
   */
  generateCreateTriggerStatement(trigger, targetSchema) {
    if (!trigger) {
      return `-- TODO: Could not retrieve definition for trigger ${trigger?.trigger_name}`;
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
   * Handle triggers to drop in production
   */
  async handleTriggersToDrop(devTriggers, prodTriggers, alterStatements) {
    const triggersToDrop = prodTriggers.filter(
      p => !devTriggers.some(d => d.trigger_name === p.trigger_name)
    );

    for (const trigger of triggersToDrop) {
      alterStatements.push(
        `-- Trigger ${trigger.trigger_name} exists in prod but not in dev`
      );
      alterStatements.push(
        `DROP TRIGGER IF EXISTS ${trigger.trigger_name} ON ${this.options.prod}.${trigger.event_object_table};`
      );
    }
  }

  /**
   * Handle triggers to create in production
   */
  async handleTriggersToCreate(devTriggers, prodTriggers, alterStatements) {
    const triggersToCreate = devTriggers.filter(
      d => !prodTriggers.some(p => p.trigger_name === d.trigger_name)
    );

    for (const trigger of triggersToCreate) {
      alterStatements.push(
        `-- Creating trigger ${trigger.trigger_name} in prod`
      );

      const triggerDefinition = await this.getTriggerDefinition(
        this.options.dev,
        trigger.trigger_name,
        trigger.event_object_table
      );

      const createStatement = this.generateCreateTriggerStatement(
        triggerDefinition,
        this.options.prod
      );

      alterStatements.push(createStatement);
      alterStatements.push('');
    }
  }

  /**
   * Handle triggers that have changed
   */
  async handleTriggersToUpdate(devTriggers, prodTriggers, alterStatements) {
    const triggersToUpdate = devTriggers.filter(devTrigger => {
      const prodTrigger = prodTriggers.find(
        p => p.trigger_name === devTrigger.trigger_name
      );
      return (
        prodTrigger && this.compareTriggerDefinitions(devTrigger, prodTrigger)
      );
    });

    for (const devTrigger of triggersToUpdate) {
      alterStatements.push(
        `-- Trigger ${devTrigger.trigger_name} has changed, updating in prod`
      );

      const oldTriggerName = `${devTrigger.trigger_name}_old_${Date.now()}`;
      alterStatements.push(
        `-- Renaming old trigger to ${oldTriggerName} for manual review`
      );
      alterStatements.push(
        `ALTER TRIGGER ${devTrigger.trigger_name} ON ${this.options.prod}.${devTrigger.event_object_table} RENAME TO ${oldTriggerName};`
      );

      const triggerDefinition = await this.getTriggerDefinition(
        this.options.dev,
        devTrigger.trigger_name,
        devTrigger.event_object_table
      );

      const createStatement = this.generateCreateTriggerStatement(
        triggerDefinition,
        this.options.prod
      );

      alterStatements.push(createStatement);
      alterStatements.push('');
    }
  }

  /**
   * Generate trigger operations for schema sync
   */
  async generateTriggerOperations() {
    const alterStatements = [];

    const devTriggers = await this.getTriggers(this.options.dev);
    const prodTriggers = await this.getTriggers(this.options.prod);

    await this.handleTriggersToDrop(devTriggers, prodTriggers, alterStatements);
    await this.handleTriggersToCreate(
      devTriggers,
      prodTriggers,
      alterStatements
    );
    await this.handleTriggersToUpdate(
      devTriggers,
      prodTriggers,
      alterStatements
    );

    return alterStatements;
  }
}
