/**
 * Sequence Operations Module
 * Handles sequence-related operations for schema sync
 */

import type { ILegacySyncOptions, TArray, TNullable } from '@/types';
import { isDdpDiffIgnoredSequence } from '@/sync/ddpInternalSchema';
import {
  type SyncDbSide,
  clientForSyncSide,
  schemaNameForSide,
} from '@/sync/syncClient';
import type { Client } from 'pg';

interface ISequenceRow {
  sequence_name: string;
  data_type: string;
  start_value: TNullable<number>;
  minimum_value: TNullable<number>;
  maximum_value: TNullable<number>;
  increment: TNullable<number>;
  cycle_option: string;
}

export class SequenceOperations {
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

  /**
   * Get all sequences from a schema on the given database.
   */
  async getSequences(side: SyncDbSide): Promise<TArray<ISequenceRow>> {
    const sequencesQuery = `
      SELECT 
        sequence_name,
        data_type,
        start_value,
        minimum_value,
        maximum_value,
        increment,
        cycle_option
      FROM information_schema.sequences 
      WHERE sequence_schema = $1
      ORDER BY sequence_name
    `;

    const schemaName = schemaNameForSide(side, this.options);
    const client = clientForSyncSide(
      side,
      this.sourceClient,
      this.targetClient
    );
    const result = await client.query(sequencesQuery, [schemaName]);

    return result.rows;
  }

  /**
   * Generate CREATE SEQUENCE statement
   */
  generateCreateSequenceStatement(
    sequence: ISequenceRow,
    targetSchema: string
  ) {
    let createStatement = `CREATE SEQUENCE IF NOT EXISTS ${targetSchema}.${sequence.sequence_name}`;

    if (sequence.data_type) {
      createStatement += ` AS ${sequence.data_type}`;
    }

    if (sequence.increment) {
      createStatement += ` INCREMENT BY ${sequence.increment}`;
    }

    if (sequence.minimum_value) {
      createStatement += ` MINVALUE ${sequence.minimum_value}`;
    }

    if (sequence.maximum_value) {
      createStatement += ` MAXVALUE ${sequence.maximum_value}`;
    }

    if (sequence.start_value) {
      createStatement += ` START WITH ${sequence.start_value}`;
    }

    // Note: cache_size is not available in information_schema.sequences
    // Default cache size will be used by PostgreSQL

    if (sequence.cycle_option === 'YES') {
      createStatement += ` CYCLE`;
    } else {
      createStatement += ` NO CYCLE`;
    }

    return `${createStatement};`;
  }

  /**
   * Generate sequence operations for schema sync
   */
  async generateSequenceOperations() {
    const alterStatements: string[] = [];

    const sourceSequences = await this.getSequences('source');
    const targetSequences = await this.getSequences('target');

    // Find missing sequences in target (sequences in source but not in target)
    const missingSequences = sourceSequences.filter(
      sourceSeq =>
        !isDdpDiffIgnoredSequence(sourceSeq.sequence_name) &&
        !targetSequences.some(
          targetSeq => targetSeq.sequence_name === sourceSeq.sequence_name
        )
    );

    // Find sequences to drop in target (sequences in target but not in source)
    const sequencesToDrop = targetSequences.filter(
      targetSeq =>
        !isDdpDiffIgnoredSequence(targetSeq.sequence_name) &&
        !sourceSequences.some(
          sourceSeq => sourceSeq.sequence_name === targetSeq.sequence_name
        )
    );

    // Handle missing sequences
    for (const sequence of missingSequences) {
      alterStatements.push(
        `-- Create missing sequence ${sequence.sequence_name}`
      );
      const createStatement = this.generateCreateSequenceStatement(
        sequence,
        this.options.target
      );
      alterStatements.push(createStatement);
    }

    // Handle sequences to drop
    for (const sequence of sequencesToDrop) {
      alterStatements.push(
        `-- Sequence ${sequence.sequence_name} exists in ${this.options.target} but not in ${this.options.source}`
      );
      alterStatements.push(
        `-- TODO: Manually drop sequence ${this.options.target}.${sequence.sequence_name} after confirming it's no longer needed`
      );
    }

    return alterStatements;
  }
}
