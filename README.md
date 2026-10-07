<div align="center">

# QueryIt

**A browser notebook for exploring your databases.**
Write SQL in one cell, then use its results in a JavaScript cell to analyze the data or draw a chart.

![Node.js 22+](https://img.shields.io/badge/node-%3E%3D22-339933?logo=node.js&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-supported-4169E1?logo=postgresql&logoColor=white)
![MySQL](https://img.shields.io/badge/MySQL-supported-4479A1?logo=mysql&logoColor=white)
![SQL Server](https://img.shields.io/badge/SQL%20Server-supported-CC2927?logo=microsoftsqlserver&logoColor=white)
![No build step](https://img.shields.io/badge/build-none-lightgrey)

<!--
  SCREENSHOT 1 (hero) — docs/images/overview.png
  Page: the main notebook at http://localhost:5500, with the sample data loaded.
  What to show: the sidebar with "Carregar" clicked and the tables listed,
  one SQL cell with a result table, and one JS cell below it drawing a bar chart.
  Tip: take it at ~1400px wide so it looks sharp on GitHub.
-->
![QueryIt notebook with a SQL cell, a JS cell and a chart](docs/images/overview.png)

</div>

---

## Why QueryIt?

Most database clients stop at a result grid. QueryIt treats a query result as **data you can keep working with**: every SQL cell stores its rows in a variable, and any JavaScript cell can read it, transform it and turn it into a chart, all in the browser, without exporting a CSV.

## Features

- 📓 **Notebook workflow**: mix SQL and JavaScript cells, run them with `Ctrl+Enter`, reorder them with ▲ / ▼.
- 🔗 **Shared variables**: each SQL cell's result is saved under the cell's name (`cell_1`, or any name you give it) and is available to every JS cell.
- 📊 **Built-in charts**: bar, line and pie charts, plus tables, from a single function call.
- 🗂️ **Schema explorer**: browse tables and columns in the sidebar and create a ready-made `SELECT` with one click.
- ✨ **Smart autocomplete**: table and column suggestions based on the schema you loaded.
- 🛢️ **Three databases**: PostgreSQL, MySQL and SQL Server.
- 🔒 **Read-only by design**: only a single `SELECT` is allowed, and results are capped at 1000 rows.

## Screenshots

### Connecting to a database

<!--
  SCREENSHOT 2 — docs/images/settings.png
  Page: the "Configurações" (settings) modal. It opens by itself on the first visit,
  or click the settings button in the header.
  What to show: database type selected, connection string filled in (it's a password
  field, so it shows as dots), proxy URL filled in.
  ⚠️ Use the test database, never a real connection string.
-->
![Settings window with database type, connection string and proxy URL](docs/images/settings.png)

### Exploring the schema

<!--
  SCREENSHOT 3 — docs/images/schema-explorer.png
  Page: the sidebar of the main notebook, after clicking "Carregar".
  What to show: the tables listed (public.customers, public.orders, public.order items),
  one of them expanded with its columns and types, and the "SELECT" button visible.
  Tip: crop to the sidebar only.
-->
![Schema explorer listing tables and their columns](docs/images/schema-explorer.png)

### Writing SQL with autocomplete

<!--
  SCREENSHOT 4 — docs/images/sql-autocomplete.png
  Page: a SQL cell in the notebook, after the schema was loaded.
  What to show: type "SELECT na" (or "FROM cu") so the autocomplete popup is open
  with table/column suggestions.
-->
![SQL cell showing table and column suggestions](docs/images/sql-autocomplete.png)

### From query to chart

<!--
  SCREENSHOT 5 — docs/images/sql-to-chart.png
  Page: the notebook with two cells.
  Cell 1 (SQL):  SELECT status, COUNT(*) AS total FROM orders GROUP BY status
  Cell 2 (JS):   charts.createBarChart(el, cell_1.rows, { x: "status", y: "total" });
  What to show: both cells run, the result table under the SQL cell and the chart
  under the JS cell. (Adjust the column names to match your data.)
-->
![A SQL cell's result being used by a JS cell to draw a bar chart](docs/images/sql-to-chart.png)

### Read-only protection

<!--
  SCREENSHOT 6 (optional) — docs/images/read-only.png
  Page: a SQL cell in the notebook.
  What to show: run something like "DELETE FROM orders" and capture the error
  message that blocks it.
-->
![A DELETE query being blocked](docs/images/read-only.png)

## How it works

```
┌──────────────────────┐   POST /api/query    ┌──────────────────────┐        ┌────────────┐
│  Notebook (browser)  │ ───────────────────▶ │   Proxy (Node.js)    │ ─────▶ │  Database  │
│  localhost:5500      │ ◀─────────────────── │   localhost:3000     │ ◀───── │            │
└──────────────────────┘      rows (JSON)     └──────────────────────┘        └────────────┘
```

- **Frontend** (`index.html`, `js/`, `css/`): the notebook. Plain ES modules, no build step; the editor is [CodeMirror 6](https://codemirror.net/).
- **Proxy** (`proxy/`): a small Node server that receives the SQL, checks that it's read-only and runs it against your database.

### Security

Writes are blocked by several independent layers:

1. **SQL parsing**: the proxy parses the query and accepts only a single `SELECT`, rejecting `INTO` and dangerous functions.
2. **Read-only transaction**: the driver runs the query in a read-only transaction and caps the rows on the database server.
3. **Database permissions**: in production, connect with a user that only has `SELECT` permission.

The proxy also blocks requests from unknown origins, rate-limits requests, protects against SSRF and never returns your connection string in an error message. Both servers listen only on `127.0.0.1` by default.

## Getting started

### Requirements

- [Node.js](https://nodejs.org/) 22 or newer
- [Docker](https://www.docker.com/) with Compose (runs the app and the sample databases)

### Install and run

```bash
git clone https://github.com/davipferr/query-it.git
cd query-it
npm install
npm install --prefix proxy   # only for tests and db:seed, which run on your machine
npm run dev
```

`npm run dev` builds and starts the frontend and the proxy in Docker. Edits to `index.html`, `css/` and `js/` show up on reload; after editing the proxy, run `docker compose restart proxy`.

Open **http://localhost:5500**. On the first visit the settings window opens. Pick your database type and paste a connection string. The proxy runs in a container, so `localhost` there means the container itself: for a database on your machine use `host.docker.internal`, for example:

```
postgres://user:password@host.docker.internal:5432/mydb
```

The proxy URL is already filled in.

Without Docker, `npm start` and `npm start --prefix proxy` in two terminals (here `localhost` in the connection string is your machine).

Both ports are published only on `127.0.0.1`, so nothing else on your network can reach them. This setup is for local use only: the proxy is allowed to reach private addresses.

### Try it with sample data

No database at hand? Start a local Postgres with sample tables:

```bash
npm run db:up
npm run db:seed
```

Then connect with `postgres://queryit:queryit@postgres:5432/queryit` (or `localhost:55432` if the proxy runs outside Docker). Stop it with `npm run db:down`.
To start MySQL and SQL Server too, use `npm run db:up:all`.

## Using the notebook

1. Click **Carregar** in the sidebar to load your tables.
2. Add a **SQL** cell, write a query and press **Ctrl+Enter**. The result is saved in a variable named after the cell (`cell_1` by default; you can rename it).
3. Add a **JS** cell to use it:

```js
return cell_1.rows.length;
```

Inside a JS cell you also have:

| Name | What it is | Example |
|---|---|---|
| `vars` | every variable at once | `console.log(vars)` |
| `el` | the cell's output area | `charts.createTable(el, cell_1.rows)` |
| `charts` | chart helpers | see below |

**Chart helpers:**

```js
charts.createBarChart(el, cell_1.rows, { x: "name", y: "total" });
charts.createLineChart(el, cell_1.rows, { x: "day", y: "revenue" });
charts.createPieChart(el, cell_1.rows, { labelKey: "status", valueKey: "count" });
charts.createTable(el, cell_1.rows);
```

Use ▲ / ▼ to reorder cells and ✕ to remove one.

## Development

| Task | Command |
|---|---|
| Run both servers (Docker) | `npm run dev` |
| Frontend only / proxy only | `npm start` / `npm start --prefix proxy` |
| Lint | `npm run lint` |
| Tests | `npm test` |
| Lint + all tests | `npm run check` |

The per-database test suites skip themselves when that database isn't running, so start them with `npm run db:up:all` for a full run.

## Project structure

```
query-it/
├── index.html          # the notebook page
├── css/                # styles
├── js/
│   ├── app.js          # app wiring
│   ├── notebook/       # cells, editor, kernel state
│   ├── charts.js       # chart helpers for JS cells
│   └── lib/            # DOM and API helpers
├── proxy/
│   ├── api/query.js    # POST /api/query handler
│   └── lib/            # SQL guard, SSRF guard, rate limit, drivers
├── docs/               # feature map and screenshots
└── server.js           # static server for the frontend
```
