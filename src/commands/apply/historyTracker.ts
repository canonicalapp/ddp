/**
 * History Tracker Module
 * Manages migration history tracking in database
 */

import { basename, dirname } from 'path';
import type { Client } from 'pg';
import type { IMigrationRecord } from '@/types/apply';
import { logDebug, logError, logInfo, logWarn } from '@/utils/logger';

export class HistoryTracker {
  private readonly tableName = 'ddp_migrations';

  /**
   * Ensure the migration history table exists and is upgraded for migration_id + immutability.
   */
  async ensureHistoryTable(client: Client): Promise<void> {
    try {
      logDebug('Ensuring migration history table exists');

      const createTableQuery = `
        CREATE TABLE IF NOT EXISTS ${this.tableName} (
          id SERIAL PRIMARY KEY,
          migration_id VARCHAR(255),
          file_name VARCHAR(255) NOT NULL,
          file_path TEXT NOT NULL,
          checksum VARCHAR(64) NOT NULL,
          applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          execution_time_ms INTEGER,
          success BOOLEAN DEFAULT TRUE,
          error_message TEXT,
          applied_by VARCHAR(255),
          environment VARCHAR(50)
        )
      `;

      await client.query(createTableQuery);

      await client.query(`
        ALTER TABLE ${this.tableName}
        ADD COLUMN IF NOT EXISTS migration_id VARCHAR(255)
      `);

      await this.dropLegacyChecksumUnique(client);
      await this.backfillMigrationIds(client);
      await this.createPartialUniqueIndex(client);
      await this.createIndexes(client);
      logInfo('Migration history table ready');
    } catch (error) {
      logError('Failed to ensure migration history table', error as Error);
      throw new Error(
        `Failed to create migration history table: ${(error as Error).message}`
      );
    }
  }

  private async dropLegacyChecksumUnique(client: Client): Promise<void> {
    const candidates = [
      'ddp_migrations_checksum_key',
      'ddp_migrations_checksum_key1',
    ];
    for (const name of candidates) {
      await client.query(
        `ALTER TABLE ${this.tableName} DROP CONSTRAINT IF EXISTS ${name}`
      );
    }
  }

