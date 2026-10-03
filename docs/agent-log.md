# Agent log

Every time a human had to step in, or an agent got something wrong, add a row here, then turn it into the strongest guard that fits:
**lint rule or check script** (best) → **test** → **skill line** → **feature-map note** (weakest).
A row without a "became" entry is an open item. These rows are also the source for eval scenarios (Phase 5).

| Date | What went wrong | Became |
|---|---|---|
| 2026-10-03 | Unescaped database names and errors went into `innerHTML` in the schema explorer, and later in `charts.createTable`. Both passed review by eye. | ESLint bans HTML-string sinks; `js/lib/dom.js` `h()` is the only DOM builder; invariant 5 |
| 2026-10-03 | The SQL guard was trusted as "SELECT only = read-only". `SELECT INTO` created a table, and side-effect functions passed. | Read-only transactions in drivers, `INTO` and function denylist, tests in both directions; `proxy-change` skill |
| 2026-10-03 | The SSRF guard checked one host while the driver connected to another (`?host=`, `?socketPath=`, duplicate `Server=`). | `parseConnection` as the single source of truth; `drivers.test.js`; invariant 2; `add-db-driver` skill |
| 2026-10-03 | Library behavior was assumed instead of checked (`pg` query params, the parser rejecting `]]`, `ipaddr` ranges). | `investigate` skill rule 3: read library source or probe |
| 2026-10-03 | A first draft of the `verify` skill had wrong expectations (`cell_1.length`, quoted tree names). Caught only by running it. | Rule: run every new skill once before committing it |
| 2026-10-03 | Stale console errors in the browser pane looked like regressions after a reload. | `verify` skill: match each console error to a request in the current page load |
| 2026-10-03 | Edits made through Python or shell heredocs mangled regex escapes three times (`\b` became a backspace, `\]` was dropped). | `CLAUDE.md` working rule: edit code with the Edit/Write tools, never through string-escaping scripts |
| 2026-10-03 | Generic lint rules were wrong for this codebase: Portuguese "todo" ("all") was flagged as a TODO marker. | Custom `comment-hygiene` rule that only matches upper-case markers |
| 2026-10-03 | The proxy's timeout timer was never cleared, which only showed up as a slow test run. | Fixed. Lesson: a slow suite is a signal, so investigate it; don't ignore it |
