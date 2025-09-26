/**
 * Schema Generator
 * Generates comprehensive schema.sql files for tables, columns, constraints, and indexes
 */

import type {
  IColumnInfo,
  IConstraintInfo,
  IIndexInfo,
  ISequenceInfo,
  ITableInfo,
} from '@/database/introspection';
import { IntrospectionService } from '@/database/introspection';
import type {
  IColumnDefinition,
  IConstraintDefinition,
  IDatabaseConnection,
  IGeneratedFile,
  IGeneratorOptions,
  IIndexDefinition,
  ISequenceDefinition,
  ITableDefinition,
  TArray,
} from '@/types';
import { ValidationError } from '@/types/errors';
import { logDebug, logError, logInfo } from '@/utils/logger';
import { validateSchemaName, validateTableName } from '@/utils/validation';
import type { Client } from 'pg';
import { BaseGenerator } from './baseGenerator';

export class SchemaGenerator extends BaseGenerator {
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
      const tables = tablesData.map(this.convertToTableDefinition.bind(this));

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
    const allSequences = this.extractAllSequences(tables);

    if (allSequences.length > 0) {
      sql += this.generateComment('Sequences') + '\n';

      for (const sequence of allSequences) {
        sql += this.generateSequenceSQL(sequence) + '\n';
      }

      sql += '\n';
    }

    // Generate tables in dependency order (parent tables before child tables)
    const sortedTables = this.sortTablesByDependencies(tables);

    for (const table of sortedTables) {
      sql += this.generateTableSQL(table);
    }

    // Generate self-referencing constraints after all tables are created
    const selfReferencingConstraints =
      this.extractSelfReferencingConstraints(tables);

