/**
 * SQL Executor Module
 * Handles SQL statement execution with error handling
 */

import type { Client } from 'pg';
import type { IExecutionOptions, IExecutionResult } from '@/types/apply';
import { logDebug, logError, logInfo, logWarn } from '@/utils/logger';
import { splitSqlStatements } from '@/utils/splitSqlStatements';

export class SQLExecutor {
  /**
   * Execute SQL content against database
   */
  async execute(
    client: Client,
    options: IExecutionOptions
  ): Promise<IExecutionResult> {
    const startTime = Date.now();
    const fileName = options.fileName;
    const sql = options.sql.trim();

    logInfo('Executing SQL file', {
      fileName,
      transactionMode: options.transactionMode,
    });

    // If SQL is empty, skip execution
    if (!sql || sql.length === 0) {
      logWarn('Empty SQL file, skipping execution', { fileName });
      return {
        success: true,
        fileName,
        statementsExecuted: 0,
        executionTime: Date.now() - startTime,
      };
    }

    try {
      const statements = splitSqlStatements(sql);
      logDebug('SQL statements split', {
        fileName,
        statementCount: statements.length,
      });

      let executedCount = 0;
      let lastError: Error | undefined;

      // Execute each statement
      for (let i = 0; i < statements.length; i++) {
        const statement = statements[i]?.trim();

        // Skip if statement is undefined or empty
        if (!statement || statement.length === 0) {
          continue;
        }

        // Skip empty statements
        if (!statement || statement.length === 0) {
          continue;
        }

        try {
          logDebug('Executing statement', {
            fileName,
            statementIndex: i + 1,
            statementPreview: statement.substring(0, 100),
          });

          await this.executeStatement(client, statement);
          executedCount++;

          logDebug('Statement executed successfully', {
            fileName,
            statementIndex: i + 1,
          });
        } catch (error) {
          lastError = error as Error;
          logError('Statement execution failed', error as Error, {
            fileName,
            statementIndex: i + 1,
            statement: statement.substring(0, 200),
          });

          // If continueOnError is false, stop execution
          if (!options.continueOnError) {
            throw error;
          }

          // If continueOnError is true, log warning and continue
          logWarn('Continuing execution despite error', {
            fileName,
            statementIndex: i + 1,
            error: (error as Error).message,
          });
        }
      }

      const executionTime = Date.now() - startTime;

      if (lastError && !options.continueOnError) {
        throw lastError;
      }

      const result: IExecutionResult = {
        success: !lastError,
        fileName,
        statementsExecuted: executedCount,
        executionTime,
        ...(lastError && { error: lastError, errorMessage: lastError.message }),
      };

      if (result.success) {
        logInfo('SQL file executed successfully', {
          fileName,
          statementsExecuted: executedCount,
          executionTime,
        });
      } else {
        logWarn('SQL file executed with errors', {
          fileName,
          statementsExecuted: executedCount,
          executionTime,
          error: lastError?.message,
        });
      }

      return result;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      logError('SQL file execution failed', error as Error, {
        fileName,
        executionTime,
      });

      return {
        success: false,
        fileName,
        statementsExecuted: 0,
        executionTime,
        error: error as Error,
        errorMessage: (error as Error).message,
      };
    }
  }

  /**
   * Execute a single SQL statement
   */
  private async executeStatement(
    client: Client,
    statement: string
  ): Promise<void> {
    // Validate statement is not empty
    if (!statement || statement.trim().length === 0) {
      return;
    }

    // Execute the statement
    await client.query(statement);
  }
}
