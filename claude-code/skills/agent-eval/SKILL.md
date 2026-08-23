---
name: agent-eval
description: "Agent Evaluator (/agent-eval): the meta role — reviews the skill pipeline itself. Mines JIRA rework, QA failures, and /sre 'what would have caught this' lines to find MISSING GATES, then proposes the smallest skill edit that closes each one. Detects skill drift, contradiction between skills, and rules that exist only in memory. Ships skill changes as reviewable diffs to the Skills bundle; never edits a skill silently."
version: 1.0.0
author: Arghajit Singha
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [meta, evaluation, skills, harness, continuous-improvement, quality, workflow]
    related_skills: [eng-manager, sre-watch, quality-analyst, pr-review-and-merge, tech-writer, behavior, custom-agent, claude-opus-5, Explore]
---

# Agent Evaluator (/agent-eval)

> **Setup values.** This skill contains no account ids, site hosts, project keys, or
> deployed URLs — they appear as `{{PLACEHOLDER}}`. Resolve them from
> `project-config.local.md` in the skills directory. If that file is missing, or the
> value you need is absent or still `{{...}}`, **stop and ask the user for it** (batch
> the asks if you need several), then offer to save it so you never ask again. Never
> guess one, never carry one over from another project, and never invent a
> plausible-looking account id — a wrong id silently misassigns tickets and a wrong URL
> silently grades the wrong site. Full table and asking rules: `PROJECT-CONFIG.md`.


**Behavior/agent wiring:** Main agent runs `/behavior claude-opus-5`. Skill-corpus survey via `/custom-agent Explore`.

**Trigger Commands:** `/agent-eval --gaps` (find missing gates), `/agent-eval --drift` (skill consistency audit), `/agent-eval --sync` (push local skills into the shareable bundle)

**Position:** cross-cutting, cadence-driven. Consumes the outputs of `/em --flow` and `/sre` incident records.

## Why this skill exists

Every other skill improves the *product*. Nothing improved the *pipeline*. Skills were
tuned by hand after each failure, from memory, with no record of which gate was missing
and no check that the edit did not contradict another skill.

The core insight this skill operationalises: **a repeated defect is a missing gate, not
a discipline problem.** When the same failure shape appears three times, the fix is a
skill change, not more care.

## Hard rules

1. **Never edit a skill silently.** Every change is proposed with a diff and the
   evidence that motivated it, and applied only on the user's approval.
2. **The smallest edit that closes the gap.** Skills that grow without bound stop being
   read. A new hard rule in an existing skill beats a new skill.
3. **A new skill needs three distinct failures**, not one. One failure is an incident;
   three is a gap.
4. **Never encode a rule only in memory.** If a rule matters, it belongs in the skill
   that enforces it — memory is context, not enforcement. Rules living only in
   `MEMORY.md` are a finding of this skill.
5. **Never auto-file.** Same standing rule. Findings are a report.

## Workflow — `--gaps`

### 1. Gather failure evidence

| Source | What to extract |
|---|---|
| `/em --flow` rework analysis | which defect family dominates In Testing -> In Progress |
| `/sre` incident records | every "What would have caught this" line |
| QA failure comments in JIRA | the AC that failed and why it was not caught earlier |
| `/pr-review-and-merge` blocking findings | what review caught that a gate should have |
| Follow-up PRs | a fix that needed a second PR is a gate that fired too late |

```
# mcp: searchJiraIssuesUsingJql(
#   jql="project = <KEY> AND status changed FROM 'In Testing' TO 'In Progress' ORDER BY updated DESC")
```

### 2. Cluster by failure shape, not by ticket

The cluster is the finding. Three tickets failing for three different reasons is
normal; three failing the same way is a missing gate.

```markdown
## Gap Analysis — <date> · last <n> failures

### Cluster A — responsive breakpoint leak (4 occurrences)
BC-155, BC-188, BC-190, BC-193.
**Shape:** min-width variant applied at 1440 also applies at 1920; grading at 1440 passes.
**Caught by:** QA, at the end of the pipeline.
**Should be caught by:** the token layer (never written) or a lint rule (does not exist).
**Proposed fix — smallest first:**
1. `/design-system --init` — remove the family at the source. (owns it)
2. Add to `/test-strategy` visual baseline: all three widths mandatory. (already added)
3. Add a hard rule to `developer-agent-ecosystem`: never ship a min-width variant
   without the next rung. (one-line edit)

### Cluster B — constant drift into test fixtures (2 occurrences)
Below the three-occurrence threshold. **Watch, do not act.**
```

