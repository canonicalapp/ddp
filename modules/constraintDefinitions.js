/**
 * Constraint Definitions Module
 * Handles constraint definition, comparison, and generation logic
 */

export class ConstraintDefinitions {
  constructor(client, options) {
    this.client = client;
    this.options = options;
  }

  /**
   * Get detailed constraint definition from dev schema
   */
  async getConstraintDefinition(schemaName, constraintName, tableName) {
    try {
      const constraintDefQuery = `
        SELECT 
          tc.table_name,
          tc.constraint_name,
          tc.constraint_type,
          kcu.column_name,
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name,
          rc.update_rule,
          rc.delete_rule
        FROM information_schema.table_constraints tc
        LEFT JOIN information_schema.key_column_usage kcu 
          ON tc.constraint_name = kcu.constraint_name
        LEFT JOIN information_schema.constraint_column_usage ccu 
          ON ccu.constraint_name = tc.constraint_name
        LEFT JOIN information_schema.referential_constraints rc
          ON tc.constraint_name = rc.constraint_name
        WHERE tc.table_schema = $1 
        AND tc.constraint_name = $2
        AND tc.table_name = $3
        ORDER BY kcu.ordinal_position
      `;

      const result = await this.client.query(constraintDefQuery, [
        schemaName,
        constraintName,
        tableName,
      ]);
      return result.rows;
    } catch (error) {
      console.warn(
        `Failed to get definition for constraint ${constraintName}:`,
        error.message
      );
      return null;
    }
  }

  /**
   * Generate constraint type specific clause
   */
  generateConstraintClause({
    constraintType,
    columns,
    foreignTableName,
    foreignColumnName,
    updateRule,
    deleteRule,
    targetSchema,
  }) {
    switch (constraintType) {
      case 'PRIMARY KEY':
        return ` PRIMARY KEY (${columns})`;

      case 'UNIQUE':
        return ` UNIQUE (${columns})`;

      case 'FOREIGN KEY': {
        let clause = ` FOREIGN KEY (${columns}) REFERENCES ${targetSchema}.${foreignTableName}(${foreignColumnName})`;
        if (updateRule && updateRule !== 'NO ACTION') {
          clause += ` ON UPDATE ${updateRule}`;
        }
        if (deleteRule && deleteRule !== 'NO ACTION') {
          clause += ` ON DELETE ${deleteRule}`;
        }
        return clause;
      }

      case 'CHECK':
        return ` CHECK (/* TODO: Add check condition */)`;

      default:
        return ` /* TODO: Unsupported constraint type: ${constraintType} */`;
    }
  }

  /**
   * Compare two constraint definitions to detect changes
   */
  compareConstraintDefinitions(devConstraint, prodConstraint) {
    if (!devConstraint || !prodConstraint) {
      return false;
    }

    // Compare key properties that define constraint behavior
    const devProps = {
      constraint_type: devConstraint.constraint_type,
      column_name: devConstraint.column_name,
      foreign_table_name: devConstraint.foreign_table_name,
      foreign_column_name: devConstraint.foreign_column_name,
      update_rule: devConstraint.update_rule,
      delete_rule: devConstraint.delete_rule,
    };

    const prodProps = {
      constraint_type: prodConstraint.constraint_type,
      column_name: prodConstraint.column_name,
      foreign_table_name: prodConstraint.foreign_table_name,
      foreign_column_name: prodConstraint.foreign_column_name,
      update_rule: prodConstraint.update_rule,
      delete_rule: prodConstraint.delete_rule,
    };

    // Compare each property
    for (const [key, devValue] of Object.entries(devProps)) {
      const prodValue = prodProps[key];
      if (devValue !== prodValue) {
        return true; // Found a difference
      }
    }

    return false; // No differences found
  }

  /**
   * Generate CREATE CONSTRAINT statement
   */
  generateCreateConstraintStatement(constraintRows, targetSchema) {
    if (!constraintRows || constraintRows.length === 0) {
      return `-- TODO: Could not retrieve definition for constraint`;
    }

    const firstRow = constraintRows[0];
    const {
      table_name,
      constraint_name,
      constraint_type,
      foreign_table_name,
      foreign_column_name,
      update_rule,
      delete_rule,
    } = firstRow;

    // Get all columns for multi-column constraints
    const columns = constraintRows
      .map(row => row.column_name)
      .filter(Boolean)
      .join(', ');

    const baseStatement = `ALTER TABLE ${targetSchema}.${table_name} ADD CONSTRAINT ${constraint_name}`;
    const constraintClause = this.generateConstraintClause({
      constraintType: constraint_type,
      columns,
      foreignTableName: foreign_table_name,
      foreignColumnName: foreign_column_name,
      updateRule: update_rule,
      deleteRule: delete_rule,
      targetSchema,
    });

    return `${baseStatement}${constraintClause};`;
  }
}
