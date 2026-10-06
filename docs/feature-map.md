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

Fast path for automated checks: `localStorage.setItem('queryit.settings', JSON.stringify({ dbType, connectionString, proxyUrl }))`, then reload (the old single-connection format still loads; it becomes the connection "Padrão"). Remove the key afterwards.

---

## 1. Settings and connections

| | |
|---|---|
| Files | `js/settings.js` (storage, modal, switcher), `js/connections.js` (pure model: migrate, validate, add/remove/activate), `js/sql-preset.js` (`TEST_QUERY`), markup in `index.html` |
| Open / close | `#open-settings` opens `#settings-modal` (by removing class `hidden`). `#close-settings` cancels (discards every change made in the modal). Submitting `#settings-form` saves. |
| Connections | `#setting-connection` picks which saved connection the form edits; `#new-connection` "Nova" adds one ("Nova conexão"); `#delete-connection` "Excluir" removes the one being edited (disabled when it's the last). Changes stay in a draft until Salvar; Salvar also makes the edited connection the **active** one. |
| Fields | `#setting-connection-name`, `#setting-db-type` (`postgres` \| `mysql` \| `mssql`), `#setting-connection-string` (password input), `#setting-proxy-url` (one proxy for all connections) |
| Test | `#test-connection` "Testar conexão" runs `TEST_QUERY` (`select 1`) with the values **in the form**, saved or not. Result in `#test-connection-result`: "Testando…" · "Conexão OK (Xms)" (`.hint.ok`) · the proxy's error · "Proxy inacessível: …" (network error) · "Preencha a connection string e o Proxy URL." (all errors `.hint.error`). |
| Switcher | `#connection-switcher` in the top bar lists the saved connections by name and switches the active one immediately. |
| State | `localStorage['queryit.settings']` = `{ proxyUrl, activeId, connections: [{ id: 'conn_N', name, dbType, connectionString }] }`. `normalizeSettings()` validates it (drops repeated ids, fills missing fields, unknown `activeId` → the first) and always returns at least one connection. `getSettings()` returns the **active** connection flattened: `{ dbType, connectionString, proxyUrl, connectionName, activeId, connections }`, so callers that only query don't care that there are several. |
| Changing connection | Saving or switching to a different `dbType`/`connectionString` calls `resetSchemaExplorer()` (§2): the schema tree and autocomplete are cleared, and every open SQL editor reloads its highlighting with the new dialect. |
| Defaults | `dbType: 'postgres'`. `proxyUrl` is `http://localhost:3000/api/query` when the page is on `localhost`/`127.0.0.1`, otherwise empty. |
| Auto-open | `js/app.js` opens the modal on load when the active connection's `connectionString` is empty. |

**Exercise:** open, fill in the fields, Testar conexão ("Conexão OK"), Salvar, reload, reopen: values persist. Nova → name "Segunda", change the type, Salvar: the switcher lists both, and the second is active. Switch back in `#connection-switcher`: the schema tree shows "Conexão trocada…".
**Failure modes:** corrupt JSON in storage falls back to the defaults silently.

## 2. Schema explorer (sidebar)

| | |
|---|---|
| Files | `js/schema-explorer.js`, `js/sql-preset.js` (`INTROSPECTION` query and the SELECT button's SQL), `js/lib/api.js` (request) |
| Trigger | `#load-schema` ("Carregar") |
| Output | `#schema-tree`: one `<details>` per table, containing a `<summary>` (a `.table-name` span reading `schema.table`, plus a `.insert-select-btn` button "SELECT") and a `<ul>` of `<li>` with the column name and a `.col-type` span |
| Request | `POST proxyUrl` with `{ dbType, connectionString, sql }`, where `sql` is the `INTROSPECTION[dbType]` query against `information_schema.columns` |
| SELECT button | `selectPreset(dbType, schema, table)` builds the SQL, then `insertSqlPreset` (§3) adds a new SQL cell with it. Names are always quoted for the dialect: Postgres `SELECT * FROM "public"."order items" LIMIT 100`, MySQL with backticks, SQL Server `SELECT TOP 100 * FROM [dbo].[order items]` (double quotes when the name contains `]`, because the proxy's parser rejects `]]`). |
| Autocomplete | After a load, the tables go to `setSchemaTables()` in `js/notebook/sql-schema.js`; every SQL editor (open or new) reloads its language with that schema (§3). |
| Filter | `#schema-filter` filters the loaded tree as you type, without querying again (`filterSchemaTables` in `sql-schema.js`). A table whose `schema.table` contains the text shows in full; otherwise it shows if a column matches, already expanded, with the matching columns as `li.match`. |
| Reset | `resetSchemaExplorer(container)`, called when the active connection changes (§1): clears the loaded tables and `setSchemaTables([])`, which makes open SQL editors reload with the new dialect. A load still in flight when the connection changes (or when another load starts) is discarded. |

**Exercise:** load with the seed data. Expect `public.customers`, `public.order items`, `public.orders`. Expand one; the columns and types are listed. Click SELECT on `order items`, then run the new cell: `3 linha(s)`. Type `email` in `#schema-filter`: only `public.customers`, open, with `email` highlighted.
**Messages:** "Configure a conexão em Configurações primeiro." (no connection or proxy URL) · "Carregando schema…" · "Nenhuma tabela encontrada." · "Nenhuma tabela ou coluna corresponde ao filtro." · "Conexão trocada. Clique em \"Carregar\" para ver o schema." · any proxy error, shown as text in `.hint.error`.
**Invariant:** names, types and errors come from the database. Only ever add them as text.

## 3. Notebook cells (shared shell)

| | |
|---|---|
| Files | `js/notebook/cell.js` (shell), `js/notebook/editor.js` (CodeMirror), `js/notebook/runner.js` (batch runs), `js/app.js` (buttons) |
| Add | `#add-sql-cell`, `#add-js-cell`, `#add-md-cell` "+ Nota" (§10). Cells are appended to `#cells`. |
| Cell DOM | `.cell.cell-<type>` (`sql` \| `js` \| `md`) > `.cell-header` (`.cell-type` "SQL" / "JS" / "NOTA", `.cell-name` SQL only, `.format-btn` "Formatar" and `.cell-history` select SQL only (§4), `.cell-language` select, `.run-btn` "▶ Run", `.run-below-btn` "▶↓", `.cell-status`, `.move-up-btn` "▲", `.move-down-btn` "▼", `.remove-btn` "✕") + `.cell-source` (editor) + `.cell-output` |
| Run | `.run-btn`, or Ctrl/Cmd+Enter in the editor (`Mod-Enter`, highest precedence). One run per cell at a time: while a SQL cell runs, `.run-btn` reads "■ Stop" and clicking it cancels the query (§4); while a JS cell runs, `.run-btn` is `disabled` (running JS can't be interrupted). `cell.run()` resolves `true`/`false` (success); `cell.stop()` cancels. |
| Run all / from here | `#run-all` "▶▶ Rodar tudo" runs every cell in DOM order; `.run-below-btn` runs from that cell to the end (it dispatches the bubbling `run-from` event, handled in `app.js`). One cell at a time, and the batch **stops at the first cell that fails** (blocked, error, cancelled, missing settings). While a batch runs, `#run-all` reads "■ Parar": it cancels the current SQL query, doesn't start the next cell and releases the batch right away (a running JS cell can't be stopped; it finishes on its own, with its `.run-btn` disabled until then). Only one batch at a time; starting another is ignored. The cell list is fixed when the batch starts. A batch that reaches a cell already running on its own waits for that run and uses its result (`cell.run()` returns the run in progress). A cell removed while it runs never writes its variables. |
| Ids | `cell_1`, `cell_2`… from a module counter. The counter never resets, so ids keep counting up after a removal. Restored cells keep their saved id, and the counter starts after the highest one (§9). |
| Language select | Changes **only syntax highlighting** (`LANGUAGES` in `editor.js`, loaded lazily from esm.sh). Execution always follows the cell type. |
| Move | `.move-up-btn` / `.move-down-btn` swap the cell with its sibling in `#cells`; the editor, output and status move with it. The first cell's ▲ and the last cell's ▼ are dimmed and not clickable (CSS `:first-child` / `:last-child`). Moving doesn't rerun anything or change kernel state: variables still reflect the order cells were **run**, not their position. |
| Remove | `.remove-btn` cancels a running query, destroys the editor (and its schema subscription) and the element, and removes the variables this cell still owns from kernel state (§5). |
| SQL autocomplete | Only after the sidebar schema is loaded (§2). lang-sql completes schemas, tables of the default schema (`public` / `dbo` / the only schema) and `table.`/`alias.` columns; `unqualifiedColumns` in `editor.js` adds bare column names of the tables mentioned in the cell text (detail `table · type`). Names that need it are quoted for the dialect (`"order items"`). Popup: `.cm-tooltip-autocomplete li` (`.cm-completionLabel`). Ctrl+Space opens it explicitly. |

**Driving the editor:** click `.cell-source .cm-content`, then type, or call `cell.editor.setValue()` from code. The editor's text is `view.state.doc`; `textContent` of `.cell-source` includes line numbers.

## 4. SQL cell

| | |
|---|---|
| Files | `js/notebook/sql-cell.js`, `js/sql-guard.js` (client pre-check), `js/lib/api.js` (request), `js/notebook/result-view.js` (output, §11), `js/history.js` (history), `formatSql` in `js/notebook/editor.js` |
| Flow | client pre-check, then settings check (settings read **once**, at the start), then `POST proxyUrl`, then render the result, then add the SQL to the history, then `replaceVarsOf(cellId, [[name, { columns, rows }]])` (only on success) |
| Variable name | `.cell-name` input (default: the cell id). Sanitized to a JS identifier by `toVarName` (invalid characters become `_`, a leading digit gets a `_` prefix). Renaming and rerunning removes the old name. Also the file name of exports (§11). |
| Output | `renderResult` (§11): toolbar + `.result-table table` with `thead th.sortable` / `tbody td`; `null` is shown as `NULL` (`td.null`), objects as JSON |
| Pre-check | `js/sql-guard.js` removes comments and blanks out strings and quoted names (`'…'`, `"…"`, `` `…` ``, `[…]`, with doubled-quote escapes) before checking, so `where status = 'delete'` or `select 1 -- drop` pass and `select 'a'; delete …` is still refused. UX only; the proxy guard decides. |
| Format | `.format-btn` "Formatar" formats the editor text with `sql-formatter` (esm.sh, pinned in the import map, loaded on first use) in the active connection's dialect (`postgresql` / `mysql` / `transactsql`). If it can't parse the SQL, the status reads "Não foi possível formatar" and the reason is in the status `title`; the text is untouched. |
| History | Every successful query is saved in `localStorage['queryit.history']` = `{ [key]: [sql, …] }`, newest first, no duplicates, 50 per connection, 20 connections (least recently used dropped). `key` is a SHA-256 of `dbType` + connection string, so the password isn't copied into another key. `.cell-history` "Histórico…" lists the active connection's history (built when the pointer enters or it gets focus; "Histórico (vazio)" when empty); picking one replaces the editor text. Saving never makes the query fail (needs `crypto.subtle`, i.e. https or localhost). |
| Status | `"N linha(s) em Xms"`, plus `" (truncado)"` at the 1000-row cap · `Executando…` · `Erro (Xms)` · `Bloqueado` · `Erro de rede` · `Cancelada (Xms)` |
| Cancel | "■ Stop" on `.run-btn` (or `#run-all` during a batch) aborts the `fetch` (`AbortController`, `signal` passed to `runQuery`). The proxy sees the connection close and cancels the query **inside the database** (§7). Output: "Consulta cancelada." |

**Exercise:** `select * from customers` gives `4 linha(s)`. `select n from generate_series(1, 1500) as n` gives `1000 linha(s) … (truncado)`. `select pg_sleep(8)`, then "■ Stop": `Cancelada (…ms)` within a second.
**Messages (client pre-check, `js/sql-guard.js`):** "Escreva uma consulta antes de rodar." · "Apenas um comando por célula é permitido." · "Somente consultas de leitura (SELECT) são permitidas." · "A consulta deve começar com SELECT ou WITH."
**Messages (settings):** "Configure a connection string em Configurações." · "Configure o Proxy URL em Configurações." (the status isn't updated in these two cases)
**Messages (proxy):** see §7.
**Messages (format):** "Não foi possível formatar".

## 5. JS cell and kernel state

| | |
|---|---|
| Files | `js/notebook/js-cell.js`, `js/notebook/kernel-state.js` |
| Execution | `new AsyncFunction('charts', 'el', 'console', 'vars', 'setVar', ...varNames, code)` (the async version of `new Function`), so the code can use top-level `await` and a returned Promise is awaited. This is intentional; it runs the user's own code. |
| In scope | every kernel variable (SQL cells give `{ columns, rows }`, with `rows` as objects keyed by column), `vars` (a shallow copy of the whole kernel state, name → value), `setVar(name, value)` (creates a variable; name sanitized like SQL names), `charts` (§6), `el` (this cell's `.cell-output`), `console`. A variable named `vars` or `setVar` shadows the built-in. |
| `setVar` | Changes are applied **only when the cell finishes without error**, all at once, and replace whatever this cell set on its previous run. |
| Output | a non-`undefined` return value is shown in a `<pre>` (objects as pretty JSON). Errors appear in `.error`. |
| Status | `Executando…` · `OK em Xms` (includes awaited time) · `Erro` |
| Kernel state | `js/notebook/kernel-state.js`: a prototype-less object (`__proto__` is an ordinary name) plus an owner per name (the cell that last wrote it). `replaceVarsOf(owner, entries)` swaps everything that cell owns; `removeVarsOf(owner)` runs when the cell is removed. A name another cell rewrote later belongs to that cell and survives. |

**Exercise:** after the SQL cell `cell_1` returns customers, `return cell_1.rows.length` gives `4`, and `return Object.keys(vars)` lists `["cell_1"]`. `setVar('total', cell_1.rows.length)` in one JS cell, then `return total` in the next gives `4`. `await new Promise(r => setTimeout(r, 500)); return 1` shows `1` with `OK em ~500ms`.
**Notes:** variables reflect the order cells were **run**, not their position.

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
| Order | CORS → rate limit → validation → `assertReadOnly` → `parseConnection` → `assertHostIsSafe` → `runQuery` (read-only, 1000-row cap) → 12s timeout. See CLAUDE.md invariants 1–2. A request already cancelled stops right after validation, before any guard or connection. |
| Cancel | `server.js` sets `req.signal`, aborted when the client closes the connection before the response ends. The handler combines it with the 12s timeout into one `AbortSignal` passed as `runQuery(config, sql, { maxRows, signal })`, and answers as soon as it fires. Drivers stop the query in the database: Postgres runs `pg_cancel_backend(pid)` and MySQL `KILL QUERY threadId`, each from a second connection with the **same** checked config; SQL Server calls `request.cancel()` on the same connection. Best effort: if the cancel fails, `statement_timeout` / `MAX_EXECUTION_TIME` / `requestTimeout` still end it. Drivers also check the signal before each statement, because a cancel sent between statements finds an idle session. **Residual risk:** a cancel still in flight (up to 8s to connect) after the session closed could hit a reused pid / thread id of another session of the same database user. It only cancels a query, never kills a connection. Only the Postgres cancel has run against a real database; MySQL and SQL Server were only read. Tests: `callHandler(body, { signal })`; the per-database "cancelar a requisição…" test checks the query is gone from the database (`countSlowQueries` in `proxy/test/helpers/databases.js`). |

**Exercise without the UI:** `callHandler()` in `proxy/test/helpers/call-handler.js`, or `curl -X POST localhost:3000/api/query -H 'Content-Type: application/json' -d '{...}'`.
**Messages:** `Origem não permitida.` · `dbType inválido…` · `connectionString é obrigatório.` · `sql é obrigatório.` · `SQL inválido: …` · `Apenas um comando por execução é permitido.` · `Somente consultas SELECT são permitidas (recebido: X).` · `SELECT ... INTO não é permitido.` · `Função não permitida: X.` · `Conexão recusada: host resolve para um endereço não permitido (…)` · `Muitas requisições…` · `Tempo limite da consulta excedido.` · `Consulta cancelada.` · `JSON inválido.` (from `server.js`) · Postgres `cannot execute X in a read-only transaction`.

## Shared helpers (`js/lib/`)

| | |
|---|---|
| `js/lib/dom.js` | `h(tag, props, ...children)` builds elements (text children are always text nodes); `show(el, ...children)` replaces content (empty call = clear); `showMessage(el, text, className = 'hint')`. **The only way to build DOM**: `innerHTML`/`outerHTML`/`insertAdjacentHTML` fail ESLint. |
| `js/lib/api.js` | `runQuery(sql, { settings, signal })` posts to the proxy (default: the saved settings; `signal` aborts the request) and resolves with the §7 200 body; throws `ProxyError` (has `status`) for proxy errors, the fetch error for network failures. `missingSetting()` returns `'connectionString'`, `'proxyUrl'` or `null`. **The only module allowed to call `fetch`.** |

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

## 10. Notes (Markdown cells)

| | |
|---|---|
| Files | `js/markdown.js` (parser + renderer), `js/notebook/cell.js` (type `md`) |
| Add | `#add-md-cell` "+ Nota". Header label "NOTA"; highlighting defaults to Markdown. |
| Run | `.run-btn` renders the text into `.cell-output .markdown`. Always succeeds, so "Rodar tudo" passes through notes. A restored note renders right away (no side effects); other restored cells stay "Não executada". |
| Syntax | Blocks: `#`…`######` headings, paragraphs, `-`/`*`/`+` and `1.` lists, `>` quotes, fenced ``` code, `---` rule. Inline: `` `code` ``, `**bold**` / `__bold__`, `*italic*` / `_italic_`, `[text](url)`. Underscores inside a word (`order_items_total`) stay literal. |
| Safety | `parse()` builds a tree and `render()` builds it with `h()`: HTML in the text stays text. Links only for `http:`, `https:`, `mailto:` (`safeHref`); any other scheme (`javascript:`, `data:`, relative) renders as plain text. Links open with `target="_blank" rel="noopener noreferrer"`. |
| Tests | `test/js/markdown.test.js` |

**Exercise:** "+ Nota", type `# Título` and `[x](javascript:alert(1))`, Run: an `<h1>`, and the link shows as plain text.

## 11. Result table (SQL cell output)

| | |
|---|---|
| Files | `js/notebook/result-view.js` (DOM), `js/result-data.js` (pure: format, filter, sort, CSV/TSV/JSON, numeric columns) |
| Toolbar | `.result-toolbar` > `.result-filter`, `.result-count` ("N linha(s)" or "N de M linha(s)"), `.export-csv-btn` "CSV", `.export-json-btn` "JSON", `.copy-btn` "Copiar", `.wrap-toggle` "Quebrar texto", `.quick-chart-btn` "Gráfico", `.result-message` |
| Filter | `.result-filter` keeps rows where any column's displayed text contains the input (case-insensitive). |
| Sort | Clicking a `th.sortable` cycles ascending ▲ → descending ▼ → original order. Numbers sort as numbers, including numeric text (Postgres `bigint`/`numeric` arrive as strings, e.g. `"-5.20"`); other text in `pt-BR` with numeric collation; `NULL` always last. |
| Export / copy | CSV, JSON and Copiar use **the rows on screen** (filtered and sorted). CSV is RFC 4180 (CRLF, doubled quotes, `NULL` → empty); JSON is a list of objects; Copiar puts TSV on the clipboard for spreadsheets ("Copiado: N linha(s)." · "Não foi possível copiar: …"). Files download as `<variable name>.csv/.json` from a local Blob (released after 10s); the CSV starts with a UTF-8 BOM so Excel keeps accents. Text starting with `=`, `+`, `-`, `@`, tab or CR gets a leading `'` in CSV/TSV, so a value from the database can't run as a spreadsheet formula; numbers, including numeric text such as `"-5.20"`, are untouched. |
| Wrap | Cells are cut at 28rem with an ellipsis, and the full value is in the cell's `title`; `.wrap-toggle` (`.active`) shows the whole text. `NULL` cells are `td.null`. |
| Quick chart | `.quick-chart-btn` opens `.quick-chart` with `.chart-type` (Barras / Linha / Pizza), `.chart-x` (any column) and `.chart-y` (numeric columns only, including numeric text such as Postgres `numeric`), drawn in `.chart-area` with `js/charts.js` from the rows on screen. Redraws on filter and sort. Message: "Nenhuma coluna numérica para o eixo Y." The Chart.js instance is destroyed (`destroyResult`) when the panel closes, the cell reruns, or the cell is removed, since Chart.js keeps every chart in a global registry. |
| Tests | `test/js/result-data.test.js` |

**Exercise:** `select * from orders`: filter `paid` → "2 de 4 linha(s)"; click `total` twice → descending; CSV downloads `cell_1.csv`; Gráfico with X `status`, Y `total` draws a `<canvas>`.

---

## Source file index

Every source file and the section that covers it (`npm run lint` checks this list).

| File | § |
|---|---|
| `index.html` | 1–6, 9–11 |
| `server.js` | 8 |
| `js/app.js` | 3, 9 |
| `js/settings.js` | 1 |
| `js/connections.js` | 1 |
| `js/history.js` | 4 |
| `js/markdown.js` | 10 |
| `js/result-data.js` | 11 |
| `js/notebook/result-view.js` | 11 |
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
| `js/notebook/runner.js` | 3 |
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
