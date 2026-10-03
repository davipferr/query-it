# QueryIt

Browser notebook for querying databases: SQL cells run through a local proxy, JS cells read their results and draw charts.

## Stack

- **No build step.** Plain ES modules served as-is. Don't add bundlers, TypeScript or frameworks.
- **Frontend** (`index.html`, `js/`, `css/`): served by `server.js` on port 5500. CodeMirror comes from esm.sh through the import map in `index.html`, pinned to exact versions. Pin any new package the same way.
- **Proxy** (`proxy/`): its own package (`proxy/package.json`) on port 3000, single endpoint `POST /api/query`. Drivers: `pg`, `mysql2`, `mssql`.
- Node 22+. The root package has no dependencies; the proxy does (`npm install --prefix proxy`).

## Commands

| Task | Command |
|---|---|
| Run both servers | `npm run dev` |
| Frontend only / proxy only | `npm start` / `npm start --prefix proxy` |
| Lint (syntax check + feature-map coverage; ESLint later) | `npm run lint` |
| Tests (`node:test`) | `npm test` |
| **Everything; run before saying a task is done** | `npm run check` |
| Test databases (Docker): Postgres / all three | `npm run db:up` / `npm run db:up:all` |
| Load fixture data into running databases | `npm run db:seed` |
| Stop the test databases | `npm run db:down` |

Agents can also start the servers through `.claude/launch.json` (`frontend`, `proxy`) and use the browser pane. **Use the `verify` skill before reporting any change as done.**

## Tests

- `proxy/test/*.test.js`: guards, rate limit, and the `/api/query` handler. The per-database suites in `query.test.js` skip themselves when that database is down. A `﹣` (skipped) result is **not** a pass.
- `test/js/*.test.js`: pure frontend modules.
- Helpers (`proxy/test/helpers/`): `callHandler` runs the handler without HTTP; `databases.js` holds the test connection strings and the seed data.
- Test databases: Postgres `localhost:55432`, MySQL `53306`, SQL Server `51433`. Credentials are in `docker-compose.yml` and are for local tests only. No volumes, so every `db:up` starts empty.
- **`{ todo: '…' }` marks a known, unfixed gap.** It still runs and shows `✖ … # todo`, but doesn't fail `check`. When you fix one, remove the `todo`. Never mark a new failure as todo to get green.

## Invariants (never break these)

1. **Writes are stopped by three layers. Never weaken one because another exists:**
   - **`proxy/lib/sql-guard.js`** parses the SQL into an AST. It allows exactly one `SELECT` and rejects `INTO` and a denylist of dangerous functions. `js/sql-guard.js` is only a fast regex pre-check for UX. Never move trust to the client, and never import the client guard from the proxy.
   - **The driver** runs the query in a read-only transaction (SQL Server: a transaction that is always rolled back) and caps the rows on the server: Postgres uses a cursor with `FETCH`, MySQL `sql_select_limit`, SQL Server `SET ROWCOUNT`. Never rewrite the user's SQL to add `LIMIT` or `TOP`.
   - **In production**, the database user should only have `SELECT` permission. The denylist will always miss something, such as dynamic SQL inside a function.
2. **Every proxy request goes through all its guards, in order:** CORS → rate limit → input validation → `assertReadOnly` → `driver.parseConnection` → `assertHostIsSafe` (SSRF) → `driver.runQuery` (read-only, row cap) → timeout. The driver must connect with **exactly** the config returned by `parseConnection`. Never pass the raw connection string to a database library, because its query parameters (`?host=`, `?socketPath=`, a repeated `Server=`) would connect somewhere the SSRF guard never checked.
3. **Errors returned to the client go through `sanitizeError`**, so a connection string never leaks.
4. **`ALLOW_PRIVATE_HOSTS=true` is a local-only default** (set in `proxy/server.js`). Production must run with it `false`.
5. **Database data is text, never HTML.** Table and column names, cell values and error messages go into the DOM through `textContent` or `escapeHtml`. Never interpolate them into `innerHTML`.
6. **`new Function` in `js/notebook/js-cell.js` is intentional** (it runs user-written JS cells). Don't use it, or `eval`, anywhere else.
7. **`server.js` must never serve files from `proxy/`** or from outside the project root.

## Where things live

**`docs/feature-map.md`** is the detailed map: DOM ids and selectors, how to drive each feature, state, the proxy contract, every user-facing message, and known bugs. Read it before reproducing a bug or verifying UI. Update it in the same change when you touch the UI, the messages or the API (`npm run lint` checks that every id and source file is listed).

| Feature | Files |
|---|---|
| App wiring | `js/app.js` |
| Settings modal (`localStorage` key `queryit.settings`) | `js/settings.js` |
| Schema explorer | `js/schema-explorer.js` |
| Cells (shell, editor, SQL, JS) | `js/notebook/cell.js`, `editor.js`, `sql-cell.js`, `js-cell.js` |
| Shared variables between cells | `js/notebook/kernel-state.js` |
| Charts and tables for JS cells | `js/charts.js` |
| Proxy handler | `proxy/api/query.js` |
| Proxy guards | `proxy/lib/sql-guard.js`, `ssrf-guard.js`, `rate-limit.js` |
| DB drivers (`extractHost`, `runQuery`) | `proxy/lib/drivers/*.js` |

## Before you change X, read Y

- **Anything in `proxy/`:** read `proxy/api/query.js` end to end, plus the guard you're touching.
- **A new DB driver:** it must export `parseConnection(connectionString) → { host, ... }`, building the config from known fields only, and `runQuery(config, sql, { maxRows })`, which must run read-only and cap rows on the server. Register it in `DRIVERS` in `proxy/api/query.js`, in `DIALECTS` in `proxy/lib/sql-guard.js`, in `INTROSPECTION` in `js/schema-explorer.js`, and in the `<select id="setting-db-type">` in `index.html`. Add its cases to `proxy/test/drivers.test.js`, plus a `MANY_ROWS` query and a test database in `proxy/test/helpers/databases.js`.
- **Anything that renders results:** read invariant 5 first.

## Known residual risks (not fixed yet)

- **DNS rebinding:** the SSRF guard resolves the host, then the driver resolves it again. Only matters with `ALLOW_PRIVATE_HOSTS=false`, i.e. a public deploy.
- **MySQL:** an explicit `LIMIT` larger than 1000 overrides `sql_select_limit`. The rows are trimmed afterwards, but the server still sends them all.
- **MySQL and SQL Server drivers** have only been tested through unit tests until someone runs `npm run db:up:all`.

## Working rules

- **Read the code before naming a cause.** Don't guess; cite `file:line`.
- **Bug reports go through the `repro-bug` skill:** reproduce it, prove it fails, then fix it.
- **Verify before you report.** Run `npm run check`. For any UI change, also open the app in the browser and exercise the feature. Say what you saw, not what you expect.
- **Code comments are in Portuguese** and explain *why*. Don't write history in comments ("changed X because…"); that belongs in the commit message. Don't leave commented-out code.
- Match the surrounding style. Quotes vary per file (single vs double); follow the file you're in.
