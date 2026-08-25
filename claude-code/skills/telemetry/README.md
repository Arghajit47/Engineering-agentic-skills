# Telemetry — measuring the harness, not the product

Every other signal in this pipeline measures the **product**: JIRA rework, QA failures,
incidents. Nothing measured the **harness** — which gates fire, which never do, which
skills actually get reached. That was the last missing component.

## What is recorded

| Field | Example |
|---|---|
| `event` | `block`, `warn`, `skill`, `subagent`, `sessionstart`, `stop` |
| `rule` | `never-push-to-main` |
| `skill` | `quality-analyst` |
| `repo` | `my-app` — **basename only** |
| `session` | first 8 chars of the session id |
| `ts` | unix seconds |

## What is never recorded

Command text · file contents · diffs · prompts · full paths · environment variables ·
ticket contents.

Command text can contain credentials, and a full path contains your username. A
telemetry file that is unsafe to read is a telemetry file nobody reads, so the writer
has an **allowlist** of keys — anything not on it is dropped, not redacted.

Storage is `events.jsonl` in this directory: local, append-only, gitignored, rotated at
5 MB with one generation kept. It never leaves the machine.

## Reading it

```bash
python3 report.py               # last 30 days
python3 report.py --days 7
python3 report.py --json        # for /agent-eval to reason over
```

The report answers three questions:

**Which gates fired?** A rule firing constantly is *not* a guard doing its job — it is a
workflow problem upstream. If `never-push-to-main` fires ten times a week, something
keeps steering toward main. Fix that.

**Which rules never fired?** The Ratchet in reverse. A rule earns its place by pointing
at an incident; a long window with zero firings and no nameable incident means it is
dead weight. Propose removing it — skills that only grow stop being read.

**Which skills were invoked?** A pipeline skill missing from the list is not being
reached. That is a broken handoff, not a skill nobody needs.

`/agent-eval --gaps` reads this alongside the JIRA rework data.

## Wiring

Installed with the hooks (`./install.sh --with-hooks`):

| Hook | Records |
|---|---|
| `PreToolUse` · `Bash` | rule blocks, via `hooks/guard.py` |
| `PostToolUse` · `Edit\|Write\|MultiEdit` | drift warnings, via `hooks/guard.py` |
| `PreToolUse` · `Skill\|Task` | skill and subagent invocations |
| `SessionStart`, `Stop` | session boundaries |

## Turning it off

```bash
touch ~/.claude/skills/telemetry/DISABLED     # off
rm    ~/.claude/skills/telemetry/DISABLED     # on
```

`SKILLS_TELEMETRY_OFF=1` is also honoured — that is how `hooks/test-guard.sh` avoids
contaminating real data. As with the hooks, the env var only works if exported where
Claude Code itself runs; the file works everywhere.

Recording never raises. If the log cannot be written the event is dropped silently — a
broken recorder must not break a session.
