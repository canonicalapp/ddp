/**
 * Logging utility for structured logging and debugging
 */

import type { TUnknownOrAny } from '@/types';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, TUnknownOrAny> | undefined;
  error?: Error | undefined;
}

export class Logger {
  private static instance: Logger;
  private logLevel: LogLevel = LogLevel.INFO;
  private logs: LogEntry[] = [];

  private constructor() {}

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  public setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  public debug(message: string, context?: Record<string, TUnknownOrAny>): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  public info(message: string, context?: Record<string, TUnknownOrAny>): void {
    this.log(LogLevel.INFO, message, context);
  }

  public warn(message: string, context?: Record<string, TUnknownOrAny>): void {
    this.log(LogLevel.WARN, message, context);
  }

  public error(
    message: string,
    error?: Error,
    context?: Record<string, TUnknownOrAny>
  ): void {
    this.log(LogLevel.ERROR, message, context, error);
  }

  private log(
    level: LogLevel,
    message: string,
    context?: Record<string, TUnknownOrAny>,
    error?: Error
  ): void {
    if (level < this.logLevel) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context: context ?? undefined,
      error: error ?? undefined,
    };

    this.logs.push(entry);

    // Output to console based on level
    const logMessage = this.formatLogEntry(entry);

    switch (level) {
      case LogLevel.DEBUG:
        console.debug(logMessage);
        break;
      case LogLevel.INFO:
        console.info(logMessage);
        break;
      case LogLevel.WARN:
        console.warn(logMessage);
        break;
      case LogLevel.ERROR:
        console.error(logMessage);
        if (error) {
          console.error('Error details:', error);
        }
        break;
    }
  }

  private formatLogEntry(entry: LogEntry): string {
    const levelName = LogLevel[entry.level];
    const contextStr = entry.context ? ` ${JSON.stringify(entry.context)}` : '';
    return `[${entry.timestamp}] ${levelName}: ${entry.message}${contextStr}`;
  }

  public getLogs(level?: LogLevel): LogEntry[] {
    if (level !== undefined) {
      return this.logs.filter(log => log.level >= level);
    }
    return [...this.logs];
  }

  public clearLogs(): void {
    this.logs = [];
  }

  public getLogsAsString(level?: LogLevel): string {
    const logs = this.getLogs(level);
    return logs.map(entry => this.formatLogEntry(entry)).join('\n');
  }
}

// Export singleton instance
export const logger = Logger.getInstance();

// Convenience functions
export const logDebug = (
  message: string,
  context?: Record<string, TUnknownOrAny>
) => logger.debug(message, context);

export const logInfo = (
  message: string,
  context?: Record<string, TUnknownOrAny>
) => logger.info(message, context);

export const logWarn = (
  message: string,
  context?: Record<string, TUnknownOrAny>
) => logger.warn(message, context);

export const logError = (
  message: string,
  error?: Error,
  context?: Record<string, TUnknownOrAny>
) => logger.error(message, error, context);
