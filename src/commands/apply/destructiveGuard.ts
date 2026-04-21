/**
 * Heuristic detection of potentially destructive SQL (user confirmation required).
 */

import { createInterface } from 'readline';
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

  if (/\bTRUNCATE\b/.test(upper)) {
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

const promptLine = (question: string): Promise<string> => {
  return new Promise(resolve => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
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

  console.error('');
  console.error(
    'The following pending migration(s) contain potentially destructive statements (DROP, TRUNCATE, ALTER … DROP, etc.):'
  );
  for (const f of risky) {
    console.error(`  - ${f.migrationId}`);
  }

  if (options.acceptDestructive) {
    console.log('Proceeding (--accept-destructive).');
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

  const answer = await promptLine(
    'Apply these migrations anyway? This may destroy data. [y/N] '
  );
  if (!/^y(es)?$/i.test(answer)) {
    throw new Error('Aborted: destructive migrations not confirmed.');
  }
};
