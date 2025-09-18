/**
 * Procedures Generator
 * Generates procs.sql files for functions and stored procedures
 */

import { IntrospectionService } from '@/database/introspection';
import type {
  IDatabaseConnection,
  IFunctionDefinition,
  IGeneratedFile,
  IGeneratorOptions,
  TUnknownOrAny,
} from '@/types';
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

  protected getGeneratorName(): string {
    return 'Procedures Generator';
  }

  protected override shouldSkip(): boolean {
    return (
      (this.options.schemaOnly ?? false) || (this.options.triggersOnly ?? false)
    );
  }

  protected override async validateData(): Promise<void> {
    const functions = await this.introspection.getFunctions();

    if (functions.length === 0) {
      throw new Error(
        `No functions or procedures found in schema '${this.schema}'`
      );
    }
  }

  async generate(): Promise<IGeneratedFile[]> {
    if (this.shouldSkip()) {
      return [];
    }

    await this.validateData();

    console.log('⚙️  Discovering functions and procedures...');
    const functionsData = await this.introspection.getFunctions();

    console.log(`   Found ${functionsData.length} functions/procedures`);

    // Convert introspection data to generator types
    const functions = functionsData.map(
      this.convertToFunctionDefinition.bind(this)
    );

    const content = await this.generateProcsSQL(functions);

    return [
      {
        name: 'procs.sql',
        content: content,
      },
    ];
  }

  private async generateProcsSQL(
    functions: IFunctionDefinition[]
  ): Promise<string> {
    let sql = this.generateHeader(
      'FUNCTIONS AND PROCEDURES',
      'Complete database functions and stored procedures definitions'
    );

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
      functions: functions.filter(f => f.returnType !== 'void'),
      procedures: functions.filter(f => f.returnType === 'void'),
    };
  }

  private convertToFunctionDefinition(
    funcData: TUnknownOrAny
  ): IFunctionDefinition {
    return {
      name: funcData.function_name ?? 'unknown_function',
      schema: this.schema,
      parameters: [], // TODO: Parse parameters from arguments
      returnType: funcData.return_type ?? 'void',
      language: funcData.language_name ?? 'plpgsql',
      body: funcData.function_body ?? '-- Function body not available',
      volatility:
        funcData.volatility === 'v'
          ? 'VOLATILE'
          : funcData.volatility === 's'
            ? 'STABLE'
            : 'IMMUTABLE',
      security: funcData.security_definer ? 'DEFINER' : 'INVOKER',
      comment: funcData.function_comment || undefined,
    };
  }

  private generateFunctionSQL(func: IFunctionDefinition): string {
    let sql = this.generateComment(`Function: ${func.name}`) + '\n';

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

    // Volatility
    sql += `\n${func.volatility}`;

    // Security
    sql += `\nSECURITY ${func.security}`;

    // Function body
    sql += '\nAS\n';
    sql += this.formatSQL(func.body, 1);
    sql += '\n;\n\n';

    return sql;
  }

  private getFunctionType(_func: IFunctionDefinition): string {
    // In PostgreSQL, both functions and procedures use CREATE FUNCTION
    // The distinction is mainly in the return type and usage
    return 'FUNCTION';
  }

  private generateParameterDefinition(param: TUnknownOrAny): string {
    let definition = '';

    // Parameter mode
    if (param.mode && param.mode !== 'IN') {
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

  private generateFunctionComment(func: IFunctionDefinition): string {
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

  private generateFunctionSignature(func: IFunctionDefinition): string {
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

  private generateFunctionBody(func: IFunctionDefinition): string {
    // Clean up the function body
    let body = func.body;

    // Remove leading/trailing whitespace
    body = body.trim();

    // Ensure proper formatting
    if (!body.startsWith('$') && !body.startsWith('$$')) {
      // If it's not a dollar-quoted string, wrap it
      body = `$$${body}$$`;
    }

    return body;
  }

  private generateFunctionMetadata(func: IFunctionDefinition): string {
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
