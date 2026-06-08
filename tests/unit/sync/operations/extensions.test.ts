import { ExtensionOperations } from '@/sync/operations/extensions';
import {
  createMockClient,
  createMockOptions,
} from '../../../fixtures/testUtils';

describe('ExtensionOperations', () => {
  it('emits CREATE EXTENSION for extensions present on source but not target', async () => {
    const mockSourceClient = createMockClient();
    const mockTargetClient = createMockClient();
    mockSourceClient.query.mockResolvedValueOnce({
      rows: [{ extname: 'pgcrypto' }, { extname: 'plpgsql' }],
    });
    mockTargetClient.query.mockResolvedValueOnce({
      rows: [{ extname: 'plpgsql' }],
    });

    const ops = new ExtensionOperations(
      mockSourceClient,
      mockTargetClient,
      createMockOptions()
    );

    const result = await ops.generateExtensionOperations();

    expect(result).toContain(
      '-- Extension pgcrypto is required by dev_schema (state) but not installed on prod_schema'
    );
    expect(result).toContain('CREATE EXTENSION IF NOT EXISTS pgcrypto;');
    expect(result.filter(line => line.includes('CREATE EXTENSION'))).toHaveLength(
      1
    );
  });
});
