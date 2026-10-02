/**
 * PostgreSQL 18 stores NOT NULL as real pg_constraint rows (contype 'n'). Those must not be
 * returned as constraint definitions: DDP synthesises NOT NULL itself, and a type-'n' row used to
 * produce invalid ADD CONSTRAINT SQL with a TODO placeholder.
 */
import { ConstraintDefinitions } from '../../../src/utils/constraintDefinitions';
import {
  createMockClient,
  createMockOptions,
} from '../../fixtures/testUtils.ts';

describe('ConstraintDefinitions.getConstraintDefinition', () => {
  it('excludes PG18 NOT NULL (contype n) rows from the lookup', async () => {
    const client = createMockClient();
    client.query.mockResolvedValue({ rows: [] });
    const defs = new ConstraintDefinitions(client, client, createMockOptions());

    await defs.getConstraintDefinition('source', 't_col_not_null', 't');

    const sql = client.query.mock.calls[0][0] as string;
    expect(sql).toContain("con.contype <> 'n'");
  });
});
