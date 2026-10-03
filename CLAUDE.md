# QueryIt

Browser notebook for querying databases: SQL cells run through a local proxy, JS cells read their results and draw charts.

## Stack

- **No build step.** Plain ES modules served as-is. Don't add bundlers, TypeScript or frameworks.
- **Frontend** (`index.html`, `js/`, `css/`): served by `server.js` on port 5500. CodeMirror comes from esm.sh through the import map in `index.html`, pinned to exact versions. Pin any new package the same way.
- **Proxy** (`proxy/`): its own package (`proxy/package.json`) on port 3000, single endpoint `POST /api/query`. Drivers: `pg`, `mysql2`, `mssql`.
- Node 22+. Root `npm install` brings only dev tooling (ESLint) and turns on the git hooks; the proxy has its own dependencies (`npm install --prefix proxy`).

## Commands

| Task | Command |
|---|---|
| Run both servers | `npm run dev` |
| Frontend only / proxy only | `npm start` / `npm start --prefix proxy` |
| Lint: ESLint + feature-map coverage + pinned CDN versions | `npm run lint` |
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

## Enforcement (what stops you)

- **ESLint** (`eslint.config.js`) fails on: `innerHTML`/`outerHTML`/`insertAdjacentHTML`/`document.write`; `fetch` outside `js/lib/api.js`; `eval`/`new Function` outside `js/notebook/js-cell.js`; the frontend importing `proxy/` or the proxy importing `js/`; database libraries or drivers imported anywhere but `proxy/api/query.js` → `drivers/index.js`; commented-out code; `TODO`/`FIXME`/`XXX`/`HACK` markers.
- **`scripts/check-feature-map.js`**: every `index.html` id and source file must be in `docs/feature-map.md`.
- **`scripts/check-pins.js`**: every CDN URL needs an exact version, and every bare import in `js/` must be in the import map.
- **`proxy/test/drivers.test.js`**: every driver in the registry must be registered everywhere else.
- **When it runs:** a Claude Code hook lints each file right after you edit it (`scripts/hooks/lint-edited.js`), and the git pre-commit hook runs `npm run check` (`.githooks/`).
- **When a rule blocks you, follow the message; don't work around it.** Never add `eslint-disable`, `--no-verify` or a new exception in `eslint.config.js` without the user agreeing.

## Invariants (never break these)

1. **Writes are stopped by three layers. Never weaken one because another exists:**
   - **`proxy/lib/sql-guard.js`** parses the SQL into an AST. It allows exactly one `SELECT` and rejects `INTO` and a denylist of dangerous functions. `js/sql-guard.js` is only a fast regex pre-check for UX. Never move trust to the client, and never import the client guard from the proxy.
   - **The driver** runs the query in a read-only transaction (SQL Server: a transaction that is always rolled back) and caps the rows on the server: Postgres uses a cursor with `FETCH`, MySQL `sql_select_limit`, SQL Server `SET ROWCOUNT`. Never rewrite the user's SQL to add `LIMIT` or `TOP`.
   - **In production**, the database user should only have `SELECT` permission. The denylist will always miss something, such as dynamic SQL inside a function.
2. **Every proxy request goes through all its guards, in order:** CORS (unknown `Origin` → 403) → rate limit → input validation → `assertReadOnly` → `driver.parseConnection` → `assertHostIsSafe` (SSRF) → `driver.runQuery` (read-only, row cap) → timeout. The driver must connect with **exactly** the config returned by `parseConnection`. Never pass the raw connection string to a database library, because its query parameters (`?host=`, `?socketPath=`, a repeated `Server=`) would connect somewhere the SSRF guard never checked.
3. **Errors returned to the client go through `sanitizeError`**, so a connection string never leaks.
4. **The local servers are local.** Both `server.js` and `proxy/server.js` listen on `127.0.0.1` unless `HOST` is set. `ALLOW_PRIVATE_HOSTS=true` is a local-only default (set in `proxy/server.js`); production must run with it `false`. The proxy accepts browser requests only from local origins and the ones listed in `ALLOWED_ORIGINS`; an empty list means local-only, **never** "allow all". `test/servers.test.js` and the CORS tests in `proxy/test/query.test.js` enforce this.
5. **Database data is text, never HTML.** Build DOM only with `h()`/`show()`/`showMessage()` from `js/lib/dom.js`; they always insert text nodes.
6. **`new Function` in `js/notebook/js-cell.js` is intentional** (it runs user-written JS cells). Don't use it, or `eval`, anywhere else.
7. **`server.js` serves only `index.html`, `css/` and `js/`.** It's an allowlist, so `.git/`, `.claude/`, `docs/`, `proxy/`, `node_modules/` and any new folder stay private. A new public folder means adding it to `PUBLIC_DIRS` deliberately.

