# QueryIt

Browser notebook for querying databases: SQL cells run through a local proxy, JS cells read their results and draw charts.

## Stack

- **No build step.** Plain ES modules served as-is. Don't add bundlers, TypeScript or frameworks.
- **Frontend** (`index.html`, `js/`, `css/`): served by `server.js` on port 5500. CodeMirror comes from esm.sh through the import map in `index.html`, pinned to exact versions. Pin any new package the same way.
- **Proxy** (`proxy/`): its own package (`proxy/package.json`) on port 3000, single endpoint `POST /api/query`. Drivers: `pg`, `mysql2`, `mssql`.
- Node 18+. The root package has no dependencies; the proxy does (`npm install --prefix proxy`).

## Commands

| Task | Command |
|---|---|
| Run both servers | `npm run dev` |
| Frontend only / proxy only | `npm start` / `npm start --prefix proxy` |
| Lint (syntax check for now; ESLint later) | `npm run lint` |
| Tests (`node:test`, `*.test.js`) | `npm test` |
| **Everything; run before saying a task is done** | `npm run check` |

Agents can also start the servers through `.claude/launch.json` (`frontend`, `proxy`) and use the browser pane.

## Invariants (never break these)

1. **`proxy/lib/sql-guard.js` is the security barrier.** It parses the SQL into an AST and allows exactly one `SELECT`. `js/sql-guard.js` is only a fast regex pre-check for UX. Never move trust to the client, never loosen the proxy guard to make a query work, and never import the client guard from the proxy.
2. **Every proxy request goes through all its guards, in order:** CORS → rate limit → input validation → `assertReadOnly` → `assertHostIsSafe` (SSRF) → `applyRowLimit` → timeout. Don't add code paths that skip any of them.
3. **Errors returned to the client go through `sanitizeError`**, so a connection string never leaks.
4. **`ALLOW_PRIVATE_HOSTS=true` is a local-only default** (set in `proxy/server.js`). Production must run with it `false`.
5. **Database data is text, never HTML.** Table and column names, cell values and error messages go into the DOM through `textContent` or `escapeHtml`. Never interpolate them into `innerHTML`.
6. **`new Function` in `js/notebook/js-cell.js` is intentional** (it runs user-written JS cells). Don't use it, or `eval`, anywhere else.
7. **`server.js` must never serve files from `proxy/`** or from outside the project root.

## Where things live

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
- **A new DB driver:** copy the shape of an existing driver and register it in `DRIVERS` in `proxy/api/query.js`, in `DIALECTS` in `proxy/lib/sql-guard.js`, in `INTROSPECTION` in `js/schema-explorer.js`, and in the `<select id="setting-db-type">` in `index.html`.
- **Anything that renders results:** read invariant 5 first.

## Working rules

- **Read the code before naming a cause.** Don't guess; cite `file:line`.
- **Verify before you report.** Run `npm run check`. For any UI change, also open the app in the browser and exercise the feature. Say what you saw, not what you expect.
- **Code comments are in Portuguese** and explain *why*. Don't write history in comments ("changed X because…"); that belongs in the commit message. Don't leave commented-out code.
- Match the surrounding style. Quotes vary per file (single vs double); follow the file you're in.
