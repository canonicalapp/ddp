import { SCHEMA_KIND_ALIASES, TYPE_ALIASES } from './aliases';
import { sanitizeName } from '../../utils/sanitize';
import type { ParsedStateCreateInput } from '../../types/state';

export const parseStateCreateArgs = (input: {
  type: string;
  kindOrDomain?: string;
  name?: string;
}): ParsedStateCreateInput => {
  const typeToken = input.type.trim().toLowerCase();
  const type = TYPE_ALIASES[typeToken];

  if (!type) {
    throw new Error(
      `Invalid type "${input.type}". Expected one of: schema|sch, proc|prc, trigger|trg`
    );
  }

  if (type === 'schema') {
    if (!input.kindOrDomain || !input.name) {
      throw new Error(
        'Schema requires: ddp state create <type> <kind> <name>\nExample: ddp state create schema table users'
      );
    }

    const kindToken = input.kindOrDomain.trim().toLowerCase();
    const schemaKind = SCHEMA_KIND_ALIASES[kindToken];

    if (!schemaKind) {
      throw new Error(
        `Invalid schema kind "${input.kindOrDomain}". Expected one of: table|tbl|t, index|idx|i, constraint|cons|c, extension|ext, view|vw|v, enum|en`
      );
    }

    return {
      type: 'schema',
      schemaKind,
      name: input.name,
    };
  }

  if (type === 'trigger') {
    if (!input.kindOrDomain || input.name) {
      throw new Error(
        'Trigger requires: ddp state create <type> <name>\nExample: ddp state create trigger audit_users'
      );
    }

    return {
      type: 'trigger',
      name: input.kindOrDomain,
    };
  }

  if (input.kindOrDomain && input.name) {
    return {
      type: 'proc',
      procDomain: sanitizeName(input.kindOrDomain),
      name: input.name,
    };
  }

  if (input.kindOrDomain && !input.name) {
    return {
      type: 'proc',
      name: input.kindOrDomain,
    };
  }

  throw new Error(
    'Proc requires: ddp state create <type> <name> OR ddp state create <type> <domain> <name>\nExamples:\n  ddp state create proc login\n  ddp state create proc auth login'
  );
};
