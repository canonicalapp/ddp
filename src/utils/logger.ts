/**
 * Logging utility for structured logging and debugging.
 * Terminal output is rendered via consola (leveled, tagged, colored);
 * entries are also kept in memory for programmatic inspection.
 */

import { createConsola } from 'consola';
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

// Our own LogLevel check in `log()` below is the single source of truth for
// filtering, so consola's own level must never additionally suppress a call
// we've already decided to allow through (consola's default level hides
// `.debug()`/`.trace()` regardless of what we pass it).
const consola = createConsola({
  level: Number.POSITIVE_INFINITY,
  formatOptions: {
    date: false,
  },
}).withTag('ddp');

export class Logger {
  private static instance: Logger | undefined;
  private logLevel: LogLevel = LogLevel.INFO;
  private logs: LogEntry[] = [];

  private constructor() {}

  public static getInstance(): Logger {
    Logger.instance ??= new Logger();
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

    const logFn = {
      [LogLevel.DEBUG]: consola.debug,
      [LogLevel.INFO]: consola.info,
      [LogLevel.WARN]: consola.warn,
      [LogLevel.ERROR]: consola.error,
    }[level].bind(consola);

    if (context) {
      logFn(message, context);
    } else {
      logFn(message);
    }
    if (level === LogLevel.ERROR && error) {
      consola.error(error);
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
