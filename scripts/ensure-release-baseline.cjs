#!/usr/bin/env node
/**
 * Ensure git has a semver tag baseline so semantic-release will not assume 1.0.0
 * while npm is already ahead.
 *
 * - OK if v{npm latest} exists, or highest v*.*.* tag > npm latest.
 * - In GitHub Actions, if package.json version > npm latest but v{package} is
 *   missing, create and push that tag (so manual tag push is not required).
 *   Prefer HEAD^ when it exists so the current commit can still be a releasable
 *   fix/feat after the baseline tag.
 */

'use strict';

const { readFileSync } = require('fs');
const { execFileSync, execSync } = require('child_process');
const { join } = require('path');
const semver = require('semver');

const PKG_NAME = '@advcomm/ddp';
const pkgPath = join(__dirname, '..', 'package.json');
const pkgVersion = JSON.parse(readFileSync(pkgPath, 'utf8')).version;

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

function baselineRefForNewTag() {
  try {
    execFileSync('git', ['rev-parse', '-q', 'HEAD^'], { stdio: 'ignore' });
    return execFileSync('git', ['rev-parse', 'HEAD^'], {
      encoding: 'utf8',
    }).trim();
  } catch {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
  }
}

function pushTag(tag) {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;
  if (!token || !repo) {
    console.error(
      'Cannot push tag: set GITHUB_TOKEN and GITHUB_REPOSITORY (GitHub Actions).'
    );
    process.exit(1);
  }
  const url = `https://x-access-token:${token}@github.com/${repo}.git`;
  execFileSync('git', ['push', url, tag], { stdio: 'inherit' });
}

const registry = npmLatest();
if (!registry || !semver.valid(registry)) {
  console.log(
    `${PKG_NAME}: not on npm or invalid version; skip baseline ensure.`
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

if (
  semver.valid(pkgVersion) &&
  semver.gt(pkgVersion, registry) &&
  !tagRefExists(`v${pkgVersion}`) &&
  process.env.GITHUB_ACTIONS === 'true'
) {
  const ref = baselineRefForNewTag();
  const tag = `v${pkgVersion}`;
  console.log(
    `Creating baseline ${tag} at ${ref.slice(0, 7)}… (package.json ${pkgVersion} > npm ${registry})`
  );
  execFileSync('git', [
    'config',
    'user.email',
    '41898282+github-actions[bot]@users.noreply.github.com',
  ]);
  execFileSync('git', ['config', 'user.name', 'github-actions[bot]']);
  execFileSync(
    'git',
    [
      'tag',
      '-a',
      tag,
      '-m',
      `chore: baseline tag for semantic-release (${pkgVersion} > npm ${registry})`,
      ref,
    ],
    { stdio: 'inherit' }
  );
  pushTag(tag);
  console.log(`Pushed ${tag}. semantic-release will use this as last release.`);
  process.exit(0);
}

console.error(
  `semantic-release would treat this branch as first release (1.0.0) but npm has ${registry}.\n` +
    `Fix one of:\n` +
    `  - git tag v${registry} <sha> && git push origin v${registry}\n` +
    `  - Set package.json version > ${registry} (e.g. 2.0.0) and let CI create the tag (requires GITHUB_ACTIONS).\n` +
    `  - Or git tag v2.0.0 <sha> && git push origin v2.0.0`
);
process.exit(1);
