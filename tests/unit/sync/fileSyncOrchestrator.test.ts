import { FileSyncOrchestrator } from '@/sync/fileSyncOrchestrator';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

// Mock fs and path modules
jest.mock('fs');
jest.mock('path');

const mockReadFileSync = readFileSync as jest.MockedFunction<
  typeof readFileSync
>;
const mockExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;
const mockWriteFileSync = writeFileSync as jest.MockedFunction<
  typeof writeFileSync
>;
const mockMkdirSync = mkdirSync as jest.MockedFunction<typeof mkdirSync>;
const mockJoin = join as jest.MockedFunction<typeof join>;
const mockDirname = dirname as jest.MockedFunction<typeof dirname>;

describe('FileSyncOrchestrator', () => {
  let orchestrator: FileSyncOrchestrator;
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    // Mock console methods
    consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    // Clear all mocks
    jest.clearAllMocks();

    // Setup default mocks
    mockJoin.mockImplementation((...paths) => paths.join('/'));
    mockDirname.mockReturnValue('/test/dir');
    mockWriteFileSync.mockImplementation(() => {});
    mockMkdirSync.mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('Constructor', () => {
    it('should initialize with options', () => {
      const options = {
        sourceDir: '/source',
        targetDir: '/target',
        output: 'alter.sql',
        dryRun: false,
      };

      orchestrator = new FileSyncOrchestrator(options);
      expect(orchestrator).toBeDefined();
    });

    it('should initialize with minimal options', () => {
      const options = {
        sourceDir: '/source',
        targetDir: '/target',
      };

      orchestrator = new FileSyncOrchestrator(options);
      expect(orchestrator).toBeDefined();
    });
  });

  describe('execute', () => {
    beforeEach(() => {
      const options = {
        sourceDir: '/source',
        targetDir: '/target',
        output: 'alter.sql',
        dryRun: false,
      };
      orchestrator = new FileSyncOrchestrator(options);
    });

    it('should execute file sync successfully', async () => {
      // Mock file existence
      mockExistsSync.mockReturnValue(true);

      // Mock file contents
      mockReadFileSync.mockImplementation((path: string) => {
        if (path.includes('schema.sql')) {
          return 'CREATE TABLE users (id SERIAL PRIMARY KEY, name VARCHAR(100));';
        }
        if (path.includes('procs.sql')) {
          return 'CREATE FUNCTION get_user(id INTEGER) RETURNS users AS $$ BEGIN RETURN * FROM users WHERE id = $1; END; $$ LANGUAGE plpgsql;';
        }
        if (path.includes('triggers.sql')) {
          return 'CREATE TRIGGER user_audit AFTER INSERT ON users FOR EACH ROW EXECUTE FUNCTION audit_function();';
        }
        return '';
      });

      const result = await orchestrator.execute();

      expect(result).toContain('FILE-BASED SCHEMA SYNC');
      expect(result).toContain('Source: /source');
      expect(result).toContain('Target: /target');
      expect(result).toContain('Generated:');
    });

    it('should handle missing files gracefully', async () => {
      // Mock file existence - some files missing
      mockExistsSync.mockImplementation((path: string) => {
        return path.includes('schema.sql');
      });

      mockReadFileSync.mockImplementation((path: string) => {
        if (path.includes('schema.sql')) {
          return 'CREATE TABLE users (id SERIAL PRIMARY KEY);';
        }
        return '';
      });

      const result = await orchestrator.execute();

      expect(result).toContain('FILE-BASED SCHEMA SYNC');
      expect(consoleSpy).toHaveBeenCalledWith(
        'DDP FILE SYNC - Comparing generated schema files...'
      );
    });

    it('should handle file read errors', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockImplementation(() => {
        throw new Error('File read error');
      });

      await expect(orchestrator.execute()).rejects.toThrow('File read error');
    });
  });

  describe('loadSchemaFiles', () => {
    beforeEach(() => {
      const options = {
        sourceDir: '/source',
        targetDir: '/target',
      };
      orchestrator = new FileSyncOrchestrator(options);
    });

    it('should load all schema files when they exist', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockImplementation((path: string) => {
        if (path.includes('schema.sql'))
          return 'CREATE TABLE users (id SERIAL);';
        if (path.includes('procs.sql'))
          return 'CREATE FUNCTION test() RETURNS VOID;';
        if (path.includes('triggers.sql'))
          return 'CREATE TRIGGER test_trigger;';
        return '';
      });

      const files = (orchestrator as any).loadSchemaFiles('/test');

      expect(files).toEqual({
        schema: 'CREATE TABLE users (id SERIAL);',
        procs: 'CREATE FUNCTION test() RETURNS VOID;',
        triggers: 'CREATE TRIGGER test_trigger;',
      });
    });

    it('should handle missing files', () => {
      mockExistsSync.mockReturnValue(false);

      const files = (orchestrator as any).loadSchemaFiles('/test');

      expect(files).toEqual({
        schema: undefined,
        procs: undefined,
        triggers: undefined,
      });
    });

    it('should handle partial files', () => {
      mockExistsSync.mockImplementation((path: string) => {
        return path.includes('schema.sql');
      });
      mockReadFileSync.mockImplementation((path: string) => {
        if (path.includes('schema.sql'))
          return 'CREATE TABLE users (id SERIAL);';
        return '';
      });

      const files = (orchestrator as any).loadSchemaFiles('/test');

      expect(files).toEqual({
        schema: 'CREATE TABLE users (id SERIAL);',
        procs: undefined,
        triggers: undefined,
      });
    });
  });

  describe('generateFileSyncScript', () => {
    beforeEach(() => {
      const options = {
        sourceDir: '/source',
        targetDir: '/target',
      };
      orchestrator = new FileSyncOrchestrator(options);
    });

    it('should generate sync script for different schemas', async () => {
      const sourceFiles = {
        schema:
          'CREATE TABLE users (id SERIAL PRIMARY KEY, name VARCHAR(100));',
        procs: 'CREATE FUNCTION get_user(id INTEGER) RETURNS users;',
        triggers: 'CREATE TRIGGER user_audit AFTER INSERT ON users;',
      };

      const targetFiles = {
        schema: 'CREATE TABLE users (id SERIAL PRIMARY KEY);',
        procs: 'CREATE FUNCTION get_user(id INTEGER) RETURNS users;',
        triggers: 'CREATE TRIGGER user_audit AFTER INSERT ON users;',
      };

      const result = await (orchestrator as any).generateFileSyncScript(
        sourceFiles,
        targetFiles
      );

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle identical schemas', async () => {
      const sourceFiles = {
        schema: 'CREATE TABLE users (id SERIAL PRIMARY KEY);',
      };

      const targetFiles = {
        schema: 'CREATE TABLE users (id SERIAL PRIMARY KEY);',
      };

      const result = await (orchestrator as any).generateFileSyncScript(
        sourceFiles,
        targetFiles
      );

      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle empty schemas', async () => {
      const sourceFiles = {};
      const targetFiles = {};

      const result = await (orchestrator as any).generateFileSyncScript(
        sourceFiles,
        targetFiles
      );

      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('compareSchemaFiles', () => {
    beforeEach(() => {
      const options = {
        sourceDir: '/source',
        targetDir: '/target',
      };
      orchestrator = new FileSyncOrchestrator(options);
    });

    it('should compare schema files and find differences', () => {
      const sourceSchema =
        'CREATE TABLE users (id SERIAL PRIMARY KEY, name VARCHAR(100));';
      const targetSchema = 'CREATE TABLE users (id SERIAL PRIMARY KEY);';

      const result = (orchestrator as any).compareSchemaFiles(
        sourceSchema,
        targetSchema
      );

      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle identical schemas', () => {
      const sourceSchema = 'CREATE TABLE users (id SERIAL PRIMARY KEY);';
      const targetSchema = 'CREATE TABLE users (id SERIAL PRIMARY KEY);';

      const result = (orchestrator as any).compareSchemaFiles(
        sourceSchema,
        targetSchema
      );

      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle null/undefined schemas', () => {
      const result1 = (orchestrator as any).compareSchemaFiles(
        null,
        'CREATE TABLE users;'
      );
      const result2 = (orchestrator as any).compareSchemaFiles(
        'CREATE TABLE users;',
        null
      );
      const result3 = (orchestrator as any).compareSchemaFiles(null, null);

      expect(Array.isArray(result1)).toBe(true);
      expect(Array.isArray(result2)).toBe(true);
      expect(Array.isArray(result3)).toBe(true);
    });
  });

  describe('compareProcsFiles', () => {
    beforeEach(() => {
      const options = {
        sourceDir: '/source',
        targetDir: '/target',
      };
      orchestrator = new FileSyncOrchestrator(options);
    });

    it('should compare procs files and find differences', () => {
      const sourceProcs = 'CREATE FUNCTION get_user(id INTEGER) RETURNS users;';
      const targetProcs =
        'CREATE FUNCTION get_user(id INTEGER) RETURNS users AS $$ BEGIN END; $$;';

      const result = (orchestrator as any).compareProcsFiles(
        sourceProcs,
        targetProcs
      );

      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle identical procs files', () => {
      const sourceProcs = 'CREATE FUNCTION get_user(id INTEGER) RETURNS users;';
      const targetProcs = 'CREATE FUNCTION get_user(id INTEGER) RETURNS users;';

      const result = (orchestrator as any).compareProcsFiles(
        sourceProcs,
        targetProcs
      );

      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('compareTriggersFiles', () => {
    beforeEach(() => {
      const options = {
        sourceDir: '/source',
        targetDir: '/target',
      };
      orchestrator = new FileSyncOrchestrator(options);
    });

    it('should compare triggers files and find differences', () => {
      const sourceTriggers = 'CREATE TRIGGER user_audit AFTER INSERT ON users;';
      const targetTriggers = 'CREATE TRIGGER user_audit AFTER UPDATE ON users;';

      const result = (orchestrator as any).compareTriggersFiles(
        sourceTriggers,
        targetTriggers
      );

      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle identical triggers files', () => {
      const sourceTriggers = 'CREATE TRIGGER user_audit AFTER INSERT ON users;';
      const targetTriggers = 'CREATE TRIGGER user_audit AFTER INSERT ON users;';

      const result = (orchestrator as any).compareTriggersFiles(
        sourceTriggers,
        targetTriggers
      );

      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('parseTablesFromSchema', () => {
    beforeEach(() => {
      const options = {
        sourceDir: '/source',
        targetDir: '/target',
      };
      orchestrator = new FileSyncOrchestrator(options);
    });

    it('should parse tables from schema SQL', () => {
      const schema = `
        CREATE TABLE users (
          id SERIAL PRIMARY KEY,
          name VARCHAR(100) NOT NULL
        );
        
        CREATE TABLE orders (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id)
        );
      `;

      const result = (orchestrator as any).parseTablesFromSchema(schema);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle empty schema', () => {
      const result = (orchestrator as any).parseTablesFromSchema('');

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });

    it('should handle malformed schema', () => {
      const schema = 'INVALID SQL SYNTAX';
      const result = (orchestrator as any).parseTablesFromSchema(schema);

      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('parseFunctionsFromProcs', () => {
    beforeEach(() => {
      const options = {
        sourceDir: '/source',
        targetDir: '/target',
      };
      orchestrator = new FileSyncOrchestrator(options);
    });

    it('should parse functions from procs SQL', () => {
      const procs = `
        CREATE FUNCTION get_user(id INTEGER) RETURNS users AS $$
        BEGIN
          RETURN * FROM users WHERE id = $1;
        END;
        $$ LANGUAGE plpgsql;
      `;

      const result = (orchestrator as any).parseFunctionsFromProcs(procs);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle empty procs', () => {
      const result = (orchestrator as any).parseFunctionsFromProcs('');

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });
  });

  describe('parseTriggersFromFile', () => {
    beforeEach(() => {
      const options = {
        sourceDir: '/source',
        targetDir: '/target',
      };
      orchestrator = new FileSyncOrchestrator(options);
    });

    it('should parse triggers from triggers SQL', () => {
      const triggers = `
        CREATE TRIGGER user_audit
        AFTER INSERT ON users
        FOR EACH ROW
        EXECUTE FUNCTION audit_function();
      `;

      const result = (orchestrator as any).parseTriggersFromFile(triggers);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle empty triggers', () => {
      const result = (orchestrator as any).parseTriggersFromFile('');

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });
  });

  describe('saveScriptToFile', () => {
    beforeEach(() => {
      const options = {
        sourceDir: '/source',
        targetDir: '/target',
        output: 'test-alter.sql',
      };
      orchestrator = new FileSyncOrchestrator(options);
    });

    it('should save script to file', () => {
      const script = 'ALTER TABLE users ADD COLUMN email VARCHAR(100);';
      const filename = 'test-alter.sql';

      (orchestrator as any).saveScriptToFile(script, filename);

      expect(mockDirname).toHaveBeenCalledWith(filename);
      expect(mockMkdirSync).toHaveBeenCalled();
      expect(mockWriteFileSync).toHaveBeenCalledWith(filename, script, 'utf8');
    });

    it('should handle directory creation errors', () => {
      mockMkdirSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const script = 'ALTER TABLE users ADD COLUMN email VARCHAR(100);';

      expect(() => {
        (orchestrator as any).saveScriptToFile(script);
      }).toThrow('Permission denied');
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      const options = {
        sourceDir: '/source',
        targetDir: '/target',
      };
      orchestrator = new FileSyncOrchestrator(options);
    });

    it('should handle file system errors gracefully', async () => {
      mockExistsSync.mockImplementation(() => {
        throw new Error('File system error');
      });

      await expect(orchestrator.execute()).rejects.toThrow('File system error');
    });

    it('should handle parsing errors gracefully', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('INVALID SQL');

      // Should not throw, but handle gracefully
      const result = await orchestrator.execute();
      expect(typeof result).toBe('string');
    });
  });
});
