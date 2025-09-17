/**
 * Database Introspection Service
 * Provides methods to introspect database schema and objects
 */

import type { TUnknownOrAny } from '@/types';
import type { Client } from 'pg';
import {
  GET_DATABASE_INFO_QUERY,
  GET_DOMAINS_QUERY,
  GET_ENUMS_QUERY,
  GET_FUNCTIONS_QUERY,
  GET_SCHEMA_INFO_QUERY,
  GET_SEQUENCES_QUERY,
  GET_TABLES_QUERY,
  GET_TABLE_COLUMNS_QUERY,
  GET_TABLE_CONSTRAINTS_QUERY,
  GET_TABLE_INDEXES_QUERY,
  GET_TRIGGERS_QUERY,
  GET_VIEWS_QUERY,
} from './queries';

export interface ITableInfo {
  table_name: string;
  table_type: string;
  table_schema: string;
  table_comment: string;
}

export interface IColumnInfo {
  column_name: string;
  ordinal_position: number;
  column_default: string | null;
  is_nullable: string;
  data_type: string;
  character_maximum_length: number | null;
  character_octet_length: number | null;
  numeric_precision: number | null;
  numeric_scale: number | null;
  datetime_precision: number | null;
  interval_type: string | null;
  udt_name: string;
  is_identity: string;
  identity_generation: string | null;
  identity_start: string | null;
  identity_increment: string | null;
  identity_maximum: string | null;
  identity_minimum: string | null;
  identity_cycle: string | null;
  is_generated: string;
  generation_expression: string | null;
  column_comment: string;
}

export interface IConstraintInfo {
  constraint_name: string;
  constraint_type: string;
  table_name: string;
  table_schema: string;
  column_name: string | null;
  foreign_table_name: string | null;
  foreign_column_name: string | null;
  update_rule: string | null;
  delete_rule: string | null;
  check_clause: string | null;
  is_deferrable: string | null;
  initially_deferred: string | null;
}

export interface IIndexInfo {
  indexname: string;
  tablename: string;
  schemaname: string;
  indexdef: string;
  index_type: string;
  estimated_rows: number;
  index_size: string;
  index_pages: number;
  is_unique: boolean;
  is_primary: boolean;
}

export interface IFunctionInfo {
  function_name: string;
  routine_type: string;
  function_body: string;
  language_oid: number;
  language_name: string;
  volatility: string;
  security_definer: boolean;
  is_strict: boolean;
  returns_set: boolean;
  cost: number;
  estimated_rows: number;
  return_type: string;
  arguments: string;
  full_definition: string;
  function_comment: string;
}

export interface ITriggerInfo {
  trigger_name: string;
  event_manipulation: string;
  event_object_table: string;
  event_object_schema: string;
  action_timing: string;
  action_orientation: string;
  action_condition: string | null;
  action_statement: string;
  action_order: number | null;
  full_definition: string;
  trigger_comment: string;
}

export interface ISchemaInfo {
  schema_name: string;
  schema_owner: string;
  schema_comment: string;
}

export interface IDatabaseInfo {
  version: string;
  database_name: string;
  current_user: string;
  session_user: string;
  server_address: string | null;
  server_port: number | null;
}

export class IntrospectionService {
  private client: Client;
  private schema: string;

  constructor(client: Client, schema: string = 'public') {
    this.client = client;
    this.schema = schema;
  }

  /**
   * Get all tables in the schema
   */
  async getTables(): Promise<ITableInfo[]> {
    const result = await this.client.query(GET_TABLES_QUERY, [this.schema]);
    return result.rows;
  }

  /**
   * Get all columns for a specific table
   */
  async getTableColumns(tableName: string): Promise<IColumnInfo[]> {
    const result = await this.client.query(GET_TABLE_COLUMNS_QUERY, [
      this.schema,
      tableName,
    ]);
    return result.rows;
  }

