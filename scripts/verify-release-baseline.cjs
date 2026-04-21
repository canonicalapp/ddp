#!/usr/bin/env node
/**
 * Ensure git has a semver tag baseline compatible with npm so semantic-release
 * will not try to publish 1.0.0 while npm is already ahead.
 *
 * OK if: tag v{npm latest} exists, OR highest v*.*.* tag is strictly > npm latest
 * (e.g. new 2.0.0 line while npm is still on 1.0.4).
 */

'use strict';

const { execSync } = require('child_process');
const semver = require('semver');

const PKG_NAME = '@advcomm/ddp';

function npmLatest() {
  try {
    return execSync(`npm view ${PKG_NAME} version`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return null;
  }
}

function gitTagVersions() {
  let out;
  try {
    out = execSync('git tag -l', { encoding: 'utf8' });
  } catch {
    return [];
  }
  return out
    .split(/\r?\n/)
    .filter(Boolean)
    .filter(t => /^v\d+\.\d+\.\d+/.test(t))
    .map(t => t.slice(1))
    .filter(v => semver.valid(v));
}

function tagRefExists(tag) {
  try {
    execSync(`git rev-parse -q --verify "refs/tags/${tag}"`, {
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

const registry = npmLatest();
if (!registry || !semver.valid(registry)) {
  console.log(
    `${PKG_NAME}: not on npm or invalid version; skip baseline check.`
  );
  process.exit(0);
}

if (tagRefExists(`v${registry}`)) {
  console.log(`OK: tag v${registry} exists (npm latest ${registry}).`);
  process.exit(0);
}

const versions = gitTagVersions();
const highest = versions.sort(semver.rcompare)[0];
if (highest && semver.gt(highest, registry)) {
  console.log(
    `OK: git baseline v${highest} is above npm ${registry} (e.g. new major line).`
  );
  process.exit(0);
}

console.error(
  `semantic-release would treat this branch as first release (1.0.0) but npm has ${registry}.\n` +
    `Either:\n` +
    `  - Tag the commit that matches npm: git tag v${registry} <sha> && git push origin v${registry}\n` +
    `  - Or start a higher line: git tag v2.0.0 HEAD && git push origin v2.0.0 (and bump package.json to 2.0.0)`
);
process.exit(1);
