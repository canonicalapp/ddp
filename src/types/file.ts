/**
 * File operation types and interfaces
 */

// File Operations
export interface IFileOutputOptions {
  path: string;
  content: string;
  overwrite?: boolean;
}

export interface IFileOutputResult {
  success: boolean;
  path?: string;
  error?: string;
}

// File Utility Types
export type TFileFormat = 'sql' | 'json' | 'yaml' | 'txt';
export type TFileEncoding = 'utf8' | 'ascii' | 'latin1' | 'base64';
