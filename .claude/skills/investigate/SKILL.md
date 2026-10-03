---
name: investigate
description: Find out why something in QueryIt behaves the way it does, before changing anything. Use when asked "why does X happen", "what causes Y", or "how does Z work", when a test fails for unclear reasons, or before proposing a cause for any bug. Stops guessing by requiring evidence from code and from running it.
---

# Investigate: evidence before conclusions

The failure this skill prevents: naming a plausible cause without reading the code, then "fixing" the wrong thing.

## Rules

1. **Every claim needs evidence you produced in this session:** a `file:line` you read, a command you ran with its output, or a value you observed in the browser. "Probably", "should" and "usually" are not evidence.
2. **Separate what you observed from what you inferred.** Label each one in the report.
3. **Library behavior is code too.** Before relying on what `pg`, `mysql2`, `mssql`/`tedious`, `node-sql-parser`, `ipaddr.js` or CodeMirror does, read their source in `node_modules` or run a 3-line probe. This repo has been bitten by:
   - `pg` honoring `?host=` in a connection string, and `mysql2` honoring `?socketPath=`.
   - `node-sql-parser` accepting `SELECT … INTO` as a plain `select`, and rejecting T-SQL's `]]` escape that SQL Server accepts.
   - `ipaddr.js` labeling `::ffff:127.0.0.1` as `ipv4Mapped`, not `loopback`.
4. **Probe, don't argue.** For "does the guard allow X?", run it:
   ```bash
   node --input-type=module -e "import('./proxy/lib/sql-guard.js').then(m => { try { m.assertReadOnly(process.argv[1], 'postgres'); console.log('ALLOWED') } catch (e) { console.log(e.message) } })" "select ..."
   ```
   Run that from the repo root so `node-sql-parser` resolves. For DOM questions, import the module in the browser pane with `javascript_tool` (`await import('/js/charts.js?' + Date.now())`).

## Steps

1. **Find the entry point.** Look up the feature in `docs/feature-map.md`, or `grep` for the user-facing message, which is in Portuguese.
2. **Trace the path** from the user action or request to the symptom. Write it down as a chain of `file:line` references.
3. **List the hypotheses** that explain the symptom. For each one, write the cheapest check that would rule it out.
4. **Run those checks**, cheapest first. Stop when one hypothesis survives with direct evidence.
5. **Check history** if the behavior looks intentional: `git log -S "<snippet>" --oneline`, then `git show`. A surprising line may have a reason, or may be a known residual risk in `CLAUDE.md`.

## Report

```
Question: …
Answer: … (one or two sentences)
Evidence:
  - [observed] proxy/api/query.js:63 calls driver.parseConnection before assertHostIsSafe
  - [observed] `npm test -- …` output: …
  - [inferred] … (and why the inference is safe)
Ruled out: … (hypothesis, plus the check that ruled it out)
Unknowns: … (what you could not check, and what would settle it)
```

If the question turns into a bug fix, continue with the `repro-bug` skill. Don't fix from here.
