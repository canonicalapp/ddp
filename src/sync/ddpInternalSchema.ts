/**
 * Schema objects owned by DDP (e.g. migration history). They must not appear in
 * state/shadow diffs or generated migrations will fight `ddp apply`.
 */

export const DDP_DIFF_IGNORE_TABLES = new Set(['ddp_migrations']);

/** SERIAL on ddp_migrations.id */
export const DDP_DIFF_IGNORE_SEQUENCES = new Set(['ddp_migrations_id_seq']);

export function isDdpDiffIgnoredTable(tableName: string): boolean {
  return DDP_DIFF_IGNORE_TABLES.has(tableName);
}

export function isDdpDiffIgnoredSequence(sequenceName: string): boolean {
  return DDP_DIFF_IGNORE_SEQUENCES.has(sequenceName);
}
