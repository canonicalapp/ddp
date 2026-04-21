/**
 * Detect CHECK constraints that only enforce NOT NULL on a single column.
 * Used to align shadow vs target when constraint names differ but behavior matches.
 */

export function stripOuterParens(expr: string): string {
  let t = expr.trim();
  let changed = true;
  while (changed && t.length >= 2) {
    changed = false;
    if (t.startsWith('(') && t.endsWith(')')) {
      t = t.slice(1, -1).trim();
      changed = true;
    }
  }
  return t;
}

/** Unwrap one layer of double-quotes and unescape "" */
function normalizeColumnToken(raw: string): string {
  let t = raw.trim();
  if (t.startsWith('"') && t.endsWith('"') && t.length >= 2) {
    t = t.slice(1, -1).replace(/""/g, '"');
  }
  return t;
}

/**
 * If `check_clause` is a single-column `IS NOT NULL`, return that column's name (unquoted).
 * Otherwise null.
 */
export function parseSingleColumnIsNotNullColumn(
  checkClause: string | null | undefined
): string | null {
  if (!checkClause || typeof checkClause !== 'string') {
    return null;
  }

  const inner = stripOuterParens(checkClause);
  const m = inner.match(
    /^((?:"(?:[^"]|"")*")|(?:[a-zA-Z_]\w*))\s+IS\s+NOT\s+NULL$/i
  );
  if (!m?.[1]) {
    return null;
  }

  return normalizeColumnToken(m[1]);
}

/**
 * Stable key for "this CHECK is just NOT NULL on column X of table T".
 * Used to match source vs target without requiring identical constraint names.
 */
export function notNullCheckEquivalenceKey(
  tableName: string,
  constraintType: string,
  checkClause: string | null | undefined,
  columnName: string | null | undefined
): string | null {
  if (constraintType !== 'CHECK') {
    return null;
  }

  let col = parseSingleColumnIsNotNullColumn(checkClause);
  if (
    !col &&
    columnName &&
    checkClause &&
    /IS\s+NOT\s+NULL/i.test(checkClause)
  ) {
    col = normalizeColumnToken(columnName);
  }
  if (!col) {
    return null;
  }

  return `${tableName}\0${col.toLowerCase()}`;
}

export function collectNotNullCheckKeys(
  rows: Array<{
    table_name: string;
    constraint_type: string;
    check_clause?: string | null;
    column_name?: string | null;
  }>
): Set<string> {
  const keys = new Set<string>();
  for (const row of rows) {
    const k = notNullCheckEquivalenceKey(
      row.table_name,
      row.constraint_type,
      row.check_clause ?? null,
      row.column_name ?? null
    );
    if (k) {
      keys.add(k);
    }
  }
  return keys;
}
