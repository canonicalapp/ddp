import {
  mergeConstraintColumnName,
  normalizeCheckClauseForCompare,
  normalizeConstraintColumnList,
} from '@/utils/constraintEquivalence';
import { ConstraintDefinitions } from '@/utils/constraintDefinitions';
import {
  createMockClient,
  createMockOptions,
} from '../../fixtures/testUtils';

describe('constraintEquivalence', () => {
  it('merges multi-column constraint rows into sorted column list', () => {
    expect(
      mergeConstraintColumnName('subscription_id', 'invoice_id')
    ).toBe('invoice_id,subscription_id');
  });

  it('normalizes CHECK clauses with cosmetic differences', () => {
    const a = `((CASE scope WHEN 'global'::tax_scope THEN true ELSE false END))`;
    const b = `CASE scope WHEN 'global'::tax_scope THEN true ELSE false END`;
    expect(normalizeCheckClauseForCompare(a)).toBe(
      normalizeCheckClauseForCompare(b)
    );
  });

  it('treats multi-column UNIQUE as equal when column order differs in catalog', () => {
    const defs = new ConstraintDefinitions(
      createMockClient(),
      createMockClient(),
      createMockOptions()
    );

    const source = {
      table_name: 'invoice_subscriptions',
      constraint_name: 'unique_invoice_subscription',
      constraint_type: 'UNIQUE',
      column_name: 'invoice_id,subscription_id',
      foreign_table_name: null,
      foreign_column_name: null,
      update_rule: null,
      delete_rule: null,
    };

    const target = {
      ...source,
      column_name: 'subscription_id,invoice_id',
    };

    expect(
      defs.compareConstraintDefinitions(source, target)
    ).toBe(false);
    expect(normalizeConstraintColumnList(source.column_name)).toBe(
      normalizeConstraintColumnList(target.column_name)
    );
  });
});
