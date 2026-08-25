#!/usr/bin/env python3
"""
Harness-level enforcement for the engineering pipeline.

Rules that matter live in skill prose, which a model can miss when context is long.
These are the four or five that must never be missed, enforced by the harness instead.

Contract:
  stdin  : Claude Code hook JSON
  exit 0 : allow, print nothing        (silent success)
  exit 2 : block, stderr goes to Claude (verbose failure)

Escape hatch:  SKILLS_HOOKS_OFF=1  disables every rule.
Rules are deliberately narrow — a noisy guard gets switched off, which is worse
than no guard.
"""
import json
import os
import re
import subprocess
import sys

PROTECTED = ("main", "master")


def die(rule, msg):
    sys.stderr.write(f"BLOCKED [{rule}]\n{msg}\n")
    sys.exit(2)


def current_branch(cwd=None):
    try:
        return subprocess.run(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"],
            capture_output=True, text=True, timeout=3, cwd=cwd,
        ).stdout.strip()
    except Exception:
        return ""


def strip_heredocs(cmd):
    """Blank out heredoc bodies. Writing docs that mention a forbidden pattern
    must not be blocked; only running it should be."""
    return re.sub(r"<<-?\s*[\'\"]?(\w+)[\'\"]?[\s\S]*?^\1\s*$", " HEREDOC ", cmd, flags=re.M)


def strip_quoted(cmd):
    """Rough removal of quoted regions so we don't match on literal text."""
    return re.sub(r"'[^']*'|\"[^\"]*\"", "", strip_heredocs(cmd))


# ---------------------------------------------------------------- Bash rules
def check_bash(cmd, cwd):
    bare = strip_quoted(cmd)

    # 1. Never push to a protected branch.
    if re.search(r"\bgit\s+push\b", bare):
        target = re.search(r"\bgit\s+push\b[^|;&]*", bare).group(0)
        # Drop flags (-f, --force, --force-with-lease, ...) before reading remote/branch.
        args = [a for a in target.split()[2:] if not a.startswith("-")]
        named = None
        if len(args) >= 2:
            ref = args[1]
            named = ref.split(":")[-1].lstrip("+")   # handles HEAD:main and +main
        if named in PROTECTED:
            die("never-push-to-main",
                f"`git push` targets '{named}'.\n"
                "Branch, open a PR, get approval. If you are landing an approved PR, "
                "merge it with `gh pr merge` instead.")
        if not named and current_branch(cwd) in PROTECTED:
            die("never-push-to-main",
                f"You are on '{current_branch(cwd)}' and this pushes the current branch.\n"
                "Create a branch first: git checkout -b <name>")

    # 2. Never commit directly on a protected branch.
    #    A compound command that creates a branch first is fine — by the time the
    #    commit runs, HEAD is no longer on the protected branch. The hook sees the
    #    branch as it is *before* execution, so check for that intent explicitly.
    makes_branch = re.search(r"\bgit\s+(?:checkout\s+-\w*b|switch\s+-\w*c)\b", bare)
    if re.search(r"\bgit\s+commit\b", bare) and not makes_branch and current_branch(cwd) in PROTECTED:
        die("never-commit-on-main",
            f"You are on '{current_branch(cwd)}'.\n"
            "git checkout -b <branch> first, then commit.")

    # 3. Dev and reviewer credentials must never meet.
    def _used(name):
        pat = r"(?:\$\{?" + name + r"\b|\b" + name + r"\s*=)"
        # Quotes are kept here: `-H "x: $TOKEN"` is real usage. Only heredocs
        # (documentation) are stripped. The $VAR / VAR= requirement keeps prose safe.
        return re.search(pat, strip_heredocs(cmd))
    if _used("GITHUB_TOKEN") and _used("GITHUB_REVIEWER_TOKEN"):
        die("token-separation",
            "GITHUB_TOKEN (dev) and GITHUB_REVIEWER_TOKEN (review/merge) appear in the "
            "same command.\nUse exactly one. Mixing them defeats the separation.")

    # 4. `gh ... --body` with a backtick is command substitution.
    m = re.search(r"\bgh\s+(?:pr|issue|release)\s+\S+[^\n]*?--body(?:=|\s+)(.+)", strip_heredocs(cmd), re.S)
    if m and "`" in m.group(1) and "--body-file" not in cmd:
        die("gh-body-injection",
            "A backtick inside `--body` is executed by the shell as command "
            "substitution.\nWrite the body to a file and use --body-file instead.")

    # 5. Snapshot baselines change only on purpose, in their own PR.
    if re.search(r"--update-snapshots|(?<![\w-])-u(?![\w-])", bare) and "playwright" in bare:
        die("visual-baseline",
            "`--update-snapshots` turns the regression detector into a regression "
            "recorder.\nIf the change is intended, update the baseline in its own PR "
            "and say why. Otherwise fix the diff.")
    return 0


