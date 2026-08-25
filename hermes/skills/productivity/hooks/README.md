# Hooks — harness-level enforcement

Skill prose is instruction a model *chooses* to follow. A hook is executed by the
harness and cannot be missed when context is long. These are the rules where being
missed once is expensive.

A hook also **overrides your permission allowlist**. `Bash(git push *)` being allowed
does not make `git push origin main` allowed. That is the point.

## Rules

49 regression cases cover these — every rule has a blocking case **and** a
must-not-fire case. `./test-guard.sh`.

| Rule | Event | Behaviour |
|---|---|---|
| `never-push-to-main` | PreToolUse · Bash | Blocks `git push` to `main`/`master` — explicit or implicit, including `-f`, `--force-with-lease`, `HEAD:main`, `refs/heads/main`, `+main`, and `git -C <path> push` |
| `never-commit-on-main` | PreToolUse · Bash | Blocks `git commit` while HEAD is on a protected branch, tracking `checkout`/`switch` **in execution order** so `-b feat && checkout main && commit` is still caught |
| `token-separation` | PreToolUse · Bash | Blocks a command that *uses* both the dev and reviewer GitHub tokens |
| `gh-body-injection` | PreToolUse · Bash | Blocks `gh … --body` containing a backtick, **even if `--body-file` is also passed** — the shell runs it before `gh` chooses |
| `visual-baseline` | PreToolUse · Bash | Blocks `playwright … -u` / `--update-snapshots` |
| design-token drift | PostToolUse · Edit/Write | Warns on a raw hex or a default `sm/md/lg/xl/2xl` variant in `.tsx`/`.jsx` |

## Design

**Silent success, verbose failure.** A passing check prints nothing. A failure writes to
stderr, which Claude Code feeds back to the model so it can self-correct.

**Parse, do not pattern-match.** Git invocations are split into execution segments and
parsed: env prefixes and global options (`-C`, `--git-dir`, `--no-pager`) are skipped to
find the subcommand, refs are normalised (`HEAD:refs/heads/main` → `main`), and branch
state is tracked as `checkout`/`switch` change it. A review of the first version found
five bypasses that regex matching could not see; all five now have regression cases.

**Narrow beats thorough.** A noisy guard gets switched off, which is worse than no
guard. So:

- Quoted strings **and heredoc bodies** are stripped before matching — writing
  documentation that *mentions* `git push origin main` is not running it.
- Token separation fires on *usage* (`$VAR` or `VAR=`), not on the words appearing.
- The breakpoint rule fires only where the project actually defines `--breakpoint-*`
  in `@theme inline`.
- `globals.css` and `*.test.tsx` / `*.spec.tsx` are exempt from the hex rule.

This is not theoretical: the first version of this README was itself blocked by the
token rule, because it documents both token names in one file. That bug is fixed, and
it is why the stripping exists.

**Fails open.** Malformed input, no git, missing files — exit 0. A broken guard must
never break the session.

**PostToolUse warns, it does not block.** The edit already happened; the message exists
so the model fixes it immediately rather than shipping the drift.

## Install

`./install.sh --with-hooks` wires it, or by hand in `~/.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse":  [{ "matcher": "Bash",
      "hooks": [{ "type": "command", "command": "python3 '$HOME/.claude/skills/hooks/guard.py'", "timeout": 10 }] }],
    "PostToolUse": [{ "matcher": "Edit|Write|MultiEdit",
      "hooks": [{ "type": "command", "command": "python3 '$HOME/.claude/skills/hooks/guard.py'", "timeout": 10 }] }]
  }
}
```

The installer **merges** — any hooks you already have are preserved — and backs up
`settings.json` first.

## Turning it off

```bash
touch ~/.claude/skills/hooks/DISABLED     # off
rm    ~/.claude/skills/hooks/DISABLED     # on
```

Use the file, not the env var. `SKILLS_HOOKS_OFF=1` is also honoured, but **only if
exported in the environment Claude Code itself runs in** — prefixing it onto a single
command does *not* reach the hook, because the hook runs as a separate process that
inherits Claude Code's environment, not your command's.

Permanently: delete the two entries from `settings.json`.

## Adding a rule

The Ratchet: a rule earns its place by pointing at a specific incident. Add it to
`guard.py`, add a row above, and add a case to `test-guard.sh`. If you cannot name what went wrong, it belongs in a skill —
not here.
