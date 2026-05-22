import { mkdtemp, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { reorderTableApplyBucketByDependencies } from '@/commands/migrate/reorderTableApplyBucket';

describe('reorderTableApplyBucketByDependencies', () => {
  it('orders child table after referenced parent', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'ddp-reorder-'));
    const child = join(dir, '001_child.sql');
    const parent = join(dir, '002_parent.sql');
    await writeFile(
      parent,
      'CREATE TABLE merchants (id uuid PRIMARY KEY);\n',
      'utf8'
    );
    await writeFile(
      child,
      `CREATE TABLE attribution_events (
        id uuid PRIMARY KEY,
        merchant_id uuid NOT NULL REFERENCES merchants (id)
      );\n`,
      'utf8'
    );

    const bucket = [
      {
        absolutePath: child,
        displayPath: 'db/state/schema/tables/001_child.sql',
      },
      {
        absolutePath: parent,
        displayPath: 'db/state/schema/tables/002_parent.sql',
      },
    ];

    const out = await reorderTableApplyBucketByDependencies(bucket);
    expect(out[0]?.absolutePath).toBe(parent);
    expect(out[1]?.absolutePath).toBe(child);
  });
});
