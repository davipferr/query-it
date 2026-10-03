# Working with agents on QueryIt

How much a human reviews depends on how much the harness has **earned**. Trust goes up only when the data says so (`npm run trust:report`), and it goes back down the moment a failure gets through.

## The trust ladder

| Stage | What the human does | What the agents do | Move up when |
|---|---|---|---|
| **A: review every diff** *(current)* | Reads each diff, plus the `verify` report | One agent at a time, in the main checkout | `npm run trust:report` says the data supports B: check green, no open agent-log items, every core-skill eval scenario (`proxy-change`, `repro-bug`, `investigate`) has ≥3 runs averaging ≥90 |
| **B: review results, not every line** | Reads the `verify` report and the `reviewer` findings. Reads the diff line by line **only** for `proxy/` and harness changes (see below) | One or more agents; every change goes through `verify`, plus `reviewer` before committing | Two weeks in B with no agent-log entry of the "claimed done but wasn't" or "security bug got through" kind |
| **C: parallel agents** | Reviews batches of finished branches (verify report + reviewer + diffstat), merges in order | 2–3 agents in parallel worktrees (`npm run agent:setup`), one using the browser at a time | Comes with CI/CD, outside this document |
| **D: autonomous** | Reviews merged work on `main` | Cloud agents, auto-merge on a green CI | Comes with CI/CD, outside this document |

**Moving down:** any of these sends you back to A until the matching guard exists:
- a security bug in `proxy/` that reached a commit
- an agent reporting "done" or "verified" for something that wasn't
- a harness change that slipped through.

Log the incident in `docs/agent-log.md` first.

## The loop for every task

1. **Pick the skill:** `repro-bug` for bugs, `investigate` for questions, `proxy-change` for anything in `proxy/`, `add-db-driver` for new databases.
2. **Work:** the edit hook lints each file as the agent saves it.
3. **`verify`:** run `npm run check` plus the browser smoke path for UI changes. The **Stop hook** won't let an agent end its turn with uncommitted code and a red `check` without at least seeing the failure.
4. **`reviewer`** (a different model) before committing anything non-trivial. It's required for `proxy/`, `server.js` and security fixes. In this project's history the reviewer caught a bypass that the author and the tests both missed.
5. **Commit:** the pre-commit hook runs `npm run check`, and the commit-msg hook guards the harness (below).
6. **Anything a human had to correct** becomes a row in `docs/agent-log.md`, then a lint rule, a test, a skill line or an eval scenario, in that order of preference.

## The harness is protected

The harness is everything that makes agent output trustworthy:
- `eslint.config.js`
- `.githooks/` and `scripts/hooks/`
- `scripts/check-*.js`
- `.claude/settings.json`, `.claude/agents/` and `.claude/skills/`
- `CLAUDE.md`
- the eval scenarios and scorer
- `.gitattributes`

An agent that weakens it can make anything look green. So:

- A commit that touches harness files is **refused** unless its message ends with `Harness-Change: approved by <name>` (`.githooks/commit-msg`).
- Agents write that line **only** when the user approved that specific harness change in the conversation. Never add it to get a commit through.
- Humans read harness diffs line by line at every stage, including D.

## Parallel agents (stage C, available now)

```bash
git worktree add ../query-it-<task> -b agent/<task>
cd ../query-it-<task>
npm run agent:setup
```

`agent:setup` links `node_modules` from the main checkout and creates a dedicated Postgres database (`queryit_wt_<folder>`) with seed data, recorded in `.env.test`. With their own databases, parallel test runs don't erase each other's seed data; this was tested with two suites running at once.

```bash
npm run agent:teardown
cd ../query-it
git worktree remove ../query-it-<task>
```

Always run teardown **before** `git worktree remove`: it drops the database and removes the `node_modules` links, so removing the folder can't reach the main checkout's `node_modules`.

Limits:
- Browser verification uses the fixed ports 5500/3000, so only one agent at a time can use the browser.
- MySQL and SQL Server don't get a database per worktree; only Postgres does.

## Measuring

- **`npm run trust:report`:** eval scores per scenario, open agent-log items, agent and harness commits, and the stage the data supports.
- **`run-evals` skill:** run scenarios, compare a skill before and after a change, add scenarios from new agent-log rows.
