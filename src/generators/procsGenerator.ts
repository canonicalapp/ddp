/**
 * Procedures Generator
 * Generates procs.sql files for functions and stored procedures
 */

import type {
  IFunctionInfo,
  IFunctionParameterInfo,
} from '@/database/introspection';
import { IntrospectionService } from '@/database/introspection';
import type {
  IDatabaseConnection,
  IFunctionDefinition,
  IFunctionParameter,
  IGeneratedFile,
  IGeneratorOptions,
} from '@/types';
import { ValidationError } from '@/types/errors';
import { logDebug, logError, logInfo } from '@/utils/logger';
import { validateFunctionName, validateSchemaName } from '@/utils/validation';
import type { Client } from 'pg';
import { BaseGenerator } from './baseGenerator';

export class ProcsGenerator extends BaseGenerator {
  private introspection: IntrospectionService;

  constructor(
    client: Client,
    connection: IDatabaseConnection,
    options: IGeneratorOptions
  ) {
    super(client, connection, options);
    this.introspection = new IntrospectionService(client, this.schema);
  }

  protected getGeneratorName() {
    return 'Procedures Generator';
  }

  protected override shouldSkip() {
    return (
      (this.options.schemaOnly ?? false) || (this.options.triggersOnly ?? false)
    );
  }

  protected override async validateData() {
    try {
      logDebug('Validating procedures data', { schema: this.schema });

      // Validate schema name
      validateSchemaName(this.schema);

      const functions = await this.introspection.getFunctions();

      if (functions.length === 0) {
        throw new ValidationError(
          `No functions or procedures found in schema '${this.schema}'`,
          'schema',
          { schema: this.schema, functionCount: 0 }
        );
      }

      logInfo(`Found ${functions.length} functions/procedures in schema`, {
        schema: this.schema,
        functionCount: functions.length,
      });

      // Validate function names
      for (const func of functions) {
        validateFunctionName(func.function_name);
      }
    } catch (error) {
      logError('Procedures validation failed', error as Error, {
        schema: this.schema,
      });
      throw error;
    }
  }

  async generate(): Promise<IGeneratedFile[]> {
    try {
      if (this.shouldSkip()) {
        logInfo('Procedures generation skipped due to options', {
          options: this.options,
        });
        return [];
      }

      await this.validateData();

      logInfo('Discovering functions and procedures', { schema: this.schema });

      const functionsData = await this.introspection.getFunctions();
      const parametersData = await this.introspection.getFunctionParameters();

      logInfo(`Found ${functionsData.length} functions/procedures`, {
        schema: this.schema,
        functionCount: functionsData.length,
      });

      // Convert introspection data to generator types
      const functions = functionsData.map(funcData =>
        this.convertToFunctionDefinition(funcData, parametersData)
      );

      logDebug('Generating procedures SQL', {
        functionCount: functions.length,
      });

      const content = await this.generateProcsSQL(functions);

      logInfo('Procedures generation completed successfully', {
        schema: this.schema,
        contentLength: content.length,
      });

      return [
        {
          name: 'procs.sql',
          content: content,
        },
      ];
    } catch (error) {
      logError('Procedures generation failed', error as Error, {
        schema: this.schema,
      });
      throw error;
    }
  }

  private async generateProcsSQL(functions: IFunctionDefinition[]) {
    let sql = this.generateHeader(
      'FUNCTIONS AND PROCEDURES',
      'Complete database functions and stored procedures definitions'
    );

    // Generate schema creation if not using public schema
    sql += this.generateSchemaCreationSQL();

    // Group functions by type for better organization
    const functionsByType = this.groupFunctionsByType(functions);

    // Generate functions first
    if (functionsByType.functions.length > 0) {
      sql += this.generateSectionHeader('FUNCTIONS');

      for (const func of functionsByType.functions) {
        sql += this.generateFunctionSQL(func);
      }
    }

    // Generate procedures
    if (functionsByType.procedures.length > 0) {
      sql += this.generateSectionHeader('PROCEDURES');

      for (const proc of functionsByType.procedures) {
        sql += this.generateFunctionSQL(proc);
      }
    }

    sql += this.generateFooter();
    return sql;
  }

