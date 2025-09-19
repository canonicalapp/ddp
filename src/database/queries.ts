/**
 * Database Queries Module
 * Contains SQL queries for database introspection
 */

/**
 * Get all tables in a schema with basic metadata
 */
export const GET_TABLES_QUERY = `
  SELECT DISTINCT
    t.table_name,
    t.table_type,
    t.table_schema,
    COALESCE(obj_description(c.oid), '') as table_comment
  FROM information_schema.tables t
  LEFT JOIN pg_class c ON c.relname = t.table_name
  LEFT JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = t.table_schema
  WHERE t.table_schema = $1
    AND t.table_type = 'BASE TABLE'
  ORDER BY t.table_name;
`;

/**
 * Get all columns for a specific table with detailed metadata
 */
export const GET_TABLE_COLUMNS_QUERY = `
  SELECT DISTINCT
    c.column_name,
    c.ordinal_position,
    c.column_default,
    c.is_nullable,
    c.data_type,
    c.character_maximum_length,
    c.character_octet_length,
    c.numeric_precision,
    c.numeric_scale,
    c.datetime_precision,
    c.interval_type,
    c.udt_name,
    c.is_identity,
    c.identity_generation,
    c.identity_start,
    c.identity_increment,
    c.identity_maximum,
    c.identity_minimum,
    c.identity_cycle,
    c.is_generated,
    c.generation_expression,
    COALESCE(col_description(pgc.oid, c.ordinal_position), '') as column_comment
  FROM information_schema.columns c
  LEFT JOIN pg_class pgc ON pgc.relname = c.table_name AND pgc.relkind = 'r'
  LEFT JOIN pg_namespace pgn ON pgn.oid = pgc.relnamespace AND pgn.nspname = c.table_schema
  WHERE c.table_schema = $1 
    AND c.table_name = $2
  ORDER BY c.ordinal_position;
`;

/**
 * Get all constraints for a specific table
 */
export const GET_TABLE_CONSTRAINTS_QUERY = `
  SELECT 
    tc.constraint_name,
    tc.constraint_type,
    tc.table_name,
    tc.table_schema,
    STRING_AGG(kcu.column_name, ',' ORDER BY kcu.ordinal_position) as column_names,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name,
    rc.update_rule,
    rc.delete_rule,
    cc.check_clause,
    tc.is_deferrable,
    tc.initially_deferred
  FROM information_schema.table_constraints tc
  LEFT JOIN information_schema.key_column_usage kcu 
    ON tc.constraint_name = kcu.constraint_name 
    AND tc.table_schema = kcu.table_schema
  LEFT JOIN information_schema.constraint_column_usage ccu 
    ON ccu.constraint_name = tc.constraint_name 
    AND ccu.table_schema = tc.table_schema
  LEFT JOIN information_schema.referential_constraints rc 
    ON tc.constraint_name = rc.constraint_name 
    AND tc.table_schema = rc.constraint_schema
  LEFT JOIN information_schema.check_constraints cc 
    ON tc.constraint_name = cc.constraint_name 
    AND tc.table_schema = cc.constraint_schema
  WHERE tc.table_schema = $1 
    AND tc.table_name = $2
  GROUP BY tc.constraint_name, tc.constraint_type, tc.table_name, tc.table_schema, 
           ccu.table_name, ccu.column_name, rc.update_rule, rc.delete_rule, 
           cc.check_clause, tc.is_deferrable, tc.initially_deferred
  ORDER BY tc.constraint_name;
`;

/**
 * Get all indexes for a specific table
 */
export const GET_TABLE_INDEXES_QUERY = `
  SELECT DISTINCT
    i.indexname,
    i.tablename,
    i.schemaname,
    i.indexdef,
    pg_am.amname as index_type,
    pg_class.reltuples as estimated_rows,
    pg_size_pretty(pg_relation_size(pg_class.oid)) as index_size,
    pg_class.relpages as index_pages,
    CASE 
      WHEN i.indexdef LIKE '%UNIQUE%' THEN true 
      ELSE false 
    END as is_unique,
    CASE 
      WHEN i.indexdef LIKE '%PRIMARY%' THEN true 
      ELSE false 
    END as is_primary,
    -- Extract column names from indexdef
    CASE 
      WHEN i.indexdef ~ '\\([^)]+\\)' THEN 
        SUBSTRING(i.indexdef FROM '\\(([^)]+)\\)')
      ELSE ''
    END as column_names
  FROM pg_indexes i
  LEFT JOIN pg_class ON pg_class.relname = i.indexname
  LEFT JOIN pg_am ON pg_am.oid = pg_class.relam
  WHERE i.schemaname = $1 
    AND i.tablename = $2
  ORDER BY i.indexname;
`;

/**
 * Get all functions and procedures in a schema
 */
