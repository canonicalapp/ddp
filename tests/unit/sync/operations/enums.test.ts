import { EnumOperations } from '@/sync/operations/enums.ts';
import {
  createMockClient,
  createMockOptions,
} from '../../../fixtures/testUtils.ts';

describe('EnumOperations', () => {
  it('creates missing enums before dependent objects', async () => {
    const sourceClient = createMockClient();
    const targetClient = createMockClient();
    const options = createMockOptions();
    const ops = new EnumOperations(sourceClient, targetClient, options);

    sourceClient.query.mockResolvedValue({
      rows: [
        {
          enum_name: 'payment_provider',
          enum_schema: options.source,
          enum_label: 'stripe',
          sort_order: 1,
        },
        {
          enum_name: 'payment_provider',
          enum_schema: options.source,
          enum_label: 'adyen',
          sort_order: 2,
        },
      ],
    });
    targetClient.query.mockResolvedValue({ rows: [] });

    const statements = await ops.generateEnumOperations();
    expect(statements).toContain(
      'CREATE TYPE "prod_schema"."payment_provider" AS ENUM (\'stripe\', \'adyen\');'
    );
  });

  it('adds missing enum labels without recreating type', async () => {
    const sourceClient = createMockClient();
    const targetClient = createMockClient();
    const options = createMockOptions();
    const ops = new EnumOperations(sourceClient, targetClient, options);

    sourceClient.query.mockResolvedValue({
      rows: [
        {
          enum_name: 'invoice_status',
          enum_schema: options.source,
          enum_label: 'draft',
          sort_order: 1,
        },
        {
          enum_name: 'invoice_status',
          enum_schema: options.source,
          enum_label: 'paid',
          sort_order: 2,
        },
      ],
    });
    targetClient.query.mockResolvedValue({
      rows: [
        {
          enum_name: 'invoice_status',
          enum_schema: options.target,
          enum_label: 'draft',
          sort_order: 1,
        },
      ],
    });

    const statements = await ops.generateEnumOperations();
    expect(statements).toContain(
      'ALTER TYPE "prod_schema"."invoice_status" ADD VALUE IF NOT EXISTS \'paid\';'
    );
  });
});
