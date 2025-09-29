/**
 * Sequence Builder
 * Handles sequence generation and SQL creation
 */

import type { ISequenceDefinition } from '@/types';
import type { ISequenceInfo } from '@/database/introspection';

export class SequenceBuilder {
  /**
   * Convert introspection sequence data to sequence definition
   */
  convertToSequenceDefinition(sequence: ISequenceInfo): ISequenceDefinition {
    return {
      name: sequence.sequence_name,
      schema: sequence.sequence_schema,
      dataType: sequence.data_type,
      startValue: sequence.start_value,
      minimumValue: sequence.minimum_value,
      maximumValue: sequence.maximum_value,
      increment: sequence.increment,
      cycleOption: sequence.cycle_option,
      comment: sequence.sequence_comment || undefined,
    };
  }

  /**
   * Generate sequence SQL
   */
  generateSequenceSQL(sequence: ISequenceDefinition): string {
    let sql = `CREATE SEQUENCE ${this.escapeIdentifier(sequence.schema)}.${this.escapeIdentifier(sequence.name)}`;

    // Add data type if not default
    if (sequence.dataType && sequence.dataType !== 'bigint') {
      sql += ` AS ${sequence.dataType}`;
    }

    // Add start value if not default
    if (sequence.startValue && sequence.startValue !== '1') {
      sql += ` START WITH ${sequence.startValue}`;
    }

    // Add increment if not default
    if (sequence.increment && sequence.increment !== '1') {
      sql += ` INCREMENT BY ${sequence.increment}`;
    }

    // Add min/max values if not defaults
    if (sequence.minimumValue && sequence.minimumValue !== '1') {
      sql += ` MINVALUE ${sequence.minimumValue}`;
    }

    if (
      sequence.maximumValue &&
      sequence.maximumValue !== '9223372036854775807'
    ) {
      sql += ` MAXVALUE ${sequence.maximumValue}`;
    }

    // Add cycle option if not default
    if (sequence.cycleOption === 'YES') {
      sql += ` CYCLE`;
    }

    sql += ';';

    return sql;
  }

  /**
   * Escape identifier for SQL
   */
  private escapeIdentifier(identifier: string): string {
    return `"${identifier.replace(/"/g, '""')}"`;
  }
}
