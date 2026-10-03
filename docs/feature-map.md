# QueryIt feature map

How to find, drive and check every feature of the app. Read it before reproducing a bug or verifying a UI change.
**Keep it current:** a change to the UI, a DOM id, a user-facing message or the proxy contract updates this file in the same change. `npm run lint` fails if an id in `index.html` or a source file is missing from this map.

UI text is in Portuguese; bug reports usually quote it. The messages below are listed so a report can be matched to code.

## Setup to drive the app

1. `npm run db:up`, then `npm run db:seed` (test databases; see `docker-compose.yml`).
2. `preview_start` with `proxy` and `frontend` (`.claude/launch.json`), or `npm run dev`.
3. Open `http://localhost:5500`. On a fresh profile the settings modal opens by itself.
4. Postgres test connection string: `postgres://queryit:queryit@localhost:55432/queryit`. The Proxy URL is pre-filled on localhost.

Seed data: `customers` (4 rows; id 3 has a `null` email), `orders` (4 rows), `order items` (3 rows; name with a space), sequence `order_seq` (Postgres only).

Fast path for automated checks: `localStorage.setItem('queryit.settings', JSON.stringify({ dbType, connectionString, proxyUrl }))`, then reload. Remove the key afterwards.

---

## 1. Settings modal

| | |
|---|---|
| Files | `js/settings.js`, markup in `index.html` |
| Open / close | `#open-settings` opens `#settings-modal` (by removing class `hidden`). `#close-settings` cancels. Submitting `#settings-form` saves. |
| Fields | `#setting-db-type` (`postgres` \| `mysql` \| `mssql`), `#setting-connection-string` (password input), `#setting-proxy-url` |
| State | `localStorage['queryit.settings']` = `{ dbType, connectionString, proxyUrl }`. `getSettings()` merges it over the defaults. |
| Defaults | `dbType: 'postgres'`. `proxyUrl` is `http://localhost:3000/api/query` when the page is on `localhost`/`127.0.0.1`, otherwise empty. |
| Auto-open | `js/app.js` opens the modal on load when `connectionString` is empty. |

**Exercise:** open, fill in the fields, Salvar, reload, reopen. The values must persist.
**Failure modes:** corrupt JSON in storage falls back to the defaults silently. Changing `dbType` doesn't re-highlight open SQL editors; the dialect is read when an editor loads SQL highlighting.

## 2. Schema explorer (sidebar)

