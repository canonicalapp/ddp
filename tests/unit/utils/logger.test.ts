/**
 * Unit tests for logger utility
 */

import {
  Logger,
  LogLevel,
  logDebug,
  logInfo,
  logWarn,
  logError,
} from '@/utils/logger';

// Mock console methods
const originalConsole = {
  debug: console.debug,
  info: console.info,
  warn: console.warn,
  error: console.error,
};

describe('Logger', () => {
  let logger: Logger;
  let consoleSpy: {
    debug: jest.SpyInstance;
    info: jest.SpyInstance;
    warn: jest.SpyInstance;
    error: jest.SpyInstance;
  };

  beforeEach(() => {
    logger = Logger.getInstance();
    logger.clearLogs();
    logger.setLogLevel(LogLevel.DEBUG);

    consoleSpy = {
      debug: jest.spyOn(console, 'debug').mockImplementation(),
      info: jest.spyOn(console, 'info').mockImplementation(),
      warn: jest.spyOn(console, 'warn').mockImplementation(),
      error: jest.spyOn(console, 'error').mockImplementation(),
    };
  });

  afterEach(() => {
    Object.values(consoleSpy).forEach(spy => spy.mockRestore());
  });

  afterAll(() => {
    // Restore original console methods
    Object.assign(console, originalConsole);
  });

  describe('Log Levels', () => {
    it('should log debug messages when level is DEBUG', () => {
      logger.setLogLevel(LogLevel.DEBUG);
      logger.debug('Debug message');

      expect(consoleSpy.debug).toHaveBeenCalledWith(
        expect.stringContaining('DEBUG: Debug message')
      );
    });

    it('should not log debug messages when level is INFO', () => {
      logger.setLogLevel(LogLevel.INFO);
      logger.debug('Debug message');

      expect(consoleSpy.debug).not.toHaveBeenCalled();
    });

    it('should log info messages when level is INFO', () => {
      logger.setLogLevel(LogLevel.INFO);
      logger.info('Info message');

      expect(consoleSpy.info).toHaveBeenCalledWith(
        expect.stringContaining('INFO: Info message')
      );
    });

    it('should not log info messages when level is WARN', () => {
      logger.setLogLevel(LogLevel.WARN);
      logger.info('Info message');

      expect(consoleSpy.info).not.toHaveBeenCalled();
    });

    it('should log warn messages when level is WARN', () => {
      logger.setLogLevel(LogLevel.WARN);
      logger.warn('Warning message');

      expect(consoleSpy.warn).toHaveBeenCalledWith(
        expect.stringContaining('WARN: Warning message')
      );
    });

    it('should not log warn messages when level is ERROR', () => {
      logger.setLogLevel(LogLevel.ERROR);
      logger.warn('Warning message');

      expect(consoleSpy.warn).not.toHaveBeenCalled();
    });

    it('should log error messages when level is ERROR', () => {
      logger.setLogLevel(LogLevel.ERROR);
      logger.error('Error message');

      expect(consoleSpy.error).toHaveBeenCalledWith(
        expect.stringContaining('ERROR: Error message')
      );
    });
  });

  describe('Context and Error Handling', () => {
    it('should include context in log messages', () => {
      logger.info('Test message', { key: 'value', number: 123 });

      expect(consoleSpy.info).toHaveBeenCalledWith(
        expect.stringContaining('{"key":"value","number":123}')
      );
    });

    it('should include error details in error messages', () => {
      const error = new Error('Test error');
      logger.error('Error occurred', error, { context: 'test' });

      expect(consoleSpy.error).toHaveBeenCalledWith(
        expect.stringContaining('ERROR: Error occurred')
      );
      expect(consoleSpy.error).toHaveBeenCalledWith('Error details:', error);
    });

    it('should handle error without context', () => {
      const error = new Error('Test error');
      logger.error('Error occurred', error);

      expect(consoleSpy.error).toHaveBeenCalledWith(
        expect.stringContaining('ERROR: Error occurred')
      );
    });
  });

  describe('Log Storage', () => {
    it('should store logs internally', () => {
      logger.info('Test message', { key: 'value' });

      const logs = logger.getLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].message).toBe('Test message');
      expect(logs[0].context).toEqual({ key: 'value' });
      expect(logs[0].level).toBe(LogLevel.INFO);
    });

    it('should filter logs by level', () => {
      logger.debug('Debug message');
      logger.info('Info message');
      logger.warn('Warning message');
      logger.error('Error message');

      const infoLogs = logger.getLogs(LogLevel.INFO);
      expect(infoLogs).toHaveLength(3); // INFO, WARN, ERROR

      const errorLogs = logger.getLogs(LogLevel.ERROR);
      expect(errorLogs).toHaveLength(1); // Only ERROR
    });

    it('should clear logs', () => {
      logger.info('Test message');
      expect(logger.getLogs()).toHaveLength(1);

      logger.clearLogs();
      expect(logger.getLogs()).toHaveLength(0);
    });

    it('should return logs as string', () => {
      logger.info('Test message', { key: 'value' });

      const logString = logger.getLogsAsString();
      expect(logString).toContain('INFO: Test message');
      expect(logString).toContain('{"key":"value"}');
    });
  });

  describe('Convenience Functions', () => {
    it('should work with convenience functions', () => {
      logDebug('Debug message', { debug: true });
      logInfo('Info message', { info: true });
      logWarn('Warning message', { warn: true });
      logError('Error message', new Error('Test'), { error: true });

      expect(consoleSpy.debug).toHaveBeenCalled();
      expect(consoleSpy.info).toHaveBeenCalled();
      expect(consoleSpy.warn).toHaveBeenCalled();
      expect(consoleSpy.error).toHaveBeenCalled();
    });
  });

  describe('Timestamp Format', () => {
    it('should include ISO timestamp in log entries', () => {
      logger.info('Test message');

      const logs = logger.getLogs();
      expect(logs[0].timestamp).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
      );
    });
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const logger1 = Logger.getInstance();
      const logger2 = Logger.getInstance();

      expect(logger1).toBe(logger2);
    });
  });
});
