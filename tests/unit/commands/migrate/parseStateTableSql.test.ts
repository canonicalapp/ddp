import {
  normalizePgTableIdent,
  parseStateTableSqlForDependencySort,
  stripSqlComments,
} from '@/commands/migrate/parseStateTableSql';

describe('parseStateTableSqlForDependencySort', () => {
  it('extracts table name and REFERENCES targets', () => {
    const sql = `
      CREATE TABLE public.attribution_events (
        id uuid PRIMARY KEY,
        merchant_id uuid NOT NULL REFERENCES public.merchants (id)
      );
    `;
    const p = parseStateTableSqlForDependencySort(sql);
    expect(p.multipleCreates).toBe(false);
    expect(p.tableName).toBe('attribution_events');
    expect(p.referencedTables).toContain('merchants');
  });

  it('handles CREATE TABLE IF NOT EXISTS without schema', () => {
    const sql = 'CREATE TABLE IF NOT EXISTS foo (a int REFERENCES bar (id));';
    const p = parseStateTableSqlForDependencySort(sql);
    expect(p.tableName).toBe('foo');
    expect(p.referencedTables).toEqual(['bar']);
  });

  it('flags multiple distinct CREATE TABLE in one file', () => {
    const sql = `
      CREATE TABLE a (id int);
      CREATE TABLE b (id int REFERENCES a(id));
    `;
    const p = parseStateTableSqlForDependencySort(sql);
    expect(p.multipleCreates).toBe(true);
    expect(p.tableName).toBeNull();
  });

  it('strips comments before parsing', () => {
    const sql = `-- leading
      /* block */
      CREATE TABLE t1 (x int REFERENCES t2 (id));
    `;
    const p = parseStateTableSqlForDependencySort(sql);
    expect(p.tableName).toBe('t1');
    expect(p.referencedTables).toEqual(['t2']);
  });
});

describe('normalizePgTableIdent', () => {
  it('lowercases unquoted identifiers', () => {
    expect(normalizePgTableIdent('Merchants')).toBe('merchants');
  });

  it('preserves quoted identifier case', () => {
    expect(normalizePgTableIdent('"CaseSensitive"')).toBe('CaseSensitive');
  });
});

describe('stripSqlComments', () => {
  it('removes line and block comments', () => {
    const s = stripSqlComments('a --x\nb /*y*/ c');
    expect(s).not.toContain('--');
    expect(s).not.toContain('/*');
    expect(s).toContain('a');
    expect(s).toContain('b');
    expect(s).toContain('c');
  });
});
