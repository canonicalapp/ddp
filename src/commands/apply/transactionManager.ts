/**
 * Transaction Manager Module
 * Handles transaction wrapping and rollback
 */

import type { Client } from 'pg';
import type { ITransactionOptions } from '@/types/apply';
import { logDebug, logError, logInfo, logWarn } from '@/utils/logger';

export class TransactionManager {
  /**
   * Execute operations with transaction management
   */
  async executeInTransaction(
    client: Client,
    options: ITransactionOptions
  ): Promise<void> {
    const { operations, mode } = options;

    logDebug('Executing with transaction mode', { mode });

    switch (mode) {
      case 'all-or-nothing':
        return this.executeAllOrNothing(client, operations);

      case 'per-file':
        return this.executePerFile(client, operations);

      case 'none':
        return this.executeWithoutTransaction(client, operations);

      default:
        logWarn('Unknown transaction mode, using per-file', { mode });
        return this.executePerFile(client, operations);
    }
  }

  /**
   * Execute all operations in a single transaction
   * If any operation fails, rollback everything
   */
  private async executeAllOrNothing(
    client: Client,
    operations: () => Promise<void>
  ): Promise<void> {
    logInfo('Starting all-or-nothing transaction');

    try {
      await this.beginTransaction(client);
      logDebug('Transaction begun');

      await operations();

      await this.commitTransaction(client);
      logInfo('Transaction committed successfully');
    } catch (error) {
      logError('Transaction failed, rolling back', error as Error);
      await this.rollbackTransaction(client);
      throw error;
    }
  }

  /**
   * Execute operations without transaction wrapping
   * Each operation executes independently
   */
  private async executePerFile(
    client: Client,
    operations: () => Promise<void>
  ): Promise<void> {
    logInfo('Starting per-file transaction');

    try {
      await this.beginTransaction(client);
      logDebug('Transaction begun');

      await operations();

      await this.commitTransaction(client);
      logInfo('Transaction committed successfully');
    } catch (error) {
      logError('Transaction failed, rolling back', error as Error);
      await this.rollbackTransaction(client);
      throw error;
    }
  }

  /**
   * Execute operations without any transaction
   * No rollback capability
   */
  private async executeWithoutTransaction(
    client: Client,
    operations: () => Promise<void>
  ): Promise<void> {
    logWarn('Executing without transaction (no rollback capability)');

    await operations();
  }

  /**
   * Begin a transaction
   */
  private async beginTransaction(client: Client): Promise<void> {
    try {
      await client.query('BEGIN');
      logDebug('BEGIN transaction executed');
    } catch (error) {
      logError('Failed to begin transaction', error as Error);
      throw new Error(
        `Failed to begin transaction: ${(error as Error).message}`
      );
    }
  }

  /**
   * Commit a transaction
   */
  private async commitTransaction(client: Client): Promise<void> {
    try {
      await client.query('COMMIT');
      logDebug('COMMIT transaction executed');
    } catch (error) {
      logError('Failed to commit transaction', error as Error);
      throw new Error(
        `Failed to commit transaction: ${(error as Error).message}`
      );
    }
  }

  /**
   * Rollback a transaction
   */
  private async rollbackTransaction(client: Client): Promise<void> {
    try {
      await client.query('ROLLBACK');
      logDebug('ROLLBACK transaction executed');
    } catch (error) {
      logError('Failed to rollback transaction', error as Error);
      // Don't throw here - we're already in error state
      logWarn('Transaction rollback failed, but continuing', {
        error: (error as Error).message,
      });
    }
  }
}
