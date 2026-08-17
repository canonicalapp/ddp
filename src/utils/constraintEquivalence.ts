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
