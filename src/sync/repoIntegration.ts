/**
 * Repository Integration
 * Handles pulling schema files from different repositories for GitHub Actions
 */

import { execSync } from 'child_process';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { FileSyncOrchestrator } from './fileSyncOrchestrator';

interface RepoSyncOptions {
  sourceRepo: string;
  targetRepo: string;
  sourceBranch?: string;
  targetBranch?: string;
  output?: string;
  dryRun?: boolean;
  tempDir?: string;
}

export class RepoIntegration {
  private options: RepoSyncOptions;

  constructor(options: RepoSyncOptions) {
    this.options = {
      sourceBranch: 'main',
      targetBranch: 'main',
      tempDir: './temp-repos',
      ...options,
    };
  }

  /**
   * Execute repository-based sync
   */
  async execute(): Promise<string> {
    try {
      console.log('DDP REPO SYNC - Pulling schema files from repositories...');
      console.log(
        `Source: ${this.options.sourceRepo} (${this.options.sourceBranch})`
      );
      console.log(
        `Target: ${this.options.targetRepo} (${this.options.targetBranch})`
      );
      console.log(`Output: ${this.options.output ?? 'alter.sql'}`);

      // Create temporary directory
      const tempDir = this.options.tempDir || './temp-repos';
      if (existsSync(tempDir)) {
        rmSync(tempDir, { recursive: true });
      }
      mkdirSync(tempDir, { recursive: true });

      // Clone repositories
      const sourceDir = await this.cloneRepository(
        this.options.sourceRepo,
        this.options.sourceBranch || 'main',
        join(tempDir, 'source')
      );

      const targetDir = await this.cloneRepository(
        this.options.targetRepo,
        this.options.targetBranch || 'main',
        join(tempDir, 'target')
      );

      // Find schema files in each repository
      const sourceSchemaDir = this.findSchemaFiles(sourceDir);
      const targetSchemaDir = this.findSchemaFiles(targetDir);

      if (!sourceSchemaDir || !targetSchemaDir) {
        throw new Error('Schema files not found in one or both repositories');
      }

      // Execute file-based sync
      const fileSyncOptions = {
        sourceDir: sourceSchemaDir,
        targetDir: targetSchemaDir,
        output: this.options.output ?? 'alter.sql',
        dryRun: this.options.dryRun ?? false,
      };

      const orchestrator = new FileSyncOrchestrator(fileSyncOptions);
      const result = await orchestrator.execute();

      // Clean up temporary directory
      rmSync(tempDir, { recursive: true });

      return result;
    } catch (error) {
      console.error('Repository sync execution failed:', error);
      throw error;
    }
  }

  /**
   * Clone a repository to a local directory
   */
  private async cloneRepository(
    repoUrl: string,
    branch: string,
    targetDir: string
  ): Promise<string> {
    try {
      console.log(`📥 Cloning ${repoUrl} (${branch}) to ${targetDir}...`);

      // Clone the repository
      execSync(
        `git clone --branch ${branch} --depth 1 ${repoUrl} ${targetDir}`,
        {
          stdio: 'pipe',
          cwd: process.cwd(),
        }
      );

      console.log(`✅ Successfully cloned ${repoUrl}`);
      return targetDir;
    } catch (error) {
      console.error(`❌ Failed to clone ${repoUrl}:`, error);
      throw new Error(`Failed to clone repository: ${repoUrl}`);
    }
  }

  /**
   * Find schema files in a repository
   * Looks for schema.sql, procs.sql, triggers.sql in common locations
   */
  private findSchemaFiles(repoDir: string): string | null {
    const commonPaths = [
      '', // Root directory
      'schema',
      'database',
      'db',
      'sql',
      'migrations',
      'ddp',
    ];

    for (const path of commonPaths) {
      const schemaDir = join(repoDir, path);
      if (this.hasSchemaFiles(schemaDir)) {
        console.log(`📁 Found schema files in: ${schemaDir}`);
        return schemaDir;
      }
    }

    console.warn(`⚠️  No schema files found in ${repoDir}`);
    return null;
  }

  /**
   * Check if a directory contains schema files
   */
  private hasSchemaFiles(dir: string): boolean {
    if (!existsSync(dir)) {
      return false;
    }

    const requiredFiles = ['schema.sql', 'procs.sql', 'triggers.sql'];
    return requiredFiles.every(file => existsSync(join(dir, file)));
  }

  /**
   * Get repository information (for GitHub Actions)
   */
  static getRepoInfo(): { owner: string; repo: string; branch: string } | null {
    try {
      // Try to get info from git remote
      const remoteUrl = execSync('git remote get-url origin', {
        encoding: 'utf8',
        stdio: 'pipe',
      }).trim();

      const branch = execSync('git branch --show-current', {
        encoding: 'utf8',
        stdio: 'pipe',
      }).trim();

      // Parse GitHub URL
      const match = remoteUrl.match(
        /github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/
      );
      if (match?.[1] && match[2]) {
        return {
          owner: match[1],
          repo: match[2],
          branch: branch,
        };
      }
    } catch {
      // Not in a git repository or no remote
    }

    return null;
  }
}