# ------------------------------------------------------------- Edit/Write rules
HEX = re.compile(r"#[0-9a-fA-F]{6}\b")
DEFAULT_BP = re.compile(r'(?:^|["\s])(sm|md|lg|xl|2xl):')


def project_has_custom_breakpoints(path):
    """Only complain about default breakpoints where custom frames actually exist."""
    d = os.path.dirname(os.path.abspath(path))
    for _ in range(6):
        for css in ("src/app/globals.css", "app/globals.css", "styles/globals.css"):
            f = os.path.join(d, css)
            if os.path.exists(f):
                try:
                    return "--breakpoint-" in open(f, encoding="utf-8", errors="ignore").read()
                except Exception:
                    return False
        parent = os.path.dirname(d)
        if parent == d:
            break
        d = parent
    return False


def check_edit(path, added):
    if not path.endswith((".tsx", ".jsx")):
        return 0
    if "globals.css" in path:
        return 0
    # Tests legitimately assert colour values; flagging them is noise.
    if re.search(r"\.(test|spec)\.[jt]sx$", path):
        return 0
    notes = []
    hexes = sorted(set(HEX.findall(added)))
    if hexes:
        notes.append(f"raw hex {', '.join(hexes[:4])} — use a --color-* token from @theme inline")
    if project_has_custom_breakpoints(path):
        bps = sorted(set(m if isinstance(m, str) else m[0] for m in DEFAULT_BP.findall(added)))
        if bps:
            notes.append(
                f"default Tailwind breakpoint(s) {', '.join(bps[:4])} — this project defines "
                "custom Figma frame breakpoints; default variants do not align with the design")
    if notes:
        sys.stderr.write(
            "DESIGN-TOKEN DRIFT in " + path + "\n  - " + "\n  - ".join(notes) +
            "\n(The edit was applied. Fix it now — this is the recurring defect family "
            "/design-system exists to prevent.)\n")
        sys.exit(2)
    return 0


def main():
    if os.environ.get("SKILLS_HOOKS_OFF") == "1":
        return 0
    if os.path.exists(os.path.expanduser("~/.claude/skills/hooks/DISABLED")):
        return 0
    try:
        ev = json.load(sys.stdin)
    except Exception:
        return 0  # never break the session on malformed input

    tool = ev.get("tool_name", "")
    ti = ev.get("tool_input", {}) or {}
    cwd = ev.get("cwd") or None

    if tool == "Bash":
        return check_bash(ti.get("command", "") or "", cwd)

    if tool in ("Edit", "Write", "MultiEdit"):
        path = ti.get("file_path", "") or ""
        if tool == "Write":
            added = ti.get("content", "") or ""
        elif tool == "Edit":
            added = ti.get("new_string", "") or ""
        else:
            added = "\n".join((e or {}).get("new_string", "") for e in ti.get("edits", []) or [])
        return check_edit(path, added)

    return 0


if __name__ == "__main__":
    sys.exit(main())
