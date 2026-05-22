/**
 * Lightweight CREATE TABLE / REFERENCES extraction for FK-based apply ordering.
 * Not a full SQL parser; best-effort for typical DDP state DDL.
 */

const CREATE_TABLE_RE =
  /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:(?:"([^"]+)"|(\w+))\.)?(?:"([^"]+)"|(\w+))\s*\(/gi;

const REFERENCES_RE =
  /REFERENCES\s+(?:ONLY\s+)?(?:(?:"([^"]+)"|(\w+))\.)?(?:"([^"]+)"|(\w+))\s*\(/gi;

export function stripSqlComments(sql: string): string {
  const noBlock = sql.replace(/\/\*[\s\S]*?\*\//g, ' ');
  return noBlock.replace(/--[^\n]*/g, ' ');
}

function pickIdent(...groups: Array<string | undefined>): string | undefined {
  for (const g of groups) {
    if (g !== undefined && g.length > 0) {
      return g;
    }
  }
  return undefined;
}

/** Quoted identifiers keep inner case; unquoted fold like PostgreSQL. */
export function normalizePgTableIdent(raw: string): string {
  const t = raw.trim();
  if (t.startsWith('"')) {
    const m = /^"((?:[^"]|"")*)"$/.exec(t);
    if (m?.[1] !== undefined) {
      return m[1].replace(/""/g, '"');
    }
    return t;
  }
  return t.toLowerCase();
}

export interface IParsedStateTableSql {
  /** First CREATE TABLE in file; null if none or ambiguous. */
  tableName: string | null;
  /** Referenced table names from REFERENCES clauses (normalized). */
  referencedTables: string[];
  /** More than one top-level CREATE TABLE — skip automatic reorder for this file. */
  multipleCreates: boolean;
}

export function parseStateTableSqlForDependencySort(
  sql: string
): IParsedStateTableSql {
  const body = stripSqlComments(sql);
  CREATE_TABLE_RE.lastIndex = 0;

  const creates: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = CREATE_TABLE_RE.exec(body)) !== null) {
    const ident = pickIdent(m[3], m[4], m[1], m[2]);
    if (ident !== undefined) {
      creates.push(normalizePgTableIdent(ident));
    }
  }

  if (creates.length === 0) {
    return {
      tableName: null,
      referencedTables: [],
      multipleCreates: false,
    };
  }

  if (creates.length > 1) {
    const unique = new Set(creates);
    if (unique.size > 1) {
      return {
        tableName: null,
        referencedTables: [],
        multipleCreates: true,
      };
    }
  }

  const tableName = creates[0] ?? null;
  const referencedTables: string[] = [];
  const seen = new Set<string>();

  REFERENCES_RE.lastIndex = 0;
  while ((m = REFERENCES_RE.exec(body)) !== null) {
    const refTable = pickIdent(m[3], m[4], m[1], m[2]);
    if (refTable === undefined) {
      continue;
    }
    const norm = normalizePgTableIdent(refTable);
    if (norm.length === 0 || seen.has(norm)) {
      continue;
    }
    seen.add(norm);
    referencedTables.push(norm);
  }

  return {
    tableName,
    referencedTables,
    multipleCreates: false,
  };
}
