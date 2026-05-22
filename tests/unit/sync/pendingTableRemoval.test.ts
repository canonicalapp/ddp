import {
  primePendingTableRemovals,
  resolveRemovedTableStrategy,
  shouldSkipPerObjectDropsOnRemovedTable,
} from '@/sync/pendingTableRemoval';
import type { ILegacySyncOptions } from '@/types/sync';

const baseOptions = (): ILegacySyncOptions => ({
  conn: 'postgres://local',
  source: 'shadow',
  target: 'public',
  targetConn: 'postgres://local',
});

describe('pendingTableRemoval', () => {
  const originalEnv = process.env.DDP_REMOVED_TABLE_STRATEGY;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.DDP_REMOVED_TABLE_STRATEGY;
    } else {
      process.env.DDP_REMOVED_TABLE_STRATEGY = originalEnv;
    }
  });

  it('defaults to cascade strategy', () => {
    delete process.env.DDP_REMOVED_TABLE_STRATEGY;
    expect(resolveRemovedTableStrategy(baseOptions())).toBe('cascade');
  });

  it('honors DDP_REMOVED_TABLE_STRATEGY=preserve-rename', () => {
    process.env.DDP_REMOVED_TABLE_STRATEGY = 'preserve-rename';
    expect(resolveRemovedTableStrategy(baseOptions())).toBe('preserve-rename');
  });

  it('skips per-object drops only for cascade on pending tables', () => {
    const options = baseOptions();
    primePendingTableRemovals(options, ['affiliates']);

    expect(
      shouldSkipPerObjectDropsOnRemovedTable(options, 'affiliates')
    ).toBe(true);
    expect(shouldSkipPerObjectDropsOnRemovedTable(options, 'orders')).toBe(
      false
    );

    options.removedTableStrategy = 'preserve-rename';
    expect(
      shouldSkipPerObjectDropsOnRemovedTable(options, 'affiliates')
    ).toBe(false);
  });
});
