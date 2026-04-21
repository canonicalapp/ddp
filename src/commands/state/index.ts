import { writeFile } from 'fs/promises';
import { join } from 'path';
import { getManifestPath, readManifest, writeManifest } from './manifest';
import { getNextNumericPrefix, getTargetDirectory } from './paths';
import { parseStateCreateArgs } from './parseArgs';
import { enforcePolicy, getStatePolicy } from './policy';
import { sanitizeName } from '@/utils/sanitize';
import { buildTemplate } from './templates';
import type { IStateManifestEntry } from '@/types/state';
import { resolveDdpRootPath } from '@/utils/ddpConfig';
import { logError, logInfo } from '@/utils/logger';

export const stateCreateCommand = async (input: {
  type: string;
  kindOrDomain?: string;
  name?: string;
}) => {
  try {
    const parsed = parseStateCreateArgs(input);
    const rootPath = await resolveDdpRootPath();
    const logicalName = sanitizeName(parsed.name);
    const policy = await getStatePolicy();
    enforcePolicy(parsed, logicalName, policy);

    logInfo('Creating DDP state file', {
      parsed,
      logicalName,
      rootPath,
    });

    const baseDir = await getTargetDirectory(parsed, rootPath);
    const prefix = await getNextNumericPrefix(baseDir);
    const fileName = `${prefix}_${logicalName}.sql`;
    const filePath = join(baseDir, fileName);

    const content = buildTemplate(parsed, logicalName);
    await writeFile(filePath, content, 'utf8');

    const manifest = await readManifest(rootPath);
    const existing = manifest.entries.find(entry => entry.path === filePath);
    if (!existing) {
      const manifestEntry: IStateManifestEntry = {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        type: parsed.type,
        name: logicalName,
        path: filePath,
        createdAt: new Date().toISOString(),
      };

      if (parsed.type === 'schema') {
        manifestEntry.kind = parsed.schemaKind;
      }

      if (parsed.type === 'proc' && parsed.procDomain) {
        manifestEntry.domain = parsed.procDomain;
      }

      manifest.entries.push(manifestEntry);
      await writeManifest(rootPath, manifest);
    }

    console.log('Created DDP state file:');
    if (parsed.type === 'schema') {
      console.log(`- Type: schema (${parsed.schemaKind})`);
    } else {
      console.log(`- Type: ${parsed.type}`);
    }

    if (parsed.type === 'proc' && parsed.procDomain) {
      console.log(`- Domain: ${parsed.procDomain}`);
    }

    console.log(`- Path: ${filePath}`);
    console.log(`- Manifest: ${getManifestPath(rootPath)}`);
  } catch (error) {
    logError('DDP state create command failed', error as Error, { input });
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('DDP STATE CREATE failed:', message);
    process.exit(1);
  }
};

export const stateValidateCommand = async () => {
  try {
    const rootPath = await resolveDdpRootPath();
    const policy = await getStatePolicy();
    const manifest = await readManifest(rootPath);
    const errors: string[] = [];

    for (const entry of manifest.entries) {
      const logicalName = sanitizeName(entry.name);
      if (policy.strictMode && !policy.legacyMode) {
        if (!policy.namePattern.test(logicalName)) {
          errors.push(
            `Invalid entry name "${entry.name}" in manifest path ${entry.path}`
          );
        }
        if (
          entry.type === 'schema' &&
          entry.kind &&
          !policy.allowedSchemaKinds.includes(entry.kind)
        ) {
          errors.push(
            `Disallowed schema kind "${entry.kind}" in manifest path ${entry.path}`
          );
        }
      }
    }

    if (errors.length > 0) {
      console.error('State validation failed:');
      for (const err of errors) {
        console.error(`- ${err}`);
      }
      process.exit(1);
    }

    console.log('State validation passed.');
    console.log(`- Root: ${rootPath}`);
    console.log(`- Manifest entries: ${manifest.entries.length}`);
    console.log(`- Strict mode: ${policy.strictMode}`);
    console.log(`- Legacy mode: ${policy.legacyMode}`);
  } catch (error) {
    logError('DDP state validate command failed', error as Error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('DDP STATE VALIDATE failed:', message);
    process.exit(1);
  }
};
