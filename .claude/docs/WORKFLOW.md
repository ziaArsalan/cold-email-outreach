# Automated Dev Workflow

The pipeline behind the **`/task`** command. The command file ([../commands/task.md](../commands/task.md)) is the executable orchestrator; this doc is the human-readable spec.

## Command syntax
```
/task                  # pick the highest-priority `todo` task and run the full pipeline
/task 12               # run task T-012 specifically
/task 12 skip-qa       # run T-012 but skip the browser QA phase
/task skip-qa          # highest-priority task, skip QA
/task all              # run every `todo` task in priority order, one after another
```
- A bare number = task id (zero-padding optional: `12` == `T-012`).
- `skip-qa` anywhere in the args skips phase 5–6.
- Args are case-insensitive.

## The pipeline
The **orchestrator** (main thread) owns the human approval gates. The **subagents** do the heavy lifting in isolated context.

1. **Read the backlog** — open [../../tasks.md](../../tasks.md). Select the task (by id, or highest priority `todo`). Set its `status: in-progress`.
2. **Plan** — delegate to the **planner** subagent ([../agents/planner.md](../agents/planner.md)). It reads the task, [../docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md), and [../../MEMORY.md](../../MEMORY.md), and returns a concrete implementation plan.
3. **Approve the plan** — orchestrator shows the plan to the human and waits for approval, *unless* [../../MEMORY.md](../../MEMORY.md) has an approval-automation rule that covers it. Edit/re-plan on request.
4. **Develop** — delegate to the **developer** subagent ([../agents/developer.md](../agents/developer.md)) with the task + the approved plan. It implements and reports a summary of what changed + how to exercise it.
5. **QA (browser)** — unless `skip-qa`: set `status: qa`, delegate to the **qa-tester** subagent ([../agents/qa-tester.md](../agents/qa-tester.md)). It starts the app, drives a real browser through each acceptance criterion via Playwright MCP, and returns PASS or a bug list.
6. **Fix loop** — if bugs are found: orchestrator presents them and asks the human to approve fixing (unless a MEMORY rule auto-approves). On approval, send the bug list back to the **developer**, then re-run **qa-tester**. Repeat until QA passes or the human stops.
7. **Changelog** — append an entry to [../../CHANGELOG.md](../../CHANGELOG.md) (date, task id, what changed, area, QA result). Mark the task `status: done` and check off acceptance boxes in [../../tasks.md](../../tasks.md). If anything reusable was learned, append it to [../../MEMORY.md](../../MEMORY.md).
8. **Ship** — `git add` the changed files, commit with message `T-XXX: <title>`, and `git push` to `main`.

## Approval gates (current defaults)
- **Plan approval (step 3):** ASK.
- **Bug-fix approval (step 6):** ASK.
- These flip to auto only when a matching rule is written into [../../MEMORY.md](../../MEMORY.md) → "Approval automation".

## Context discipline
- Each subagent gets **only** its task text + the specific file paths it needs — never the whole repo, never the other agents' context.
- Subagents cannot talk to the human; only the orchestrator pauses for approval. Subagents return structured results to the orchestrator.

## Failure handling
- If the app won't start, dependencies are missing, or `server/.env` is absent, QA reports it as a blocker; orchestrator surfaces it and sets the task `status: blocked` instead of shipping.
- Never commit secrets. Never push if QA failed (unless `skip-qa` was explicitly requested).
