/**
 * Constraint Operations Module
 * Handles constraints, indexes, and foreign keys sync logic
 */

export class ConstraintOperations {
  constructor(client, options) {
    this.client = client;
    this.options = options;
  }

  /**
   * Get all constraints from a schema
   */
  async getConstraints(schemaName) {
    const constraintsQuery = `
      SELECT 
        tc.table_name,
        tc.constraint_name,
        tc.constraint_type,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints tc
      LEFT JOIN information_schema.key_column_usage kcu 
        ON tc.constraint_name = kcu.constraint_name
      LEFT JOIN information_schema.constraint_column_usage ccu 
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.table_schema = $1
      ORDER BY tc.table_name, tc.constraint_name
    `;

    const result = await this.client.query(constraintsQuery, [schemaName]);
    return result.rows;
  }

  /**
   * Generate constraint operations for schema sync
   */
  async generateConstraintOperations() {
    const alterStatements = [];

    const devConstraints = await this.getConstraints(this.options.dev);
    const prodConstraints = await this.getConstraints(this.options.prod);

    // Find constraints to drop in prod (exist in prod but not in dev)
    const constraintsToDrop = prodConstraints.filter(
      p => !devConstraints.some(d => d.constraint_name === p.constraint_name)
    );

    for (const constraint of constraintsToDrop) {
      alterStatements.push(
        `-- Constraint ${constraint.constraint_name} exists in prod but not in dev`
      );
      alterStatements.push(
        `ALTER TABLE ${this.options.prod}.${constraint.table_name} DROP CONSTRAINT ${constraint.constraint_name};`
      );
    }

    // Find constraints to create in prod (exist in dev but not in prod)
    const constraintsToCreate = devConstraints.filter(
      d => !prodConstraints.some(p => p.constraint_name === d.constraint_name)
    );

    for (const constraint of constraintsToCreate) {
      alterStatements.push(
        `-- TODO: Create constraint ${constraint.constraint_name} in prod`
      );
      alterStatements.push(`-- Constraint type: ${constraint.constraint_type}`);
      if (constraint.constraint_type === 'FOREIGN KEY') {
        alterStatements.push(
          `-- Foreign key: ${constraint.column_name} -> ${constraint.foreign_table_name}.${constraint.foreign_column_name}`
        );
      }
    }

    return alterStatements;
  }
}
