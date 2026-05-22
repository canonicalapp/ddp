# DDP - Declarative Database Provisioning

A PostgreSQL-focused CLI for **declarative schema state**, **versioned migrations**, **applying** them safely, plus **introspection** (`gen`) and **database-to-database diffs** (`sync`).

## Overview

DDP helps teams manage PostgreSQL schemas in Git:

1. **`init`** — Scaffold `ddp.config.json` and the standard `state/` + `migrations/` layout
2. **`state`** — Create and validate declarative SQL artifacts (schema / procs / triggers) under policy
3. **`migration`** — **`migration diff`** can generate SQL from state vs a target DB (shadow catalog)
4. **`apply`** — Run pending migrations with transactions, history, locks, and destructive guards
5. **`seed`** — Run every top-level `*.sql` in `paths.seeds` (no history; fails if none found)
6. **`reset`** — Dev-only DB reset: drop/recreate DB, then run apply + seed
7. **`gen`** — Generate `schema.sql` / `procs.sql` / `triggers.sql` from a live database
8. **`sync`** — Compare two databases and emit `alter.sql` (with data-preserving renames)

Run `ddp` with no arguments to print built-in help.

## Installation

**Requirements:** Node.js **18+** and PostgreSQL **12+** for database commands.

```bash
npm install -g @advcomm/ddp
# or
npm install @advcomm/ddp
```

The published package ships the compiled **`dist/`** tree. Installing from a **git URL** without building will not provide `dist/cli.js`; use npm or clone and run `npm ci && npm run build`.

## Environment variables and `.env`

Commands that need a database (for example **`apply`**, **`seed`**, **`migration diff`**, **`gen`**, **`inspect`**, **`reset`**) call **`loadEnvFile`** before reading `DB_*` (or `SOURCE_DB_*` / `TARGET_DB_*` for **`sync`**).

- **Auto-discover:** if you do **not** pass **`--env`**, DDP searches upward from the **current working directory** for a file named **`.env`** and merges its entries into `process.env` **only when a key is not already set** (shell exports and CI-injected secrets keep precedence).
- **`--env <path>`:** optional. Use it when the file is not named `.env`, is outside the search path, or you want an explicit profile (for example **`.env.staging`**).
- **Tests:** most commands skip loading `.env` when `NODE_ENV=test` or `JEST_WORKER_ID` is set; **`sync`** still loads so integration tests can control behavior.

Typical target-database variables (see also **Configuration** below):

```bash
DB_HOST=localhost
DB_PORT=5432
DB_NAME=mydatabase
DB_USER=username
DB_PASSWORD=password
DB_SCHEMA=public
```

So in docs, **`ddp apply`** and similar examples **omit `--env`** when you run them from the project root that already contains a standard **`.env`**.

## Command summary

| Command                       | Purpose                                                                            |
| ----------------------------- | ---------------------------------------------------------------------------------- |
| `ddp init`                    | Create `ddp.config.json` (default root `db/`) and folder layout                    |
| `ddp state create …`          | Scaffold a new state SQL file (schema / proc / trigger)                            |
| `ddp state validate`          | Validate layout + manifest against policy                                          |
| `ddp state sort-manifest`     | Reorder `state-manifest.json` table entries by FK dependencies (aligns with apply) |
| `ddp migration create <name>` | New timestamped migration folder under `paths.migrations`                          |
| `ddp migration diff`          | Materialize state to shadow, diff vs target; optional `--write` migration          |
| `ddp inspect stale`           | List preserved backup artifacts (`*_old_*`, `*_dropped_*`) in target schema        |
| `ddp inspect backfill`        | Show split backfill migration progress (`expand/backfill/constraints`)             |
| `ddp apply`                   | Apply pending migrations from config (or `--folder`)                               |
| `ddp seed`                    | Execute all `*.sql` in `paths.seeds` (sorted); no tracking; error if empty         |
| `ddp reset`                   | Dev-only drop/recreate DB, then run `apply` and `seed`                             |
| `ddp gen`                     | Introspect a DB → SQL files or stdout                                              |
| `ddp sync`                    | Diff source vs target DB → `alter.sql`                                             |

