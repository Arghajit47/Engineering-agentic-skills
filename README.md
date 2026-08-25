# Engineering Pipeline Skills

A full engineering team's roles, as Claude Code skills. One person plus an agent
pipeline covering **plan → design → spec → test → build → review → secure → release →
verify → watch → document → improve**.

## Gates, not suggestions

Most agent setups give a model instructions and hope. Three things here **stop the
pipeline** rather than advise it:

- **`/security-review` blocks the merge** — application *and* harness security
- **`/release` blocks QA until the deploy is proven** — a 200 is not proof; the served
  HTML must carry a token the diff added and lose one it removed
- **`/test-strategy` blocks implementation until the tests have failed** — a test that
  never failed has never been shown to test anything

And six rules are enforced **below the model**, by hooks the harness runs:

| Enforced by a hook | Effect |
|---|---|
| push or commit to `main` | blocked |
| dev + reviewer GitHub tokens in one command | blocked |
| `gh --body` containing a backtick (shell injection) | blocked |
| `playwright --update-snapshots` | blocked |
| raw hex or default `lg:`/`xl:` in a component | warned, on the edit |

Skill prose is instruction a model *chooses* to follow. A hook is executed by the
harness, so it survives a long context — and it **overrides your permission allowlist**:
`Bash(git push *)` being allowed does not make `git push origin main` allowed.

Hooks are opt-in and the installer asks explicitly (no default — you type `y` or `n`).
It merges with any hooks you already have and backs up `settings.json` first.
Off switch: `touch ~/.claude/skills/hooks/DISABLED`.
See `hooks/README.md` and the 38-case matrix in `hooks/test-guard.sh`.

## Prerequisites

**Skills only** — nothing but Claude Code (or Hermes). All 18 install and 14 work fully.

**For the Figma read path** (`ba`, `qa`, `developer`, `design-system`) you also need the
Local AI Bridge, and it has real requirements:

| Need | Why |
|---|---|
| **Figma Desktop app** | A development plugin can only be imported from the desktop app. **figma.com in a browser cannot load it and cannot reach `localhost`.** |
| A Figma account | Free plan is fine — working within it is why this bridge exists |
| **The design file open in Figma** | The plugin reads *whichever file is currently open*, not a file key. Re-run it when you switch files. |
| Node.js 18+ and npm | Builds the plugin, runs the server |
| Port 47291 free | Mandatory — every skill hardcodes it |

Two steps stay **manual** no matter what, because Figma requires a human to import and
run a development plugin: importing `manifest.json`, and running the plugin and
**keeping it open** (closing it makes the server serve stale data).

`./install.sh` checks Node, npm, Figma Desktop, and the port before offering to install,
and tells you what is missing. Missing items don't block the skills install.

**Decline the bridge and the skills fall back to Figma MCP automatically.** Saying `n`
records `FIGMA_READ_PATH: figma-mcp` in your config, and the four skills use the official
`plugin:figma` server from then on — you are never asked again. Install the bridge
yourself later? Flip one line to `FIGMA_READ_PATH: bridge`, or re-run
`./install.sh --with-bridge`.

If **neither** path is available, those four skills **halt and say so** rather than
guessing a design value. The other fourteen are unaffected.

Install:

```bash
./install.sh                  # skills + setup + offers the Local AI Bridge
./install.sh --with-bridge    # install the bridge without being asked
./install.sh --no-bridge      # skills only
./install.sh --with-hooks     # wire the enforcement hooks
./install.sh --target hermes  # into ~/.hermes/skills/productivity
./install.sh --dry-run        # see what would change
./install.sh --config         # where your settings live + current values
./install.sh --list           # what is in here
```

Both harnesses read the same `project-config.local.md`, so you configure once.

Then restart Claude Code and read **`PIPELINE.md`** — the lifecycle map, the role
table, and the fourteen invariants every skill enforces.

**Only 8 of the 18 skills are chronological.** The rest are entry points you invoke
yourself, a dependency, or reference data. A whole ticket is three commands:

```bash
/em --plan            # you approve the order
/architect EPIC-12    # you accept the ADR  → /ba authors the tickets
/developer ENG-190    # you pick one ticket
                      # → test-strategy, pr-review-and-merge, security-review, release,
                      #   quality-analyst, perf-budget, sre, docs all chain to Done
```

## What is in here

**Delivery pipeline** — the ticket flow, in order:

| Skill | Command | Owns |
|---|---|---|
| `eng-manager` | `/em` | backlog, sprint scope, WIP limits, flow metrics, release notes |
| `architect` | `/architect` | ADRs and frozen API/data contracts, before tickets exist |
| `ba` | `/ba` | Figma → JIRA tickets with BDD acceptance criteria |
| `test-strategy` | `/test-strategy` | the test contract and RED evidence, before code |
| `developer-agent-ecosystem` | `/developer` | implementation via scoped sub-agents |
| `security-review` | `/security-review` | **blocking** app + harness security gate |
| `pr-review-and-merge` | `/pr-review-and-merge` | AC review, verdict, merge |
| `release-engineer` | `/release` | CI → deploy, served-HTML deploy proof, tags, rollback |
| `qa` | `/quality-analyst` | Figma parity, a11y, states, X-Ray test cases |
| `perf-budget` | `/perf` | Core Web Vitals, bundle size, image weight |
| `sre-watch` | `/sre` | post-deploy soak, incidents, the rollback call |
| `tech-writer` | `/docs` | changelog, ADR status, README, `ONBOARDING.md` |

