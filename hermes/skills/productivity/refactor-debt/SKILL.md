---
name: refactor-debt
description: "Refactor & Tech-Debt Owner (/refactor): the only role that removes code. Runs on a cadence, never inside a feature ticket. Finds duplication, dead code, over-abstraction, and drift; ships behaviour-preserving PRs proven by an unchanged test suite. Refuses to mix refactor and behaviour change in one diff. Never auto-files — produces a debt register the user prioritises."
version: 1.0.0
author: Arghajit Singha
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [refactor, tech-debt, dead-code, duplication, cleanup, maintenance, workflow]
    related_skills: [pr-review-and-merge, developer-agent-ecosystem, design-system, eng-manager, quality-analyst, behavior, custom-agent, claude-opus-5, Explore, worker]
---

# Refactor & Tech-Debt Owner (/refactor)

> **Setup values.** This skill contains no account ids, site hosts, project keys, or
> deployed URLs — they appear as `{{PLACEHOLDER}}`. Resolve them from
> `project-config.local.md` in the skills directory. If that file is missing, or the
> value you need is absent or still `{{...}}`, **stop and ask the user for it** (batch
> the asks if you need several), then offer to save it so you never ask again. Never
> guess one, never carry one over from another project, and never invent a
> plausible-looking account id — a wrong id silently misassigns tickets and a wrong URL
> silently grades the wrong site. Full table and asking rules: `PROJECT-CONFIG.md`.


**Behavior/agent wiring:** Main agent runs `/behavior claude-opus-5`. Duplication and dead-code discovery via `/custom-agent Explore`; test-suite verification via `/custom-agent worker`.

**Trigger Commands:** `/refactor --register` (debt survey, no code change), `/refactor <ITEM>` (execute one register item), `/refactor --dead-code`

**Position:** cross-cutting, cadence-driven. Explicitly **not** part of the ticket flow.

## Why this skill exists

Every other agent in the pipeline adds code. `/developer` adds features, `/quality-analyst`
adds tests, `/security-review` adds guards. Nothing removes anything, so the codebase
only grows and the marginal cost of each ticket rises. This is the only role whose
output can be a negative diff.

## Hard rules

1. **Behaviour-preserving or it is not a refactor.** The test suite must pass
   *unchanged*. If a test needs editing to go green, you changed behaviour — stop, and
   split it into a feature ticket.
2. **Never mix refactor with behaviour change in one PR.** This is the rule that makes
   refactor PRs reviewable. A mixed diff is unreviewable and gets rubber-stamped.
3. **Never runs inside a feature ticket.** A developer sub-agent that spots debt notes
   it; it does not detour. Scope creep inside a ticket is how a 5-point story becomes
   three days.
4. **Never auto-files.** `--register` produces a table. The user decides what becomes
   work. (Standing no-endless-ticketing rule — a duplication count is a measurement.)
5. **One concern per PR.** "Remove dead exports" and "extract the card component" are
   two PRs.
6. **Never push to `main`.** Branch + PR + explicit approval, as always.

## Workflow — `--register` (survey)

Produces the debt register. No code changes at all.

### 1. Mechanical scans

```bash
# Dead exports and unused files
npx -y knip --no-progress 2>/dev/null || npx -y ts-prune

# Duplication
npx -y jscpd src --min-lines 8 --min-tokens 60 --reporters console

# Unused dependencies
npx -y depcheck

# TypeScript escape hatches
grep -rn ': any\b\|as any\|@ts-ignore\|@ts-expect-error' src/ --include=*.ts --include=*.tsx | wc -l

# Suppressed lint
grep -rn 'eslint-disable' src/ | wc -l

# Files large enough to be doing two jobs
find src -name '*.tsx' -o -name '*.ts' | xargs wc -l | sort -rn | head -15

# Churn × size — the highest-value refactor targets
git log --format=format: --name-only --since=6.months | sort | uniq -c | sort -rn | head -20
```

The churn × size intersection is the one that matters: a 900-line file nobody touches
is not debt, it is furniture. A 300-line file edited in every second ticket is where
the cost lives.

### 2. Structural review

