/**
 * Application-owned routines for schema diff (excludes extension members).
 */

const ROUTINE_SELECT_BODY = `
    p.proname AS routine_name,
    n.nspname AS routine_schema,
    CASE p.prokind
      WHEN 'p' THEN 'PROCEDURE'
      ELSE 'FUNCTION'
    END AS routine_type,
    p.oid::text AS routine_oid,
    pg_get_function_identity_arguments(p.oid) AS identity_arguments,
    pg_get_function_result(p.oid) AS data_type
`;

/** Routines in $1 schema that are not owned by a PostgreSQL extension. */
export const APPLICATION_ROUTINES_IN_SCHEMA_QUERY = `
  SELECT
    ${ROUTINE_SELECT_BODY}
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = $1
    AND p.prokind IN ('f', 'p')
    AND NOT EXISTS (
      SELECT 1
      FROM pg_depend d
      WHERE d.classid = 'pg_proc'::regclass
        AND d.objid = p.oid
        AND d.deptype = 'e'
    )
  ORDER BY n.nspname, p.proname, identity_arguments
`;

/** Routines in any of $1::text[] schemas (extension members excluded). */
export const APPLICATION_ROUTINES_IN_SCHEMAS_QUERY = `
  SELECT
    ${ROUTINE_SELECT_BODY}
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = ANY($1::text[])
    AND p.prokind IN ('f', 'p')
    AND NOT EXISTS (
      SELECT 1
      FROM pg_depend d
      WHERE d.classid = 'pg_proc'::regclass
        AND d.objid = p.oid
        AND d.deptype = 'e'
    )
  ORDER BY n.nspname, p.proname, identity_arguments
`;

export interface IRoutineIdentity {
  routine_name: string;
  routine_type: string;
  routine_schema?: string;
  routine_oid?: string;
  identity_arguments?: string | null;
  routine_definition?: string | null;
}

/**
 * Stable key for matching routines across shadow vs target catalogs.
 * When schemas differ (e.g. ddp_shadow → public), OIDs must not be used — the same
 * logical function has different OIDs in each schema.
 */
export function routineIdentityKey(
  routine: IRoutineIdentity,
  options?: { useCatalogOid?: boolean }
): string {
  const useCatalogOid = options?.useCatalogOid === true;
  const oid = routine.routine_oid?.trim();
  if (useCatalogOid && oid) {
    return `${routine.routine_type}:${oid}`;
  }
  return `${routine.routine_type}:${routine.routine_name}:${routine.identity_arguments ?? ''}`;
}

/**
 * Merge routine rows from multiple schemas; first row per logical key wins (call with shadow before target).
 */
export function mergeRoutinesByLogicalKey<T extends IRoutineIdentity>(
  rows: T[],
  options?: { useCatalogOid?: boolean }
): T[] {
  const byKey = new Map<string, T>();
  for (const row of rows) {
    const key = routineIdentityKey(row, options);
    if (!byKey.has(key)) {
      byKey.set(key, row);
    }
  }
  return [...byKey.values()];
}

export function formatRoutineDropStatement(
  targetSchema: string,
  routine: IRoutineIdentity
): string {
  const kind =
    routine.routine_type.toLowerCase() === 'procedure' ? 'PROCEDURE' : 'FUNCTION';
  const args = routine.identity_arguments?.trim();
  const objectRef =
    args !== undefined && args.length > 0
      ? `${targetSchema}.${routine.routine_name}(${args})`
      : `${targetSchema}.${routine.routine_name}`;
  return `DROP ${kind} IF EXISTS ${objectRef};`;
}
