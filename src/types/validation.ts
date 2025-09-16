/**
 * Validation types and interfaces
 */

// Validation Types
export interface IValidationResult {
  valid: boolean;
  errors: IValidationErrorItem[];
}

export interface IValidationErrorItem {
  field: string;
  message: string;
  code: string;
}

// Validation Utility Types
export type TValidationRule =
  | 'required'
  | 'email'
  | 'url'
  | 'minLength'
  | 'maxLength'
  | 'pattern';
export type TValidationSeverity = 'error' | 'warning' | 'info';
