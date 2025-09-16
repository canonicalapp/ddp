/**
 * Utility functions for schema sync operations
 */

interface ColumnInfo {
  column_name: string;
  data_type: string;
  character_maximum_length?: number;
  is_nullable: 'YES' | 'NO';
  column_default?: string;
}

export class Utils {
  /**
   * Generate a timestamp string suitable for file/object naming
   * @returns {string} Timestamp in format: 2024-01-15T10-30-45-123Z
   */
  static generateTimestamp(): string {
    return new Date().toISOString().replace(/[:.]/g, '-');
  }

  /**
   * Generate a backup name with timestamp for data preservation
   * @param {string} originalName - The original name to backup
   * @param {string} suffix - Optional suffix (default: 'dropped')
   * @returns {string} Backup name with timestamp
   */
  static generateBackupName(
    originalName: string,
    suffix: string = 'dropped'
  ): string {
    const timestamp = this.generateTimestamp();
    return `${originalName}_${suffix}_${timestamp}`;
  }

  /**
   * Generate output filename with timestamp
   * @param {string} devSchema - Development schema name
   * @param {string} prodSchema - Production schema name
   * @param {string} prefix - Optional prefix (default: 'schema-sync')
   * @returns {string} Generated filename
   */
  static generateOutputFilename(
    devSchema: string,
    prodSchema: string,
    prefix: string = 'schema-sync'
  ): string {
    const timestamp = this.generateTimestamp().slice(0, 19);
    return `${prefix}_${devSchema}-to-${prodSchema}_${timestamp}.sql`;
  }

  /**
   * Format column definition for SQL generation
   * @param {ColumnInfo} column - Column object with properties
   * @returns {string} Formatted column definition
   */
  static formatColumnDefinition(column: ColumnInfo): string {
    let def = `"${column.column_name}" ${column.data_type}`;

    if (column.character_maximum_length) {
      def += `(${column.character_maximum_length})`;
    }

    if (column.is_nullable === 'NO') {
      def += ' NOT NULL';
    }

    if (column.column_default) {
      def += ` DEFAULT ${column.column_default}`;
    }

    return def;
  }

  /**
   * Format data type with length specification
   * @param {ColumnInfo} column - Column object
   * @returns {string} Formatted data type
   */
  static formatDataType(column: ColumnInfo): string {
    if (column.character_maximum_length) {
      return `${column.data_type}(${column.character_maximum_length})`;
    }
    return column.data_type;
  }

  /**
   * Generate comment for manual review items
   * @param {string} type - Type of item (table, column, function, etc.)
   * @param {string} name - Name of the item
   * @param {string} reason - Reason for manual review
   * @returns {string} Formatted comment
   */
  static generateManualReviewComment(
    type: string,
    name: string,
    reason: string
  ): string {
    return `-- TODO: Manual review required for ${type} ${name} - ${reason}`;
  }

  /**
   * Generate section header for script output
   * @param {string} title - Section title
   * @returns {Array<string>} Array of header lines
   */
  static generateSectionHeader(title: string): string[] {
    return [
      '-- ===========================================',
      `-- ${title.toUpperCase()}`,
      '-- ===========================================',
    ];
  }

  /**
   * Generate script footer
   * @returns {Array<string>} Array of footer lines
   */
  static generateScriptFooter(): string[] {
    return [
      '',
      '-- ===========================================',
      '-- END OF SCHEMA SYNC SCRIPT',
      '-- ===========================================',
    ];
  }
}
