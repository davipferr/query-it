# QueryIt

A browser notebook for querying databases. Write SQL in one cell, then use its results in a JavaScript cell to explore the data or draw a chart.

Supports **PostgreSQL**, **MySQL** and **SQL Server**. Queries are read-only: only a single `SELECT` is allowed, and results are capped at 1000 rows.

## How it works

- **Frontend** (`index.html`, `js/`, `css/`): the notebook, served on `http://localhost:5500`.
- **Proxy** (`proxy/`): a small Node server on `http://localhost:3000` that receives the SQL, checks that it's read-only and runs it against your database.

## Requirements

- Node.js 22 or newer
- Docker (optional, only for the test databases)

## Running it

```bash
npm install
npm install --prefix proxy
npm run dev
```

Open http://localhost:5500. On the first visit the settings window opens. Pick your database type and paste a connection string, for example:

```
postgres://user:password@localhost:5432/mydb
```

The proxy URL is already filled in.

## Using the notebook

1. Click **Carregar** in the sidebar to load your tables.
2. Add a **SQL** cell, write a query and press **Ctrl+Enter**. The result is saved in a variable named after the cell (`cell_1` by default; you can rename it).
3. Add a **JS** cell to use it:

```js
return cell_1.rows.length;
```

Inside a JS cell you also have:

- `vars`: every variable at once, e.g. `console.log(vars)`
- `charts`: chart helpers, e.g. `charts.createBarChart(el, cell_1.rows, { x: "name", y: "total" })`
- `el`: the cell's output area

Use ▲ / ▼ to reorder cells and ✕ to remove one.

## Trying it with sample data

If you don't have a database at hand, start a local Postgres with sample tables:

```bash
npm run db:up
npm run db:seed
```

Then connect with `postgres://queryit:queryit@localhost:55432/queryit`. Stop it with `npm run db:down`.

## Tests

```bash
npm run check
```

This runs the linter and all the tests.