  private async createPartialUniqueIndex(client: Client): Promise<void> {
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_ddp_migrations_migration_success
      ON ${this.tableName} (migration_id)
      WHERE success = true
    `);
  }

  private async backfillMigrationIds(client: Client): Promise<void> {
    const res = await client.query<{ id: number; file_path: string }>(
      `SELECT id, file_path FROM ${this.tableName}
       WHERE migration_id IS NULL OR migration_id = ''`
    );

    for (const row of res.rows) {
      const migrationId = this.extractMigrationIdFromPath(row.file_path);
      const value = migrationId || `legacy_${row.id}`;
      await client.query(
        `UPDATE ${this.tableName} SET migration_id = $1 WHERE id = $2`,
        [value, row.id]
      );
    }
  }

  private extractMigrationIdFromPath(filePath: string): string | null {
    try {
      const parent = dirname(filePath);
      const id = basename(parent);
      if (/^\d{14}_[a-z0-9_]+$/.test(id)) {
        return id;
      }
    } catch {
      return null;
    }
    return null;
  }

  /**
   * Create indexes on migration history table
   */
  private async createIndexes(client: Client): Promise<void> {
    const indexes = [
      {
        name: 'idx_ddp_migrations_file_name',
        query: `CREATE INDEX IF NOT EXISTS idx_ddp_migrations_file_name ON ${this.tableName}(file_name)`,
      },
      {
        name: 'idx_ddp_migrations_applied_at',
        query: `CREATE INDEX IF NOT EXISTS idx_ddp_migrations_applied_at ON ${this.tableName}(applied_at)`,
      },
      {
        name: 'idx_ddp_migrations_migration_id',
        query: `CREATE INDEX IF NOT EXISTS idx_ddp_migrations_migration_id ON ${this.tableName}(migration_id)`,
      },
    ];

    for (const index of indexes) {
      try {
        await client.query(index.query);
        logDebug('Index created or already exists', { index: index.name });
      } catch (error) {
        logWarn('Failed to create index', {
          index: index.name,
          error: (error as Error).message,
        });
      }
    }
  }

  /**
   * Decide whether to apply, skip, or fail (immutability violation).
   */
  async getApplyDecision(
    client: Client,
    migrationId: string,
    checksum: string,
    enforceImmutability: boolean
  ): Promise<'apply' | 'skip'> {
    const query = `
      SELECT checksum
      FROM ${this.tableName}
      WHERE migration_id = $1 AND success = true
      ORDER BY applied_at DESC
      LIMIT 1
    `;

    const result = await client.query<{ checksum: string }>(query, [
      migrationId,
    ]);

    if (result.rows.length === 0) {
      return 'apply';
    }

    const appliedChecksum = result.rows[0]?.checksum;
    if (appliedChecksum === checksum) {
      logDebug('Migration already applied (same checksum)', { migrationId });
      return 'skip';
    }

    if (enforceImmutability) {
      throw new Error(
        `Migration "${migrationId}" is immutable: it was already applied with a different checksum.\n` +
          `Restore the original up.sql or add a new migration instead of editing this one.`
      );
    }

    logWarn(
      'Checksum mismatch but immutability not enforced; applying anyway',
      {
        migrationId,
      }
    );
    return 'apply';
  }

  /**
   * Record a migration in history
   */
  async recordMigration(
    client: Client,
    record: Omit<IMigrationRecord, 'id'>
  ): Promise<void> {
    try {
      logDebug('Recording migration in history', {
        migrationId: record.migration_id,
        fileName: record.file_name,
        checksum: record.checksum,
      });

      const insertQuery = `
        INSERT INTO ${this.tableName} (
          migration_id,
          file_name,
          file_path,
          checksum,
          applied_at,
          execution_time_ms,
          success,
          error_message,
          applied_by,
          environment
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `;

      const values = [
        record.migration_id,
        record.file_name,
        record.file_path,
        record.checksum,
        record.applied_at ?? new Date(),
        record.execution_time_ms ?? null,
        record.success,
        record.error_message ?? null,
        record.applied_by ?? process.env.USER ?? null,
        record.environment ?? process.env.NODE_ENV ?? null,
      ];

      await client.query(insertQuery, values);
      logInfo('Migration recorded in history', {
        migrationId: record.migration_id,
        success: record.success,
      });
    } catch (error) {
      logError('Failed to record migration in history', error as Error, {
        migrationId: record.migration_id,
      });

      if (
        error instanceof Error &&
        error.message.includes('duplicate key value') &&
        error.message.includes('uq_ddp_migrations_migration_success')
      ) {
        throw new Error(
          `Migration already recorded as successful: ${record.migration_id}`
        );
      }

      throw new Error(
        `Failed to record migration: ${(error as Error).message}`
      );
    }
  }

  /**
   * Get all applied migrations
   */
  async getAppliedMigrations(client: Client): Promise<IMigrationRecord[]> {
    try {
      const query = `
        SELECT 
          id,
          migration_id,
          file_name,
          file_path,
          checksum,
          applied_at,
          execution_time_ms,
          success,
          error_message,
          applied_by,
          environment
        FROM ${this.tableName}
        ORDER BY applied_at DESC
      `;

      const result = await client.query(query);
      const migrations: IMigrationRecord[] = result.rows.map(row => ({
        id: row.id,
        migration_id: row.migration_id ?? '',
        file_name: row.file_name,
        file_path: row.file_path,
        checksum: row.checksum,
        applied_at: row.applied_at,
        execution_time_ms: row.execution_time_ms,
        success: row.success,
        error_message: row.error_message,
        applied_by: row.applied_by,
        environment: row.environment,
      }));

      logDebug('Retrieved applied migrations', {
        count: migrations.length,
      });

      return migrations;
    } catch (error) {
      logError('Failed to get applied migrations', error as Error);
      if (error instanceof Error && error.message.includes('does not exist')) {
        return [];
      }
      throw error;
    }
  }

  /**
   * Get migration status for a specific migration id
   */
  async getMigrationStatus(
    client: Client,
    migrationId: string
  ): Promise<IMigrationRecord | null> {
    try {
      const query = `
        SELECT 
          id,
          migration_id,
          file_name,
          file_path,
          checksum,
          applied_at,
          execution_time_ms,
          success,
          error_message,
          applied_by,
          environment
        FROM ${this.tableName}
        WHERE migration_id = $1
        ORDER BY applied_at DESC
        LIMIT 1
      `;

      const result = await client.query(query, [migrationId]);

      if (result.rows.length === 0) {
        logDebug('Migration not found in history', { migrationId });
        return null;
      }

      const row = result.rows[0];
      const migration: IMigrationRecord = {
        id: row.id,
        migration_id: row.migration_id ?? '',
        file_name: row.file_name,
        file_path: row.file_path,
        checksum: row.checksum,
        applied_at: row.applied_at,
        execution_time_ms: row.execution_time_ms,
        success: row.success,
        error_message: row.error_message,
        applied_by: row.applied_by,
        environment: row.environment,
      };

      logDebug('Retrieved migration status', {
        migrationId,
        success: migration.success,
        appliedAt: migration.applied_at,
      });

      return migration;
    } catch (error) {
      logError('Failed to get migration status', error as Error, {
        migrationId,
      });
      if (error instanceof Error && error.message.includes('does not exist')) {
        return null;
      }
      throw error;
    }
  }
}
