export type TManifestEntryKind =
  | 'table'
  | 'index'
  | 'constraint'
  | 'extension'
  | 'view'
  | 'enum';

export interface IStateManifestEntryLike {
  path?: string;
  type?: 'schema' | 'proc' | 'trigger';
  kind?: TManifestEntryKind;
  domain?: string;
}

export const PRIORITY_BY_KIND: Record<string, number> = {
  extension: 10,
  enum: 20,
  table: 30,
  constraint: 40,
  index: 50,
  view: 60,
  trigger: 70,
  proc: 80,
};

export const priorityForKind = (kind: string): number =>
  PRIORITY_BY_KIND[kind] ?? 999;

export const inferStateApplyPriority = (
  entry: Partial<IStateManifestEntryLike>,
  displayPath: string
): number => {
  if (entry.type === 'proc') {
    return priorityForKind('proc');
  }
  if (entry.type === 'trigger') {
    return priorityForKind('trigger');
  }
  if (entry.kind) {
    return priorityForKind(entry.kind);
  }

  const p = displayPath.toLowerCase();
  if (p.includes('/schema/extensions/')) {
    return priorityForKind('extension');
  }
  if (p.includes('/schema/enums/')) {
    return priorityForKind('enum');
  }
  if (p.includes('/schema/tables/')) {
    return priorityForKind('table');
  }
  if (p.includes('/schema/constraints/')) {
    return priorityForKind('constraint');
  }
  if (p.includes('/schema/indexes/')) {
    return priorityForKind('index');
  }
  if (p.includes('/schema/views/')) {
    return priorityForKind('view');
  }
  if (p.includes('/triggers/')) {
    return priorityForKind('trigger');
  }
  if (p.includes('/procs/')) {
    return priorityForKind('proc');
  }
  return 999;
};
