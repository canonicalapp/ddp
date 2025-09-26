/**
 * Triggers Generator
 * Generates triggers.sql files for database triggers
 */

import {
  type ITriggerInfo,
  IntrospectionService,
} from '@/database/introspection';
import type {
  IDatabaseConnection,
  IGeneratedFile,
  IGeneratorOptions,
  ITriggerDefinition,
  TArray,
  TMaybe,
} from '@/types';
import { ValidationError } from '@/types/errors';
import { logDebug, logError, logInfo } from '@/utils/logger';
import { validateSchemaName, validateTableName } from '@/utils/validation';
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

  protected getGeneratorName() {
    return 'Triggers Generator';
  }

  protected override shouldSkip() {
    return (
      (this.options.schemaOnly ?? false) || (this.options.procsOnly ?? false)
    );
  }

  protected override async validateData() {
    try {
      logDebug('Validating triggers data', { schema: this.schema });

      // Validate schema name
      validateSchemaName(this.schema);

      const triggers = await this.introspection.getTriggers();

      logInfo(`Found ${triggers.length} triggers in schema`, {
        schema: this.schema,
        triggerCount: triggers.length,
      });

      // Validate trigger names and table names
      for (const trigger of triggers) {
        validateTableName(trigger.event_object_table);

        // Note: trigger names might be auto-generated, so we'll validate them more leniently
        if (trigger.trigger_name && trigger.trigger_name.length > 63) {
          throw new ValidationError(
            'Trigger name must be 63 characters or less',
            'triggerName',
            { triggerName: trigger.trigger_name }
          );
        }
      }
    } catch (error) {
      logError('Triggers validation failed', error as Error, {
        schema: this.schema,
      });
      throw error;
    }
  }

  async generate(): Promise<TArray<IGeneratedFile>> {
    try {
      if (this.shouldSkip()) {
        logInfo('Triggers generation skipped due to options', {
          options: this.options,
        });
        return [];
      }

      await this.validateData();

      logInfo('Discovering triggers', { schema: this.schema });
      const triggersData = await this.introspection.getTriggers();

      logInfo(`Found ${triggersData.length} triggers`, {
        schema: this.schema,
        triggerCount: triggersData.length,
      });

      // Convert introspection data to generator types
      const triggers = triggersData.map(
        this.convertToTriggerDefinition.bind(this)
      );

      logDebug('Generating triggers SQL', { triggerCount: triggers.length });
      const content = await this.generateTriggersSQL(triggers);

      logInfo('Triggers generation completed successfully', {
        schema: this.schema,
        contentLength: content.length,
      });

      return [
        {
          name: 'triggers.sql',
          content: content,
        },
      ];
    } catch (error) {
      logError('Triggers generation failed', error as Error, {
        schema: this.schema,
      });
      throw error;
    }
  }

  private async generateTriggersSQL(triggers: TArray<ITriggerDefinition>) {
    let sql = this.generateHeader(
      'TRIGGERS',
      'Complete database triggers definitions'
    );

    // Generate schema creation if not using public schema
    sql += this.generateSchemaCreationSQL();

    // Group triggers by table for better organization
    const triggersByTable = this.groupTriggersByTable(triggers);

    for (const [tableName, tableTriggers] of triggersByTable) {
      sql += this.generateSectionHeader(`TRIGGERS FOR TABLE: ${tableName}`);

      // Group triggers by name to combine events
      const triggersByName = this.groupTriggersByName(tableTriggers);

      for (const [, triggerGroup] of triggersByName) {
        sql += this.generateTriggerSQL(triggerGroup);
      }
    }

    sql += this.generateFooter();
    return sql;
  }

  private groupTriggersByTable(
    triggers: TArray<ITriggerDefinition>
  ): Map<string, TArray<ITriggerDefinition>> {
    const grouped = new Map<string, TArray<ITriggerDefinition>>();

    for (const trigger of triggers) {
      const tableName = trigger.table;

      if (!grouped.has(tableName)) {
        grouped.set(tableName, []);
      }

      grouped.get(tableName)?.push(trigger);
    }

    // Sort triggers by name, then by event within each table
    for (const [tableName, tableTriggers] of grouped) {
      grouped.set(
        tableName,
        tableTriggers.sort((a, b) => {
          const nameCompare = a.name.localeCompare(b.name);

          if (nameCompare !== 0) return nameCompare;

          return a.event.localeCompare(b.event);
        })
      );
    }

    return grouped;
  }

  private convertToTriggerDefinition(
    triggerData: ITriggerInfo
  ): ITriggerDefinition {
    return {
      name: triggerData.trigger_name,
      table: triggerData.event_object_table,
      schema: this.schema,
      event: triggerData.event_manipulation as
        | 'INSERT'
        | 'UPDATE'
        | 'DELETE'
        | 'TRUNCATE',
      timing: triggerData.action_timing as 'BEFORE' | 'AFTER' | 'INSTEAD OF',
      function: this.extractFunctionName(triggerData.action_statement),
      ...(triggerData.action_condition && {
        condition: triggerData.action_condition,
      }),
      comment: undefined,
    };
  }

  private groupTriggersByName(
    triggers: TArray<ITriggerDefinition>
  ): Map<string, TArray<ITriggerDefinition>> {
    const grouped = new Map<string, TArray<ITriggerDefinition>>();

    for (const trigger of triggers) {
      const triggerName = trigger.name;

      if (!grouped.has(triggerName)) {
        grouped.set(triggerName, []);
      }

      grouped.get(triggerName)?.push(trigger);
    }

    return grouped;
  }

  private extractFunctionName(actionStatement: TMaybe<string>) {
    if (!actionStatement) {
      return 'unknown_function';
    }

    // Extract function name from action statement like "test_function()" or "EXECUTE FUNCTION dev.test_function()"
    const match = actionStatement.match(
      /(?:EXECUTE FUNCTION\s+)?(?:[\w.]+\.)?(\w+)(?:\(\))?/i
    );

    return match?.[1] ?? 'unknown_function';
  }

  private generateTriggerSQL(triggers: TArray<ITriggerDefinition>) {
    if (triggers.length === 0) return '';

    const trigger = triggers[0]; // Use first trigger for common properties

    if (!trigger) return ''; // Additional safety check

    let sql = this.generateComment(`Trigger: ${trigger.name}`) + '\n';

    if (trigger.comment) {
      sql += this.generateComment(trigger.comment) + '\n';
    }

    // CREATE TRIGGER statement
    sql += `CREATE TRIGGER ${this.escapeIdentifier(trigger.name)}\n`;

    // Timing (should be the same for all triggers with same name)
    sql += `  ${trigger.timing} `;

    // Events - combine all events
    const events = [...new Set(triggers.map(t => t.event))].sort();
    sql += events.join(' OR ') + '\n';

    // ON table
    sql += `  ON ${this.escapeIdentifier(trigger.schema)}.${this.escapeIdentifier(trigger.table)}\n`;

    // FOR EACH ROW/STATEMENT
    sql += `  FOR EACH ROW\n`;

    // WHEN condition (use first non-null condition)
    const condition = triggers.find(t => t.condition)?.condition;
    if (condition) {
      sql += `  WHEN (${condition})\n`;
    }

    // EXECUTE FUNCTION
    sql += `  EXECUTE FUNCTION ${this.escapeIdentifier(trigger.schema)}.${this.escapeIdentifier(trigger.function)}();\n\n`;

    return sql;
  }

  private generateTriggerComment(trigger: ITriggerDefinition) {
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

  private generateTriggerMetadata(trigger: ITriggerDefinition) {
    const metadata = [];

    metadata.push(`Table: ${trigger.table}`);
    metadata.push(`Event: ${trigger.timing} ${trigger.event}`);
    metadata.push(`Function: ${trigger.function}`);

    if (trigger.condition) {
      metadata.push(`Condition: ${trigger.condition}`);
    }

    return this.generateComment(metadata.join(' | ')) + '\n';
  }

  private generateTriggerEvents(trigger: ITriggerDefinition) {
    const events = trigger.event.split('|').map(e => e.trim());

    return events.join(' OR ');
  }

  private generateTriggerTiming(trigger: ITriggerDefinition) {
    return trigger.timing;
  }

  private generateTriggerCondition(trigger: ITriggerDefinition) {
    if (!trigger.condition) {
      return '';
    }

    return `WHEN (${trigger.condition})`;
  }

  private generateTriggerFunction(trigger: ITriggerDefinition) {
    return `EXECUTE FUNCTION ${this.escapeIdentifier(trigger.function)}()`;
  }

  private generateTriggerDescription(trigger: ITriggerDefinition) {
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

  private generateTriggerHeader(trigger: ITriggerDefinition) {
    return this.generateComment(
      `Trigger: ${trigger.name} on ${trigger.schema}.${trigger.table}`
    );
  }

  private generateTriggerFooter(): string {
    return '\n';
  }

  private generateTriggerBody(trigger: ITriggerDefinition) {
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

  private generateTriggerDropStatement(trigger: ITriggerDefinition) {
    return `-- DROP TRIGGER IF EXISTS ${this.escapeIdentifier(trigger.name)} ON ${this.escapeIdentifier(trigger.schema)}.${this.escapeIdentifier(trigger.table)};`;
  }

  private generateTriggerCreateStatement(trigger: ITriggerDefinition) {
    return this.generateTriggerBody(trigger);
  }

  private generateTriggerAlterStatement(trigger: ITriggerDefinition) {
    // For triggers, we typically drop and recreate rather than alter
    return (
      this.generateTriggerDropStatement(trigger) +
      '\n' +
      this.generateTriggerCreateStatement(trigger)
    );
  }
}
