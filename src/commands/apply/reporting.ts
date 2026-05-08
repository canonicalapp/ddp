import type { IExecutionResult, ILoadedFile } from '@/types/apply';

export const performDryRun = async (files: ILoadedFile[]): Promise<void> => {
  console.log('Migrations that would run (in order):');
  console.log('');

  for (const file of files) {
    console.log(`📄 ${file.migrationId}`);
    console.log(`   Path: ${file.path}`);
    console.log(`   Checksum: ${file.checksum.substring(0, 16)}...`);
    console.log(`   Size: ${file.content.length} bytes`);
    console.log('');
  }

  console.log('✅ Dry-run completed — no database changes');
};

export const reportResults = (results: IExecutionResult[]): void => {
  console.log('');
  console.log('📊 Execution summary:');
  console.log('');

  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  const totalStatements = results.reduce(
    (sum, r) => sum + r.statementsExecuted,
    0
  );
  const totalTime = results.reduce((sum, r) => sum + r.executionTime, 0);

  console.log(`✅ Successful: ${successful}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📝 Total statements: ${totalStatements}`);
  console.log(`⏱️  Total time: ${totalTime}ms`);
  console.log('');

  if (failed > 0) {
    console.log('Failed migrations:');
    for (const result of results) {
      if (!result.success) {
        console.log(`  ❌ ${result.fileName}`);
        if (result.errorMessage) {
          console.log(`     Error: ${result.errorMessage}`);
        }
      }
    }
    console.log('');
  }
};
