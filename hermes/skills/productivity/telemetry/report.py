#!/usr/bin/env python3
"""
Read the telemetry log and say something actionable about it.

    python3 report.py            # last 30 days
    python3 report.py --days 7
    python3 report.py --json     # machine-readable, for /agent-eval

The point is not a dashboard. It is three questions:
  1. Which gates are actually firing?      -> where the real friction is
  2. Which rules never fire?               -> dead weight; the Ratchet in reverse
  3. Which skills are used, and which not? -> discovery problems, or dead skills
"""
import argparse
import json
import os
import sys
import time
from collections import Counter

DIR = os.path.dirname(os.path.abspath(__file__))
LOGS = [os.path.join(DIR, "events.jsonl"), os.path.join(DIR, "events.jsonl.1")]

# Every rule the guard can emit. A rule here with zero firings is a candidate
# for deletion — a guard nobody trips is either perfect or pointless, and the
# only way to tell is to ask.
KNOWN_RULES = [
    "never-push-to-main",
    "never-commit-on-main",
    "token-separation",
    "gh-body-injection",
    "visual-baseline",
    "design-token-drift",
]


def load(days):
    cutoff = time.time() - days * 86400
    rows = []
    for p in LOGS:
        if not os.path.exists(p):
            continue
        with open(p, encoding="utf-8", errors="ignore") as f:
            for line in f:
                try:
                    r = json.loads(line)
                except Exception:
                    continue
                if r.get("ts", 0) >= cutoff:
                    rows.append(r)
    return rows


def build(rows, days):
    rules = Counter(r["rule"] for r in rows if r.get("rule"))
    skills = Counter(r["skill"] for r in rows if r.get("event") == "skill" and r.get("skill"))
    repos = Counter(r["repo"] for r in rows if r.get("repo"))
    sessions = len({r["session"] for r in rows if r.get("session")})
    blocks = sum(1 for r in rows if r.get("event") == "block")
    warns = sum(1 for r in rows if r.get("event") == "warn")
    return {
        "days": days,
        "events": len(rows),
        "sessions": sessions,
        "blocks": blocks,
        "warns": warns,
        "rules_fired": dict(rules.most_common()),
        "rules_never_fired": [r for r in KNOWN_RULES if r not in rules],
        "skills_used": dict(skills.most_common()),
        "repos": dict(repos.most_common(5)),
    }


def render(d):
    out = []
    a = out.append
    a(f"## Harness Telemetry — last {d['days']} days\n")
    if not d["events"]:
        a("No events recorded.\n")
        a("Either nothing has run yet, or telemetry is off "
          "(`ls telemetry/DISABLED`). Hooks must be wired for gate data: "
          "`./install.sh --with-hooks`.")
        return "\n".join(out)

    a(f"**{d['events']} events · {d['sessions']} sessions · "
      f"{d['blocks']} blocked · {d['warns']} warned**\n")

    a("### Gates that fired")
    if d["rules_fired"]:
        a("| Rule | Times |")
        a("|---|---|")
        for k, v in d["rules_fired"].items():
            a(f"| `{k}` | {v} |")
        top, n = next(iter(d["rules_fired"].items()))
        a("")
        a(f"**Read:** `{top}` fired {n}× — the most common thing the harness had to stop. "
          "A rule that fires constantly is a workflow problem upstream, not just a guard "
          "doing its job: ask why the attempt keeps happening.")
    else:
        a("None. Either the work has been clean, or the hooks are not wired.")
    a("")

    a("### Rules that never fired")
    if d["rules_never_fired"]:
        for r in d["rules_never_fired"]:
            a(f"- `{r}`")
        a("")
        a("**Read:** these cost nothing to keep, but a rule that never fires over a long "
          "window is either genuinely preventive or dead weight. The Ratchet says a rule "
          "earns its place by pointing at an incident — if you cannot name one, remove it.")
    else:
        a("None — every rule has fired at least once.")
    a("")

    a("### Skills invoked")
    if d["skills_used"]:
        a("| Skill | Runs |")
        a("|---|---|")
        for k, v in d["skills_used"].items():
            a(f"| `{k}` | {v} |")
        a("")
        a("**Read:** a pipeline skill missing from this list is not being reached. That is "
          "usually a broken handoff, not a skill nobody needs.")
    else:
        a("No skill invocations recorded.")
    a("")

    if d["repos"]:
        a("### Repos")
        a(", ".join(f"`{k}` ({v})" for k, v in d["repos"].items()))
        a("")

    a("---")
    a("Recorded: event type, tool, skill, rule, repo basename. "
      "**Never** command text, file contents, prompts, or full paths. Local only.")
    return "\n".join(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=30)
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()
    d = build(load(args.days), args.days)
    print(json.dumps(d, indent=2) if args.json else render(d))
    return 0


if __name__ == "__main__":
    sys.exit(main())