## Quick start (declarative workflow)

```bash
# 1. Scaffold project (default root: ./db)
ddp init
# Optional: custom root — ddp init --path mydb
# Overwrite existing config — ddp init --force

# 2. Add declarative state files (examples)
ddp state create schema table users
ddp state create proc login
ddp state validate

# 3. Hand-written migration when needed
ddp migration create add_feature_x

# 4. Optional: generate a migration from state vs target DB (uses .env from project root)
ddp migration diff --write

# 5. Apply migrations
ddp apply

# 6. Optional: repeatable seed SQL (db/seeds/*.sql — idempotent SQL recommended)
ddp seed

# 7. Optional: dev reset (drop/recreate DB, then apply + seed)
ddp reset --non-interactive --force
```

## `ddp init`

Creates **`ddp.config.json`** at the repo root and directories:

- `paths.root` (default `db`) — `state/` and `migrations/`
- `state/schema`, `state/procs`, `state/triggers`

| Option          | Description                          | Default |
| --------------- | ------------------------------------ | ------- |
| `--path <path>` | Root folder for DDP content          | `db`    |
| `--force`       | Overwrite existing `ddp.config.json` | off     |

## `ddp state`

### `ddp state create`

Creates a numbered state SQL file. Shapes:

- **Schema:** `ddp state create schema <kind> <name>` — kinds include `table`, `index`, `constraint`, `extension`, `view`, `enum` (aliases: `sch`, `tbl`, `idx`, …)
- **Proc:** `ddp state create proc <name>` or `ddp state create proc <domain> <name>`
- **Trigger:** `ddp state create trigger <name>`

Examples:

```bash
ddp state create schema table users
ddp state create sch idx users_email_idx
ddp state create proc login
ddp state create prc auth login
ddp state create trg audit_users
```

### `ddp state validate`

Checks structure and **`state-manifest.json`** against **`statePolicy`** in `ddp.config.json` (strict mode, naming patterns, allowed kinds). Deep validation connects to the database (uses **`.env`** / **`--env`** like other DB commands).

### `ddp state sort-manifest`

Rewrites **`state-manifest.json`** so **`kind: "table"`** entries follow **foreign-key dependency order** (same ordering logic used when applying state / shadow). Other manifest rows keep their relative order within each apply kind. Run from the project root after editing table SQL if you want the committed manifest order to match apply.

## `ddp migration`

### `ddp migration create <name>`

Scaffolds an empty folder `YYYYMMDDHHMMSS_<name>/` under **`paths.migrations`** for hand-written SQL.

### `ddp migration diff`

Applies declarative **state** to a **shadow** catalog, diffs against the **target** database, then prints SQL or writes a new migration (`--write`).

- Default: same database as target, shadow schema `ddp_shadow` (override with `--shadow-schema` or `DDP_SHADOW_SCHEMA`).
- Optional separate DB: `--shadow-url` or `DDP_SHADOW_DATABASE_URL`.

Useful options:

| Option                    | Description                                                              |
| ------------------------- | ------------------------------------------------------------------------ |
| `--write`                 | Emit SQL into a new migration under `paths.migrations`                   |
| `--migration-name <slug>` | With `--write`: name slug (required with `--non-interactive`)            |
| `--non-interactive`       | Fail instead of prompting (CI)                                           |
| `--create-database`       | Create target DB if missing                                              |
| `--env <path>`            | Optional `.env` path (default: auto-discover **`.env`** upward from cwd) |

Connection flags match other commands (`--env`, `--host`, `--port`, `--database`, `--username`, `--password`, `--schema`).

When `--write` generates a real drift migration and preserved backup artifacts exist, `up.sql` includes a short notice and points to `ddp inspect` for the complete artifact log.
When safe backfill requirements are detected, `ddp migration diff --write` emits `up.sql` (expand phase), plus `backfill.sql`, `backfill.verify.sql`, and `constraints.sql`.

**Why does `up.sql` list many unrelated `ALTER`s?** The diff is the **full** structural delta between **shadow** (materialized from repo state) and **target**. If the target DB is missing migrations, has looser nullability, or catalog text differs cosmetically from shadow, you will see every mismatch in one file—not only the change you had in mind. Bring the target in line with state (or reset a dev DB) before diffing to narrow the script.