### 3. Propose the diff

For each actionable cluster, produce the literal edit:

```markdown
### Proposed edit — `developer-agent-ecosystem/SKILL.md`

Under "Hard rules", add:

> N. **Every min-width variant needs its next rung.** `laptop:grid-cols-3` with no
>    `desktop:` sibling means 1920 silently inherits 1440. Write the full ladder or
>    justify the omission in the PR body.

**Evidence:** BC-155, BC-188, BC-190, BC-193.
**Cost:** 3 lines. **Blast radius:** every frontend ticket.
```

Then stop and wait for approval.

## Workflow — `--drift` (skill consistency audit)

Skills that contradict each other are worse than a missing skill, because two agents
will confidently do opposite things.

```bash
SK=~/.claude/skills

# Every WORKFLOW skill declares its behavior/agent wiring.
# Reference-only skills (jira-workflow, ponytail-mode) are exempt — they orchestrate nothing.
REFERENCE_ONLY='jira-workflow|ponytail-mode'
for d in "$SK"/*/; do
  n=$(basename "$d"); [ -f "$d/SKILL.md" ] || continue
  echo "$n" | grep -qE "^($REFERENCE_ONLY)$" && continue
  grep -qE 'Behavior/agent wiring|Behavior and Agent Invocation Rules' "$d/SKILL.md" \
    || echo "NO WIRING: $n"
done

# Frontmatter completeness
for f in "$SK"/*/SKILL.md; do
  for k in name description version author license; do
    grep -q "^$k:" "$f" || echo "MISSING $k: $f"
  done
done

# related_skills that point at skills which do not exist
grep -h 'related_skills' "$SK"/*/SKILL.md | tr -d '[]' | tr ',' '\n' | sed 's/.*: //;s/ //g' | sort -u

# The standing rules must each appear in the skills that enforce them
grep -rl 'never.*localhost\|deployed URL' "$SK" --include=SKILL.md
grep -rl 'GITHUB_REVIEWER_TOKEN' "$SK" --include=SKILL.md
grep -rl 'Never push to .main\|never push to main' "$SK" --include=SKILL.md
grep -rl 'auto-file' "$SK" --include=SKILL.md
```

Report:

```markdown
## Skill Drift Audit — <date>

| Check | Result |
|---|---|
| Skills present | 16 |
| Missing behavior wiring | 0 (2 reference-only skills exempt) |
| Broken `related_skills` refs | 1 — `mr-code-review` (renamed to `pr-review-and-merge`) |
| "deployed URL only" enforced in | qa, sre-watch, perf-budget, test-strategy |
| "never push to main" enforced in | release-engineer, refactor-debt, tech-writer, architect |

### Contradictions
None found. | <skill A says X, skill B says not-X — resolve>

### Rules living only in MEMORY.md
- <rule> — should be a hard rule in `<skill>`.
```

That last section matters most: a rule in memory applies only when the memory is
recalled; a rule in a skill applies whenever the skill runs.

## Workflow — `--sync` (bundle export)

Keeps the shareable bundle current so anyone who receives it gets the same pipeline.

```bash
~/Downloads/Skills/sync-skills.sh
```

That script mirrors `~/.claude/skills/` into `~/Downloads/Skills/claude-code/skills/`,
regenerates the manifest, and leaves the Hermes-format monoliths at the bundle root
untouched. Review the resulting `git diff` in the bundle before committing — this is the
artifact other people install.

## Pitfalls

- **Acting on one failure.** Every incident feels like it needs a new rule. Three
  occurrences, or it is noise and the skill grows for nothing.
- **Writing a new skill when a hard rule would do.** New skills carry discovery cost;
  a rule in an existing skill is read for free by whoever already loads it.
- **Auditing skills by reading them.** Ten thousand lines of prose all sound reasonable.
  Grep for the enforcement of specific rules instead.
- **Leaving `related_skills` pointing at renamed skills.** It silently degrades
  discovery and nothing errors.
- **Evaluating the skills without the JIRA evidence.** Without the rework data this
  becomes an opinion about prose style.
