import { splitSqlStatements } from '@/utils/splitSqlStatements.ts';

describe('splitSqlStatements', () => {
  it('splits on semicolons after line comments that contain apostrophes', () => {
    const sql = `
-- TODO: it's safe to ignore
SELECT 1;
SELECT 2;
`;
    expect(splitSqlStatements(sql).length).toBe(2);
  });

  it('does not merge remainder of file when a comment has an apostrophe', () => {
    const sql = `CREATE SEQUENCE s;
-- confirm it's unused
CREATE TABLE t (id int);
`;
    const stmts = splitSqlStatements(sql);
    expect(stmts.length).toBe(2);
    expect(stmts[1]).toContain('CREATE TABLE t (id int);');
  });

  it('handles block comments with semicolons inside', () => {
    const sql = `SELECT 1; /* a;b */ SELECT 2;`;
    const stmts = splitSqlStatements(sql);
    expect(stmts.length).toBe(2);
  });
});
