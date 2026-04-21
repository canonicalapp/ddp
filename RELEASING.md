# Releasing `@advcomm/ddp`

## Automated releases (semantic-release)

On **`main`**, [semantic-release](https://semantic-release.gitbook.io/) runs in GitHub Actions: **conventional commits** in git history set the next **semver**, `CHANGELOG.md` is updated, a GitHub Release is created, and the package is published to npm.

**Releases do not use Husky.** CI only runs `npm ci` and `npx semantic-release`. There is no `preversion` script that runs lint/tests (that would break `@semantic-release/npm`’s internal `npm version`).

### Commit messages (for semantic-release only)

semantic-release’s commit analyzer reads **merged git history** — not local hooks. Use [Conventional Commits](https://www.conventionalcommits.org/) on **`main`** so releases bump correctly:

| Commit / PR title (examples)                     | Release bump   |
| ------------------------------------------------ | -------------- |
| `fix: ...`                                       | patch          |
| `feat: ...`                                      | minor          |
| `BREAKING CHANGE:` in body or `feat!:` / `fix!:` | major          |
| `chore:`, `docs:`, etc. (no feat/fix)            | no new version |

You can enforce this later (e.g. PR titles, CI, or hooks); it is **not** required for the release workflow to run.

### CI

1. Workflow: [`.github/workflows/release.yml`](.github/workflows/release.yml) on push to **`main`** (skips with `[skip ci]` on the release bot commit). Uses **Node 22** ([semantic-release v25](https://github.com/semantic-release/semantic-release/blob/master/docs/support/node-version.md)).
2. Secret **`NPM_TOKEN`**: npm automation or publish token ([npm access tokens](https://docs.npmjs.com/about-access-tokens)). `GITHUB_TOKEN` is provided by Actions.
3. **Git tags vs npm**: align the latest **`v*`** tag with npm before the first automated release if needed:
   ```bash
   git tag v1.0.4 <commit-sha-that-shipped-1.0.4>
   git push origin v1.0.4
   ```

### Local dry run

Node **22+**, clean tree, full history:

```bash
CI=true GITHUB_TOKEN=... NPM_TOKEN=... npm run release:dry-run
```

Config: [`release.config.cjs`](release.config.cjs).

---

## Husky (optional, local dev only)

[Husky](https://typicode.github.io/husky/) hooks in `.husky/` are for **your machine** (e.g. pre-push tests). They are **not** part of semantic-release and are **not** run in the release GitHub Action. Remove or change them anytime without affecting CI releases.

---

## Semver (manual mental model)

| Bump      | When                                                           |
| --------- | -------------------------------------------------------------- |
| **PATCH** | Bug fixes, refactors, docs—backward compatible.                |
| **MINOR** | New features / flags—backward compatible.                      |
| **MAJOR** | Breaking changes (CLI, migration format, required Node, etc.). |

## Published versions on npm

```bash
npm run npm:latest
npm run npm:versions
```

## Manual release (fallback)

1. Merge to `main`.
2. Optionally `npm run check:all`.
3. `npm run release:patch` / `minor` / `major` (do not add `preversion` → `check:all`).
4. `git push --follow-tags`
5. `npm publish` — `prepublishOnly` runs **`npm run build`** and **`scripts/assert-npm-version.cjs`**.

### Registry check bypass

```bash
SKIP_REGISTRY_VERSION_CHECK=1 npm publish
```

### First publish / rename

If the package is unpublished, the assert script skips. For a rename, update `PKG_NAME` in `scripts/assert-npm-version.cjs` and `package.json` `name` together.
