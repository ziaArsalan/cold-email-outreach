# Devtronics Outreach

Cold email outreach automation. React client (port 3000) + Express server (port 5000); Claude AI + Google Sheets + SMTP.

## Run the app
```bash
npm run dev        # both client + server (concurrently)
npm run client     # client only  → http://localhost:3000
npm run server     # server only  → http://localhost:5000
```

## Automated dev workflow
Trigger with **`/task`**. It reads the backlog, plans, develops, QA-tests in a real browser, logs, and ships.
→ Full pipeline & command syntax: [.claude/docs/WORKFLOW.md](.claude/docs/WORKFLOW.md)

## Map — read only what a task needs (keep context lean)
| Need | File |
|------|------|
| Stack, layout, data flow, conventions | [.claude/docs/ARCHITECTURE.md](.claude/docs/ARCHITECTURE.md) |
| The workflow pipeline & rules | [.claude/docs/WORKFLOW.md](.claude/docs/WORKFLOW.md) |
| Task backlog (the queue `/task` reads) | [tasks.md](tasks.md) |
| Worklog / release notes | [CHANGELOG.md](CHANGELOG.md) |
| Project memory — decisions, gotchas, approval rules (multi-machine) | [MEMORY.md](MEMORY.md) |
| Subagents (planner / developer / qa-tester) | [.claude/agents/](.claude/agents/) |

## Rules
- **Don't overload agents.** Pass each subagent only its task + the one or two files it needs (reference by path), never the whole repo.
- **Read [MEMORY.md](MEMORY.md) before planning** any task — it holds decisions and gotchas that change how you build.
- Secrets live in `server/.env` (gitignored). Never commit them or print their values.
- Ship target is **direct commit to `main`** (see workflow).
