/**
 * Unit tests for database connection functionality
 */

import { buildConnectionString } from '@/database/connection';
import type { IDatabaseConnection } from '@/types/database';

describe('Database Connection', () => {
  describe('buildConnectionString', () => {
    it('should build a valid PostgreSQL connection string', () => {
      const config: IDatabaseConnection = {
        host: 'localhost',
        port: 5432,
        database: 'testdb',
        username: 'testuser',
        password: 'testpass',
        schema: 'public',
      };

      const result = buildConnectionString(config);
      expect(result).toBe(
        'postgresql://testuser:testpass@localhost:5432/testdb'
      );
    });

    it('should handle special characters in credentials', () => {
      const config: IDatabaseConnection = {
        host: 'localhost',
        port: 5432,
        database: 'test@db',
        username: 'user@domain',
        password: 'pass@word',
        schema: 'public',
      };

      const result = buildConnectionString(config);
      expect(result).toBe(
        'postgresql://user%40domain:pass%40word@localhost:5432/test%40db'
      );
    });

    it('should handle different ports', () => {
      const config: IDatabaseConnection = {
        host: 'localhost',
        port: 5433,
        database: 'testdb',
        username: 'testuser',
        password: 'testpass',
        schema: 'public',
      };

      const result = buildConnectionString(config);
      expect(result).toBe(
        'postgresql://testuser:testpass@localhost:5433/testdb'
      );
    });

    it('should handle different hosts', () => {
      const config: IDatabaseConnection = {
        host: '192.168.1.100',
        port: 5432,
        database: 'testdb',
        username: 'testuser',
        password: 'testpass',
        schema: 'public',
      };

      const result = buildConnectionString(config);
      expect(result).toBe(
        'postgresql://testuser:testpass@192.168.1.100:5432/testdb'
      );
    });

    it('should handle empty password', () => {
      const config: IDatabaseConnection = {
        host: 'localhost',
        port: 5432,
        database: 'testdb',
        username: 'testuser',
        password: '',
        schema: 'public',
      };

      const result = buildConnectionString(config);
      expect(result).toBe('postgresql://testuser:@localhost:5432/testdb');
    });

    it('should handle complex passwords with special characters', () => {
      const config: IDatabaseConnection = {
        host: 'localhost',
        port: 5432,
        database: 'testdb',
        username: 'testuser',
        password: 'p@ssw0rd!@#$%^&*()',
        schema: 'public',
      };

      const result = buildConnectionString(config);
      expect(result).toBe(
        'postgresql://testuser:p%40ssw0rd!%40%23%24%25%5E%26*()@localhost:5432/testdb'
      );
    });
  });

  describe('connection string edge cases', () => {
    it('should handle very long database names', () => {
      const config: IDatabaseConnection = {
        host: 'localhost',
        port: 5432,
        database: 'a'.repeat(100),
        username: 'testuser',
        password: 'testpass',
        schema: 'public',
      };

      const result = buildConnectionString(config);
      expect(result).toContain(
        'postgresql://testuser:testpass@localhost:5432/'
      );
      expect(result).toContain('a'.repeat(100));
    });

    it('should handle unicode characters in credentials', () => {
      const config: IDatabaseConnection = {
        host: 'localhost',
        port: 5432,
        database: 'tëstdb',
        username: 'tëstuser',
        password: 'tëstpass',
        schema: 'public',
      };

      const result = buildConnectionString(config);
      expect(result).toBe(
        'postgresql://t%C3%ABstuser:t%C3%ABstpass@localhost:5432/t%C3%ABstdb'
      );
    });

    it('should handle numeric database names', () => {
      const config: IDatabaseConnection = {
        host: 'localhost',
        port: 5432,
        database: '12345',
        username: 'testuser',
        password: 'testpass',
        schema: 'public',
      };

      const result = buildConnectionString(config);
      expect(result).toBe(
        'postgresql://testuser:testpass@localhost:5432/12345'
      );
    });
  });
});
