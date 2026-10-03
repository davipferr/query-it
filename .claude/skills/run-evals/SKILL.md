---
name: run-evals
description: Run the skill evals in evals/ (spawn a disguised agent on a scenario with a planted bug, score it with hidden tests and a judge on a different model, record the result), and hill-climb a skill by comparing scores before and after a change. Use when asked to run evals, test or benchmark a skill, check whether a skill change helped, or add an eval scenario.
---

# Run the skill evals

Evals are unit tests for skills. A scenario plants a real past bug (from `docs/agent-log.md`) in a **disguised copy** of the repo. An agent that doesn't know it's being tested works on it, then hidden tests plus a judge on a different model score the result.

Each run spawns two subagents (agent + judge). That costs tokens, so tell the user how many runs you're about to start before starting a batch.

## 0. Calibrate (no agents, free)

```bash
node evals/calibrate.js
```

Every scenario must show `✔`: hidden tests fail on the planted bug and pass on HEAD. Never run agents against an uncalibrated scenario. Evals use **committed** code (HEAD), so commit skill changes before measuring them.

## 1. One run

1. **Prepare:** `node evals/prepare.js <scenario>` prints `runId`, `workspace` and `prompt`.
2. **Agent under test:** spawn an `Agent` (`subagent_type: general-purpose`, default model) whose prompt is **exactly** the printed `prompt`, nothing else. Never mention evals, scenarios, rubrics, scoring or that a bug was planted; agents behave differently when they know they're being tested. Run it in the foreground, and save its final report to `evals/runs/<runId>/agent-report.md`.
3. **Score:** `node evals/score.js <runId>`. It collects the diff, `npm run check` in the workspace, the hidden tests, forbidden-path changes, and whether the real repo was touched. It writes `evals/runs/<runId>/judge-input.md`.
4. **Judge:** spawn an `Agent` with a **different model** from the agent under test (`model: sonnet` when the agent ran on the default). Its prompt:
   > You are grading a coding agent's work. Read `<abs path>/judge-input.md` and `<abs path>/agent-report.md`. Score every rubric criterion 0, 1 or 2 using only the evidence in those files (you may read files in the workspace `<workspace>` to confirm claims; don't modify anything). A claim in the report that the diff or test output contradicts scores 0 for that criterion. Reply with only JSON: `{"scores": {"<criterion id>": n, ...}, "notes": "<one short paragraph>"}`.

   Save its JSON to `evals/runs/<runId>/judge.json`.
5. **Record:** `node evals/record.js <runId> evals/runs/<runId>/judge.json --agent-model <m> --judge-model <m>`. This appends a row to `evals/results.jsonl` and deletes the workspace (pass `--keep` to inspect it).

**Score:** 50% hidden tests + 50% rubric (100% rubric for question-only scenarios). It's **0** if the agent touched the real repository or changed a path the scenario forbids. Check `touchedRealRepo` after every run, and if it's `true`, run `git status` and restore the real repo before anything else.

## 2. Hill-climbing a skill

1. Baseline: run the skill's scenarios **3 times each**, because single runs are noisy. Note the average per scenario from `evals/results.jsonl` (`skillVersion` identifies the version of the skill).
2. Read the low-scoring runs (`evals/runs/<runId>/judge.json`, `diff.patch`, `agent-report.md`) and find the behavior the skill failed to cause.
3. Change the skill: one focused change, with a concrete instruction rather than a vague exhortation. Commit it.
4. Re-run the same scenarios the same number of times. Keep the change if the average went up without another scenario going down. Otherwise revert it.
5. Stop when the skill reliably scores high, or when changes stop helping. Then look for a missing **lint rule or test** instead: hard enforcement beats skill wording.

## 3. Adding a scenario

Start from a row in `docs/agent-log.md` (real failures make the best scenarios). Create `evals/scenarios/<id>/`:

- `scenario.json`:
  - `id`, `skill`, `source`
  - `prompt`: written like a real user message, never mentioning evals
  - `expected`: the correct outcome. **Verify every factual claim in it by running it**, because a wrong `expected` teaches the judge to penalize correct work.
  - `rubric`: 4–6 criteria, scored 0–2 each
  - `mustNotChange`: path prefixes the agent must not modify
- `setup.js` (optional): plants the bug with `ws.replace(file, from, to)`, which fails loudly if the text isn't found exactly once, and `ws.remove(file)`. Also remove the existing tests that would reveal the bug, without leaving lint errors behind.
- `hidden.test.js` (optional): runs from `test/hidden/` in the workspace, and checks behavior rather than implementation details, so any correct fix passes.

Then `node evals/calibrate.js <id>` must show `✔` with `npm run check` green on the planted copy (otherwise the gate gives the bug away).

## Known gaps

- The agent under test runs as a subagent of this session. It sees this session's skills and `CLAUDE.md` (the same files as the workspace), but the Claude Code edit hook doesn't lint files outside the real repo, and the browser pane isn't part of the scenarios.
- Disguise isn't perfect: the real repo, with `evals/` and its history, is on the same disk. `touchedRealRepo` catches writes but not reads.