    if (selfReferencingConstraints.length > 0) {
      sql += this.generateComment('Self-referencing constraints') + '\n';

      for (const constraint of selfReferencingConstraints) {
        sql +=
          this.generateConstraintSQL(
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

  private generateTableSQL(table: ITableDefinition) {
    try {
      // Validate table definition
      validateTableName(table.name);
      validateSchemaName(table.schema);

      let sql = this.generateSectionHeader(
        `TABLE: ${table.schema}.${table.name}`
      );

      // Table comment
      if (table.comment) {
        sql += this.generateComment(`Table: ${table.comment}`) + '\n';
      }

      // CREATE TABLE statement
      sql += `CREATE TABLE ${this.escapeIdentifier(table.schema)}.${this.escapeIdentifier(table.name)} (\n`;

      // Columns (ensure ordinal order as per CID specification)
      const sortedColumns = [...table.columns].sort(
        (a, b) => a.ordinalPosition - b.ordinalPosition
      );

      const columnDefinitions = sortedColumns.map(col =>
        this.generateColumnDefinition(col)
      );

      sql += this.formatSQL(columnDefinitions.join(',\n'), 1) + '\n';

      sql += ');\n\n';

      // Table constraints (excluding column-level constraints and self-references)
      const tableConstraints = table.constraints.filter(
        constraint =>
          constraint.type !== 'NOT NULL' &&
          !(
            constraint.type === 'FOREIGN KEY' &&
            constraint.references?.table === table.name
          )
      );

      if (tableConstraints.length > 0) {
        sql += this.generateComment('Table constraints') + '\n';

        for (const constraint of tableConstraints) {
          sql +=
            this.generateConstraintSQL(constraint, table.schema, table.name) +
            '\n';
        }

        sql += '\n';
      }

      // Indexes (exclude primary key indexes and unique indexes that correspond to unique constraints)
      const uniqueConstraintNames = new Set(
        table.constraints
          .filter(constraint => constraint.type === 'UNIQUE')
          .map(constraint => constraint.name)
      );

      const nonPrimaryIndexes = table.indexes.filter(
        index => !index.is_primary && !uniqueConstraintNames.has(index.name)
      );

      if (nonPrimaryIndexes.length > 0) {
        sql += this.generateComment('Indexes') + '\n';

        // Deduplicate indexes by name
        const seenIndexes = new Set<string>();

        for (const index of nonPrimaryIndexes) {
          const indexKey = `${index.schema ?? table.schema}.${index.name}`;

          if (!seenIndexes.has(indexKey)) {
            sql += this.generateIndexSQL(index, table.schema) + '\n';

            seenIndexes.add(indexKey);
          }
        }

        sql += '\n';
      }

      return sql;
    } catch (error) {
      logError('Failed to generate table SQL', error as Error, {
        table: table.name,
        schema: table.schema,
      });
      throw error;
    }
  }

  private generateColumnDefinition(column: IColumnDefinition) {
    let definition = `${this.escapeIdentifier(column.name)} ${this.generateDataType(column)}`;

    // NOT NULL constraint (only if not nullable - default is nullable)
    if (!column.nullable) {
      definition += ' NOT NULL';
    }

    // DEFAULT value (only if explicitly set and not a default default)
    if (
      column.defaultValue &&
      !this.isDefaultDefaultValue(column.defaultValue)
    ) {
      definition += ` DEFAULT ${column.defaultValue}`;
    }

    // Identity column (only if explicitly set)
    if (column.isIdentity) {
      if (column.identityGeneration === 'ALWAYS') {
        definition += ' GENERATED ALWAYS AS IDENTITY';
      } else if (column.identityGeneration === 'BY DEFAULT') {
        definition += ' GENERATED BY DEFAULT AS IDENTITY';
      }
    }

    // Generated column (only if not NEVER - which is the default)
    if (column.generated && column.generated !== 'NEVER') {
      definition += ` GENERATED ${column.generated}`;
    }

    return definition;
  }

  /**
   * Check if a default value is a "default default" that should be omitted
   * @param defaultValue - The default value to check
   * @returns true if this is a default default value that should be omitted
   */
  private isDefaultDefaultValue(defaultValue: string) {
    const defaultDefaults = [
      'NULL',
      'null',
      'DEFAULT NULL',
      'default null',
      '::text',
      '::character varying',
      '::integer',
      '::bigint',
      '::numeric',
      '::boolean',
      '::timestamp without time zone',
      '::timestamp with time zone',
      '::date',
      '::time without time zone',
      '::time with time zone',
    ];

    return defaultDefaults.some(defaultVal =>
      defaultValue.toLowerCase().includes(defaultVal.toLowerCase())
    );
  }

  private generateDataType(column: IColumnDefinition) {
    let type = column.type.toUpperCase();

    // Add length/precision for character types (only if not default)
    if (column.length && (type.includes('CHAR') || type.includes('VARCHAR'))) {
      // Only add length if it's not a default length
      if (!this.isDefaultLength(type, column.length)) {
        type += `(${column.length})`;
      }
    }

    // Add precision and scale for numeric types (only if not default)
    if (column.precision !== undefined) {
      if (column.scale !== undefined) {
        // Only add precision/scale if they're not defaults
        if (
          !this.isDefaultNumericPrecision(type, column.precision, column.scale)
        ) {
          type += `(${column.precision},${column.scale})`;
        }
      } else {
        // Only add precision if it's not a default
        if (!this.isDefaultNumericPrecision(type, column.precision, 0)) {
          type += `(${column.precision})`;
        }
      }
    }

    return type;
  }

  /**
   * Check if a character length is a default that should be omitted
   * @param type - The data type
   * @param length - The length value
   * @returns true if this is a default length that should be omitted
   */
  private isDefaultLength(type: string, length: number) {
    // Common default lengths that should be omitted
    const defaultLengths: { [key: string]: number } = {
      VARCHAR: 255,
      CHAR: 1,
      'CHARACTER VARYING': 255,
      CHARACTER: 1,
      TEXT: 0, // TEXT doesn't need length specification
    };

    return defaultLengths[type] === length;
  }

  /**
   * Check if numeric precision/scale are defaults that should be omitted
   * @param type - The data type
   * @param precision - The precision value
   * @param scale - The scale value
   * @returns true if these are default values that should be omitted
   */
  private isDefaultNumericPrecision(
    type: string,
    precision: number,
    scale: number
  ) {
    // Common default precisions that should be omitted
    const defaultPrecisions: {
      [key: string]: { precision: number; scale: number };
    } = {
      INTEGER: { precision: 32, scale: 0 },
      BIGINT: { precision: 64, scale: 0 },
      SMALLINT: { precision: 16, scale: 0 },
      NUMERIC: { precision: 0, scale: 0 }, // Default numeric without precision
      DECIMAL: { precision: 0, scale: 0 }, // Default decimal without precision
    };

    const defaultPrecision = defaultPrecisions[type];

    return !!(
      defaultPrecision &&
      defaultPrecision.precision === precision &&
      defaultPrecision.scale === scale
    );
  }

  private convertToTableDefinition(data: {
    table: ITableInfo;
    columns: IColumnInfo[];
    constraints: IConstraintInfo[];
    indexes: IIndexInfo[];
    sequences: ISequenceInfo[];
  }): ITableDefinition {
    return {
      name: data.table.table_name,
      schema: data.table.table_schema,
      columns: data.columns.map(this.convertToColumnDefinition.bind(this)),
      constraints: data.constraints.map(
        this.convertToConstraintDefinition.bind(this)
      ),

      indexes: data.indexes.map(this.convertToIndexDefinition.bind(this)),
      sequences: data.sequences.map(
        this.convertToSequenceDefinition.bind(this)
      ),

      comment: data.table.table_comment || undefined,
    };
  }

  private convertToColumnDefinition(column: IColumnInfo): IColumnDefinition {
    return {
      name: column.column_name,
      type: column.data_type,
      nullable: column.is_nullable === 'YES',
      ...(column.column_default && { defaultValue: column.column_default }),
      ...(column.character_maximum_length && {
        length: column.character_maximum_length,
      }),
      ...(column.numeric_precision && { precision: column.numeric_precision }),
      ...(column.numeric_scale && { scale: column.numeric_scale }),
      isIdentity: column.is_identity === 'YES',
      identityGeneration: column.identity_generation as
        | 'ALWAYS'
        | 'BY DEFAULT'
        | undefined,
      generated: column.is_generated as
        | 'ALWAYS'
        | 'BY DEFAULT'
        | 'NEVER'
        | undefined,
      ordinalPosition: column.ordinal_position || 0,
    };
  }

  private convertToConstraintDefinition(
    constraint: IConstraintInfo
  ): IConstraintDefinition {
    return {
      name: constraint.constraint_name,
      type: constraint.constraint_type as
        | 'PRIMARY KEY'
        | 'FOREIGN KEY'
        | 'UNIQUE'
        | 'CHECK'
        | 'NOT NULL',
      columns: constraint.column_names
        ? constraint.column_names.split(',')
        : [],
      references: constraint.foreign_table_name
        ? {
            table: constraint.foreign_table_name,
            column: constraint.foreign_column_name ?? 'id',
          }
        : undefined,
      ...(constraint.check_clause && { checkClause: constraint.check_clause }),
      deferrable: constraint.is_deferrable === 'YES',
      initiallyDeferred: constraint.initially_deferred === 'YES',
      onDelete: constraint.delete_rule as
        | 'CASCADE'
        | 'SET NULL'
        | 'SET DEFAULT'
        | 'RESTRICT'
        | 'NO ACTION',
      onUpdate: constraint.update_rule as
        | 'CASCADE'
        | 'SET NULL'
        | 'SET DEFAULT'
        | 'RESTRICT'
        | 'NO ACTION',
    };
  }

  private convertToIndexDefinition(index: IIndexInfo): IIndexDefinition {
    // Extract columns from indexdef
    const columns = this.extractColumnsFromIndexDef(index.indexdef);
    const whereClause = this.extractWhereClause(index.indexdef);

    return {
      name: index.indexname,
      table: index.tablename,
      schema: index.schemaname,
      columns,
      unique: index.is_unique,
      ...(whereClause && { partial: whereClause }),
      method: 'btree', // Default method since index_method is not available
      is_primary: index.is_primary,
    };
  }

  private extractColumnsFromIndexDef(indexdef: string) {
    // Extract column names from index definition
    // Example: "CREATE UNIQUE INDEX idx_users_email ON dev.users USING btree (email)"
    const match = indexdef.match(/\(([^)]+)\)/);

    if (match?.[1]) {
      return match[1].split(',').map(col => col.trim().replace(/"/g, ''));
    }

    return [];
  }

  private extractWhereClause(indexdef: string) {
    // Extract WHERE clause from index definition
    // Example: "CREATE INDEX ... WHERE is_active = true"
    const whereMatch = indexdef.match(/WHERE\s+(.+)$/i);

    return whereMatch?.[1]?.trim();
  }

  private convertToSequenceDefinition(
    sequence: ISequenceInfo
  ): ISequenceDefinition {
    return {
      name: sequence.sequence_name,
      schema: sequence.sequence_schema,
      dataType: sequence.data_type,
      startValue: sequence.start_value,
      minimumValue: sequence.minimum_value,
      maximumValue: sequence.maximum_value,
      increment: sequence.increment,
      cycleOption: sequence.cycle_option,
      comment: sequence.sequence_comment || undefined,
    };
  }

  private generateConstraintSQL(
    constraint: IConstraintDefinition,
    schema: string,
    tableName: string
  ) {
    const constraintName = this.escapeIdentifier(constraint.name);
    const tableRef = `${this.escapeIdentifier(schema)}.${this.escapeIdentifier(tableName)}`;

    const columns = constraint.columns
      .map(col => this.escapeIdentifier(col))
      .join(', ');

    switch (constraint.type) {
      case 'PRIMARY KEY': {
        return `ALTER TABLE ${tableRef} ADD CONSTRAINT ${constraintName} PRIMARY KEY (${columns});`;
      }

      case 'UNIQUE': {
        return `ALTER TABLE ${tableRef} ADD CONSTRAINT ${constraintName} UNIQUE (${columns});`;
      }

      case 'FOREIGN KEY': {
        if (!constraint.references) {
          return `-- TODO: Foreign key constraint ${constraintName} - missing reference information`;
        }

        const refTable = this.escapeIdentifier(constraint.references.table);
        const refColumn = this.escapeIdentifier(constraint.references.column);

        // Add schema qualification to the referenced table
        const refTableWithSchema = `${this.escapeIdentifier(schema)}.${refTable}`;

        let fkSQL = `ALTER TABLE ${tableRef} ADD CONSTRAINT ${constraintName} FOREIGN KEY (${columns}) REFERENCES ${refTableWithSchema} (${refColumn})`;

        if (constraint.onDelete) {
          fkSQL += ` ON DELETE ${constraint.onDelete}`;
        }

        if (constraint.onUpdate) {
          fkSQL += ` ON UPDATE ${constraint.onUpdate}`;
        }

        if (constraint.deferrable) {
          fkSQL += ' DEFERRABLE';
          if (constraint.initiallyDeferred) {
            fkSQL += ' INITIALLY DEFERRED';
          }
        }

        fkSQL += ';';

        return fkSQL;
      }

      case 'CHECK': {
        const checkClause =
          constraint.checkClause ?? '/* TODO: Add check condition */';

        return `ALTER TABLE ${tableRef} ADD CONSTRAINT ${constraintName} CHECK (${checkClause});`;
      }

      default: {
        return `-- TODO: Unsupported constraint type: ${constraint.type}`;
      }
    }
  }

  private generateIndexSQL(index: IIndexDefinition, schema: string) {
    const indexName = this.escapeIdentifier(index.name);
    const tableName = this.escapeIdentifier(index.table);

    const columns = index.columns
      .map(col => this.escapeIdentifier(col))
      .join(', ');

    let sql = `CREATE`;

    if (index.unique) {
      sql += ` UNIQUE`;
    }

    sql += ` INDEX ${indexName} ON ${this.escapeIdentifier(schema)}.${tableName}`;

    if (index.method && index.method !== 'btree') {
      sql += ` USING ${index.method}`;
    }

    sql += ` (${columns})`;

    if (index.partial) {
      sql += ` WHERE ${index.partial}`;
    }

    sql += ';';

    return sql;
  }

  private sortTablesAlphabetically(
    tables: ITableDefinition[]
  ): ITableDefinition[] {
    return [...tables].sort((a, b) => a.name.localeCompare(b.name));
  }

  private sortTablesByDependencies(
    tables: ITableDefinition[]
  ): ITableDefinition[] {
    const sorted: ITableDefinition[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (table: ITableDefinition) => {
      if (visiting.has(table.name)) {
        // Circular dependency detected - add anyway
        return;
      }

      if (visited.has(table.name)) {
        return;
      }

      visiting.add(table.name);

      // Find tables this table depends on (via foreign keys)
      const dependencies = tables.filter(
        otherTable =>
          otherTable.name !== table.name &&
          table.constraints.some(
            constraint =>
              constraint.type === 'FOREIGN KEY' &&
              constraint.references?.table === otherTable.name
          )
      );

      // Visit dependencies first
      for (const dep of dependencies) {
        visit(dep);
      }

      visiting.delete(table.name);
      visited.add(table.name);
      sorted.push(table);
    };

    for (const table of tables) {
      visit(table);
    }

    return sorted;
  }

  private extractAllSequences(
    tables: ITableDefinition[]
  ): ISequenceDefinition[] {
    const allSequences: ISequenceDefinition[] = [];
    const seen = new Set<string>();

    for (const table of tables) {
      for (const sequence of table.sequences) {
        const key = `${sequence.schema}.${sequence.name}`;

        if (!seen.has(key)) {
          allSequences.push(sequence);
          seen.add(key);
        }
      }
    }

    return allSequences.sort((a, b) => a.name.localeCompare(b.name));
  }

  private extractSelfReferencingConstraints(
    tables: ITableDefinition[]
  ): TArray<{
    constraint: IConstraintDefinition;
    schema: string;
    tableName: string;
  }> {
    const selfReferencingConstraints: TArray<{
      constraint: IConstraintDefinition;
      schema: string;
      tableName: string;
    }> = [];

    for (const table of tables) {
      for (const constraint of table.constraints) {
        if (
          constraint.type === 'FOREIGN KEY' &&
          constraint.references?.table === table.name
        ) {
          selfReferencingConstraints.push({
            constraint,
            schema: table.schema,
            tableName: table.name,
          });
        }
      }
    }

    return selfReferencingConstraints;
  }

  private generateSequenceSQL(sequence: ISequenceDefinition) {
    let sql = `CREATE SEQUENCE ${this.escapeIdentifier(sequence.schema)}.${this.escapeIdentifier(sequence.name)}`;

    // Add data type if not default
    if (sequence.dataType && sequence.dataType !== 'bigint') {
      sql += ` AS ${sequence.dataType}`;
    }

    // Add start value if not default
    if (sequence.startValue && sequence.startValue !== '1') {
      sql += ` START WITH ${sequence.startValue}`;
    }

    // Add increment if not default
    if (sequence.increment && sequence.increment !== '1') {
      sql += ` INCREMENT BY ${sequence.increment}`;
    }

    // Add min/max values if not defaults
    if (sequence.minimumValue && sequence.minimumValue !== '1') {
      sql += ` MINVALUE ${sequence.minimumValue}`;
    }

    if (
      sequence.maximumValue &&
      sequence.maximumValue !== '9223372036854775807'
    ) {
      sql += ` MAXVALUE ${sequence.maximumValue}`;
    }

    // Add cycle option if not default
    if (sequence.cycleOption === 'YES') {
      sql += ` CYCLE`;
    }

    sql += ';';

    return sql;
  }
}
