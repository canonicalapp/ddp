/**
 * Extension operations — database-wide CREATE EXTENSION drift (not per-function).
 */

import type { ILegacySyncOptions } from '@/types';
import {
  type SyncDbSide,
  clientForSyncSide,
} from '@/sync/syncClient';
import type { Client } from 'pg';

interface IExtensionRow {
  extname: string;
}

const EXTENSIONS_QUERY = `
  SELECT extname
  FROM pg_extension
  ORDER BY extname
`;

export class ExtensionOperations {
  private sourceClient: Client;
  private targetClient: Client;
  private options: ILegacySyncOptions;

  constructor(
    sourceClient: Client,
    targetClient: Client,
    options: ILegacySyncOptions
  ) {
    this.sourceClient = sourceClient;
    this.targetClient = targetClient;
    this.options = options;
  }

  async getExtensions(side: SyncDbSide): Promise<IExtensionRow[]> {
    const client = clientForSyncSide(
      side,
      this.sourceClient,
      this.targetClient
    );
    const result = await client.query<IExtensionRow>(EXTENSIONS_QUERY);
    return result.rows;
  }

  /**
   * Emit CREATE EXTENSION for names present after state apply (source) but missing on target.
   * Never DROP extensions or their member functions — use state + prune for removal.
   */
  async generateExtensionOperations(): Promise<string[]> {
    const alterStatements: string[] = [];
    const [sourceExtensions, targetExtensions] = await Promise.all([
      this.getExtensions('source'),
      this.getExtensions('target'),
    ]);

    const targetNames = new Set(targetExtensions.map(e => e.extname));
    const toCreate = sourceExtensions.filter(e => !targetNames.has(e.extname));

    for (const ext of toCreate) {
      alterStatements.push(
        `-- Extension ${ext.extname} is required by ${this.options.source} (state) but not installed on ${this.options.target}`
      );
      alterStatements.push(
        `CREATE EXTENSION IF NOT EXISTS ${ext.extname};`
      );
      alterStatements.push('');
    }

    return alterStatements;
  }
}