  private groupFunctionsByType(functions: IFunctionDefinition[]): {
    functions: IFunctionDefinition[];
    procedures: IFunctionDefinition[];
  } {
    return {
      functions: functions
        .filter(f => f.returnType !== 'void')
        .sort((a, b) => a.name.localeCompare(b.name)),

      procedures: functions
        .filter(f => f.returnType === 'void')
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

  private convertToFunctionDefinition(
    funcData: IFunctionInfo,
    parametersData: IFunctionParameterInfo[]
  ): IFunctionDefinition {
    // Get parameters for this specific function
    const functionParameters = parametersData.filter(
      param => param.function_name === funcData.function_name
    );

    // Convert parameters to IFunctionParameter format
    const isTableFunction =
      funcData.return_type &&
      typeof funcData.return_type === 'string' &&
      funcData.return_type.includes('TABLE');

    const parameters = functionParameters
      .filter(param => {
        // For TABLE functions, only include IN parameters (exclude OUT parameters)
        if (isTableFunction) {
          return param.parameter_mode === 'IN';
        }
        return true; // Include all parameters for non-TABLE functions
      })
      .map(param => ({
        name: param.parameter_name,
        type: param.data_type,
        mode: this.mapParameterMode(param.parameter_mode),
        ...(param.parameter_default && {
          defaultValue: param.parameter_default,
        }),
      }));

    const returnType =
      funcData.return_type && funcData.return_type.trim() !== ''
        ? funcData.return_type
        : funcData.routine_type === 'p'
          ? 'void'
          : 'void';

    const volatility =
      funcData.volatility === 'v'
        ? 'VOLATILE'
        : funcData.volatility === 's'
          ? 'STABLE'
          : 'IMMUTABLE';

    return {
      name: funcData.function_name || 'unknown_function',
      schema: this.schema,
      parameters,
      returnType,
      language: funcData.language_name || 'plpgsql',
      body: funcData.function_body || '-- Function body not available',
      volatility,
      security: funcData.security_definer ? 'DEFINER' : 'INVOKER',
      comment: funcData.function_comment || undefined,
    };
  }

  /**
   * Map parameter mode from information_schema to our interface
   */
  private mapParameterMode(mode: string): 'IN' | 'OUT' | 'INOUT' | 'VARIADIC' {
    switch (mode.toUpperCase()) {
      case 'IN':
        return 'IN';
      case 'OUT':
        return 'OUT';
      case 'INOUT':
        return 'INOUT';
      case 'VARIADIC':
        return 'VARIADIC';
      default:
        return 'IN'; // Default to IN if unknown
    }
  }

  private generateFunctionSQL(func: IFunctionDefinition) {
    const type = func.returnType === 'void' ? 'Procedure' : 'Function';

    let sql = this.generateComment(`${type}: ${func.name}`) + '\n';

    if (func.comment) {
      sql += this.generateComment(func.comment) + '\n';
    }

    // Function signature
    sql += `CREATE OR REPLACE ${this.getFunctionType(func)} ${this.escapeIdentifier(func.schema)}.${this.escapeIdentifier(func.name)}`;

    // Parameters
    if (func.parameters.length > 0) {
      const params = func.parameters.map(param =>
        this.generateParameterDefinition(param)
      );

      sql += `(\n${this.formatSQL(params.join(',\n'), 1)}\n)`;
    } else {
      sql += '()';
    }

    // Return type
    if (func.returnType && func.returnType !== 'void') {
      sql += `\nRETURNS ${func.returnType}`;
    }

    // Language
    sql += `\nLANGUAGE ${func.language}`;

    // Volatility (only for functions, not procedures)
    if (func.returnType !== 'void') {
      sql += `\n${func.volatility}`;
    }

    // Security
    sql += `\nSECURITY ${func.security}`;

    // Function body
    sql += '\nAS\n';
    sql += this.generateFunctionBody(func);
    sql += ';\n\n';

    return sql;
  }

  private getFunctionType(func: IFunctionDefinition) {
    // In PostgreSQL, procedures use CREATE PROCEDURE, functions use CREATE FUNCTION
    return func.returnType === 'void' ? 'PROCEDURE' : 'FUNCTION';
  }

  private generateParameterDefinition(param: IFunctionParameter) {
    let definition = '';

    // Parameter mode
    if (param.mode !== 'IN') {
      definition += `${param.mode} `;
    }

    // Parameter name
    if (param.name) {
      definition += `${this.escapeIdentifier(param.name)} `;
    }

    // Parameter type
    definition += param.type;

    // Default value
    if (param.defaultValue) {
      definition += ` DEFAULT ${param.defaultValue}`;
    }

    return definition.trim();
  }

  private generateFunctionComment(func: IFunctionDefinition) {
    const parts = [];

    if (func.comment) {
      parts.push(func.comment);
    }

    if (func.parameters.length > 0) {
      const paramList = func.parameters
        .map(p => `${p.name || 'unnamed'}: ${p.type}`)
        .join(', ');
      parts.push(`Parameters: ${paramList}`);
    }

    if (func.returnType && func.returnType !== 'void') {
      parts.push(`Returns: ${func.returnType}`);
    }

    return parts.join(' | ');
  }

  private generateFunctionSignature(func: IFunctionDefinition) {
    const params = func.parameters
      .map(param => {
        let paramStr = '';

        if (param.mode !== 'IN') {
          paramStr += `${param.mode} `;
        }

        if (param.name) {
          paramStr += `${this.escapeIdentifier(param.name)} `;
        }

        paramStr += param.type;

        return paramStr.trim();
      })
      .join(', ');

    const returnType =
      func.returnType && func.returnType !== 'void'
        ? ` RETURNS ${func.returnType}`
        : '';

    return `${this.escapeIdentifier(func.name)}(${params})${returnType}`;
  }

  private generateFunctionBody(func: IFunctionDefinition) {
    // Clean up the function body
    let body = func.body;

    // Remove leading/trailing whitespace
    body = body.trim();

    // Remove trailing semicolon if present (not needed in dollar-quoted strings)
    if (body.endsWith(';')) {
      body = body.slice(0, -1);
    }

    // Ensure proper formatting with dollar-quoted strings
    if (!body.startsWith('$') && !body.startsWith('$$')) {
      // If it's not a dollar-quoted string, wrap it
      body = `$$${body}$$`;
    }

    return body;
  }

  private generateFunctionMetadata(func: IFunctionDefinition) {
    const metadata = [];

    metadata.push(`Volatility: ${func.volatility}`);

    metadata.push(`Security: ${func.security}`);

    if (func.language) {
      metadata.push(`Language: ${func.language}`);
    }

    return metadata.length > 0
      ? this.generateComment(metadata.join(' | ')) + '\n'
      : '';
  }
}
