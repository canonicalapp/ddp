/**
 * Select which physical Postgres connection to use for sync/diff.
 * Schema *names* can match on source and target (e.g. both `public`); databases differ.
 */

import type { ILegacySyncOptions } from '@/types';
import type { Client } from 'pg';

export type SyncDbSide = 'source' | 'target';

export const clientForSyncSide = (
  side: SyncDbSide,
  sourceClient: Client,
  targetClient: Client
): Client => (side === 'source' ? sourceClient : targetClient);

export const schemaNameForSide = (
  side: SyncDbSide,
  options: ILegacySyncOptions
): string => (side === 'source' ? options.source : options.target);
