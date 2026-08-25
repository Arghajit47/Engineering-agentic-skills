#!/usr/bin/env python3
"""
Observability for the engineering pipeline.

Records what the harness actually did, so the Ratchet has data instead of memory:
which gates fire, which never fire, which skills are used, where sessions end.

WHAT IS RECORDED — deliberately narrow:
    timestamp, event type, tool name, skill name, rule name, repo basename
WHAT IS NEVER RECORDED:
    command text, file contents, diffs, prompts, paths beyond a basename, env vars
Command text can contain credentials. A telemetry file that is unsafe to read is a
telemetry file nobody reads.

Storage : ~/.claude/skills/telemetry/events.jsonl   (append-only, local, gitignored)
Off     : touch ~/.claude/skills/telemetry/DISABLED
Rotation: at 5 MB the file is moved aside to events.jsonl.1 (one generation kept)

Usage as a hook:  python3 observe.py            (reads hook JSON on stdin)
Usage internally: observe.record({...})
"""
import json
import os
import sys
import time

HOME = os.path.expanduser("~")
DIR = os.path.join(HOME, ".claude", "skills", "telemetry")
LOG = os.path.join(DIR, "events.jsonl")
DISABLED = os.path.join(DIR, "DISABLED")
MAX_BYTES = 5 * 1024 * 1024

# Only these keys are ever written. Anything else in a payload is dropped.
ALLOWED = {"ts", "event", "tool", "skill", "rule", "repo", "session", "detail", "ms"}


def enabled():
    if os.environ.get("SKILLS_TELEMETRY_OFF") == "1":
        return False
    return not os.path.exists(DISABLED)


def _repo_name(cwd):
    """Basename only — never the full path, which contains the username."""
    if not cwd:
        return None
    try:
        d = os.path.abspath(cwd)
        for _ in range(8):
            if os.path.isdir(os.path.join(d, ".git")):
                return os.path.basename(d)
            parent = os.path.dirname(d)
            if parent == d:
                break
            d = parent
        return os.path.basename(os.path.abspath(cwd))
    except Exception:
        return None


def record(payload):
    """Append one event. Never raises — telemetry must not break a session."""
    if not enabled():
        return
    try:
        os.makedirs(DIR, exist_ok=True)
        if os.path.exists(LOG) and os.path.getsize(LOG) > MAX_BYTES:
            os.replace(LOG, LOG + ".1")
        row = {k: v for k, v in payload.items() if k in ALLOWED and v is not None}
        row.setdefault("ts", int(time.time()))
        with open(LOG, "a", encoding="utf-8") as f:
            f.write(json.dumps(row, separators=(",", ":")) + "\n")
    except Exception:
        pass


def main():
    try:
        ev = json.load(sys.stdin)
    except Exception:
        return 0

    tool = ev.get("tool_name") or ""
    ti = ev.get("tool_input") or {}
    hook = ev.get("hook_event_name") or ""
    repo = _repo_name(ev.get("cwd"))
    session = (ev.get("session_id") or "")[:8] or None

    if hook in ("SessionStart", "SessionEnd", "Stop", "SubagentStop"):
        record({"event": hook.lower(), "repo": repo, "session": session})
        return 0

    if tool == "Skill":
        # The one tool whose *input* is safe: a skill name is not user content.
        record({"event": "skill", "skill": ti.get("skill") or ti.get("name"),
                "repo": repo, "session": session})
        return 0

    if tool in ("Task", "Agent"):
        record({"event": "subagent", "detail": (ti.get("subagent_type") or "")[:40] or None,
                "repo": repo, "session": session})
        return 0

    return 0


if __name__ == "__main__":
    sys.exit(main())
