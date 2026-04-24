import type { ParsedStateCreateInput } from '../../types/state';

export const buildTemplate = (
  parsed: ParsedStateCreateInput,
  logicalName: string
): string => {
  if (parsed.type === 'schema') {
    const header = `-- DDP state: schema/${parsed.schemaKind} - ${logicalName}\n\n`;

    switch (parsed.schemaKind) {
      case 'table':
        return (
          header +
          `CREATE TABLE IF NOT EXISTS ${logicalName} (\n` +
          `  id   BIGSERIAL PRIMARY KEY,\n` +
          `  name TEXT NOT NULL\n` +
          `);\n`
        );
      case 'index':
        return (
          header +
          '-- Replace table / column list as needed.\n' +
          `CREATE INDEX IF NOT EXISTS new_${logicalName}_index ON ${logicalName} (column_name);\n`
        );
      case 'constraint':
        return (
          header +
          '-- Replace table / columns / references as needed.\n' +
          '-- Idempotent: duplicate constraint name is ignored.\n' +
          `DO $$\n` +
          `BEGIN\n` +
          `  ALTER TABLE ${logicalName}\n` +
          `    ADD CONSTRAINT ${logicalName}_fk FOREIGN KEY (child_id) REFERENCES parent_table (id);\n` +
          `EXCEPTION\n` +
          `  WHEN duplicate_object THEN NULL;\n` +
          `END $$;\n`
        );
      case 'extension':
        return (
          header +
          '-- Adjust extension name as needed.\n' +
          `CREATE EXTENSION IF NOT EXISTS pgcrypto;\n`
        );
      case 'view':
        return (
          header +
          `CREATE OR REPLACE VIEW ${logicalName} AS\n` +
          `  SELECT 1 AS one;\n`
        );
      case 'enum':
        return (
          header +
          '-- Idempotent: type name collision is ignored (safe to re-run in shadow / dev).\n' +
          `DO $$\n` +
          `BEGIN\n` +
          `  CREATE TYPE ${logicalName} AS ENUM ('active', 'inactive');\n` +
          `EXCEPTION\n` +
          `  WHEN duplicate_object THEN NULL;\n` +
          `END $$;\n`
        );
      default:
        return header;
    }
  }

  if (parsed.type === 'proc') {
    const header = `-- DDP state: proc - ${logicalName}\n\n`;
    return (
      header +
      '-- Replace signature and body as needed.\n' +
      `CREATE OR REPLACE FUNCTION ${logicalName}()\n` +
      `RETURNS void AS $$\n` +
      `BEGIN\n` +
      `  -- implementation\n` +
      `END;\n` +
      `$$ LANGUAGE plpgsql;\n`
    );
  }

  const header = `-- DDP state: trigger - ${logicalName}\n\n`;
  return (
    header +
    '-- Replace table / timing / function as needed.\n' +
    `DROP TRIGGER IF EXISTS new_${logicalName}_trigger ON ${logicalName};\n` +
    `CREATE TRIGGER new_${logicalName}_trigger\n` +
    `  AFTER INSERT ON ${logicalName}\n` +
    `  FOR EACH ROW\n` +
    `  EXECUTE FUNCTION your_function();\n`
  );
};