Dispatch `/custom-agent Explore`:

> Find components in `src/` that render near-identical markup with different props,
> abstractions with exactly one caller, and props threaded through three or more levels
> without being read in between. Report file:line and the concrete duplication. Do not
> propose fixes yet.

Also check the drift families this codebase actually produces:

- **Constant drift** — a runtime value changed and the test/POM/fixture copy did not.
  Grep every changed literal across `src/**` and `test-automation/**`.
- **Token drift** — raw hex and default Tailwind breakpoints. That is `/design-system`'s
  register, not this one; cross-reference rather than duplicate.
- **Hydration guard copy-paste** — the same SWR guard inlined in N components instead
  of extracted once.

### 3. The register

```markdown
## Tech-Debt Register — <repo> · <date>

| # | Item | Evidence | Churn | Effort | Risk | Payoff |
|---|---|---|---|---|---|---|
| 1 | `Card` markup duplicated 5× | jscpd: 5 clones, 34 lines | high | S | low | every card ticket gets cheaper |
| 2 | 23 `as any` in `src/lib/api.ts` | grep | med | M | med | real types at the API boundary |
| 3 | 11 unused exports | knip | — | S | none | −180 LOC |

**Recommended order:** 3 (free), 1 (highest churn), 2 (needs the ADR contract first).
**Not filed.** Tell me which of these to execute.
```

Effort S/M/L. Risk is *blast radius if wrong*, not difficulty.

## Workflow — `/refactor <ITEM>` (execute)

### 1. Record the green baseline

```bash
git checkout -b refactor/<slug>
npm test 2>&1 | tail -20          # record exact pass count
npx tsc --noEmit                   # root
npx tsc --noEmit -p test-automation  # separate package — root tsconfig excludes it
npm run build
```

Write the numbers down. They are the contract: the same numbers must appear after.

### 2. Refactor

Smallest correct diff for **one** concern. Do not rename while extracting. Do not
reformat untouched lines — it destroys the diff's reviewability.

### 3. Prove behaviour preserved

```bash
npm test 2>&1 | tail -20   # identical pass count, zero spec files modified
git diff --stat -- '*.test.*' '*.spec.*'   # must be EMPTY
npx tsc --noEmit && npx tsc --noEmit -p test-automation
npm run build
```

`git diff --stat` on test files being non-empty is the tripwire. If it fires, you
changed behaviour. Abandon and re-scope.

Compare like with like on test counts — a `--project unit` count and a full-suite count
are different figures, and quoting one against the other reads as a regression that
is not there.

### 4. PR

```bash
gh pr create --title "refactor: <one concern>" --body-file /tmp/pr-body.md
```

Body must contain the before/after verification table:

```markdown
## Refactor — <concern>

Behaviour-preserving. No spec file modified.

| Check | Before | After |
|---|---|---|
| `npm test` | 214 passed | 214 passed |
| `tsc --noEmit` (root) | exit 0 | exit 0 |
| `tsc --noEmit` (test-automation) | exit 0 | exit 0 |
| `npm run build` | exit 0 | exit 0 |
| LOC | +0 −180 | |

`git diff --stat -- '*.test.*'` → empty.
```

Then hand to `/pr-review-and-merge` as normal. A refactor PR gets the same review gate
as a feature PR — including `/security-review`, because "just moving code" is how a
server-only import crosses into a client component.

## Pitfalls

- **Editing a test to make the refactor pass.** The single most common way a refactor
  silently ships a bug. The empty test-diff check is non-negotiable.
- **Abstracting at two call sites.** Two is a coincidence. Three is a pattern. Premature
  abstraction is itself debt, and this skill creates it as easily as it removes it.
- **Reformatting the whole file.** The real change becomes invisible in review.
- **Refactoring low-churn code.** Correct-looking work with no payoff. Follow the churn
  column.
- **Deleting an export `knip` calls unused that is reached dynamically** — string-keyed
  imports, route conventions, Playwright POM lookups. Grep the string form before
  deleting.
- **Doing this during a sprint's feature work.** Cadence-driven means between tickets,
  with the user's explicit go-ahead on a register item.
