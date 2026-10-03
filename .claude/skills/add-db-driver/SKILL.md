---
name: add-db-driver
description: Recipe for adding support for a new database type (e.g. SQLite, Oracle, ClickHouse) to QueryIt. Use when asked to support another database. It covers the driver, every registration point, the test database and verification.
---

# Add a database driver

Also follow the `proxy-change` skill: a driver is part of the security boundary.

## 0. Feasibility (stop and ask if any answer is "no")

- Is there a maintained Node driver for it?
- Does `node-sql-parser` support its dialect? See the `database` option list in its README. Without that, `assertReadOnly` can't parse the user's SQL.
- Can it run **read-only**, or at least inside a transaction that is always rolled back?
- Can it **cap rows on the server** without rewriting the user's SQL (a cursor with `FETCH`, a session row limit, `SET ROWCOUNT`, streaming with cancel)?
- Is there a Docker image for a local test database?

## 1. Driver: `proxy/lib/drivers/<name>.js`

Copy the shape of `postgres.js`:

- **`parseConnection(connectionString) → { host, port, user, password, database, ... }`**
  - Build it from **known fields only**. Ignore or reject everything else.
  - Reject duplicate keys and host aliases.
  - Strip IPv6 brackets from `host`.
  - The returned `host` must be exactly where the driver connects; the SSRF guard checks it.
- **`runQuery(config, sql, { maxRows }) → { columns, rows }`**
  - Connect with `config` only, never the raw string.
  - Read-only transaction, or a transaction that is always rolled back.
  - Row cap on the server; trim with `slice(0, maxRows)` as a backstop.
  - Connection and statement timeouts.
  - A fresh connection or pool per call, closed in `finally`.
  - `rows` is an array of arrays in the same order as `columns`.

## 2. Register it, then let the test tell you what's missing

1. Add it to `proxy/lib/drivers/index.js`.
2. Run `npm test`. `registro de drivers` in `proxy/test/drivers.test.js` fails and names each missing place:
   - `DIALECTS` in `proxy/lib/sql-guard.js` (the `node-sql-parser` dialect name)
   - `INTROSPECTION` in `js/sql-preset.js`: a query returning `table_schema, table_name, column_name, data_type` in that order. Also add a `QUOTE` rule there, plus the dialect's row-limit syntax in `selectPreset`.
   - `<option value="<name>">` in `#setting-db-type` in `index.html`
   - `DATABASES` and `MANY_ROWS` in `proxy/test/helpers/databases.js`
3. Not enforced by tests, but do it:
   - **Syntax highlighting:** the dialect in `LANGUAGES.sql` in `js/notebook/editor.js` (it falls back to standard SQL).
   - **ESLint:** add the new database library's package name to the list of restricted imports in `eslint.config.js` (the `proxy/lib/*.js` block), next to `pg`, `mysql2` and `mssql`.

## 3. Test database

- A service in `docker-compose.yml` with its own profile, a fixed port outside the default range (like 55432, 53306, 51433), no volume, and a healthcheck.
- Seed: `DDL[<name>]` and `QUOTE[<name>]` in `proxy/test/helpers/databases.js`, with the same tables and rows as the others (including `order items`, the table name with a space).
- `proxy/test/drivers.test.js`: `parseConnection` cases. At minimum: normal fields, ignored or rejected extra options, rejected duplicates, IPv6 host.
- `proxy/test/query.test.js` runs its per-database suite automatically once `DATABASES` has the entry. Add dialect-specific cases (the subquery-limit test, `limite menor`) to its maps.

## 4. Verify and document

- `npm run db:up` with the new profile, `npm run db:seed`, then `npm test`: the new suite shows `✔`, not `﹣`.
- Do the browser walkthrough from the `verify` skill with the new type selected: load the schema, use the SELECT button on `order items`, run a query that returns more than 1000 rows.
- `docs/feature-map.md`: the database list in §1, quoting in §2, §7.
- `CLAUDE.md`: commands (the new `db:up` profile), test database ports, residual risks specific to this database.
- Add the image to the "large images" warning in the `verify` skill if it's big.
