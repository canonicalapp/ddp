/**
 * Triggers Generator
 * Generates triggers.sql files for database triggers
 */

import { IntrospectionService } from '@/database/introspection';
import type {
  IDatabaseConnection,
  IGeneratedFile,
  IGeneratorOptions,
  ITriggerDefinition,
  TUnknownOrAny,
} from '@/types';
import type { Client } from 'pg';
import { BaseGenerator } from './baseGenerator';

export class TriggersGenerator extends BaseGenerator {
  private introspection: IntrospectionService;

  constructor(
    client: Client,
    connection: IDatabaseConnection,
    options: IGeneratorOptions
  ) {
    super(client, connection, options);
    this.introspection = new IntrospectionService(client, this.schema);
  }

  protected getGeneratorName(): string {
    return 'Triggers Generator';
  }

  protected override shouldSkip(): boolean {
    return (
      (this.options.schemaOnly ?? false) || (this.options.procsOnly ?? false)
    );
  }

  protected override async validateData(): Promise<void> {
    // No validation needed - triggers are optional
    // If no triggers exist, we'll generate an empty file
  }

  async generate(): Promise<IGeneratedFile[]> {
    if (this.shouldSkip()) {
      return [];
    }

    await this.validateData();

    console.log('🔔 Discovering triggers...');
    const triggersData = await this.introspection.getTriggers();

    console.log(`   Found ${triggersData.length} triggers`);

    // Convert introspection data to generator types
    const triggers = triggersData.map(
      this.convertToTriggerDefinition.bind(this)
    );

    const content = await this.generateTriggersSQL(triggers);

    return [
      {
        name: 'triggers.sql',
        content: content,
      },
    ];
  }

  private async generateTriggersSQL(
    triggers: ITriggerDefinition[]
  ): Promise<string> {
    let sql = this.generateHeader(
      'TRIGGERS',
      'Complete database triggers definitions'
    );

    // Group triggers by table for better organization
    const triggersByTable = this.groupTriggersByTable(triggers);

    for (const [tableName, tableTriggers] of triggersByTable) {
      sql += this.generateSectionHeader(`TRIGGERS FOR TABLE: ${tableName}`);

      for (const trigger of tableTriggers) {
        sql += this.generateTriggerSQL(trigger);
      }
    }

    sql += this.generateFooter();
    return sql;
  }

  private groupTriggersByTable(
    triggers: ITriggerDefinition[]
  ): Map<string, ITriggerDefinition[]> {
    const grouped = new Map<string, ITriggerDefinition[]>();

    for (const trigger of triggers) {
      const tableName = trigger.table;

      if (!grouped.has(tableName)) {
        grouped.set(tableName, []);
      }

      grouped.get(tableName)?.push(trigger);
    }

    // Sort triggers alphabetically within each table
    for (const [tableName, tableTriggers] of grouped) {
      grouped.set(
        tableName,
        tableTriggers.sort((a, b) => a.name.localeCompare(b.name))
      );
    }

    return grouped;
  }

  private convertToTriggerDefinition(
    triggerData: TUnknownOrAny
  ): ITriggerDefinition {
    return {
      name: triggerData.trigger_name,
      table: triggerData.event_object_table,
      schema: this.schema,
      event: triggerData.event_manipulation,
      timing: triggerData.action_timing,
      function: this.extractFunctionName(triggerData.action_statement),
      condition: triggerData.action_condition ?? undefined,
      comment: undefined,
    };
  }

  private extractFunctionName(
    actionStatement: string | null | undefined
  ): string {
    if (!actionStatement) {
      return 'unknown_function';
    }

    // Extract function name from action statement like "test_function()" or "EXECUTE FUNCTION test_function()"
    const match = actionStatement.match(
      /(?:EXECUTE FUNCTION\s+)?(\w+)(?:\(\))?/i
    );

    return match?.[1] ?? 'unknown_function';
  }

