import {
  formatRoutineDropStatement,
  routineIdentityKey,
} from '@/sync/routineSql';

describe('routineSql', () => {
  it('formats DROP with argument list for overloaded functions', () => {
    expect(
      formatRoutineDropStatement('public', {
        routine_name: 'digest',
        routine_type: 'FUNCTION',
        identity_arguments: 'bytea, text',
      })
    ).toBe('DROP FUNCTION IF EXISTS public.digest(bytea, text);');
  });

  it('formats DROP without args when identity is empty', () => {
    expect(
      formatRoutineDropStatement('public', {
        routine_name: 'noop',
        routine_type: 'FUNCTION',
        identity_arguments: '',
      })
    ).toBe('DROP FUNCTION IF EXISTS public.noop;');
  });

  it('uses oid only when useCatalogOid is set (same schema)', () => {
    const a = routineIdentityKey(
      {
        routine_name: 'digest',
        routine_type: 'FUNCTION',
        routine_oid: '12345',
        identity_arguments: 'bytea, text',
      },
      { useCatalogOid: true }
    );
    const b = routineIdentityKey(
      {
        routine_name: 'digest',
        routine_type: 'FUNCTION',
        routine_oid: '99999',
        identity_arguments: 'text, bytea',
      },
      { useCatalogOid: true }
    );
    expect(a).not.toBe(b);
  });

  it('matches by name and args across shadow vs public (default)', () => {
    const shadow = routineIdentityKey({
      routine_name: 'fn_touch_updated_at',
      routine_type: 'FUNCTION',
      routine_oid: '111',
      identity_arguments: '',
    });
    const publicFn = routineIdentityKey({
      routine_name: 'fn_touch_updated_at',
      routine_type: 'FUNCTION',
      routine_oid: '222',
      identity_arguments: '',
    });
    expect(shadow).toBe(publicFn);
  });
});