  /**
   * Get all constraints for a specific table
   */
  async getTableConstraints(tableName: string): Promise<IConstraintInfo[]> {
    const result = await this.client.query(GET_TABLE_CONSTRAINTS_QUERY, [
      this.schema,
      tableName,
    ]);
    return result.rows;
  }

  /**
   * Get all indexes for a specific table
   */
  async getTableIndexes(tableName: string): Promise<IIndexInfo[]> {
    const result = await this.client.query(GET_TABLE_INDEXES_QUERY, [
      this.schema,
      tableName,
    ]);
    return result.rows;
  }

  /**
   * Get all functions and procedures in the schema
   */
  async getFunctions(): Promise<IFunctionInfo[]> {
    const result = await this.client.query(GET_FUNCTIONS_QUERY, [this.schema]);
    return result.rows;
  }

  /**
   * Get all triggers in the schema
   */
  async getTriggers(): Promise<ITriggerInfo[]> {
    const result = await this.client.query(GET_TRIGGERS_QUERY, [this.schema]);
    return result.rows;
  }

  /**
   * Get all sequences in the schema
   */
  async getSequences(): Promise<any[]> {
    const result = await this.client.query(GET_SEQUENCES_QUERY, [this.schema]);
    return result.rows;
  }

  /**
   * Get all views in the schema
   */
  async getViews(): Promise<any[]> {
    const result = await this.client.query(GET_VIEWS_QUERY, [this.schema]);
    return result.rows;
  }

  /**
   * Get all enums in the schema
   */
  async getEnums(): Promise<any[]> {
    const result = await this.client.query(GET_ENUMS_QUERY, [this.schema]);
    return result.rows;
  }

  /**
   * Get all domains in the schema
   */
  async getDomains(): Promise<TUnknownOrAny[]> {
    const result = await this.client.query(GET_DOMAINS_QUERY, [this.schema]);
    return result.rows;
  }

  /**
   * Get schema information
   */
  async getSchemaInfo(): Promise<ISchemaInfo | null> {
    const result = await this.client.query(GET_SCHEMA_INFO_QUERY, [
      this.schema,
    ]);
    return result.rows[0] ?? null;
  }

  /**
   * Get database information
   */
  async getDatabaseInfo(): Promise<IDatabaseInfo> {
    const result = await this.client.query(GET_DATABASE_INFO_QUERY);
    return result.rows[0];
  }

  /**
   * Get complete table information including columns, constraints, and indexes
   */
  async getCompleteTableInfo(tableName: string): Promise<{
    table: ITableInfo;
    columns: IColumnInfo[];
    constraints: IConstraintInfo[];
    indexes: IIndexInfo[];
  }> {
    const [tableResult, columnsResult, constraintsResult, indexesResult] =
      await Promise.all([
        this.client.query(GET_TABLES_QUERY, [this.schema]),
        this.getTableColumns(tableName),
        this.getTableConstraints(tableName),
        this.getTableIndexes(tableName),
      ]);

    const table = tableResult.rows.find(
      (t: ITableInfo) => t.table_name === tableName
    );

    if (!table) {
      throw new Error(`Table ${tableName} not found in schema ${this.schema}`);
    }

    return {
      table,
      columns: columnsResult,
      constraints: constraintsResult,
      indexes: indexesResult,
    };
  }

  /**
   * Get all tables with their complete information
   */
  async getAllTablesComplete(): Promise<
    Array<{
      table: ITableInfo;
      columns: IColumnInfo[];
      constraints: IConstraintInfo[];
      indexes: IIndexInfo[];
    }>
  > {
    const tables = await this.getTables();

    const tablesMeta = tables.map(async table => {
      const [columns, constraints, indexes] = await Promise.all([
        this.getTableColumns(table.table_name),
        this.getTableConstraints(table.table_name),
        this.getTableIndexes(table.table_name),
      ]);

      return {
        table,
        columns,
        constraints,
        indexes,
      };
    });

    return await Promise.all(tablesMeta);
  }
}
