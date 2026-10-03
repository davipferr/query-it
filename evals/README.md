# Skill evals

Unit tests for the agent skills in `.claude/skills/`. The full procedure is in the `run-evals` skill; this is the map.

| Path | What it is |
|---|---|
| `scenarios/<id>/scenario.json` | user-style prompt, the expected outcome (hidden from the agent), the rubric, and `mustNotChange` paths |
| `scenarios/<id>/setup.js` | plants a real past bug (from `docs/agent-log.md`) in the disguised copy |
| `scenarios/<id>/hidden.test.js` | behavior tests added only after the agent finishes |
| `lib/workspace.js` | builds the disguised copy in `%TEMP%`: HEAD content without `evals/`, the agent log or git history |
| `calibrate.js` | without any agent, checks that each planted bug fails the hidden tests and that HEAD passes them |
| `prepare.js` → `score.js` → `record.js` | one run: build the workspace, collect evidence and the judge packet, then record the score and clean up |
| `results.jsonl` | one row per run (scenario, skill version, models, hidden tests, rubric, score). This is the history to hill-climb against. |
| `runs/` | per-run artifacts (diff, outputs, agent report, judge JSON); git-ignored |

```bash
npm run eval:calibrate
npm run eval:prepare -- <scenario>
```
