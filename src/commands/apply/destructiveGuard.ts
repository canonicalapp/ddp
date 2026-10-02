/**
 * Heuristic detection of potentially destructive SQL (user confirmation required).
 */

import consola from 'consola';
import type { ILoadedFile } from '@/types/apply';

const stripStringsAndComments = (sql: string): string =>
  sql
    .replace(/'[^']*'/g, ' ')
    .replace(/"[^"]*"/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ');

export const migrationSqlLooksDestructive = (sql: string): boolean => {
  const s = stripStringsAndComments(sql);
  const upper = s.toUpperCase();

  // `BEFORE TRUNCATE ON t` / `... OR TRUNCATE ON t` is a trigger event, not a data-destroying
  // statement; only a TRUNCATE that is not followed by ON counts.
  if (/\bTRUNCATE\b(?!\s+ON\b)/.test(upper)) {
    return true;
  }

  if (
    /\bDROP\s+(DATABASE|SCHEMA|TABLE|INDEX|VIEW|TYPE|DOMAIN|SEQUENCE|EXTENSION|FUNCTION|PROCEDURE|AGGREGATE|CAST|CONVERSION|OPERATOR|LANGUAGE|RULE|TRIGGER)\b/.test(
      upper
    )
  ) {
    return true;
  }

  if (/\bALTER\s+TABLE\b[\s\S]{0,4000}?\bDROP\b/.test(upper)) {
    return true;
  }

  return false;
};

export const assertDestructiveMigrationsAllowed = async (
  files: ILoadedFile[],
  options: {
    acceptDestructive?: boolean;
    nonInteractive?: boolean;
  }
): Promise<void> => {
  const risky = files.filter(f => migrationSqlLooksDestructive(f.content));
  if (risky.length === 0) {
    return;
  }

  consola.warn(
    'The following pending migration(s) contain potentially destructive statements (DROP, TRUNCATE, ALTER … DROP, etc.):'
  );
  for (const f of risky) {
    consola.log(`  - ${f.migrationId}`);
  }

  if (options.acceptDestructive) {
    consola.info('Proceeding (--accept-destructive).');
    return;
  }

  if (options.nonInteractive) {
    throw new Error(
      'Destructive migrations require --accept-destructive in non-interactive mode.'
    );
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(
      'Destructive migrations require --accept-destructive when stdin is not a TTY.'
    );
  }

  const confirmed = await consola.prompt(
    'Apply these migrations anyway? This may destroy data.',
    { type: 'confirm', initial: false }
  );
  if (confirmed !== true) {
    throw new Error('Aborted: destructive migrations not confirmed.');
  }
};
