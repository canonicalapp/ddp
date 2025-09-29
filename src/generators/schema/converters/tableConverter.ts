/**
 * Table Converter
 * Handles conversion from introspection data to table definitions
 */
import type {
  IColumnInfo,
  IConstraintInfo,
  IIndexInfo,
  ISequenceInfo,
  ITableInfo,
} from '@/database/introspection';
import type { ITableDefinition } from '@/types';
import { ColumnBuilder } from '../builders/columnBuilder';
import { ConstraintBuilder } from '../builders/constraintBuilder';
import { IndexBuilder } from '../builders/indexBuilder';
import { SequenceBuilder } from '../builders/sequenceBuilder';

export class TableConverter {
  private columnBuilder: ColumnBuilder;
  private constraintBuilder: ConstraintBuilder;
  private indexBuilder: IndexBuilder;
  private sequenceBuilder: SequenceBuilder;

  constructor() {
    this.columnBuilder = new ColumnBuilder();
    this.constraintBuilder = new ConstraintBuilder();
    this.indexBuilder = new IndexBuilder();
    this.sequenceBuilder = new SequenceBuilder();
  }

  /**
   * Convert introspection data to table definition
   */
  convertToTableDefinition(data: {
    table: ITableInfo;
    columns: IColumnInfo[];
    constraints: IConstraintInfo[];
    indexes: IIndexInfo[];
    sequences: ISequenceInfo[];
  }): ITableDefinition {
    return {
      name: data.table.table_name,
      schema: data.table.table_schema,
      columns: data.columns.map(
        this.columnBuilder.convertToColumnDefinition.bind(this.columnBuilder)
      ),
      constraints: data.constraints.map(
        this.constraintBuilder.convertToConstraintDefinition.bind(
          this.constraintBuilder
        )
      ),
      indexes: data.indexes.map(
        this.indexBuilder.convertToIndexDefinition.bind(this.indexBuilder)
      ),
      sequences: data.sequences.map(
        this.sequenceBuilder.convertToSequenceDefinition.bind(
          this.sequenceBuilder
        )
      ),
      comment: data.table.table_comment || undefined,
    };
  }
}
