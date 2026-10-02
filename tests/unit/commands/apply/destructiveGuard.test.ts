import { migrationSqlLooksDestructive } from '../../../../src/commands/apply/destructiveGuard';

describe('migrationSqlLooksDestructive TRUNCATE handling', () => {
  it('flags a TRUNCATE statement', () => {
    expect(migrationSqlLooksDestructive('TRUNCATE TABLE s.t;')).toBe(true);
    expect(migrationSqlLooksDestructive('truncate s.t;')).toBe(true);
    expect(migrationSqlLooksDestructive('TRUNCATE ONLY s.t;')).toBe(true);
  });

  it('does not flag TRUNCATE as a trigger event', () => {
    const sql = `CREATE OR REPLACE TRIGGER g
      BEFORE TRUNCATE ON s.t
      FOR EACH STATEMENT EXECUTE FUNCTION s.f();`;
    expect(migrationSqlLooksDestructive(sql)).toBe(false);
    expect(
      migrationSqlLooksDestructive(
        'CREATE TRIGGER g BEFORE DELETE OR TRUNCATE ON s.t EXECUTE FUNCTION s.f();'
      )
    ).toBe(false);
  });
});
