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
   * Generate trigger operations for schema sync
   */
  async generateTriggerOperations() {
    const alterStatements = [];

    const devTriggers = await this.getTriggers(this.options.dev);
    const prodTriggers = await this.getTriggers(this.options.prod);

    // Find triggers to drop in prod (exist in prod but not in dev)
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

    // Find triggers to create in prod (exist in dev but not in prod)
    const triggersToCreate = devTriggers.filter(
      d => !prodTriggers.some(p => p.trigger_name === d.trigger_name)
    );

    for (const trigger of triggersToCreate) {
      alterStatements.push(
        `-- TODO: Create trigger ${trigger.trigger_name} in prod`
      );
      alterStatements.push(
        `-- Trigger: ${trigger.action_timing} ${trigger.event_manipulation} ON ${trigger.event_object_table}`
      );
      alterStatements.push(`-- Action: ${trigger.action_statement}`);
    }

    return alterStatements;
  }
}
