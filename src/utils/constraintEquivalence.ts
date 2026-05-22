/**
 * Semantic equality for catalog constraint rows (shadow vs target).
 * Avoids false "constraint has changed" when Postgres catalog shape differs cosmetically.
 */

import { stripOuterParens } from './constraintNotNullEquivalence';

export function normalizeReferentialAction(
  rule: string | null | undefined
): string {
  if (!rule || rule.toUpperCase() === 'NO ACTION') {
    return 'NO ACTION';
  }
  return rule.toUpperCase();
}

/** Sorted, comma-separated column list for multi-column UNIQUE / PK / FK. */
export function normalizeConstraintColumnList(
  columnName: string | null | undefined
): string {
  if (!columnName) {
    return '';
  }
  return columnName
    .split(',')
    .map(c => c.trim())
    .filter(c => c.length > 0)
    .sort()
    .join(',');
}

/**
 * Collapse whitespace / casing / redundant parens on CHECK expressions so
 * catalog text matches state SQL after apply.
 */
export function normalizeCheckClauseForCompare(
  clause: string | null | undefined
): string {
  if (!clause) {
    return '';
  }

  let s = clause.trim();
  for (let i = 0; i < 8; i += 1) {
    const next = stripOuterParens(s);
    if (next === s) {
      break;
    }
    s = next;
  }

  s = s.replace(/\s+/g, ' ');
  s = s.replace(/\s*::\s*/g, '::');
  return s.toLowerCase();
}

export function mergeConstraintColumnName(
  existingColumn: string | null | undefined,
  nextColumn: string | null | undefined
): string | null {
  const cols = new Set<string>();
  for (const raw of [existingColumn, nextColumn]) {
    if (!raw) {
      continue;
    }
    for (const part of raw.split(',')) {
      const t = part.trim();
      if (t.length > 0) {
        cols.add(t);
      }
    }
  }
  if (cols.size === 0) {
    return null;
  }
  return [...cols].sort().join(',');
}
