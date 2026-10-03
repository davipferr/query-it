---
name: proxy-change
description: Required checklist for ANY change under proxy/ (handler, guards, drivers, server) or to SQL the frontend generates for the proxy (js/sql-preset.js). The proxy executes user SQL against real databases, so a mistake there is a security hole, not just a bug.
---

# Changing the proxy safely

The proxy is the security boundary of QueryIt. It runs SQL typed by users, against databases they name. Read `CLAUDE.md` invariants 1–4 before starting.

## Before writing code

1. Read `proxy/api/query.js` end to end, plus every module you'll touch.
2. Name the **layer** you're changing and what it's responsible for:
   | Layer | File | Stops |
   |---|---|---|
   | Validation | `proxy/api/query.js` | malformed requests |
   | SQL guard | `proxy/lib/sql-guard.js` | non-SELECT, multiple statements, `INTO`, dangerous functions |
   | Connection parsing | `proxy/lib/drivers/*.js` `parseConnection` | the driver connecting anywhere the SSRF guard didn't check |
   | SSRF guard | `proxy/lib/ssrf-guard.js` | private, loopback, metadata and other non-public addresses |
   | Read-only + row cap | `proxy/lib/drivers/*.js` `runQuery` | writes the guard missed; huge results |
   | Error sanitizing | `sanitizeError` in `query.js` | credentials leaking in error messages |
3. **Never weaken one layer because another one covers it.** If a legitimate query is blocked, make the check more precise. Don't remove it, and don't add a bypass flag.

## While writing code

- **Tests in both directions.** Every guard change needs a test showing the attack is blocked **and** a test showing legitimate queries still pass (`proxy/test/sql-guard.test.js` has both lists). One direction alone isn't enough.
- **Prove it against a real database** when you touch drivers or the handler: `npm run db:up`, `npm run db:seed`, `npm test`. `POST /api/query contra postgres` must show `✔`, not `﹣` (skipped). If you changed MySQL or SQL Server code and those containers aren't up, say so in the report; don't claim it's verified.
- **Exploit-style check for security fixes:** reproduce the original attack through `callHandler` (`proxy/test/helpers/call-handler.js`) before the fix and after it. Say in the report what happened to the database (for example "no table created").
- **The parser and the database disagree sometimes.** Anything the frontend generates (`js/sql-preset.js`) must pass `assertReadOnly`; `test/js/sql-preset.test.js` checks this. If you add generated SQL, add it there.
- **Connection strings:** build config from known fields only. Never hand the raw string to `pg`/`mysql2`/`mssql`, because they honor options (`?host=`, `?socketPath=`, a repeated `Server=`) that would redirect the connection.
- **Errors:** new error messages are in Portuguese, carry no credentials, and go through the existing `catch` that calls `sanitizeError`.

## After

1. `npm run check` is green (`# todo` failures are allowed only if they were already there).
2. Update `docs/feature-map.md` §7 (messages, order, contract) and, if you left a gap, **Known residual risks** in `CLAUDE.md`.
3. Report:
   - which layer changed, and why the other layers still hold
   - the attack test and the legitimate-query test you added
   - which databases the change really ran against.
