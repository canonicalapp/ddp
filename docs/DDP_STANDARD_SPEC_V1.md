# DDP Standard Specification — Version 1

This document describes the **on-disk layout**, **`ddp.config.json` schema**, and **migration contract** implemented by the `@advcomm/ddp` CLI as of this repo. It is the single reference for “DDP standard v1” tooling (`init`, `state`, `migration`, `apply`, `migration diff`).

For day-to-day usage, see the root [README.md](../README.md).

---

## 1. Goals

- **Declarative state** in Git (`state/`) for schema, procedures, and triggers.
- **Versioned migrations** (`migrations/`) for ordered, auditable application to PostgreSQL.
- **Seed SQL** (`seeds/`) — optional flat `*.sql` files run by `ddp seed` with **no** history table (repeatable; use idempotent SQL).
- **One config file** at the repository root: `ddp.config.json`.
- **Apply** records history in the database and enforces **immutability** of applied migrations by default.

---

## 2. Repository layout

After `ddp init` (default `--path db`):

```text
<repo>/
  ddp.config.json          # required for resolveDdpConfig / default apply paths
  db/                        # paths.root (configurable)
    state/
      schema/
      procs/
      triggers/
    migrations/              # timestamped migration folders (see §4)
    seeds/                   # optional flat *.sql for ddp seed (see §7)
```

Paths in `ddp.config.json` are relative to the directory containing `ddp.config.json` (project root), except where noted.

---

## 3. `ddp.config.json` (v1 schema)

Top-level shape (see `src/utils/ddpConfig.ts` and `src/commands/init/index.ts`):

| Field                            | Type               | Purpose                                                            |
| -------------------------------- | ------------------ | ------------------------------------------------------------------ |
| `version`                        | `number`           | Config format version (currently `1`).                             |
| `paths.root`                     | `string`           | Root folder for DDP content (default `db`).                        |
| `paths.state`                    | `string`           | State root (default `{root}/state`).                               |
| `paths.migrations`               | `string`           | Migrations root (default `{root}/migrations`).                     |
| `paths.seeds`                    | `string`           | Seeds root — flat `*.sql` only (default `{root}/seeds`).           |
| `stateLayout.schemaDir`          | `string`           | Schema SQL directory.                                              |
| `stateLayout.procsDir`           | `string`           | Procedures SQL directory.                                          |
| `stateLayout.triggersDir`        | `string`           | Triggers SQL directory.                                            |
| `stateLayout.splitMode`          | `'modular'`        | Layout mode.                                                       |
| `migrations.namingPattern`       | `'timestamp_name'` | Folder naming convention.                                          |
| `migrations.requireDownSql`      | `boolean`          | Optional policy (scaffold / future gates).                         |
| `migrations.requireMetadata`     | `boolean`          | Optional policy.                                                   |
| `migrations.enforceImmutability` | `boolean`          | If `true` (default), changing `up.sql` after apply fails (see §5). |
| `compat.legacyMode`              | `boolean`          | Compatibility flag.                                                |
| `statePolicy.strictMode`         | `boolean`          | Stricter validation in `ddp state validate`.                       |
| `statePolicy.namePattern`        | `string`           | Regex for artifact names.                                          |
| `statePolicy.allowedSchemaKinds` | `string[]`         | Allowed `schema` kinds (table, index, …).                          |

---

## 4. Migration standard (apply + create)

### 4.1 Directory naming

Each migration is a **directory** under `paths.migrations`:

- Pattern: **`YYYYMMDDHHMMSS_<slug>`**
- Regex: `^\d{14}_[a-z0-9_]+$` (14-digit UTC-like timestamp + underscore + lowercase slug)

Example: `20260417120000_add_users`

### 4.2 Required file

- **`up.sql`** — required; entire file is executed (split into statements by the apply pipeline).

### 4.3 Optional files

- **`down.sql`** — optional (not executed by `apply` today; reserved for future rollback tooling).
- **`migration.json`** — optional metadata (policy may evolve).

### 4.4 Ordering

Order is derived from the **numeric prefix** (first segment before `_`). Ties break by name.

### 4.5 Creating migrations

- `ddp migration create <name>` scaffolds a new folder with the current timestamp + name.

---

## 5. Apply semantics (`ddp apply`)

