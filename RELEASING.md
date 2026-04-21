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
3. **Git tags are the version baseline** (critical): semantic-release uses **`v*.*.*` tags** on `main`, not npm, to decide the last release. With **no** such tags it tries **`1.0.0`**, which will fail **`prepublishOnly`** if npm is already higher.

   **Option A — continue 1.x:** tag what npm already has (e.g. **`v1.0.4`**) on the commit that matches that publish.

   **Option B — reset baseline at 2.x (new line):** npm only accepts **non‑decreasing** versions, so you cannot “restart” at `1.0.0`. Bump **`package.json`** to **`2.0.0`**, then create **one** tag on current `main`:

   ```bash
   git tag v2.0.0 HEAD
   git push origin v2.0.0
   ```

   The next releasable **`fix:`** on `main` becomes **`2.0.1`** (first publish from automation on the new line). Older **`1.x`** releases stay on npm for existing consumers.

   Tags must look like **`v1.2.3`** — not a bare **`v1`** (invalid semver for the tool).

   CI runs **`scripts/verify-release-baseline.cjs`**: it passes if **`v{npm latest}`** exists **or** the highest git tag is **strictly greater** than npm latest (Option B).

### Local dry run

Node **22+**, clean tree, full history:

```bash
CI=true GITHUB_TOKEN=... NPM_TOKEN=... npm run release:dry-run
```

Config: [`release.config.cjs`](release.config.cjs).

### If you still see tests during the release job

The **Release** workflow does **not** run Jest. If logs show `jest` / `test:ci`, almost always:

1. **`package.json` on `main` still has a `preversion` (or `version`) script** that runs `check:all` or `test`. **`@semantic-release/npm` runs `npm version`**, which triggers those scripts. **Remove `preversion`** (and anything that runs tests on version bump) from `main`.
2. A **different workflow** on the same push (e.g. a general CI job) is running in parallel—check the **job name** in GitHub Actions.

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
