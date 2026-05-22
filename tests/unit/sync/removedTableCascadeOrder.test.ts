import { TableOperations } from '@/sync/operations/tables';
import {
  createMockClient,
  createMockOptions,
} from '../../fixtures/testUtils';

describe('removed table CASCADE ordering', () => {
  it('orders child table before parent for DROP TABLE', async () => {
    const mockSourceClient = createMockClient();
    const mockTargetClient = createMockClient();
    const mockOptions = createMockOptions();

    const tableOps = new TableOperations(
      mockSourceClient,
      mockTargetClient,
      mockOptions
    );

    mockSourceClient.query.mockResolvedValue({
      rows: [{ table_name: 'orders' }],
    });
    mockTargetClient.query
      .mockResolvedValueOnce({
        rows: [
          { table_name: 'orders' },
          { table_name: 'affiliate_commissions' },
          { table_name: 'affiliates' },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            child_table: 'affiliate_commissions',
            parent_table: 'affiliates',
          },
        ],
      });

    const ordered = await tableOps.sortTablesToDropForCascadeAsync([
      { table_name: 'affiliates' },
      { table_name: 'affiliate_commissions' },
    ]);

    expect(ordered.map(t => t.table_name)).toEqual([
      'affiliate_commissions',
      'affiliates',
    ]);
  });
});
