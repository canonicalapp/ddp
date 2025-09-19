/**
 * Unit tests for database queries module
 */

import {
  GET_DATABASE_INFO_QUERY,
  GET_FUNCTIONS_QUERY,
  GET_SCHEMA_INFO_QUERY,
  GET_TABLES_QUERY,
  GET_TABLE_COLUMNS_QUERY,
  GET_TABLE_CONSTRAINTS_QUERY,
  GET_TABLE_INDEXES_QUERY,
  GET_TRIGGERS_QUERY,
} from '@/database/queries';

describe('Database Queries', () => {
  describe('GET_TABLES_QUERY', () => {
    it('should contain correct table selection fields', () => {
      expect(GET_TABLES_QUERY).toContain('table_name');
      expect(GET_TABLES_QUERY).toContain('table_type');
      expect(GET_TABLES_QUERY).toContain('table_schema');
      expect(GET_TABLES_QUERY).toContain('table_comment');
    });

    it('should filter for BASE TABLE type only', () => {
      expect(GET_TABLES_QUERY).toContain("table_type = 'BASE TABLE'");
    });

    it('should order by table name', () => {
      expect(GET_TABLES_QUERY).toContain('ORDER BY t.table_name');
    });

    it('should use parameterized query', () => {
      expect(GET_TABLES_QUERY).toContain('$1');
    });

    it('should join with pg_class for comments', () => {
      expect(GET_TABLES_QUERY).toContain('LEFT JOIN pg_class c');
      expect(GET_TABLES_QUERY).toContain('obj_description(c.oid)');
    });
  });

  describe('GET_TABLE_COLUMNS_QUERY', () => {
    it('should contain all necessary column fields', () => {
      expect(GET_TABLE_COLUMNS_QUERY).toContain('column_name');
      expect(GET_TABLE_COLUMNS_QUERY).toContain('ordinal_position');
      expect(GET_TABLE_COLUMNS_QUERY).toContain('column_default');
      expect(GET_TABLE_COLUMNS_QUERY).toContain('is_nullable');
      expect(GET_TABLE_COLUMNS_QUERY).toContain('data_type');
      expect(GET_TABLE_COLUMNS_QUERY).toContain('character_maximum_length');
      expect(GET_TABLE_COLUMNS_QUERY).toContain('numeric_precision');
      expect(GET_TABLE_COLUMNS_QUERY).toContain('numeric_scale');
      expect(GET_TABLE_COLUMNS_QUERY).toContain('is_identity');
      expect(GET_TABLE_COLUMNS_QUERY).toContain('identity_generation');
      expect(GET_TABLE_COLUMNS_QUERY).toContain('is_generated');
      expect(GET_TABLE_COLUMNS_QUERY).toContain('column_comment');
    });

    it('should use two parameters for schema and table', () => {
      expect(GET_TABLE_COLUMNS_QUERY).toContain('$1');
      expect(GET_TABLE_COLUMNS_QUERY).toContain('$2');
    });

    it('should order by ordinal position', () => {
      expect(GET_TABLE_COLUMNS_QUERY).toContain('ORDER BY c.ordinal_position');
    });

    it('should join with pg_class for comments', () => {
      expect(GET_TABLE_COLUMNS_QUERY).toContain('LEFT JOIN pg_class pgc');
      expect(GET_TABLE_COLUMNS_QUERY).toContain(
        'col_description(pgc.oid, c.ordinal_position)'
      );
    });
  });

  describe('GET_TABLE_CONSTRAINTS_QUERY', () => {
    it('should contain constraint information fields', () => {
      expect(GET_TABLE_CONSTRAINTS_QUERY).toContain('constraint_name');
      expect(GET_TABLE_CONSTRAINTS_QUERY).toContain('constraint_type');
      expect(GET_TABLE_CONSTRAINTS_QUERY).toContain('table_name');
      expect(GET_TABLE_CONSTRAINTS_QUERY).toContain('column_name');
      expect(GET_TABLE_CONSTRAINTS_QUERY).toContain('foreign_table_name');
      expect(GET_TABLE_CONSTRAINTS_QUERY).toContain('foreign_column_name');
      expect(GET_TABLE_CONSTRAINTS_QUERY).toContain('update_rule');
      expect(GET_TABLE_CONSTRAINTS_QUERY).toContain('delete_rule');
      expect(GET_TABLE_CONSTRAINTS_QUERY).toContain('check_clause');
    });

    it('should join multiple constraint tables', () => {
      expect(GET_TABLE_CONSTRAINTS_QUERY).toContain(
        'information_schema.table_constraints'
      );
      expect(GET_TABLE_CONSTRAINTS_QUERY).toContain(
        'information_schema.key_column_usage'
      );
      expect(GET_TABLE_CONSTRAINTS_QUERY).toContain(
        'information_schema.constraint_column_usage'
      );
      expect(GET_TABLE_CONSTRAINTS_QUERY).toContain(
        'information_schema.referential_constraints'
      );
      expect(GET_TABLE_CONSTRAINTS_QUERY).toContain(
        'information_schema.check_constraints'
      );
    });

    it('should use two parameters for schema and table', () => {
      expect(GET_TABLE_CONSTRAINTS_QUERY).toContain('$1');
      expect(GET_TABLE_CONSTRAINTS_QUERY).toContain('$2');
    });
  });

  describe('GET_TABLE_INDEXES_QUERY', () => {
    it('should contain index information fields', () => {
      expect(GET_TABLE_INDEXES_QUERY).toContain('indexname');
      expect(GET_TABLE_INDEXES_QUERY).toContain('tablename');
      expect(GET_TABLE_INDEXES_QUERY).toContain('schemaname');
      expect(GET_TABLE_INDEXES_QUERY).toContain('indexdef');
      expect(GET_TABLE_INDEXES_QUERY).toContain('index_type');
      expect(GET_TABLE_INDEXES_QUERY).toContain('is_unique');
      expect(GET_TABLE_INDEXES_QUERY).toContain('is_primary');
    });

    it('should use pg_indexes as base table', () => {
      expect(GET_TABLE_INDEXES_QUERY).toContain('FROM pg_indexes i');
    });

    it('should join with pg_class and pg_am', () => {
      expect(GET_TABLE_INDEXES_QUERY).toContain(
        'LEFT JOIN pg_class ON pg_class.relname = i.indexname'
      );
      expect(GET_TABLE_INDEXES_QUERY).toContain(
        'LEFT JOIN pg_am ON pg_am.oid = pg_class.relam'
      );
    });

    it('should use two parameters for schema and table', () => {
      expect(GET_TABLE_INDEXES_QUERY).toContain('$1');
      expect(GET_TABLE_INDEXES_QUERY).toContain('$2');
    });
  });

  describe('GET_FUNCTIONS_QUERY', () => {
    it('should contain function information fields', () => {
      expect(GET_FUNCTIONS_QUERY).toContain('function_name');
      expect(GET_FUNCTIONS_QUERY).toContain('routine_type');
      expect(GET_FUNCTIONS_QUERY).toContain('function_body');
      expect(GET_FUNCTIONS_QUERY).toContain('language_name');
      expect(GET_FUNCTIONS_QUERY).toContain('volatility');
      expect(GET_FUNCTIONS_QUERY).toContain('security_definer');
      expect(GET_FUNCTIONS_QUERY).toContain('return_type');
      expect(GET_FUNCTIONS_QUERY).toContain('arguments');
      expect(GET_FUNCTIONS_QUERY).toContain('full_definition');
      expect(GET_FUNCTIONS_QUERY).toContain('function_comment');
    });

    it('should use pg_proc as base table', () => {
      expect(GET_FUNCTIONS_QUERY).toContain('FROM pg_proc p');
    });

    it('should filter for functions and procedures only', () => {
      expect(GET_FUNCTIONS_QUERY).toContain("p.prokind IN ('f', 'p')");
    });

    it('should use one parameter for schema', () => {
      expect(GET_FUNCTIONS_QUERY).toContain('$1');
    });
  });

  describe('GET_TRIGGERS_QUERY', () => {
    it('should contain trigger information fields', () => {
      expect(GET_TRIGGERS_QUERY).toContain('trigger_name');
      expect(GET_TRIGGERS_QUERY).toContain('event_manipulation');
      expect(GET_TRIGGERS_QUERY).toContain('event_object_table');
      expect(GET_TRIGGERS_QUERY).toContain('action_timing');
      expect(GET_TRIGGERS_QUERY).toContain('action_orientation');
      expect(GET_TRIGGERS_QUERY).toContain('action_condition');
      expect(GET_TRIGGERS_QUERY).toContain('action_statement');
      expect(GET_TRIGGERS_QUERY).toContain('full_definition');
      expect(GET_TRIGGERS_QUERY).toContain('trigger_comment');
    });

    it('should use information_schema.triggers as base', () => {
      expect(GET_TRIGGERS_QUERY).toContain(
        'FROM information_schema.triggers t'
      );
    });

    it('should join with pg_trigger for full definition', () => {
      expect(GET_TRIGGERS_QUERY).toContain(
        'LEFT JOIN pg_trigger ON pg_trigger.tgname = t.trigger_name'
      );
      expect(GET_TRIGGERS_QUERY).toContain('pg_get_triggerdef(pg_trigger.oid)');
    });

    it('should use one parameter for schema', () => {
      expect(GET_TRIGGERS_QUERY).toContain('$1');
    });
  });

  describe('GET_SCHEMA_INFO_QUERY', () => {
    it('should contain schema information fields', () => {
      expect(GET_SCHEMA_INFO_QUERY).toContain('schema_name');
      expect(GET_SCHEMA_INFO_QUERY).toContain('schema_owner');
      expect(GET_SCHEMA_INFO_QUERY).toContain('schema_comment');
    });

    it('should use information_schema.schemata as base', () => {
      expect(GET_SCHEMA_INFO_QUERY).toContain(
        'FROM information_schema.schemata s'
      );
    });

    it('should use one parameter for schema', () => {
      expect(GET_SCHEMA_INFO_QUERY).toContain('$1');
    });
  });

  describe('GET_DATABASE_INFO_QUERY', () => {
    it('should contain database information fields', () => {
      expect(GET_DATABASE_INFO_QUERY).toContain('version()');
      expect(GET_DATABASE_INFO_QUERY).toContain('current_database()');
      expect(GET_DATABASE_INFO_QUERY).toContain('current_user');
      expect(GET_DATABASE_INFO_QUERY).toContain('session_user');
      expect(GET_DATABASE_INFO_QUERY).toContain('inet_server_addr()');
      expect(GET_DATABASE_INFO_QUERY).toContain('inet_server_port()');
    });

    it('should not use parameters', () => {
      expect(GET_DATABASE_INFO_QUERY).not.toContain('$');
    });
  });
});