## Where things live

**`docs/feature-map.md`** is the detailed map: DOM ids and selectors, how to drive each feature, state, the proxy contract, every user-facing message, and known bugs. Read it before reproducing a bug or verifying UI. Update it in the same change when you touch the UI, the messages or the API (`npm run lint` checks that every id and source file is listed).

| Feature | Files |
|---|---|
| App wiring | `js/app.js` |
| DOM building (only way) | `js/lib/dom.js` |
| Proxy requests (only `fetch`) | `js/lib/api.js` |
| SQL the app generates (introspection, SELECT button) | `js/sql-preset.js` |
| Settings modal (`localStorage` key `queryit.settings`) | `js/settings.js` |
| Schema explorer | `js/schema-explorer.js` |
| Cells (shell, editor, SQL, JS) | `js/notebook/cell.js`, `editor.js`, `sql-cell.js`, `js-cell.js` |
| Shared variables between cells | `js/notebook/kernel-state.js` |
| Charts and tables for JS cells | `js/charts.js` |
| Proxy handler | `proxy/api/query.js` |
| Proxy guards | `proxy/lib/sql-guard.js`, `ssrf-guard.js`, `rate-limit.js` |
| DB drivers (`parseConnection`, `runQuery`), registry | `proxy/lib/drivers/*.js`, `proxy/lib/drivers/index.js` |

## Before you change X, read Y

- **Anything in `proxy/`:** read `proxy/api/query.js` end to end, plus the guard you're touching.
- **A new DB driver:** it must export `parseConnection(connectionString) → { host, ... }`, building the config from known fields only, and `runQuery(config, sql, { maxRows })`, which must run read-only and cap rows on the server. Add it to `proxy/lib/drivers/index.js`, then run `npm test`: the registry test in `proxy/test/drivers.test.js` names every other place still missing it (`DIALECTS`, `INTROSPECTION` in `js/sql-preset.js`, the `<option>` in `index.html`, `DATABASES`/`MANY_ROWS` in the test helpers). Add `parseConnection` cases to the same test file.
- **Anything that renders results:** read invariant 5 first.

## Known residual risks (not fixed yet)

- **Any local origin passes the proxy CORS check, on any port.** Another app you run on `http://localhost:8080` (or one with an XSS hole) could use the proxy. Narrowing it to the QueryIt frontend's port would break `npm run dev` on a custom `PORT`.


- **DNS rebinding:** the SSRF guard resolves the host, then the driver resolves it again. Only matters with `ALLOW_PRIVATE_HOSTS=false`, i.e. a public deploy.
- **MySQL:** an explicit `LIMIT` larger than 1000 overrides `sql_select_limit`. The rows are trimmed afterwards, but the server still sends them all.
- **MySQL and SQL Server drivers** have only been tested through unit tests until someone runs `npm run db:up:all`.

## Skills and agents (`.claude/`)

| When | Use |
|---|---|
| Before reporting any change as done | `verify` skill |
| A bug report, an error, "X doesn't work" | `repro-bug` skill |
| "Why does X happen?", an unclear failure, before naming a cause | `investigate` skill |
| Any change under `proxy/` or to `js/sql-preset.js` | `proxy-change` skill (required) |
| Supporting a new database type | `add-db-driver` skill |
| Before committing a non-trivial change | `reviewer` subagent (read-only, a different model) |

When an agent gets something wrong or a human has to step in, add a row to `docs/agent-log.md` and turn it into a rule, test or skill line.

## Working rules

- **Read the code before naming a cause.** Don't guess; cite `file:line`.
- **Bug reports go through the `repro-bug` skill:** reproduce it, prove it fails, then fix it.
- **Verify before you report.** Run `npm run check`. For any UI change, also open the app in the browser and exercise the feature. Say what you saw, not what you expect.
- **Code comments are in Portuguese** and explain *why*. Don't write history in comments ("changed X because…"); that belongs in the commit message. Don't leave commented-out code.
- **Edit code with the Edit/Write tools**, not Python or shell heredocs: string escaping has mangled regexes here before (see `docs/agent-log.md`).
- **Run any new or changed skill once** against the real app before committing it.
- Match the surrounding style. Quotes vary per file (single vs double); follow the file you're in.
