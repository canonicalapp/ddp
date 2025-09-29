/**
 * Schema Generator
 * Generates comprehensive schema.sql files for tables, columns, constraints, and indexes
 */

import { IntrospectionService } from '@/database/introspection';
import type {
  IDatabaseConnection,
  IGeneratedFile,
  IGeneratorOptions,
  ITableDefinition,
} from '@/types';
import { ValidationError } from '@/types/errors';
import { logDebug, logError, logInfo } from '@/utils/logger';
import { validateSchemaName, validateTableName } from '@/utils/validation';
import type { Client } from 'pg';
import { BaseGenerator } from '../baseGenerator';
import { ConstraintBuilder } from './builders/constraintBuilder';
import { SequenceBuilder } from './builders/sequenceBuilder';
import { TableBuilder } from './builders/tableBuilder';
import { TableConverter } from './converters/tableConverter';
import { TableSorter } from './utils/tableSorter';

export class SchemaGenerator extends BaseGenerator {
  private introspection: IntrospectionService;
  private tableBuilder: TableBuilder;
  private sequenceBuilder: SequenceBuilder;
  private constraintBuilder: ConstraintBuilder;
  private tableConverter: TableConverter;
  private tableSorter: TableSorter;

  constructor(
    client: Client,
    connection: IDatabaseConnection,
    options: IGeneratorOptions
  ) {
    super(client, connection, options);
    this.introspection = new IntrospectionService(client, this.schema);
    this.tableBuilder = new TableBuilder();
    this.sequenceBuilder = new SequenceBuilder();
    this.constraintBuilder = new ConstraintBuilder();
    this.tableConverter = new TableConverter();
    this.tableSorter = new TableSorter();
  }

  protected getGeneratorName() {
    return 'Schema Generator';
  }

  protected override shouldSkip() {
    return (
      (this.options.procsOnly ?? false) || (this.options.triggersOnly ?? false)
    );
  }

  protected override async validateData() {
    try {
      logDebug('Validating schema data', { schema: this.schema });

      // Validate schema name
      validateSchemaName(this.schema);

      // First check if schema exists
      const schemaExists = await this.introspection.checkSchemaExists();

      if (!schemaExists) {
        throw new ValidationError(
          `Schema '${this.schema}' does not exist in the database. Please create the schema first or specify a different schema name.`,
          'schema',
          {
            schema: this.schema,
            suggestion: 'Use CREATE SCHEMA command to create the schema first',
            availableSchemas: await this.introspection.getAvailableSchemas(),
          }
        );
      }

      const tables = await this.introspection.getTables();

      if (tables.length === 0) {
        throw new ValidationError(
          `Schema '${this.schema}' exists but contains no tables. Nothing to generate.`,
          'schema',
          { schema: this.schema, tableCount: 0 }
        );
      }

      logInfo(`Found ${tables.length} tables in schema`, {
        schema: this.schema,
        tableCount: tables.length,
      });

      // Validate table names
      for (const table of tables) {
        validateTableName(table.table_name);
      }
    } catch (error) {
      logError('Schema validation failed', error as Error, {
        schema: this.schema,
      });
      throw error;
    }
  }

  async generate(): Promise<IGeneratedFile[]> {
    try {
      if (this.shouldSkip()) {
        logInfo('Schema generation skipped due to options', {
          options: this.options,
        });

        return [];
      }

      await this.validateData();

      logInfo('Discovering tables and their metadata', { schema: this.schema });
      const tablesData = await this.introspection.getAllTablesComplete();

      logInfo(`Found ${tablesData.length} tables with complete metadata`, {
        schema: this.schema,
        tableCount: tablesData.length,
      });

      // Convert introspection data to generator types
      const tables = tablesData.map(
        this.tableConverter.convertToTableDefinition.bind(this.tableConverter)
      );

      logDebug('Generating schema SQL', { tableCount: tables.length });
      const content = await this.generateSchemaSQL(tables);

      logInfo('Schema generation completed successfully', {
        schema: this.schema,
        contentLength: content.length,
      });

      return [
        {
          name: 'schema.sql',
          content: content,
        },
      ];
    } catch (error) {
      logError('Schema generation failed', error as Error, {
        schema: this.schema,
      });
      throw error;
    }
  }

  private async generateSchemaSQL(tables: ITableDefinition[]) {
    let sql = this.generateHeader(
      'SCHEMA DEFINITION',
      'Complete database schema including tables, columns, constraints, and indexes'
    );

    // Generate schema creation if not using public schema
    sql += this.generateSchemaCreationSQL();

    // Generate sequences first (before tables)
    const allSequences = this.tableSorter.extractAllSequences(tables);

    if (allSequences.length > 0) {
      sql += this.generateComment('Sequences') + '\n';

      for (const sequence of allSequences) {
        sql += this.sequenceBuilder.generateSequenceSQL(sequence) + '\n';
      }

      sql += '\n';
    }

    // Generate tables in dependency order (parent tables before child tables)
    const sortedTables = this.tableSorter.sortTablesByDependencies(tables);

    for (const table of sortedTables) {
      sql += this.tableBuilder.generateTableSQL(table);
    }

    // Generate self-referencing constraints after all tables are created
    const selfReferencingConstraints =
      this.tableSorter.extractSelfReferencingConstraints(tables);

    if (selfReferencingConstraints.length > 0) {
      sql += this.generateComment('Self-referencing constraints') + '\n';

      for (const constraint of selfReferencingConstraints) {
        sql +=
          this.constraintBuilder.generateConstraintSQL(
            constraint.constraint,
            constraint.schema,
            constraint.tableName
          ) + '\n';
      }

      sql += '\n';
    }

    sql += this.generateFooter();

    return sql;
  }

  /**
   * Override generateHeader to add timestamp
   */
  protected override generateHeader(
    title: string,
    description: string
  ): string {
    return `-- ================================================\n-- ${title}\n-- ${description}\n-- Generated on: ${new Date().toISOString()}\n-- ================================================\n\n`;
  }

  /**
   * Override generateFooter to add end marker
   */
  protected override generateFooter(): string {
    return `-- ================================================\n-- End of Schema Definition\n-- ================================================\n`;
  }

  /**
   * Override generateSchemaCreationSQL to handle non-public schemas
   */
  protected override generateSchemaCreationSQL(): string {
    if (this.schema === 'public') {
      return '';
    }

    return `-- Create schema if it doesn't exist\nCREATE SCHEMA IF NOT EXISTS ${this.escapeIdentifier(this.schema)};\n\n`;
  }

  /**
   * Override generateComment for consistency
   */
  protected override generateComment(comment: string): string {
    return `-- ${comment}`;
  }

  /**
   * Override escapeIdentifier for consistency
   */
  protected override escapeIdentifier(identifier: string): string {
    return `"${identifier.replace(/"/g, '""')}"`;
  }
}
