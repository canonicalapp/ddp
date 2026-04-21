# Releasing `@advcomm/ddp`

## Automated releases (recommended)

This repo uses **[semantic-release](https://semantic-release.gitbook.io/)** on **`main`**: conventional commits determine the next **semver** version, `CHANGELOG.md` is updated, a GitHub Release is created, and the package is published to npm.

### Commit messages

Follow [Conventional Commits](https://www.conventionalcommits.org/) (enforced locally via **Commitlint** on `git commit`):

| In commit / PR title                               | Release bump   |
| -------------------------------------------------- | -------------- |
| `fix: ...`                                         | patch          |
| `feat: ...`                                        | minor          |
| `BREAKING CHANGE:` in footer or `feat!:` / `fix!:` | major          |
| `chore:`, `docs:`, `refactor:`, etc. (no feat/fix) | no new release |

Merge commits and revert commits are ignored by Commitlint so default GitHub merge strategies still work.

### CI setup

1. **GitHub**: workflow [`.github/workflows/release.yml`](.github/workflows/release.yml) runs on every push to `main` (skips when the commit message contains `[skip ci]`, e.g. the release bot commit). It uses **Node 22** in Actions because [semantic-release v25](https://github.com/semantic-release/semantic-release/blob/master/docs/support/node-version.md) requires Node ^22.14 or ≥24.10 (Node 20 is not supported). It installs dependencies and runs **semantic-release** only; quality gates are expected from **local** [Husky](https://typicode.github.io/husky/) hooks (pre-push runs unit and integration tests, type-check, build, lint, and format). `prepublishOnly` still runs **`npm run build`** (and the registry version check) when a version is published. Do not add a **`preversion`** script that runs the full suite: the **npm** plugin invokes `npm version`, which would run `preversion` in the middle of the release and can fail (e.g. right after `CHANGELOG.md` is generated).
2. **npm**: add an **automation** or **publish** token as repository secret **`NPM_TOKEN`** ([npm access tokens](https://docs.npmjs.com/about-access-tokens)).
3. **Git tags vs npm**: semantic-release uses **git tags** (e.g. `v1.0.4`) to compute the next version. After enabling automation, ensure the **latest tag matches what is already on npm** so the first run does not replay or skip incorrectly. If `1.0.4` is on npm but there is no `v1.0.4` tag, create it on the commit that was published:
   ```bash
   git tag v1.0.4 <commit-sha-that-shipped-1.0.4>
   git push origin v1.0.4
   ```

### Local dry run

Requires a clean repo, full git history, and `GITHUB_TOKEN` / `NPM_TOKEN` if you want publish simulation; usually it is enough to rely on CI:

```bash
npm run release:dry-run
```

Config lives in [`release.config.cjs`](release.config.cjs).

---

## Semantic versioning (manual mental model)

Versions follow [semver](https://semver.org): **MAJOR.MINOR.PATCH** (e.g. `1.2.3`).

| Bump      | When                                                                   |
| --------- | ---------------------------------------------------------------------- |
| **PATCH** | Bug fixes, internal refactors, docs—backward compatible.               |
| **MINOR** | New features, new CLI flags—backward compatible for existing users.    |
| **MAJOR** | Breaking changes (CLI removal, migration format, required Node, etc.). |

Pre-release identifiers (e.g. `1.1.0-beta.1`) are supported by `npm version`; ensure consumers understand npm dist-tags if you use them.

## Published versions on npm

Check the registry before a **manual** bump:

```bash
npm view @advcomm/ddp version
npm view @advcomm/ddp versions --json
```

Or:

```bash
npm run npm:latest
npm run npm:versions
```

## Manual release workflow (fallback)

If you cannot use CI:

1. Merge work to `main`.
2. Run `npm run check:all`.
3. Bump (creates commit + tag when git is configured and the tree is clean):
   ```bash
   npm run release:patch   # or release:minor / release:major
   ```
   There is no `preversion` hook: **semantic-release** runs `npm version` internally, and a heavy `preversion` (e.g. full tests) would fail mid-release. Rely on step 2 and your pre-push hook instead.
4. Push: `git push --follow-tags`
5. Publish: `npm publish`  
   `prepublishOnly` runs `npm run build` and **`scripts/assert-npm-version.cjs`**, which **refuses** publish if `package.json` is **≤** the version already on npm.

### Dry run / pack

`npm publish --dry-run` skips the strict registry check when npm sets the dry-run flag. To bypass in other situations (e.g. a fork under the same name), use only when you understand the risk:

```bash
SKIP_REGISTRY_VERSION_CHECK=1 npm publish
```

### First publish of a new package name

If `@advcomm/ddp` is not found on the registry, the assert script exits **0** (skips). For a **rename**, update `PKG_NAME` in `scripts/assert-npm-version.cjs` and `package.json` `name` together.
