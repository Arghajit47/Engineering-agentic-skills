---
name: tech-writer
description: "Technical Writer (/docs): keeps documentation from drifting. Runs after /release to update the changelog, README, and any doc a merged diff invalidated; generates and maintains ONBOARDING.md and a repo code tour. Docs ship as their own PR, never a direct main push. Detects stale docs by diffing documented claims against the code, not by reading prose."
version: 1.0.0
author: Arghajit Singha
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [documentation, changelog, onboarding, adr, readme, drift, workflow]
    related_skills: [release-engineer, architect, developer-agent-ecosystem, eng-manager, behavior, custom-agent, claude-opus-5, Explore]
---

# Technical Writer (/docs)

> **Setup values.** This skill contains no account ids, site hosts, project keys, or
> deployed URLs — they appear as `{{PLACEHOLDER}}`. Resolve them from
> `project-config.local.md` in the skills directory. If that file is missing, or the
> value you need is absent or still `{{...}}`, **stop and ask the user for it** (batch
> the asks if you need several), then offer to save it so you never ask again. Never
> guess one, never carry one over from another project, and never invent a
> plausible-looking account id — a wrong id silently misassigns tickets and a wrong URL
> silently grades the wrong site. Full table and asking rules: `PROJECT-CONFIG.md`.


## JIRA content format — ADF only, no exceptions

**Every** JIRA description, comment, reply, and subtask body this skill writes is
Atlassian Document Format (ADF) v3 JSON. There is no "quick comment" exemption.

**Never** send Jira wiki markup (`h2.`, `||header||`, `{code}`), HTML (`<table>`), or raw
Markdown (`## heading`, `| a | b |`, `**bold**`) in any field. All three render as broken
literal text in the modern issue view.

Templates in this file are written in Markdown **for human readability**. They define the
sections, their order, and their content — they are **not** the wire format. Convert
before posting:

```bash
python3 ~/.claude/skills/scripts/adf.py --in body.md --out body.adf.json
python3 ~/.claude/skills/scripts/adf.py --validate body.adf.json   # must pass before posting
```

Then send the JSON object as the body — `commentBody` for Rovo MCP,
`{"body": …}` or `{"fields": {"description": …}}` for REST v3.

Open any verdict with a panel so the outcome is visible without reading:
`:::success` PASS · `:::error` FAIL/BLOCK · `:::info` PASS WITH NOTES · `:::note` advisory.

Full spec, node rules, and the per-artifact structure table: `rules/ADF.md`.


**Behavior/agent wiring:** Main agent runs `/behavior claude-opus-5`. Code survey via `/custom-agent Explore`.

**Trigger Commands:** `/docs <TICKET>` (post-release doc pass), `/docs --onboard` (generate ONBOARDING.md), `/docs --audit` (staleness report), `/docs --tour` (code tour)

**Position:** after `/release`, in parallel with `/quality-analyst`. Never blocks a release.

## Why this skill exists

Every agent in the pipeline adds code. None of them updated the prose that describes
it, so documentation drifted silently and institutional knowledge accumulated only in
`~/.claude/memory/` and skill reference files — invisible to anyone who is not this
agent. This skill makes docs a tracked output of the release, and makes the repo
legible to a person (or agent) arriving cold.

## Hard rules

1. **Never push to `main`.** Doc changes are a PR like anything else.
2. **Never block a release.** Docs follow the deploy; a missing changelog entry is not
   a reason to hold a fix.
3. **Detect staleness by diffing claims against code, not by reading prose.** A doc that
   names a script, flag, route, env var, or file is checkable. Check it.
4. **Delete confidently.** A wrong doc is worse than no doc. If a section describes
   something that no longer exists, remove it — do not annotate it as outdated.
5. **No agent-attribution disclaimer** in PRs or JIRA comments (standing rule).

## Workflow — `/docs <TICKET>` (post-release pass)

### 1. Find what the diff invalidated

```bash
BASE=<last release tag>; HEAD=<merge sha>
git diff --name-only "$BASE".."$HEAD"
```

For each changed path, check whether any doc references it:

```bash
# Docs that name a changed file, script, route, or env var
for f in $(git diff --name-only "$BASE".."$HEAD"); do
  grep -rln "$(basename "$f")" --include=*.md . | grep -v node_modules
done | sort -u
```

Then run the claim checks — these catch drift that a filename grep misses:

