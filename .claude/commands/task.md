---
description: Run the automated dev workflow — read the backlog, plan, develop, browser-QA, log, and ship a task.
argument-hint: "[task-number] [skip-qa] | all | skip-qa"
---

You are the **orchestrator** of the automated dev workflow. Full spec: @.claude/docs/WORKFLOW.md

Arguments: `$ARGUMENTS`

## 0. Parse arguments
- A bare number → task id (`12` means `T-012`; zero-padding optional).
- `skip-qa` present anywhere → skip phases 5–6.
- `all` → process every `todo` task in priority order, looping the whole pipeline per task.
- Nothing / only `skip-qa` → pick the highest-priority `todo` task. Priority order: P0 > P1 > P2 > P3; ties broken top-to-bottom in the file.
- Case-insensitive.

## 1. Select the task
Read @tasks.md. Choose the task per the args. If none is `todo`, say so and stop. Set the chosen task's `status: in-progress` (Edit tasks.md). Briefly read @MEMORY.md for any decisions/gotchas/approval rules that apply.

## 2. Plan
Launch the **planner** subagent (Agent tool, subagent_type `planner`). Pass it: the full task block and the instruction to consult `.claude/docs/ARCHITECTURE.md` + `MEMORY.md`. Do **not** dump the whole repo into it.

## 3. Plan approval gate
Check MEMORY.md → "Approval automation" for a rule that covers this. If none, present the plan to the user and **wait for approval** (accept edits / re-plan on request). If a rule auto-approves, note that and continue.

## 4. Develop
Launch the **developer** subagent (subagent_type `developer`) with the task + the approved plan only. Relay back its summary of changes + how to exercise the feature.

## 5. QA (skip entirely if `skip-qa`)
Set the task `status: qa`. Launch the **qa-tester** subagent (subagent_type `qa-tester`) with the acceptance criteria + the developer's "how to exercise it" steps. It uses the Playwright MCP browser.

## 6. Fix loop (skip if `skip-qa`)
- QA **PASS** → continue.
- QA **BLOCKED** → set task `status: blocked`, report the blocker to the user, and stop (do not ship).
- QA **FAIL** → present the bug list. Check MEMORY.md for a bug-fix auto-approval rule; if none, **ask the user** to approve fixing. On approval, send the bug list to a fresh **developer** run, then re-run **qa-tester**. Repeat until PASS or the user stops. Never ship a failing build.

## 7. Record
- Append an entry to @CHANGELOG.md (date `2026-06-06` style, task id, what changed, area, QA result, commit sha — fill the sha after step 8 or use the message).
- In @tasks.md: set the task `status: done` and check off the acceptance boxes.
- If something reusable was learned (a convention, a gotcha, a repeatable approval decision), append it to @MEMORY.md in this same change.

## 8. Ship
`git add` the changed files (never `server/.env` or other secrets), commit with message `T-XXX: <title>`, and `git push` to `main`. Report the commit sha.

If `all`: loop back to step 1 for the next `todo` task until the backlog is clear, stopping if any task is blocked or the user intervenes.

## Guardrails
- Keep each subagent's context minimal — task + named files only.
- Only the orchestrator (you) pauses for human approval; subagents never do.
- Do not push if QA failed (unless `skip-qa` was explicitly given) or if any task is `blocked`.
