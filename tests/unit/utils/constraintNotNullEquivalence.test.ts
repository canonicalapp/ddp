/**
 * Unit tests for NOT NULL CHECK equivalence parsing
 */

import {
  notNullCheckEquivalenceKey,
  parseSingleColumnIsNotNullColumn,
  stripOuterParens,
} from '@/utils/constraintNotNullEquivalence.ts';

describe('constraintNotNullEquivalence', () => {
  it('stripOuterParens removes nested wrappers', () => {
    expect(stripOuterParens('((x))')).toBe('x');
    expect(stripOuterParens('( ( a ) )')).toBe('a');
  });

  it('parseSingleColumnIsNotNullColumn handles common pg clauses', () => {
    expect(parseSingleColumnIsNotNullColumn('(phone_number IS NOT NULL)')).toBe(
      'phone_number'
    );
    expect(parseSingleColumnIsNotNullColumn('(("email" IS NOT NULL))')).toBe(
      'email'
    );
    expect(parseSingleColumnIsNotNullColumn('(id IS NOT NULL)')).toBe('id');
  });

  it('returns null for non not-null checks', () => {
    expect(parseSingleColumnIsNotNullColumn('(id > 0)')).toBeNull();
    expect(parseSingleColumnIsNotNullColumn(null)).toBeNull();
  });

  it('notNullCheckEquivalenceKey builds stable keys for CHECK only', () => {
    expect(
      notNullCheckEquivalenceKey(
        'users',
        'CHECK',
        '(phone_number IS NOT NULL)',
        null
      )
    ).toBe('users\0phone_number');

    expect(
      notNullCheckEquivalenceKey(
        'users',
        'PRIMARY KEY',
        '(x IS NOT NULL)',
        null
      )
    ).toBeNull();
  });
});
