/**
 * Base Generator Class
 * Abstract base class providing common functionality for all generators
 */

import type {
  IDatabaseConnection,
  IGeneratedFile,
  IGeneratorOptions,
  IGeneratorResult,
} from '@/types';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { Client } from 'pg';

export abstract class BaseGenerator {
  protected client: Client;
  protected options: IGeneratorOptions;
  protected connection: IDatabaseConnection;
  protected schema: string;

  constructor(
    client: Client,
    connection: IDatabaseConnection,
    options: IGeneratorOptions
  ) {
    this.client = client;
    this.connection = connection;
    this.options = options;
    this.schema = connection.schema ?? 'public';
  }

  /**
   * Abstract method to generate content - must be implemented by subclasses
   */
  abstract generate(): Promise<IGeneratedFile[]>;

  /**
   * Generate and output files based on options
   */
  async execute(): Promise<IGeneratorResult> {
    try {
      console.log(`🔧 Generating ${this.getGeneratorName()}...`);

      // Check if generation should be skipped
      if (this.shouldSkip()) {
        console.log(`⏭️  Skipping ${this.getGeneratorName()} generation`);
        return {
          success: true,
          files: [],
        };
      }

      // Validate data before generation
      await this.validateData();

      const files = await this.generate();

      if (this.options.stdout) {
        this.outputToStdout(files);
      } else {
        await this.outputToFiles(files);
      }

      console.log(
        `✅ ${this.getGeneratorName()} generation completed successfully`
      );

      return {
        success: true,
        files: files,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      console.error(
        `❌ ${this.getGeneratorName()} generation failed:`,
        errorMessage
      );

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Get the name of this generator for logging
   */
  protected abstract getGeneratorName(): string;

  /**
   * Output files to stdout
   */
  private outputToStdout(files: IGeneratedFile[]): void {
    files.forEach((file, index) => {
      if (index > 0) {
        console.log('\n' + '='.repeat(80) + '\n');
      }

      console.log(`-- ${file.name}\n`);
      console.log(file.content);
    });
  }

  /**
   * Output files to disk
   */
  private async outputToFiles(files: IGeneratedFile[]): Promise<void> {
    // Ensure output directory exists
    const outputDir = this.options.outputDir;
    mkdirSync(outputDir, { recursive: true });

    for (const file of files) {
      const filePath = join(outputDir, file.name);
      file.path = filePath;

      writeFileSync(filePath, file.content, 'utf8');
      console.log(`📄 Generated: ${filePath}`);
    }
  }

  /**
   * Generate SQL header with metadata
   */
  protected generateHeader(title: string, description: string): string {
    const timestamp = new Date().toISOString();
    const database = this.connection.database;
    const schema = this.schema;

    return `
-- ===========================================
-- ${title}
-- ===========================================
-- Generated: ${timestamp}
-- Database: ${database}
-- Schema: ${schema}
-- Description: ${description}
-- ===========================================

`;
  }

  /**
   * Generate SQL footer
   */
  protected generateFooter(): string {
    return `
-- ===========================================
-- END OF ${this.getGeneratorName().toUpperCase()}
-- ===========================================
`;
  }

  /**
   * Format SQL with proper indentation
   */
  protected formatSQL(sql: string, indentLevel: number = 0): string {
    const indent = '  '.repeat(indentLevel);
    return sql
      .split('\n')
      .map(line => {
        const trimmed = line.trim();
        if (!trimmed) return '';
        return `${indent}${trimmed}`;
      })
      .join('\n');
  }

  /**
   * Escape SQL identifiers
   */
  protected escapeIdentifier(identifier: string): string {
    // Only escape if it contains special characters or is a reserved word
    if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) {
      return identifier;
    }
    return `"${identifier.replace(/"/g, '""')}"`;
  }

  /**
   * Escape SQL string literals
   */
  protected escapeString(str: string): string {
    return `'${str.replace(/'/g, "''")}'`;
  }

  /**
   * Generate comment block
   */
  protected generateComment(comment: string): string {
    return `-- ${comment}`;
  }

  /**
   * Generate section header
   */
  protected generateSectionHeader(title: string): string {
    return `
-- ===========================================
-- ${title}
-- ===========================================
`;
  }

  /**
   * Check if generation should be skipped based on options
   */
  protected shouldSkip(): boolean {
    // This will be overridden by specific generators
    return false;
  }

  /**
   * Validate required data before generation
   */
  protected async validateData(): Promise<void> {
    // Override in subclasses for specific validation
  }

  /**
   * Get database connection info for logging
   */
  protected getConnectionInfo(): string {
    return `${this.connection.host}:${this.connection.port}/${this.connection.database}.${this.schema}`;
  }
}
