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
| Files | `js/schema-explorer.js`, `js/sql-preset.js` (`INTROSPECTION` query and the SELECT button's SQL), `js/lib/api.js` (request) |
| Trigger | `#load-schema` ("Carregar") |
| Output | `#schema-tree`: one `<details>` per table, containing a `<summary>` (a `.table-name` span reading `schema.table`, plus a `.insert-select-btn` button "SELECT") and a `<ul>` of `<li>` with the column name and a `.col-type` span |
| Request | `POST proxyUrl` with `{ dbType, connectionString, sql }`, where `sql` is the `INTROSPECTION[dbType]` query against `information_schema.columns` |
| SELECT button | `selectPreset(dbType, schema, table)` builds the SQL, then `insertSqlPreset` (§3) adds a new SQL cell with it. Names are always quoted for the dialect: Postgres `SELECT * FROM "public"."order items" LIMIT 100`, MySQL with backticks, SQL Server `SELECT TOP 100 * FROM [dbo].[order items]` (double quotes when the name contains `]`, because the proxy's parser rejects `]]`). |
| Autocomplete | After a load, the tables go to `setSchemaTables()` in `js/notebook/sql-schema.js`; every SQL editor (open or new) reloads its language with that schema (§3). |

**Exercise:** load with the seed data. Expect `public.customers`, `public.order items`, `public.orders`. Expand one; the columns and types are listed. Click SELECT on `order items`, then run the new cell: `3 linha(s)`.
**Messages:** "Configure a conexão em Configurações primeiro." (no connection or proxy URL) · "Carregando schema…" · "Nenhuma tabela encontrada." · any proxy error, shown as text in `.hint.error`.
**Invariant:** names, types and errors come from the database. Only ever add them as text.

## 3. Notebook cells (shared shell)

| | |
|---|---|
| Files | `js/notebook/cell.js` (shell), `js/notebook/editor.js` (CodeMirror), `js/app.js` (buttons) |
| Add | `#add-sql-cell`, `#add-js-cell`. Cells are appended to `#cells`. |
| Cell DOM | `.cell` > `.cell-header` (`.cell-type`, `.cell-name` SQL only, `.cell-language` select, `.run-btn` "▶ Run", `.cell-status`, `.move-up-btn` "▲", `.move-down-btn` "▼", `.remove-btn` "✕") + `.cell-source` (editor) + `.cell-output` |
| Run | `.run-btn`, or Ctrl/Cmd+Enter in the editor (`Mod-Enter`, highest precedence) |
| Ids | `cell_1`, `cell_2`… from a module counter. The counter never resets, so ids keep counting up after a removal. Restored cells keep their saved id, and the counter starts after the highest one (§9). |
| Language select | Changes **only syntax highlighting** (`LANGUAGES` in `editor.js`, loaded lazily from esm.sh). Execution always follows the cell type. |
| Move | `.move-up-btn` / `.move-down-btn` swap the cell with its sibling in `#cells`; the editor, output and status move with it. The first cell's ▲ and the last cell's ▼ are dimmed and not clickable (CSS `:first-child` / `:last-child`). Moving doesn't rerun anything or change kernel state: variables still reflect the order cells were **run**, not their position. |
| Remove | `.remove-btn` destroys the editor (and its schema subscription) and the element. The cell's variable stays in kernel state. |
| SQL autocomplete | Only after the sidebar schema is loaded (§2). lang-sql completes schemas, tables of the default schema (`public` / `dbo` / the only schema) and `table.`/`alias.` columns; `unqualifiedColumns` in `editor.js` adds bare column names of the tables mentioned in the cell text (detail `table · type`). Names that need it are quoted for the dialect (`"order items"`). Popup: `.cm-tooltip-autocomplete li` (`.cm-completionLabel`). Ctrl+Space opens it explicitly. |

**Driving the editor:** click `.cell-source .cm-content`, then type, or call `cell.editor.setValue()` from code. The editor's text is `view.state.doc`; `textContent` of `.cell-source` includes line numbers.

## 4. SQL cell

| | |
|---|---|
| Files | `js/notebook/sql-cell.js`, `js/sql-guard.js` (client pre-check), `js/lib/api.js` (request) |
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
| Execution | `new Function('charts', 'el', 'console', 'vars', ...varNames, code)`. This is intentional; it runs the user's own code. |
| In scope | every SQL cell variable (`{ columns, rows }`, with `rows` as objects keyed by column), `vars` (a shallow copy of the whole kernel state, name → value; a cell named `vars` shadows it), `charts` (§6), `el` (this cell's `.cell-output`), `console` |
| Output | a non-`undefined` return value is shown in a `<pre>` (objects as pretty JSON). Errors appear in `.error`. |
| Status | `OK em Xms` · `Erro` |

**Exercise:** after the SQL cell `cell_1` returns customers, `return cell_1.rows.length` gives `4`, and `return Object.keys(vars)` lists `["cell_1"]`.
**Notes:** JS cells only read state; they don't create variables. The code runs synchronously; a returned Promise is shown as `{}`.

## 6. Charts (`charts` inside JS cells)

| | |
|---|---|
| Files | `js/charts.js`; Chart.js 4.5.1 from jsdelivr (`<script>` in `index.html`, pinned; `npm run lint` rejects unpinned CDN URLs) |
| API | `createBarChart(el, rows, { x, y, label })`, `createLineChart(...)`, `createPieChart(el, rows, { labelKey, valueKey })`, `createTable(el, rows)` |

**Exercise:** `charts.createBarChart(el, cell_1.rows, { x: 'name', y: 'id' })` draws a `<canvas>` in the cell output.
**Messages:** "Sem dados." (`createTable` with no rows).
**Invariant:** `createTable` gets column names and values from the database, so it builds cells with `h()` (text only).

## 7. Proxy: `POST /api/query`

| | |
|---|---|
| Files | `proxy/server.js` (HTTP and the JSON body), `proxy/api/query.js` (handler), `proxy/lib/*` (guards), `proxy/lib/drivers/*` (`index.js` is the registry; only the handler imports it) |
| Request | `{ dbType: 'postgres' \| 'mysql' \| 'mssql', connectionString, sql }` |
| 200 | `{ columns: string[], rows: any[][], rowCount, elapsedMs, truncated }` (`truncated` when `rowCount >= 1000`) |
| Errors | `{ error }` with 400 (validation, guard, SSRF, database error), 403 (origin not allowed), 405 (not POST), 429 (rate limit: 30 per minute per IP), 404 (other paths) |
| CORS | A browser `Origin` must be local (`localhost`, `127.0.0.1`, `[::1]`, any port) or listed in `ALLOWED_ORIGINS` (comma-separated, read on each request). Otherwise 403 before anything else runs, including preflight. An empty list means local-only. Requests without `Origin` (curl) skip CORS. |
| Listens on | `127.0.0.1:3000` (`HOST`/`PORT` override) |
| Order | CORS → rate limit → validation → `assertReadOnly` → `parseConnection` → `assertHostIsSafe` → `runQuery` (read-only, 1000-row cap) → 12s timeout. See CLAUDE.md invariants 1–2. |

**Exercise without the UI:** `callHandler()` in `proxy/test/helpers/call-handler.js`, or `curl -X POST localhost:3000/api/query -H 'Content-Type: application/json' -d '{...}'`.
**Messages:** `Origem não permitida.` · `dbType inválido…` · `connectionString é obrigatório.` · `sql é obrigatório.` · `SQL inválido: …` · `Apenas um comando por execução é permitido.` · `Somente consultas SELECT são permitidas (recebido: X).` · `SELECT ... INTO não é permitido.` · `Função não permitida: X.` · `Conexão recusada: host resolve para um endereço não permitido (…)` · `Muitas requisições…` · `Tempo limite da consulta excedido.` · `JSON inválido.` (from `server.js`) · Postgres `cannot execute X in a read-only transaction`.

## Shared helpers (`js/lib/`)

| | |
|---|---|
| `js/lib/dom.js` | `h(tag, props, ...children)` builds elements (text children are always text nodes); `show(el, ...children)` replaces content (empty call = clear); `showMessage(el, text, className = 'hint')`. **The only way to build DOM**: `innerHTML`/`outerHTML`/`insertAdjacentHTML` fail ESLint. |
| `js/lib/api.js` | `runQuery(sql)` posts to the proxy with the saved settings and resolves with the §7 200 body; throws `ProxyError` (has `status`) for proxy errors, the fetch error for network failures. `missingSetting()` returns `'connectionString'`, `'proxyUrl'` or `null`. **The only module allowed to call `fetch`.** |

## 8. Static server

| | |
|---|---|
| Files | `server.js` |
| Behavior | serves on `127.0.0.1:5500` (`HOST`/`PORT` override). `/` maps to `index.html`. Only `index.html`, `css/**` and `js/**` are public (an allowlist); everything else, including malformed URLs, gets 404. MIME types come from a fixed table. |
| Tests | `test/servers.test.js` starts both servers and checks they can't be reached from the LAN address, plus the allowlist |

## 9. Notebook persistence

| | |
|---|---|
| Files | `js/notebook/persistence.js` (format, validation, storage), `js/notebook/cell.js` (`serialize()`, `serializeCells`, `reserveCellIds`, restore through `createCell(type, saved)`), `js/app.js` (load on startup, autosave) |
| State | `localStorage['queryit.notebook']` = `{ version: 1, cells: [{ id, type, name (SQL only), language, source }] }`, in DOM order |
| Not saved | outputs, query results, kernel state, the connection string |
| Save | 300 ms after the last change (debounce): code edits (`cell-change` event from the editor), `input`/`change` in `#cells` (variable name, language), and adding / removing / moving cells (`MutationObserver` on `#cells`). A pending save is flushed on `pagehide`. |
| Load | `js/app.js` on startup: validates with `parse()` (unknown cell types dropped, bad fields replaced with defaults; an id that isn't `cell_N` with up to 9 digits, or repeats an earlier one, gets a fresh id; a language not in `LANGUAGES` falls back to the cell type), moves the id counter past the highest restored `cell_N`, then recreates the cells. Restored cells **don't run**; their status reads `Não executada`. |
| Corrupt data | `loadNotebook()` returns `problem`: `'unreadable'` (bad JSON or unknown `version`; the notebook loads empty) or `'partial'` (some cells dropped). Either way the raw text is copied first to `queryit.notebook.corrupt`, or to `queryit.notebook.corrupt.<timestamp>` when that key already holds a different copy, so the next save doesn't destroy it. If the copy fails, the tab **doesn't save at all**. |
| Status | `#notebook-status` (toolbar, `.hint.warning`), empty unless something went wrong |
| Other tabs | When another tab writes `queryit.notebook` (the `storage` event, which never fires in the tab that wrote), this tab stops autosaving and shows `#notebook-conflict` (class `hidden` removed). `#notebook-reload` reloads the page with the other tab's version; `#notebook-keep` saves this tab's version over it and resumes autosaving, and then the other tab shows the warning. Nothing is reloaded automatically, because that would erase this tab's outputs. An edit still waiting for the 300 ms debounce when the other tab writes isn't saved; it stays on screen, "Manter esta versão" saves it and "Recarregar" discards it. |
| Tests | `test/js/persistence.test.js` |

**Exercise:** add a SQL cell and a JS cell, type in both, rename the SQL variable, change the JS cell's language, move the JS cell up, reload. Everything comes back in the same order, with `Não executada`. Run the SQL cell, then the JS one.
**Fast path:** `localStorage.setItem('queryit.notebook', JSON.stringify({ version: 1, cells: [...] }))`, then reload. Remove the key afterwards (`queryit.notebook` and `queryit.notebook.corrupt`).
**Exercise (two tabs):** open the app in two tabs, edit a cell in tab A, then check that tab B shows `#notebook-conflict` and that editing in B doesn't change `queryit.notebook`. Click `#notebook-keep` in B: storage gets B's version and A shows the warning.
**Messages:** "O notebook salvo não pôde ser lido; uma cópia ficou em queryit.notebook.corrupt." · "Algumas células salvas não puderam ser lidas; uma cópia do notebook ficou em queryit.notebook.corrupt." (the key named is the one actually used) · "O notebook salvo não pôde ser lido por inteiro e a cópia falhou; esta aba não vai salvar para não apagá-lo." · "Não foi possível salvar o notebook neste navegador." · "O notebook foi alterado em outra aba; esta aba parou de salvar." (buttons "Recarregar", "Manter esta versão")

---

## Source file index

Every source file and the section that covers it (`npm run lint` checks this list).

| File | § |
|---|---|
| `index.html` | 1–6, 9 |
| `server.js` | 8 |
| `js/app.js` | 3, 9 |
| `js/settings.js` | 1 |
| `js/schema-explorer.js` | 2 |
| `js/sql-guard.js` | 4 |
| `js/sql-preset.js` | 2 |
| `js/charts.js` | 6 |
| `js/notebook/cell.js` | 3, 9 |
| `js/notebook/editor.js` | 3 |
| `js/notebook/sql-schema.js` | 2–3 |
| `js/notebook/sql-cell.js` | 4 |
| `js/notebook/js-cell.js` | 5 |
| `js/notebook/kernel-state.js` | 5 |
| `js/notebook/persistence.js` | 9 |
| `proxy/server.js` | 7 |
| `proxy/api/query.js` | 7 |
| `proxy/lib/sql-guard.js` | 7 |
| `proxy/lib/ssrf-guard.js` | 7 |
| `proxy/lib/rate-limit.js` | 7 |
| `proxy/lib/drivers/postgres.js` | 7 |
| `proxy/lib/drivers/mysql.js` | 7 |
| `proxy/lib/drivers/mssql.js` | 7 |
| `proxy/lib/drivers/index.js` | 7 |
| `js/lib/dom.js` | Shared helpers |
| `js/lib/api.js` | Shared helpers |
