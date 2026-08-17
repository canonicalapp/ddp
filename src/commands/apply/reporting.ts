import consola from 'consola';
import type { IExecutionResult, ILoadedFile } from '@/types/apply';

export const performDryRun = async (files: ILoadedFile[]): Promise<void> => {
  consola.info('Migrations that would run (in order):');

  for (const file of files) {
    consola.log(`  ${file.migrationId}`);
    consola.log(`    Path: ${file.path}`);
    consola.log(`    Checksum: ${file.checksum.substring(0, 16)}...`);
    consola.log(`    Size: ${file.content.length} bytes`);
  }

  consola.success('Dry-run completed — no database changes');
};

export const reportResults = (results: IExecutionResult[]): void => {
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  const totalStatements = results.reduce(
    (sum, r) => sum + r.statementsExecuted,
    0
  );
  const totalTime = results.reduce((sum, r) => sum + r.executionTime, 0);

  consola.box({
    title: 'Execution summary',
    message: [
      `Successful:       ${successful}`,
      `Failed:           ${failed}`,
      `Total statements: ${totalStatements}`,
      `Total time:       ${totalTime}ms`,
    ].join('\n'),
  });

  if (failed > 0) {
    consola.warn('Failed migrations:');
    for (const result of results) {
      if (!result.success) {
        consola.log(`  ${result.fileName}`);
        if (result.errorMessage) {
          consola.log(`    Error: ${result.errorMessage}`);
        }
      }
    }
  }
};
