/**
 * Utility types and interfaces
 */

// Comparison Types
export interface IComparisonResult<T> {
  source: T;
  target: T;
  differences: string[];
  identical: boolean;
}