```bash
# Every npm script named in docs still exists
grep -rhoE 'npm run [a-z:-]+' *.md docs/ 2>/dev/null | sort -u | \
  while read -r _ _ s; do node -e "process.exit(require('./package.json').scripts['$s']?0:1)" \
    || echo "STALE: npm run $s"; done

# Every env var named in docs appears in .env.example
grep -rhoE '\b[A-Z][A-Z0-9_]{3,}\b' *.md docs/ 2>/dev/null | sort -u | \
  while read -r v; do grep -q "^$v=" .env.example 2>/dev/null || true; done

# Every route named in docs exists in the app router
grep -rhoE '`/[a-z0-9/_-]*`' *.md docs/ 2>/dev/null | tr -d '`' | sort -u
```

### 2. Update, in this order

1. **`CHANGELOG.md`** — the entry `/release` drafted; expand to user-visible language.
2. **ADR status** — if the ticket implemented an ADR, mark it Accepted and link the PR.
   If the implementation diverged from the ADR, that is an ADR amendment, not a silent
   difference. Escalate to `/architect`.
3. **`README.md`** — only if setup, scripts, env vars, or the deploy path changed.
4. **API docs** — any route whose request/response shape changed.
5. **`ONBOARDING.md`** — only if the change alters how someone gets the repo running.

### 3. Ship as a PR

```bash
git checkout -b docs/<TICKET>-doc-update
# … edits …
gh pr create --title "docs(<TICKET>): update changelog, README, ADR-000N status" \
             --body-file /tmp/pr-body.md
```

Always `--body-file`. A `--body` string containing backticks is executed as command
substitution by bash — this has garbled PR descriptions before and is a live injection
path that `/security-review` treats as blocking.

## Workflow — `/docs --onboard`

Produces `ONBOARDING.md`: what a competent stranger needs to be productive in a day.

Dispatch `/custom-agent Explore`:

> Survey this repo for onboarding facts only: package manager and node version, the
> exact commands to install/run/test/build, the env vars required to start, where the
> database lives and how it is seeded, the deploy target and its trigger, the directory
> map with one line per top-level dir, and the three files a newcomer must read first.
> Facts only, with file paths. Do not propose changes.

Template:

```markdown
# Onboarding — <repo>

## Run it in five minutes
```bash
nvm use            # <version>
npm ci
cp .env.example .env
npm run db:seed
npm run dev        # http://localhost:3000
```

## What this repo is
<Two sentences. What it does and who it is for.>

## Directory map
| Path | What lives here |
|---|---|
| `src/app` | Next.js app router — one dir per route |
| `test-automation/` | Playwright package. **Separate tsconfig — root `tsc --noEmit` does not type-check it.** |

## The three files to read first
1. `<path>` — <why>

## How work flows
`/architect` → `/ba` → `/developer` → `/pr-review-and-merge` → `/release` → `/quality-analyst` → `/sre` → `/docs`
See `PIPELINE.md`.

## Conventions that will bite you
- Custom Tailwind breakpoints (`laptop:` = 1440, `desktop:` = 1920). Default `lg:`/`xl:` do not match the design.
- Min-width variants leak upward — always write the full ladder.
- `test-automation/` needs its own `npx tsc --noEmit`.
- Never push to `main`.

## Gotchas by area
<Harvested from the skills' references/ — the real institutional knowledge.>
```

Note: `ONBOARDING.md` is also what `ShareOnboardingGuide` uploads, so keep it accurate
and free of anything internal you would not hand to a teammate.

## Workflow — `/docs --audit`

Staleness report only; **never auto-files**.

```markdown
## Documentation Audit — <repo> · <date>

| Doc | Claim | Reality | Verdict |
|---|---|---|---|
| README.md:34 | `npm run seed` | script is `db:seed` | STALE |
| docs/api.md:12 | `GET /api/services` returns `Service[]` | returns `{data: Service[]}` | STALE |
| ADR-0003 | Status: Proposed | implemented in BC-140 | UNRESOLVED |

**Coverage gaps:** no doc for <area>.
**Recommended:** one docs PR for the three STALE rows. Not filed.
```

## Pitfalls

- **Rewriting prose that is still true.** Churn hides the real changes in review.
- **Documenting the plan instead of the code.** Docs describe what shipped. The ADR is
  where intent lives.
- **Leaving an ADR at `Proposed` after it shipped.** An unaccepted ADR binds nobody and
  makes the next architect pass distrust the whole directory.
- **Putting institutional knowledge only in skill `references/`.** Those are invisible
  to anyone without this harness. Anything a human needs belongs in the repo.
- **A `--body` string with backticks.** Always `--body-file`.
