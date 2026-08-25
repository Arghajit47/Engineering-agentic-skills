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

# Telemetry is optional: if it is missing or broken the guard still works.
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "telemetry"))
try:
    from observe import record as _record
except Exception:
    def _record(_payload):
        return None

_CTX = {"repo": None}


def die(rule, msg):
    _record({"event": "block", "rule": rule, "repo": _CTX.get("repo")})
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
# Global options that may sit between `git` and the subcommand. Some take a value.
GIT_GLOBAL_VALUED = {"-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path"}
GIT_GLOBAL_FLAGS = {"-P", "--no-pager", "--paginate", "--bare", "--literal-pathspecs",
                    "--no-replace-objects", "--no-optional-locks"}

SEGMENT_SPLIT = re.compile(r"&&|\|\||;|\||\n")


def segments(cmd):
    """Split a command line into execution segments, in order.

    Quoted regions are blanked for splitting only, so a `;` inside a string does
    not create a phantom segment, while offsets stay aligned with the original.
    """
    masked = re.sub(r"'[^']*'|\"[^\"]*\"", lambda m: " " * len(m.group()), strip_heredocs(cmd))
    out, last = [], 0
    for m in SEGMENT_SPLIT.finditer(masked):
        out.append(cmd[last:m.start()])
        last = m.end()
    out.append(cmd[last:])
    return [x.strip() for x in out if x.strip()]


def parse_git(seg):
    """-> (subcommand, args) for a git invocation, else (None, []).

    Skips leading env assignments and git global options, so `git -C /r push` and
    `FOO=1 git --no-pager push` are both seen as a push.
    """
    try:
        toks = seg.split()
    except Exception:
        return None, []
    i = 0
    while i < len(toks) and re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*=.*", toks[i]):
        i += 1
    if i >= len(toks) or os.path.basename(toks[i].strip("\"'")) != "git":
        return None, []
    i += 1
    while i < len(toks):
        t = toks[i]
        if t in GIT_GLOBAL_VALUED:
            i += 2; continue
        if any(t.startswith(g + "=") for g in GIT_GLOBAL_VALUED) or t in GIT_GLOBAL_FLAGS:
            i += 1; continue
        break
    if i >= len(toks):
        return None, []
    return toks[i], toks[i + 1:]


def norm_ref(ref):
    """origin/+HEAD:refs/heads/main -> main"""
    ref = ref.split(":")[-1].lstrip("+")
    for prefix in ("refs/heads/", "heads/"):
        if ref.startswith(prefix):
            ref = ref[len(prefix):]
    return ref


def check_bash(cmd, cwd):
    bare = strip_quoted(cmd)

    # Walk segments in execution order so branch state is correct at each point.
    branch = current_branch(cwd)
    for seg in segments(cmd):
        sub, args = parse_git(seg)
        if not sub:
            continue
        positional = [a for a in args if not a.startswith("-")]

        # Track branch changes as they happen.
        if sub in ("checkout", "switch"):
            creating = any(a.startswith("-") and ("b" in a.lstrip("-") or "c" in a.lstrip("-"))
                           for a in args if a.startswith("-"))
            if positional:
                branch = norm_ref(positional[0])
            elif creating:
                branch = "(new)"
            continue

        if sub == "push":
            named = norm_ref(positional[1]) if len(positional) >= 2 else None
            target = named or branch
            if target in PROTECTED:
                die("never-push-to-main",
                    f"`git push` targets '{target}'.\n"
                    "Branch, open a PR, get approval. If you are landing an approved PR, "
                    "merge it with `gh pr merge` instead.")

        if sub == "commit" and branch in PROTECTED:
            die("never-commit-on-main",
                f"This commit runs while HEAD is on '{branch}'.\n"
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

    # 4. A backtick inside --body is executed by the shell before gh ever sees it,
    #    so --body-file being present too does not make it safe.
    m = re.search(r"\bgh\s+(?:pr|issue|release)\s+\S+[^\n]*?--body(?:=|\s+)(.+)",
                  strip_heredocs(cmd), re.S)
    if m and "`" in m.group(1):
        die("gh-body-injection",
            "A backtick inside `--body` is executed by the shell as command "
            "substitution.\nWrite the body to a file and use --body-file alone — "
            "passing both still runs the backtick.")

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
        _record({"event": "warn", "rule": "design-token-drift", "repo": _CTX.get("repo")})
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
    _CTX["repo"] = os.path.basename(os.path.abspath(cwd)) if cwd else None

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