**Constraint churn on every diff:** If `migration diff` keeps emitting the same `DROP CONSTRAINT` / `ADD CONSTRAINT` pairs, the target catalog and shadow often differ cosmetically (multi-column UNIQUE column order, CHECK expression parentheses/casts). DDP normalizes those before comparing. After upgrading DDP, regenerate once; if a migration only contained false constraint churn, you can drop it from history on dev.

**Trigger rename churn (`*_old_<timestamp>`) on every diff:** PostgreSQL catalogs can spell the same trigger slightly differently (for example `EXECUTE PROCEDURE` vs `EXECUTE FUNCTION`, optional `public.` on the function). DDP now normalizes those before deciding a trigger “changed,” so spurious `ALTER TRIGGER … RENAME` blocks should be far less common.

**Removed tables (not in `state/`):** For whole modules (e.g. affiliate tables), DDP:

1. Drops **FKs on remaining tables** that still point at removed tables (e.g. `orders → affiliates`).
2. Skips per-constraint/index/trigger noise on tables being removed.
3. Emits **`DROP TABLE … CASCADE`** at the end in **child → parent** order.

Default strategy is **`cascade`** (destructive; review `up.sql`). For rename-first tombstones instead, set `DDP_REMOVED_TABLE_STRATEGY=preserve-rename` before `migration diff`.

## `ddp inspect`

`inspect` is a read-only diagnostics verb with explicit intents:

- `ddp inspect stale`
- `ddp inspect backfill`

> Breaking change: bare `ddp inspect` no longer runs stale artifact inspection directly. Use an explicit intent (`ddp inspect stale` or `ddp inspect backfill`).

### `ddp inspect stale`

Inspects the target schema for preserved backup artifacts left by rename-first safety behavior:

- Trigger backups matching `*_old_<timestamp>`
- Table backups matching `*_dropped_<timestamp>`
- Column backups matching `*_dropped_<timestamp>`

Connection options follow **Environment variables and `.env`** above (optional **`--env`**, or a discovered **`.env`**).

### `ddp inspect backfill`

Inspects split migration backfill progress by combining migration files and apply history:

- detects `up.sql`, `backfill.sql`, `backfill.verify.sql`, `constraints.sql`
- checks applied status for `::expand` / `::constraints`
- prints next-step guidance for pending backfill workflows

Connection options follow **Environment variables and `.env`** above.

## `ddp apply`

Runs versioned migrations from **`paths.migrations`** in `ddp.config.json`, or **`--folder`**.

**`--prune` (prune-only):** this flag means **no migrations** are loaded or applied for that invocation. Instead, DDP connects to the target database and runs **only** `DROP` / `DROP COLUMN` for preserved rename tombstones from the non-destructive sync policy: triggers matching `*_old_<digits>`, tables matching `*_dropped_<digits>`, and columns matching `*_dropped_<digits>` (same rules as `ddp inspect`). Use **`ddp apply --prune --dry-run`** to print the statements without executing. For normal migration runs, omit `--prune`.

| Option                      | Description                                                                                                   | Default     |
| --------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------- |
| `--folder <path>`           | Override migrations root                                                                                      | from config |
| `--prune`                   | Prune-only: drop preserved rename tombstones only; **does not** apply migrations                              | off         |
| `--transaction-mode <mode>` | `per-file` \| `all-or-nothing` \| `none`                                                                      | `per-file`  |
| `--dry-run`                 | Without `--prune`: list pending migrations (no DB). With `--prune`: print DROPs only (connects for discovery) | off         |
| `--continue-on-error`       | Continue after a failed file                                                                                  | off         |
| `--skip-history`            | Do not record history (not recommended)                                                                       | off         |
| `--accept-destructive`      | Allow migrations flagged as destructive                                                                       | off         |
| `--non-interactive`         | No prompts (use with `--accept-destructive` / `--create-database` in CI)                                      | off         |
| `--create-database`         | Create database if it does not exist                                                                          | off         |
| `--acknowledge-backfill`    | Optional acknowledgment for pending `backfill.sql` follow-ups                                                 | off         |
| `--with-backfill`           | Run `constraints.sql` after verify checks pass                                                                | off         |
| `--force`                   | With `--with-backfill`, apply `constraints.sql` even if verify fails                                          | off         |
| `--skip-lock`               | Skip PostgreSQL advisory lock (testing only)                                                                  | off         |