**Cross-cutting** — cadence-driven, outside the ticket flow:

| Skill | Command | Owns |
|---|---|---|
| `design-system` | `/design-system` | Figma → token layer, breakpoints, assets, drift |
| `refactor-debt` | `/refactor` | the only role that removes code |
| `agent-eval` | `/agent-eval` | reviews this pipeline itself — finds missing gates |

**Dependency — shipped in the box:** `local-ai-bridge` is the Figma read path that `ba`,
`qa`, `developer`, and `design-system` require. Both halves are included:

- the **skill** — endpoint contracts, health checks, the sequential-fetch rule
- the **application source** in `bridge/` — Figma Desktop plugin + Express server on
  port 47291, installed and built for you by `./install.sh`

The installer checks prerequisites, copies the source, runs `npm install`, and builds
`code.js`. It cannot import the plugin into Figma or run it for you — see
**Prerequisites** above and `bridge/INSTALL.md`, which also has a first-run
troubleshooting table.

Only source ships. `server/screenshots/`, `server/svgs/`, and `server/state/` are runtime
caches holding extracted design data — excluded so the bundle carries no client work, and
**preserved on upgrade** if you already have them. Re-installing over an existing bridge
backs up its source first and never touches those caches.

Without the bridge those four skills halt and say so rather than guessing a design value;
the other fourteen are unaffected. The official `plugin:figma` MCP server is the
alternative read path.

**Enforcement layer** — not skills, but the reason the gates hold:

| Component | What it does |
|---|---|
| `hooks/guard.py` | Harness-level rules that **block**: pushing or committing to `main`, mixing the dev and reviewer GitHub tokens, `gh --body` with backticks, updating a visual baseline. Warns on raw hex / default breakpoints in components. Overrides your permission allowlist. |
| `rules/ADF.md` + `scripts/adf.py` | **All JIRA content is ADF v3 JSON — no exceptions.** Markdown-subset → ADF converter and a validator that rejects wiki markup, HTML, and raw Markdown before anything is posted. |
| `telemetry/` | Records which gates fire, which never do, and which skills get reached — the data `/agent-eval` uses. Rule names and repo basenames only; never command text, file contents, or prompts. |
| `rules/AGENTS.md` | Always-on rules template. Copy to a repo root as `AGENTS.md`/`CLAUDE.md` — under 50 lines, in context every turn, before any skill loads. |

Skill prose is instruction a model *chooses* to follow; a hook is executed by the
harness. `./install.sh --with-hooks` wires them, preserving any hooks you already have
and backing up `settings.json`. Off switch: `touch ~/.claude/skills/hooks/DISABLED`.
Details and the 38-case regression matrix: `hooks/README.md`, `hooks/test-guard.sh`.

**Dependency and reference** — never invoked as a pipeline step:

| Skill | Command | Owns |
|---|---|---|
| `local-ai-bridge` | — | Figma read access on port 47291; source ships in `bridge/` |
| `jira-workflow` | — | which assignee each ticket state takes |
| `ponytail-mode` | — | persona flag |

The first column is the **directory name** — what `Skill(skill="…")` takes. Three differ
from their command: `ba` = `/ba`, `qa` = `/quality-analyst`, `pr-review-and-merge` =
`/pr-review-and-merge` (Hermes calls it `mr-code-review`).

## The idea

Most agent setups cover build and review, then stop. The expensive failures live in the
gaps: nobody owns coherence across tickets, nobody owns the deploy, nobody looks after
Done, and nothing removes code.

Each skill closes one of those gaps and wires itself into its neighbours as a gate, so
the pipeline enforces itself rather than relying on anyone remembering. `/agent-eval`
closes the loop: when the same defect shape appears three times, that is a **missing
gate**, and the fix is a skill edit — not more diligence.

Every rule here is traceable to something that actually went wrong. If you cannot name
the incident, the rule does not belong.

## Configuration — nothing is hardcoded

These skills contain **no** account ids, site hosts, project keys, repo owners, emails,
or deployed URLs. Every such value is a `{{PLACEHOLDER}}` resolved at setup time —
`./install.sh` walks you through it, `--setup` re-runs it alone, `--no-setup` skips it.

Setup writes everything to **one file**:

```
~/.claude/skills/project-config.local.md
```

That is the single place your settings live. See it any time — path, current values, and
what is still unset:

```bash
./install.sh --config
```

It is plain Markdown, one `- KEY: value` per line. **Edit it by hand** whenever you
like; changes take effect on the next skill run, no re-install. `--setup` re-runs the
prompts (delete the file first to be asked again). Both harnesses read this same file,
and multiple projects live under their own `## heading`.

