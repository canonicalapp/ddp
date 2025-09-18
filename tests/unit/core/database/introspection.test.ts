/**
 * Unit tests for database introspection service
 */

import { IntrospectionService } from '@/database/introspection';

describe('Database Introspection', () => {
  describe('IntrospectionService', () => {
    it('should be importable', () => {
      expect(IntrospectionService).toBeDefined();
      expect(typeof IntrospectionService).toBe('function');
    });

    it('should be instantiable with default schema', () => {
      // Mock client object
      const mockClient = {
        query: () => Promise.resolve({ rows: [] }),
      };

      const service = new IntrospectionService(mockClient as any);
      expect(service).toBeInstanceOf(IntrospectionService);
    });

    it('should be instantiable with custom schema', () => {
      // Mock client object
      const mockClient = {
        query: () => Promise.resolve({ rows: [] }),
      };

      const service = new IntrospectionService(
        mockClient as any,
        'custom_schema'
      );
      expect(service).toBeInstanceOf(IntrospectionService);
    });
  });

  describe('IntrospectionService methods', () => {
    let service: IntrospectionService;
    let mockClient: any;

    beforeEach(() => {
      mockClient = {
        query: () => Promise.resolve({ rows: [] }),
      };
      service = new IntrospectionService(mockClient, 'public');
    });

    it('should have getTables method', () => {
      expect(typeof service.getTables).toBe('function');
    });

    it('should have getTableColumns method', () => {
      expect(typeof service.getTableColumns).toBe('function');
    });

    it('should have getTableConstraints method', () => {
      expect(typeof service.getTableConstraints).toBe('function');
    });

    it('should have getTableIndexes method', () => {
      expect(typeof service.getTableIndexes).toBe('function');
    });

    it('should have getFunctions method', () => {
      expect(typeof service.getFunctions).toBe('function');
    });

    it('should have getTriggers method', () => {
      expect(typeof service.getTriggers).toBe('function');
    });

    it('should have getSequences method', () => {
      expect(typeof service.getSequences).toBe('function');
    });

    it('should have getViews method', () => {
      expect(typeof service.getViews).toBe('function');
    });

    it('should have getEnums method', () => {
      expect(typeof service.getEnums).toBe('function');
    });

    it('should have getDomains method', () => {
      expect(typeof service.getDomains).toBe('function');
    });

    it('should have getSchemaInfo method', () => {
      expect(typeof service.getSchemaInfo).toBe('function');
    });

    it('should have getDatabaseInfo method', () => {
      expect(typeof service.getDatabaseInfo).toBe('function');
    });

    it('should have getCompleteTableInfo method', () => {
      expect(typeof service.getCompleteTableInfo).toBe('function');
    });

    it('should have getAllTablesComplete method', () => {
      expect(typeof service.getAllTablesComplete).toBe('function');
    });
  });

  describe('IntrospectionService basic functionality', () => {
    let service: IntrospectionService;
    let mockClient: any;

    beforeEach(() => {
      mockClient = {
        query: () => Promise.resolve({ rows: [] }),
      };
      service = new IntrospectionService(mockClient, 'public');
    });

    it('should return empty array for getTables when no results', async () => {
      const result = await service.getTables();
      expect(result).toEqual([]);
    });

    it('should return empty array for getFunctions when no results', async () => {
      const result = await service.getFunctions();
      expect(result).toEqual([]);
    });

    it('should return empty array for getTriggers when no results', async () => {
      const result = await service.getTriggers();
      expect(result).toEqual([]);
    });

    it('should return null for getSchemaInfo when no results', async () => {
      const result = await service.getSchemaInfo();
      expect(result).toBeNull();
    });

    it('should return first row for getDatabaseInfo when results exist', async () => {
      const mockDbInfo = {
        version: 'PostgreSQL 15.0',
        database_name: 'testdb',
      };

      mockClient.query = () => Promise.resolve({ rows: [mockDbInfo] });

      const result = await service.getDatabaseInfo();
      expect(result).toEqual(mockDbInfo);
    });
  });
});