Destructive heuristics (e.g. `DROP`, `TRUNCATE`) require explicit **`--accept-destructive`** in non-interactive runs.
When pending generated `backfill.sql` files exist, `ddp apply` continues with `up.sql` and prints follow-up guidance.
For split migrations (`up.sql`, `backfill.verify.sql`, `constraints.sql`), use **`--with-backfill`** once manual backfill is complete; apply verifies checks are all zero before executing constraints.
If verify/backfill checks still fail but you intentionally want to proceed, use **`--with-backfill --force`** (dangerous).

## `ddp seed`

Runs **every** top-level **`*.sql`** file in **`paths.seeds`** (default `{root}/seeds`), in **lexicographic** order. **No migration history** — each run executes all files again (design for idempotent scripts or dev resets).

**Exits with an error** if the directory has **no** `.sql` files (so empty seed folders are not silent no-ops).

| Option                      | Description                                        | Default                |
| --------------------------- | -------------------------------------------------- | ---------------------- |
| `--folder <path>`           | Override seeds directory                           | from `ddp.config.json` |
| `--transaction-mode <mode>` | `per-file` \| `all-or-nothing` \| `none`           | `per-file`             |
| `--continue-on-error`       | Continue after a failed file                       | off                    |
| `--accept-destructive`      | Allow TRUNCATE/DROP-style SQL (same as apply)      | off                    |
| `--non-interactive`         | No prompts (use with `--accept-destructive` in CI) | off                    |
| `--create-database`         | Create database if missing                         | off                    |
| `--skip-lock`               | Skip advisory lock (testing)                       | off                    |

Connection options match **`apply`** (see **Environment variables and `.env`** above).

## `ddp reset` (dev-only)

Resets a local/dev database in one command:

1. Drops and recreates the target database
2. Runs `ddp apply`
3. Runs `ddp seed` (unless `--skip-seed`)

Safety guards:

- Only allowed when env resolves to development/test (`DDP_ENV` or `NODE_ENV`, default fallback is `development`).
- Requires confirmation; for CI/non-interactive runs use `--non-interactive --force`.
- Target guardrails:
  - Host must match allowlist (default: `localhost`, `127.0.0.1`, `::1`)
  - DB name allowlist is optional (set explicitly via option/env when needed)
  - Prod-like names (`prod`, `production`, `staging`, `live`) are blocked unless explicitly overridden

| Option                                 | Description                                                       | Default                   |
| -------------------------------------- | ----------------------------------------------------------------- | ------------------------- |
| `--maintenance-database <name>`        | Maintenance DB used to execute DROP/CREATE DATABASE               | `postgres`                |
| `--yes`                                | Skip interactive confirmation (alias to `--force`)                | off                       |
| `--force`                              | Skip interactive confirmation                                     | off                       |
| `--non-interactive`                    | No prompt; must be combined with `--force` or `--yes`             | off                       |
| `--allowed-hosts <list>`               | Comma-separated reset host allowlist (supports `*`)               | `localhost,127.0.0.1,::1` |
| `--allowed-databases <list>`           | Comma-separated DB-name allowlist (supports `*`)                  | unset (no DB allowlist)   |
| `--allow-risky-database-name`          | Allow prod-like DB names after other checks                       | off                       |
| `--skip-seed`                          | Run apply only                                                    | off                       |
| `--transaction-mode <mode>`            | Pass-through to apply/seed (`per-file`, `all-or-nothing`, `none`) | command default           |
| `--continue-on-error`                  | Pass-through to apply/seed                                        | off                       |
| `--accept-destructive` / `--skip-lock` | Pass-through to apply/seed                                        | off                       |

Environment equivalents:

- `DDP_RESET_ALLOWED_HOSTS` (comma-separated)
- `DDP_RESET_ALLOWED_DATABASES` (comma-separated)

