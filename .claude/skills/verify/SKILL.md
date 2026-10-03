---
name: verify
description: Verify a change in QueryIt actually works before reporting it done. Use after any code change to js/, css/, index.html, server.js or proxy/, and whenever asked to check, test or confirm something works.
---

# Verify a QueryIt change

A change is not done until you have watched it work. Report what you **observed**, not what you expect.

## 1. Automated checks (always)

```bash
npm run check
```

- A `✖` on a test **without** `# todo` is a real failure. Fix it; don't mark it todo or delete it to get green.
- A `✖ … # todo` is a known, tracked gap. If your change fixes one, remove its `todo` option.
- If you touched `proxy/`, the database suites must actually run, not show as skipped:

```bash
npm run db:up
npm run db:seed
npm test
```

  Then make sure `POST /api/query contra postgres` shows `✔`, not `﹣`. MySQL and SQL Server only run after `npm run db:up:all` (large images; ask the user before pulling them for the first time).

## 2. In the browser (any change the user can see: js/, css/, index.html, server.js, or proxy responses)

1. `npm run db:up` and `npm run db:seed` if they aren't up already.
2. Start both servers with `preview_start` using the `frontend` and `proxy` configurations from `.claude/launch.json`.
3. Settings (the modal opens by itself on a fresh profile; otherwise `#open-settings`; the faster `localStorage` route is in `docs/feature-map.md`):
   - Tipo de banco: `postgres`
   - Connection string: `postgres://queryit:queryit@localhost:55432/queryit` (local test database from `docker-compose.yml`)
   - Proxy URL: `http://localhost:3000/api/query`
4. Exercise the feature you changed, plus this smoke path:
   - `#load-schema` shows `public.customers`, `public.order items` and `public.orders` in `#schema-tree`.
   - `#add-sql-cell`, then run `select * from customers` (Ctrl+Enter). The status reads `4 linha(s) em …ms`.
   - `#add-js-cell`, then run `return cell_1.rows.length`. Expect `4`. (SQL cells store `{ columns, rows }`, with rows as objects.)
5. `read_console_messages` with `onlyErrors: true` must be empty, except a `400 (Bad Request)` for each query you **meant** to be refused; the browser logs every failed response. Console messages **persist across reloads** in the pane, so before blaming your change, match each error to a request in `read_network_requests` and check that it came from the current page load. If you touched the request flow, check `read_network_requests` for `/api/query`.
6. Take a screenshot of the final state as proof.
7. Clean up: stop the preview servers, and remove `queryit.settings` from `localStorage` if you set it with JS.

## 3. Report

- The commands you ran and their pass/todo/skip counts.
- What you did in the browser and what you saw, with the screenshot.
- Anything you could not verify, and why. Never say "verified" for a step you skipped.

## Reference data (seeded by `npm run db:seed`)

| Table | Rows | Notes |
|---|---|---|
| `customers` (id, name, email, country) | 4 | id 3 has a `null` email |
| `orders` (id, customer_id, total, status) | 4 | statuses: paid, pending, refunded |
| `order items` (order_id, product, qty) | 3 | name with a space; needs quoting |
