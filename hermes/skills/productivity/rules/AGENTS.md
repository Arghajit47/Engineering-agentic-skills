<!--
Always-on rules for the engineering pipeline.

Copy to your repo root as AGENTS.md (or CLAUDE.md — Claude Code reads that name).
Unlike a skill, this is in context for EVERY turn, so it stays short: only rules
that must hold before any skill loads. Everything else lives in the skill that
owns it.

Keep it under ~50 lines. The Ratchet applies: every line here should be traceable
to a specific thing that went wrong. If you cannot name the incident, delete the line.
-->

# Engineering rules

## Never
- **Push or commit to `main`.** Branch → PR → explicit approval. (Enforced by hook.)
- **Put `GITHUB_TOKEN` and `GITHUB_REVIEWER_TOKEN` in one command.** Dev vs review/merge. (Hook.)
- **Use `gh … --body "…"` with backticks** — the shell executes them. Use `--body-file`. (Hook.)
- **Update a visual baseline inside a feature PR.** Own PR, stated reason. (Hook.)
- **Auto-file a ticket.** A measurement is not a defect. Report; the user decides.
- **Estimate a design value.** Read it, or halt and say the bridge is unavailable.

## Always
- **Evidence about behaviour comes from the deployed URL**, never `localhost`, never a
  preview alias. A 200 is not proof of deploy — grep the served HTML for a token the
  diff added and one it removed.
- **Tokens, not values.** `--color-*` and the named frame breakpoints; never a raw hex
  or a default `sm/md/lg/xl/2xl` variant where the design defines its own frames.
- **Write the full breakpoint ladder.** A min-width variant leaks upward: `laptop:` with
  no `desktop:` sibling means 1920 silently inherits 1440.
- **Touch the test when you touch the code.** A class or copy change with no `*.test.tsx`
  update is incomplete — CI runs vitest before deploy, so one stale assertion blocks it.
- **Type-check every package.** The root `tsconfig.json` excludes `test-automation/`;
  run `npx tsc --noEmit` inside it too.
- **`test-automation/` is SDET-owned.** Frontend/Backend/Integration work never edits it.

## Config
No account id, host, project key, repo owner, email, deployed URL, or absolute
`/Users/...` path belongs in a file. They live in
`~/.claude/skills/project-config.local.md`. Missing a value? Ask once, offer to save.
Never guess: a wrong id misassigns tickets, a wrong URL grades the wrong site.

## Pipeline
`/em → /architect → /ba → /developer → /pr-review-and-merge → /release → /quality-analyst → /sre → /docs`
Handoffs are automatic. Only `/quality-analyst` may set a ticket to Done.
Full map: `~/.claude/skills/PIPELINE.md`.
