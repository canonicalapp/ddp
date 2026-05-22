import { ConstraintHandlers } from '@/utils/constraintHandlers';
import { primePendingTableRemovals } from '@/sync/pendingTableRemoval';
import {
  createMockClient,
  createMockOptions,
} from '../../fixtures/testUtils';

describe('ConstraintHandlers removed module FKs', () => {
  it('drops FKs on surviving tables that reference removed module tables first', async () => {
    const mockSourceClient = createMockClient();
    const mockTargetClient = createMockClient();
    const options = createMockOptions();
    primePendingTableRemovals(options, ['affiliates']);

    const handlers = new ConstraintHandlers(
      mockSourceClient,
      mockTargetClient,
      options
    );

    const targetConstraints = [
      {
        table_name: 'orders',
        constraint_name: 'orders_affiliate_id_fkey',
        constraint_type: 'FOREIGN KEY',
        column_name: 'affiliate_id',
        foreign_table_name: 'affiliates',
        foreign_column_name: 'id',
        update_rule: 'NO ACTION',
        delete_rule: 'NO ACTION',
      },
      {
        table_name: 'affiliates',
        constraint_name: 'affiliates_pkey',
        constraint_type: 'PRIMARY KEY',
        column_name: 'id',
        foreign_table_name: null,
        foreign_column_name: null,
        update_rule: null,
        delete_rule: null,
      },
    ];

    const statements: string[] = [];
    await handlers.handleConstraintsToDrop([], targetConstraints, statements);

    expect(
      statements.some(line =>
        line.includes(
          'ALTER TABLE prod_schema.orders DROP CONSTRAINT IF EXISTS "orders_affiliate_id_fkey"'
        )
      )
    ).toBe(true);
    expect(
      statements.some(line =>
        line.includes('DROP CONSTRAINT') && line.includes('affiliates_pkey')
      )
    ).toBe(false);
  });
});