| | |
|---|---|
| Files | `js/schema-explorer.js`, `js/sql-preset.js` (the SELECT button's SQL) |
| Trigger | `#load-schema` ("Carregar") |
| Output | `#schema-tree`: one `<details>` per table, containing a `<summary>` (a `.table-name` span reading `schema.table`, plus a `.insert-select-btn` button "SELECT") and a `<ul>` of `<li>` with the column name and a `.col-type` span |
| Request | `POST proxyUrl` with `{ dbType, connectionString, sql }`, where `sql` is the `INTROSPECTION[dbType]` query against `information_schema.columns` |
| SELECT button | `selectPreset(dbType, schema, table)` builds the SQL, then `insertSqlPreset` (§3) adds a new SQL cell with it. Names are always quoted for the dialect: Postgres `SELECT * FROM "public"."order items" LIMIT 100`, MySQL with backticks, SQL Server `SELECT TOP 100 * FROM [dbo].[order items]` (double quotes when the name contains `]`, because the proxy's parser rejects `]]`). |

**Exercise:** load with the seed data. Expect `public.customers`, `public.order items`, `public.orders`. Expand one; the columns and types are listed. Click SELECT on `order items`, then run the new cell: `3 linha(s)`.
**Messages:** "Configure a conexão em Configurações primeiro." (no connection or proxy URL) · "Carregando schema…" · "Nenhuma tabela encontrada." · any proxy error, shown as text in `.hint.error`.
**Invariant:** names, types and errors come from the database. Only ever add them as text.

## 3. Notebook cells (shared shell)

| | |
|---|---|
| Files | `js/notebook/cell.js` (shell), `js/notebook/editor.js` (CodeMirror), `js/app.js` (buttons) |
| Add | `#add-sql-cell`, `#add-js-cell`. Cells are appended to `#cells`. |
| Cell DOM | `.cell` > `.cell-header` (`.cell-type`, `.cell-name` SQL only, `.cell-language` select, `.run-btn` "▶ Run", `.cell-status`, `.remove-btn` "✕") + `.cell-source` (editor) + `.cell-output` |
| Run | `.run-btn`, or Ctrl/Cmd+Enter in the editor (`Mod-Enter`, highest precedence) |
| Ids | `cell_1`, `cell_2`… from a module counter. The counter never resets, so ids keep counting up after a removal. |
| Language select | Changes **only syntax highlighting** (`LANGUAGES` in `editor.js`, loaded lazily from esm.sh). Execution always follows the cell type. |
| Remove | `.remove-btn` destroys the editor and the element. The cell's variable stays in kernel state. |

**Driving the editor:** click `.cell-source .cm-content`, then type, or call `cell.editor.setValue()` from code. The editor's text is `view.state.doc`; `textContent` of `.cell-source` includes line numbers.

## 4. SQL cell

| | |
|---|---|
| Files | `js/notebook/sql-cell.js`, `js/sql-guard.js` (client pre-check) |
| Flow | client pre-check, then settings check, then `POST proxyUrl`, then render the table, then `setVar(name, { columns, rows })` |
| Variable name | `.cell-name` input (default: the cell id). Sanitized to a JS identifier (invalid characters become `_`, a leading digit gets a `_` prefix). |
| Output | `.cell-output table` with `thead th` / `tbody td`; `null` is shown as `NULL`, objects as JSON |
| Status | `"N linha(s) em Xms"`, plus `" (truncado)"` at the 1000-row cap · `Executando…` · `Erro (Xms)` · `Bloqueado` · `Erro de rede` |

**Exercise:** `select * from customers` gives `4 linha(s)`. `select n from generate_series(1, 1500) as n` gives `1000 linha(s) … (truncado)`.
**Messages (client pre-check, `js/sql-guard.js`):** "Escreva uma consulta antes de rodar." · "Apenas um comando por célula é permitido." · "Somente consultas de leitura (SELECT) são permitidas." · "A consulta deve começar com SELECT ou WITH."
**Messages (settings):** "Configure a connection string em Configurações." · "Configure o Proxy URL em Configurações." (the status isn't updated in these two cases)
**Messages (proxy):** see §7.
**Known bugs:** the client pre-check refuses forbidden words inside string literals (`where status = 'delete'`); this is the todo test in `test/js/sql-guard.test.js`.

## 5. JS cell and kernel state

| | |
|---|---|
| Files | `js/notebook/js-cell.js`, `js/notebook/kernel-state.js` |
| Execution | `new Function('charts', 'el', 'console', ...varNames, code)`. This is intentional; it runs the user's own code. |
| In scope | every SQL cell variable (`{ columns, rows }`, with `rows` as objects keyed by column), `charts` (§6), `el` (this cell's `.cell-output`), `console` |
| Output | a non-`undefined` return value is shown in a `<pre>` (objects as pretty JSON). Errors appear in `.error`. |
| Status | `OK em Xms` · `Erro` |

**Exercise:** after the SQL cell `cell_1` returns customers, `return cell_1.rows.length` gives `4`.
**Notes:** JS cells only read state; they don't create variables. The code runs synchronously; a returned Promise is shown as `{}`.

## 6. Charts (`charts` inside JS cells)

| | |
|---|---|
| Files | `js/charts.js`; Chart.js from `cdn.jsdelivr.net/npm/chart.js@4` (major version only, **not pinned**) |
| API | `createBarChart(el, rows, { x, y, label })`, `createLineChart(...)`, `createPieChart(el, rows, { labelKey, valueKey })`, `createTable(el, rows)` |

**Exercise:** `charts.createBarChart(el, cell_1.rows, { x: 'name', y: 'id' })` draws a `<canvas>` in the cell output.
**Messages:** "Sem dados." (`createTable` with no rows).
**Invariant:** `createTable` gets column names and values from the database, so it builds cells with `textContent`.

## 7. Proxy: `POST /api/query`

| | |
|---|---|
| Files | `proxy/server.js` (HTTP and the JSON body), `proxy/api/query.js` (handler), `proxy/lib/*` (guards), `proxy/lib/drivers/*` |
| Request | `{ dbType: 'postgres' \| 'mysql' \| 'mssql', connectionString, sql }` |
| 200 | `{ columns: string[], rows: any[][], rowCount, elapsedMs, truncated }` (`truncated` when `rowCount >= 1000`) |
| Errors | `{ error }` with 400 (validation, guard, SSRF, database error), 405 (not POST), 429 (rate limit: 30 per minute per IP), 404 (other paths) |
| Order | CORS → rate limit → validation → `assertReadOnly` → `parseConnection` → `assertHostIsSafe` → `runQuery` (read-only, 1000-row cap) → 12s timeout. See CLAUDE.md invariants 1–2. |

**Exercise without the UI:** `callHandler()` in `proxy/test/helpers/call-handler.js`, or `curl -X POST localhost:3000/api/query -H 'Content-Type: application/json' -d '{...}'`.
**Messages:** `dbType inválido…` · `connectionString é obrigatório.` · `sql é obrigatório.` · `SQL inválido: …` · `Apenas um comando por execução é permitido.` · `Somente consultas SELECT são permitidas (recebido: X).` · `SELECT ... INTO não é permitido.` · `Função não permitida: X.` · `Conexão recusada: host resolve para um endereço não permitido (…)` · `Muitas requisições…` · `Tempo limite da consulta excedido.` · `JSON inválido.` (from `server.js`) · Postgres `cannot execute X in a read-only transaction`.

## 8. Static server

| | |
|---|---|
| Files | `server.js` |
| Behavior | serves project files on 5500. `/` maps to `index.html`. Returns 404 outside the root and for anything under `proxy/`. MIME types come from a fixed table. |

---

## Source file index

Every source file and the section that covers it (`npm run lint` checks this list).

| File | § |
|---|---|
| `index.html` | 1–6 |
| `server.js` | 8 |
| `js/app.js` | 3 |
| `js/settings.js` | 1 |
| `js/schema-explorer.js` | 2 |
| `js/sql-guard.js` | 4 |
| `js/sql-preset.js` | 2 |
| `js/charts.js` | 6 |
| `js/notebook/cell.js` | 3 |
| `js/notebook/editor.js` | 3 |
| `js/notebook/sql-cell.js` | 4 |
| `js/notebook/js-cell.js` | 5 |
| `js/notebook/kernel-state.js` | 5 |
| `proxy/server.js` | 7 |
| `proxy/api/query.js` | 7 |
| `proxy/lib/sql-guard.js` | 7 |
| `proxy/lib/ssrf-guard.js` | 7 |
| `proxy/lib/rate-limit.js` | 7 |
| `proxy/lib/drivers/postgres.js` | 7 |
| `proxy/lib/drivers/mysql.js` | 7 |
| `proxy/lib/drivers/mssql.js` | 7 |