- Resolves migration root from `ddp.config.json` (`paths.migrations`) unless `--folder` is set.
- Discovers only **directories** matching §4.1; each must contain **`up.sql`**.
- Maintains history in PostgreSQL table **`ddp_migrations`** (created if missing).
- Each applied migration is keyed by **`migration_id`** (folder name) and **`checksum`** (SHA-256 of `up.sql` content).
- **Idempotency:** if the same `migration_id` was applied successfully with the **same** checksum, it is **skipped**.
- **Immutability:** if `migrations.enforceImmutability` is `true` (default) and checksum **differs** from a successful apply, **apply aborts** (do not edit applied migrations; add a new timestamped migration).

Transaction behavior, destructive heuristics, advisory lock, and DB preflight are controlled by CLI flags (see README).

---

## 6. Declarative state (`state/`)

- **Schema**, **procs**, and **triggers** live under the configured directories.
- `ddp state create` scaffolds SQL using **idempotent** patterns where possible (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `CREATE EXTENSION IF NOT EXISTS`, `CREATE OR REPLACE` for views/procs, `DO $$ … duplicate_object` for enum/constraint stubs, `DROP TRIGGER IF EXISTS` before `CREATE TRIGGER`).
- `ddp state validate` checks layout and **`state-manifest.json`** against `statePolicy`.
- `ddp migration diff` materializes state into a **shadow** catalog, diffs against a target DB, and can **`--write`** a new migration under `paths.migrations`.

---

## 7. Seed data (`ddp seed`)

- **Layout:** only **top-level** `*.sql` files under `paths.seeds` (default `{root}/seeds`). Names are sorted lexicographically for execution order (e.g. `001_roles.sql`, `002_users.sql`).
- **Behavior:** **`ddp seed`** connects, optionally takes an advisory lock (distinct from `apply`), and runs each file. **No `ddp_migrations` (or other) tracking** — every invocation runs all seed files again. Use **idempotent** SQL (`INSERT … ON CONFLICT`, `TRUNCATE …` + insert, etc.) as appropriate.
- **Empty folder:** if there are **no** `*.sql` files, the command **exits with an error** (so CI does not silently skip seeds).
- **Overrides:** `--folder <path>` uses another directory; same DB flags / destructive heuristics as `apply` (`--accept-destructive`, `--non-interactive`, transaction mode, etc.).

**Versioned, run-once reference data** still belongs in **`migrations/`** via `ddp apply` if you want history and immutability.

---

## 8. Normative references (code)

| Concern                | Location                               |
| ---------------------- | -------------------------------------- |
| Config types           | `src/utils/ddpConfig.ts`               |
| Default config / init  | `src/commands/init/index.ts`           |
| Migration discovery    | `src/commands/apply/fileLoader.ts`     |
| History + immutability | `src/commands/apply/historyTracker.ts` |
| Apply orchestration    | `src/commands/apply/index.ts`          |
| Seed command           | `src/commands/seed/index.ts`           |
| Dev reset command      | `src/commands/reset/index.ts`          |

---

## 9. Dev reset workflow

`ddp reset` is a **dev-only convenience command**:

1. Connects to a maintenance DB (default `postgres`)
2. Terminates active sessions on target DB
3. `DROP DATABASE IF EXISTS` + `CREATE DATABASE`
4. Runs `ddp apply`
5. Runs `ddp seed` (unless `--skip-seed`)

It enforces environment safety (`DDP_ENV`/`NODE_ENV` in dev/test set) and interactive confirmation unless `--non-interactive --force` is provided.
It also enforces target guardrails by default:

- Host allowlist: `localhost`, `127.0.0.1`, `::1` (override via `--allowed-hosts` / `DDP_RESET_ALLOWED_HOSTS`)
- Database-name allowlist patterns: `*dev*`, `*test*`, `*local*`, `*sandbox*`, `*tmp*` (override via `--allowed-databases` / `DDP_RESET_ALLOWED_DATABASES`)
- Prod-like names (`*prod*`, `*production*`, `*staging*`, `*live*`) blocked unless `--allow-risky-database-name` is provided

---

## 10. Document history

- **v1** — Spec aligned with the current CLI implementation; replaces any informal `_v1` draft that was not committed to git.
