import {
  inferStateFileKind,
  resolveStateApplySearchPath,
} from '@/commands/migrate/stateApplyRouting';

describe('stateApplyRouting', () => {
  const names = { shadowSchema: 'ddp_shadow', targetSchema: 'public' };

  it('classifies procs and triggers', () => {
    expect(inferStateFileKind('db/state/procs/sales/001_fn.sql')).toBe('proc');
    expect(inferStateFileKind('db/state/triggers/001_updated_at.sql')).toBe(
      'trigger'
    );
    expect(inferStateFileKind('db/state/schema/tables/001_users.sql')).toBe(
      'schema'
    );
  });

  it('routes procs to target schema on separate-database layout', () => {
    expect(
      resolveStateApplySearchPath(
        'db/state/procs/common/001_fn_touch.sql',
        'separate-database',
        names
      )
    ).toBe('public');
  });

  it('routes schema to shadow on separate-database layout', () => {
    expect(
      resolveStateApplySearchPath(
        'db/state/schema/tables/001_users.sql',
        'separate-database',
        names
      )
    ).toBe('ddp_shadow');
  });

  it('routes everything to shadow on same-database layout', () => {
    expect(
      resolveStateApplySearchPath(
        'db/state/procs/common/001_fn_touch.sql',
        'same-database',
        names
      )
    ).toBe('ddp_shadow');
  });
});