## `ddp gen`

Generate **`schema.sql`**, **`procs.sql`**, **`triggers.sql`** from a live database.

```bash
ddp gen --database mydb --username user --password pass --output ./output
ddp gen --schema-only
ddp gen --procs-only --stdout
```

| Option                                               | Description           | Default                  |
| ---------------------------------------------------- | --------------------- | ------------------------ |
| `--env <path>`                                       | Optional `.env` path  | auto-discover **`.env`** |
| `--output <dir>`                                     | Output directory      | `./output`               |
| `--stdout`                                           | Print files to stdout | off                      |
| `--schema-only` / `--procs-only` / `--triggers-only` | Partial output        | off                      |

## `ddp sync`

Compare **source** and **target** databases and write **`alter.sql`**. Uses the same **`.env`** / **`--env`** behavior as other commands (see **Environment variables and `.env`**). Optional GitHub-style **`--source-repo` / `--target-repo`** (and branches) for repo-integrated flows.

```bash
ddp sync \
  --source-database dev_db --source-username u1 --source-password p1 \
  --target-database prod_db --target-username u2 --target-password p2
ddp sync --dry-run --output migration.sql
```

## Configuration

### `ddp.config.json` (after `ddp init`)

- **`paths`** — `root`, `state`, `migrations`, `seeds` (optional; `ddp init` adds `seeds`)
- **`stateLayout`** — schema / procs / triggers directories, `splitMode`
- **`migrations`** — naming, immutability, optional metadata/down-SQL rules
- **`statePolicy`** — `strictMode`, `namePattern`, `allowedSchemaKinds`

### Environment variables

These names are what a **`.env`** file (or **`--env`**) typically supplies for the **target** database. The same auto-load rules apply as in **Environment variables and `.env`** at the top of this document.

```bash
DB_HOST=localhost
DB_PORT=5432
DB_NAME=mydatabase
DB_USER=username
DB_PASSWORD=password
DB_SCHEMA=public
```

**Sync (source / target)** — e.g. `SOURCE_DB_HOST`, `SOURCE_DB_PORT`, `SOURCE_DB_NAME`, `SOURCE_DB_USER`, `SOURCE_DB_PASSWORD`, `SOURCE_DB_SCHEMA` and the matching `TARGET_DB_*` variables, or use `ddp sync` flags.

**Shadow / diff (optional):**

```bash
DDP_SHADOW_DATABASE_URL=postgresql://...
DDP_SHADOW_SCHEMA=ddp_shadow
```

## Example output (`gen` / `sync`)

### Generated schema excerpt (`schema.sql`)

```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_users_email ON users(email);
```

### Sync script excerpt (`alter.sql`)

```sql
-- Schema Sync Script (conceptual)
CREATE TABLE target.orders ( /* ... */ );
ALTER TABLE target.products ADD COLUMN "description" text;
-- Destructive operations use rename-first preservation (see below)
```

## Data preservation (`sync`)

Destructive operations **rename** objects with timestamps before drop (tables, columns, functions, constraints, indexes, triggers). After you have validated migrations and data, you can remove the preserved rename tombstones with **`ddp apply --prune`** (see **`ddp apply`**); use **`ddp apply --prune --dry-run`** first to review the exact `DROP` statements.

## Development

Clone the repository, use **Node 18+**, and regenerate the lockfile with the **same npm major** as CI when changing dependencies (Node 24 on Actions ships npm 11.x — e.g. `npx npm@latest install`).

```bash
git clone https://github.com/canonicalapp/ddp.git
cd ddp
npm ci
npm run build
npm test
```

Use `npm run dev` / `tsx src/cli.ts <command>` for local CLI runs without a global install.

## Contributing

1. Fork and branch
2. Run tests and `npm run check` (or `check:all`)
3. Open a PR

Releases on **`main`** use **semantic-release** (see [RELEASING.md](RELEASING.md)).

## License

MIT — see [LICENSE](LICENSE).

## Support

Issues and feature requests: [GitHub issues](https://github.com/canonicalapp/ddp/issues).

## Changelog

See [CHANGELOG.md](CHANGELOG.md).
