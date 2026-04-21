/**
 * File Loader Module
 * Handles SQL file discovery, loading, and validation
 */

import { createHash } from 'crypto';
import { readFile, readdir, stat } from 'fs/promises';
import { join, basename } from 'path';
import type { IFileLoadOptions, ILoadedFile } from '@/types/apply';
import { logDebug, logError, logInfo } from '@/utils/logger';

export class FileLoader {
  private readonly migrationNamePattern = /^\d{14}_[a-z0-9_]+$/;
  private readonly upFileName = 'up.sql';

  /**
   * Load SQL files based on provided options
   */
  async loadFiles(options: IFileLoadOptions): Promise<ILoadedFile[]> {
    if (!options.folder) {
      throw new Error('Migration root folder is required');
    }

    logInfo('Loading migrations from standardized folder structure', {
      folder: options.folder,
    });
    const files = await this.discoverFilesInFolder(options.folder);

    logInfo('Files loaded successfully', {
      count: files.length,
      files: files.map(f => f.name),
    });

    return files;
  }

  /**
   * Discover SQL files from standardized migration directory structure
   * Format:
   *   migrations/
   *     20260416103000_init_schema/
   *       up.sql
   *       down.sql (optional)
   *       migration.json (optional)
   */
  private async discoverFilesInFolder(folder: string): Promise<ILoadedFile[]> {
    try {
      const entries = await readdir(folder);
      const files: ILoadedFile[] = [];

      for (const entry of entries) {
        const migrationDir = join(folder, entry);
        const entryStats = await stat(migrationDir);

        // Only process migration directories
        if (!entryStats.isDirectory()) {
          continue;
        }

        this.validateMigrationDirectoryName(entry);

        const upFilePath = join(migrationDir, this.upFileName);
        const upFileStats = await stat(upFilePath).catch(() => null);

        if (!upFileStats?.isFile()) {
          throw new Error(
            `Missing required file "${this.upFileName}" in migration directory: ${entry}`
          );
        }

        const order = this.parseMigrationOrder(entry);
        const file = await this.loadSingleFile(
          entry,
          upFilePath,
          'unknown',
          order
        );
        files.push(file);
      }

      if (files.length === 0) {
        throw new Error(
          `No valid migrations found in "${folder}". Expected versioned directories with up.sql files`
        );
      }

      return this.sortFilesByOrder(files);
    } catch (error) {
      logError('Failed to discover files in folder', error as Error, {
        folder,
      });
      throw new Error(
        `Failed to discover files in folder: ${(error as Error).message}`
      );
    }
  }

  /**
   * Validate migration folder naming convention
   */
  private validateMigrationDirectoryName(directoryName: string): void {
    if (!this.migrationNamePattern.test(directoryName)) {
      throw new Error(
        `Invalid migration directory name "${directoryName}". Expected format: YYYYMMDDHHMMSS_description`
      );
    }
  }

  /**
   * Parse migration order from directory prefix
   */
  private parseMigrationOrder(directoryName: string): number {
    const [prefix] = directoryName.split('_');
    const parsed = Number(prefix);
    if (!Number.isFinite(parsed)) {
      throw new Error(
        `Invalid migration version prefix in directory "${directoryName}"`
      );
    }
    return parsed;
  }

  /**
   * Load a single SQL file
   */
  private async loadSingleFile(
    migrationId: string,
    filePath: string,
    type: 'schema' | 'procs' | 'triggers' | 'unknown',
    order: number
  ): Promise<ILoadedFile> {
    try {
      const content = await readFile(filePath, 'utf8');
      const checksum = this.calculateChecksum(content);
      const fileName = basename(filePath);
      const displayName = `${migrationId}/${fileName}`;

      logDebug('File loaded', {
        path: filePath,
        name: displayName,
        type,
        size: content.length,
        checksum,
      });

      return {
        migrationId,
        name: displayName,
        path: filePath,
        content,
        checksum,
        order,
        type,
      };
    } catch (error) {
      logError('Failed to load file', error as Error, { filePath });
      throw new Error(
        `Failed to load file ${filePath}: ${(error as Error).message}`
      );
    }
  }

  /**
   * Calculate SHA-256 checksum of file content
   */
  private calculateChecksum(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }

  /**
   * Sort files by execution order
   */
  private sortFilesByOrder(files: ILoadedFile[]): ILoadedFile[] {
    return [...files].sort((a, b) => {
      // First sort by order
      if (a.order !== b.order) {
        return a.order - b.order;
      }
      // If same order, sort alphabetically by name
      return a.name.localeCompare(b.name);
    });
  }
}