It is gitignored and excluded from this bundle by `sync-skills.sh`, so **your values
never travel with the skills**. Every key is documented in `PROJECT-CONFIG.md`.

**Skip anything you don't know.** A skill that hits an unresolved value stops and asks
you for it — once — then offers to save it. Skills are told never to guess one: a wrong
account id silently misassigns tickets, a wrong URL silently grades the wrong site.

Values asked for: `ATLASSIAN_SITE`, `JIRA_PROJECT_KEY`, `JIRA_DEV_ACCOUNT_ID`,
`JIRA_REVIEWER_ACCOUNT_ID`, `JIRA_EMAIL`, `GITHUB_REPO`, `GITHUB_OWNER`,
`GITHUB_REVIEWER_ACCOUNT`, `DEPLOYED_URL`, `DESIGN_FRAME_WIDTHS`, `STORY_POINT_FIELD`,
`PROJECT_NAME`, **`FIGMA_READ_PATH`**, **`REPO_ROOT`**, **`LOCAL_AI_BRIDGE_HOME`**. Full table, discovery
commands, and the rules on how a skill must ask: **`PROJECT-CONFIG.md`**.

**Paths.** `REPO_ROOT` (your local checkout) and `LOCAL_AI_BRIDGE_HOME` are absolute
paths, so they use shell-variable form and setup pre-fills `REPO_ROOT` from
`git rev-parse --show-toplevel` when you run the installer inside a checkout. **No skill
may hardcode an absolute path** — a `/Users/<name>` path leaks the author's username and
breaks for everyone else, and `sync-skills.sh` refuses to publish if one appears.
`REPO_ROOT` is per-project; re-derive it rather than trusting a stale value:

```bash
export REPO_ROOT="$(git rev-parse --show-toplevel)"
```

**Scripted installs** skip the prompts and read the same names from the environment:

```bash
PROJECT_NAME=web ATLASSIAN_SITE=acme.atlassian.net \
REPO_ROOT="$(git rev-parse --show-toplevel)" ./install.sh
```

`sync-skills.sh` refuses to publish if an account id, Atlassian host, deployed URL, or
custom-field id ever reappears in a skill.

## Adapting it to your stack

These skills encode hard-won details of a specific stack: Next.js on Netlify, Prisma +
SQLite, vitest + Playwright, Tailwind v4 with custom Figma-derived breakpoints, JIRA via
Atlassian Rovo MCP, and the Local AI Bridge on `localhost:47291` (shipped in `bridge/`).

Nothing breaks if you lack a tool — a skill you cannot run simply is not invoked. Two
worth reading before your first real run:

- **`design-system/SKILL.md`** — your design's real frame widths, read from the bridge.
  Everything downstream grades against that list.
- **`perf-budget/SKILL.md`** — the budget table, or drop a `perf-budget.json` in your repo.

The *structure* — gates, handoffs, invariants — transfers unchanged. The stack
specifics do not.

## Keeping the bundle current

```bash
./sync-skills.sh     # mirror ~/.claude/skills -> claude-code/skills/, rebuild hermes/, regenerate MANIFEST.md
```

Run it after **any** skill edit or the bundle goes stale. It refuses to publish on four
conditions, so a regression cannot ship silently:

1. a literal credential in the source skills
2. an account id, Atlassian host, deployed URL, or JIRA custom-field id anywhere in the bundle
3. an absolute `/Users/<name>` path
4. `project-config.local.md` reaching the bundle

Review `git diff` before committing — this folder is what other people install.

## Layout

```
install.sh                     install/upgrade — Claude Code (default) or Hermes
sync-skills.sh                 re-export from ~/.claude/skills into this bundle
export-hermes.sh               regenerate hermes/ from claude-code/ (called by sync)
PIPELINE.md                    the lifecycle map and the invariants
PROJECT-CONFIG.md              every {{PLACEHOLDER}}, how to find it, how a skill must ask
MANIFEST.md                    generated skill inventory
bridge/                        Local AI Bridge source — plugin + server, installed by install.sh
claude-code/skills/            the 18 skills — canonical source
hermes/skills/productivity/    the same 18, generated, in Hermes layout
```

Both trees are generated from one source. `claude-code/skills/` is canonical; never edit
`hermes/` by hand — it is deleted and rebuilt on every sync. Three skills carry Hermes
names on export: `ba` → `business-analyst-workflow`, `qa` → `quality-analyst`,
`pr-review-and-merge` → `mr-code-review`, so existing Hermes cross-references resolve.

## Note on sharing

Safe to hand on as-is: no credentials, no account ids, no site hosts, no deployed URLs —
`sync-skills.sh` refuses to publish if any of those reappear.

One thing it does **not** strip: historical ticket ids and narrative in the
`references/` case studies (`KAN-6`, `BC-155`, and similar). Those are the evidence
anchors that make the case studies worth reading, and they carry no configuration
meaning — but they do reveal that some tickets existed. Remove them if that matters for
your audience.

---

Author: **Arghajit Singha**. MIT licence.