export const GET_FUNCTIONS_QUERY = `
  SELECT 
    p.proname as function_name,
    p.prokind as routine_type,
    p.prosrc as function_body,
    p.prolang as language_oid,
    l.lanname as language_name,
    p.provolatile as volatility,
    p.prosecdef as security_definer,
    p.proisstrict as is_strict,
    p.proretset as returns_set,
    p.procost as cost,
    p.prorows as estimated_rows,
    pg_get_function_result(p.oid) as return_type,
    pg_get_function_arguments(p.oid) as arguments,
    pg_get_functiondef(p.oid) as full_definition,
    COALESCE(obj_description(p.oid), '') as function_comment
  FROM pg_proc p
  LEFT JOIN pg_language l ON p.prolang = l.oid
  LEFT JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = $1
    AND p.prokind IN ('f', 'p') -- 'f' = function, 'p' = procedure
  ORDER BY p.proname;
`;

/**
 * Get function parameters from information_schema.parameters
 */
export const GET_FUNCTION_PARAMETERS_QUERY = `
  SELECT 
    p.specific_name,
    p.parameter_name,
    p.data_type,
    p.parameter_mode,
    p.parameter_default,
    p.ordinal_position,
    proc.proname as function_name
  FROM information_schema.parameters p
  JOIN pg_proc proc ON p.specific_name LIKE '%_' || proc.oid::text
  JOIN pg_namespace n ON proc.pronamespace = n.oid
  WHERE p.specific_schema = $1
    AND p.parameter_name IS NOT NULL
    AND n.nspname = $1
  ORDER BY proc.proname, p.ordinal_position;
`;

/**
 * Get all triggers for tables in a schema
 */
export const GET_TRIGGERS_QUERY = `
  SELECT 
    t.trigger_name,
    t.event_manipulation,
    t.event_object_table,
    t.event_object_schema,
    t.action_timing,
    t.action_orientation,
    t.action_condition,
    t.action_statement,
    t.action_order,
    pg_get_triggerdef(pg_trigger.oid) as full_definition,
    COALESCE(obj_description(pg_trigger.oid), '') as trigger_comment
  FROM information_schema.triggers t
  LEFT JOIN pg_trigger ON pg_trigger.tgname = t.trigger_name
  LEFT JOIN pg_class ON pg_class.oid = pg_trigger.tgrelid
  LEFT JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
  WHERE t.event_object_schema = $1
  ORDER BY t.event_object_table, t.trigger_name;
`;

/**
 * Get all sequences in a schema
 */
export const GET_SEQUENCES_QUERY = `
  SELECT 
    s.sequence_name,
    s.data_type,
    s.numeric_precision,
    s.numeric_scale,
    s.start_value,
    s.minimum_value,
    s.maximum_value,
    s.increment,
    s.cycle_option,
    s.sequence_schema,
    COALESCE(obj_description(c.oid), '') as sequence_comment
  FROM information_schema.sequences s
  LEFT JOIN pg_class c ON c.relname = s.sequence_name
  LEFT JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = s.sequence_schema
  WHERE s.sequence_schema = $1
  ORDER BY s.sequence_name;
`;

/**
 * Get all views in a schema
 */
export const GET_VIEWS_QUERY = `
  SELECT 
    v.table_name,
    v.view_definition,
    v.table_schema,
    COALESCE(obj_description(c.oid), '') as view_comment
  FROM information_schema.views v
  LEFT JOIN pg_class c ON c.relname = v.table_name
  LEFT JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = v.table_schema
  WHERE v.table_schema = $1
  ORDER BY v.table_name;
`;

/**
 * Get all enums in a schema
 */
export const GET_ENUMS_QUERY = `
  SELECT 
    t.typname as enum_name,
    e.enumlabel as enum_value,
    e.enumsortorder as sort_order,
    n.nspname as schema_name
  FROM pg_type t
  JOIN pg_enum e ON t.oid = e.enumtypid
  JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = $1
  ORDER BY t.typname, e.enumsortorder;
`;

/**
 * Get all domains in a schema
 */
export const GET_DOMAINS_QUERY = `
  SELECT 
    d.domain_name,
    d.data_type,
    d.character_maximum_length,
    d.numeric_precision,
    d.numeric_scale,
    d.domain_default,
    d.is_nullable,
    d.domain_schema,
    COALESCE(obj_description(t.oid), '') as domain_comment
  FROM information_schema.domains d
  LEFT JOIN pg_type t ON t.typname = d.domain_name
  LEFT JOIN pg_namespace n ON n.oid = t.typnamespace AND n.nspname = d.domain_schema
  WHERE d.domain_schema = $1
  ORDER BY d.domain_name;
`;

/**
 * Get schema information
 */
export const GET_SCHEMA_INFO_QUERY = `
  SELECT 
    schema_name,
    schema_owner,
    COALESCE(obj_description(oid), '') as schema_comment
  FROM information_schema.schemata s
  LEFT JOIN pg_namespace n ON n.nspname = s.schema_name
  WHERE schema_name = $1;
`;

/**
 * Get database version and information
 */
export const GET_DATABASE_INFO_QUERY = `
  SELECT 
    version() as version,
    current_database() as database_name,
    current_user as current_user,
    session_user as session_user,
    inet_server_addr() as server_address,
    inet_server_port() as server_port;
`;