  private generateTriggerSQL(trigger: ITriggerDefinition): string {
    let sql = this.generateComment(`Trigger: ${trigger.name}`) + '\n';

    if (trigger.comment) {
      sql += this.generateComment(trigger.comment) + '\n';
    }

    // CREATE TRIGGER statement
    sql += `CREATE TRIGGER ${this.escapeIdentifier(trigger.name)}\n`;

    // Timing
    sql += `  ${trigger.timing} ${trigger.event}\n`;

    // ON table
    sql += `  ON ${this.escapeIdentifier(trigger.schema)}.${this.escapeIdentifier(trigger.table)}\n`;

    // FOR EACH ROW/STATEMENT
    sql += `  FOR EACH ROW\n`;

    // WHEN condition
    if (trigger.condition) {
      sql += `  WHEN (${trigger.condition})\n`;
    }

    // EXECUTE FUNCTION
    sql += `  EXECUTE FUNCTION ${this.escapeIdentifier(trigger.function)}();\n\n`;

    return sql;
  }

  private generateTriggerComment(trigger: ITriggerDefinition): string {
    const parts = [];

    if (trigger.comment) {
      parts.push(trigger.comment);
    }

    parts.push(`Table: ${trigger.table}`);
    parts.push(`Event: ${trigger.timing} ${trigger.event}`);
    parts.push(`Function: ${trigger.function}`);

    if (trigger.condition) {
      parts.push(`Condition: ${trigger.condition}`);
    }

    return parts.join(' | ');
  }

  private generateTriggerMetadata(trigger: ITriggerDefinition): string {
    const metadata = [];

    metadata.push(`Table: ${trigger.table}`);
    metadata.push(`Event: ${trigger.timing} ${trigger.event}`);
    metadata.push(`Function: ${trigger.function}`);

    if (trigger.condition) {
      metadata.push(`Condition: ${trigger.condition}`);
    }

    return this.generateComment(metadata.join(' | ')) + '\n';
  }

  private generateTriggerEvents(trigger: ITriggerDefinition): string {
    const events = trigger.event.split('|').map(e => e.trim());
    return events.join(' OR ');
  }

  private generateTriggerTiming(trigger: ITriggerDefinition): string {
    return trigger.timing;
  }

  private generateTriggerCondition(trigger: ITriggerDefinition): string {
    if (!trigger.condition) {
      return '';
    }

    return `WHEN (${trigger.condition})`;
  }

  private generateTriggerFunction(trigger: ITriggerDefinition): string {
    return `EXECUTE FUNCTION ${this.escapeIdentifier(trigger.function)}()`;
  }

  private generateTriggerDescription(trigger: ITriggerDefinition): string {
    const description = [];

    description.push(`Trigger: ${trigger.name}`);
    description.push(`Table: ${trigger.schema}.${trigger.table}`);
    description.push(`Event: ${trigger.timing} ${trigger.event}`);
    description.push(`Function: ${trigger.function}`);

    if (trigger.condition) {
      description.push(`Condition: ${trigger.condition}`);
    }

    return description.join('\n');
  }

  private generateTriggerHeader(trigger: ITriggerDefinition): string {
    return this.generateComment(
      `Trigger: ${trigger.name} on ${trigger.schema}.${trigger.table}`
    );
  }

  private generateTriggerFooter(): string {
    return '\n';
  }

  private generateTriggerBody(trigger: ITriggerDefinition): string {
    let body = `CREATE TRIGGER ${this.escapeIdentifier(trigger.name)}\n`;
    body += `  ${trigger.timing} ${trigger.event}\n`;
    body += `  ON ${this.escapeIdentifier(trigger.schema)}.${this.escapeIdentifier(trigger.table)}\n`;
    body += `  FOR EACH ROW\n`;

    if (trigger.condition) {
      body += `  WHEN (${trigger.condition})\n`;
    }

    body += `  EXECUTE FUNCTION ${this.escapeIdentifier(trigger.function)}();`;

    return body;
  }

  private generateTriggerDropStatement(trigger: ITriggerDefinition): string {
    return `-- DROP TRIGGER IF EXISTS ${this.escapeIdentifier(trigger.name)} ON ${this.escapeIdentifier(trigger.schema)}.${this.escapeIdentifier(trigger.table)};`;
  }

  private generateTriggerCreateStatement(trigger: ITriggerDefinition): string {
    return this.generateTriggerBody(trigger);
  }

  private generateTriggerAlterStatement(trigger: ITriggerDefinition): string {
    // For triggers, we typically drop and recreate rather than alter
    return (
      this.generateTriggerDropStatement(trigger) +
      '\n' +
      this.generateTriggerCreateStatement(trigger)
    );
  }
}
