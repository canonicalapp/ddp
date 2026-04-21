/**
 * Split SQL into statements (semicolons, strings, dollar-quotes).
 * Shared by apply executor and shadow apply.
 */

export const splitSqlStatements = (sql: string): string[] => {
  const statements: string[] = [];
  let currentStatement = '';
  let inFunction = false;
  let inString = false;
  let stringChar: string | null = null;
  let dollarQuoteTag: string | null = null;
  let depth = 0;

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    const prevChar = i > 0 ? sql[i - 1] : '';

    // Line/block comments are not string literals; apostrophes in `-- it's` must
    // not toggle `inString` or statements merge into one batch.
    if (!inString && !inFunction) {
      if (char === '-' && i + 1 < sql.length && sql[i + 1] === '-') {
        currentStatement += '-';
        currentStatement += '-';
        i++;
        while (i + 1 < sql.length && sql[i + 1] !== '\n') {
          i++;
          currentStatement += sql[i];
        }
        continue;
      }
      if (char === '/' && i + 1 < sql.length && sql[i + 1] === '*') {
        currentStatement += '/';
        currentStatement += '*';
        i++;
        while (i + 1 < sql.length) {
          i++;
          const c = sql[i];
          currentStatement += c;
          if (c === '*' && i + 1 < sql.length && sql[i + 1] === '/') {
            currentStatement += sql[i + 1];
            i++;
            break;
          }
        }
        continue;
      }
    }

    if (!inFunction && !dollarQuoteTag) {
      if ((char === "'" || char === '"') && prevChar !== '\\') {
        if (!inString) {
          inString = true;
          stringChar = char;
        } else if (char === stringChar) {
          inString = false;
          stringChar = null;
        }
        currentStatement += char;
        continue;
      }

      if (inString) {
        currentStatement += char;
        continue;
      }
    }

    if (!inString) {
      if (char === '$' && !dollarQuoteTag) {
        const match = sql.substring(i).match(/^\$([^$]*)\$/);
        if (match) {
          dollarQuoteTag = match[0];
          inFunction = true;
          depth = 1;
          currentStatement += dollarQuoteTag;
          i += dollarQuoteTag.length - 1;
          continue;
        }
      }

      if (dollarQuoteTag && sql.substring(i).startsWith(dollarQuoteTag)) {
        depth--;
        if (depth === 0) {
          inFunction = false;
          const tag = dollarQuoteTag;
          dollarQuoteTag = null;
          currentStatement += tag;
          i += tag.length - 1;
          continue;
        }
        currentStatement += dollarQuoteTag;
        i += dollarQuoteTag.length - 1;
        continue;
      }

      if (inFunction) {
        currentStatement += char;
        continue;
      }
    }

    if (char === ';' && !inString && !inFunction) {
      currentStatement += char;
      const trimmed = currentStatement.trim();

      if (trimmed.length > 0) {
        statements.push(trimmed);
      }

      currentStatement = '';
      continue;
    }

    currentStatement += char;
  }

  const trimmed = currentStatement.trim();
  if (trimmed.length > 0) {
    statements.push(trimmed);
  }

  return statements;
};
