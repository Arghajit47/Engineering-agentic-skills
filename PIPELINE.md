# Engineering Pipeline — Skill Map

One human plus an agent pipeline, running a full engineering team's roles. This file is
the canonical map; every skill's "Pipeline position and gates" section points here.

## Invocation order

**Only 8 of the 18 skills are chronological.** The rest are entry points you invoke
yourself, or reference data nothing invokes. Read this section before the role table —
it is the part people get wrong.

### The automatic chain

You invoke **three** commands — `/architect`, then accept the ADR, then pick a ticket for
`/developer`. Everything else is auto-invoked, per the standing workflow-handoff rule:
once a ticket is in flight, no skill pauses to ask whether to continue.

The two pauses are deliberate. An ADR binds a whole epic, and `/ba` authors *several*
tickets while `/developer` builds *one* — neither has an unambiguous automatic successor.

```
        YOU
         │
         ▼
 ①  /architect ──────── ADR + Frozen contracts
         │  ⏸ you ACCEPT the ADR
         ▼
 ②  /ba ─────────────── tickets, token-named ACs
         │  ⏸ you PICK A TICKET
         │     /ba authors several; /developer takes one
         ▼
 ④  /developer <TICKET> ──────────────────────────────────────┐
         │                                                    │
         ├─ ③ /test-strategy   ⟨INTERRUPT · dev step 12.5⟩    │
         │      test contract → RED evidence                  │
         │      runs BEFORE any implementation code           │
         │                                                    │
         ▼  DOD met, MR raised                                │
 ⑤  /pr-review-and-merge ──── AC review                       │
         │                                                    │
         ├─ ⑥ /security-review ⟨INTERRUPT · PR step 7.5⟩      │
         │      PASS · PASS WITH NOTES · BLOCK ───────────────┤
         │      runs BEFORE the merge decision                │
         ▼  merged                                            │
 ⑦  /release ──────────────── CI green + served-HTML proof    │
         │                                                    │
         │      red CI / stale deploy ────────────────────────┤
         ▼  deploy proven to carry the commit                 │
 ⑧  /quality-analyst ──────── Figma parity, a11y, states      │
         │                                                    │
         ├─ ⑨ /perf-budget    ⟨SUB-GATE · QA step 9.5⟩        │
         │      CWV, bundle, image weight                     │
         │                                                    │
         │      FAIL (QA or perf) ────────────────────────────┘
         ▼  PASS → Done                    all three returns →
                                           In Progress → /developer
 ⑩  /sre  (post-deploy soak)  +  /docs  (changelog, ADR status)
```

The circled numbers are **invocation order**, not reading order — ③ `/test-strategy`
fires from inside ④ `/developer`, which is why it appears below it.

### Who invokes whom — the wiring, verbatim

| # | Skill | Invoked by | Trigger condition |
|---|---|---|---|
| ① | `/architect` | **you** | epic spans more than one component |
| ② | `/ba` | `architect` | ADR Accepted (**pauses for your approval first**) |
| ③ | `/test-strategy` | `developer`, step 12.5 | before any implementation code |
| ④ | `/developer` | **you** | you pick which authored ticket to build |
| ⑤ | `/pr-review-and-merge` | `developer`, step 14 | sub-agent hit DOD, MR raised |
| ⑥ | `/security-review` | `pr-review-and-merge`, step 7.5 | **before** the merge decision |
| ⑦ | `/release` | `pr-review-and-merge`, step 10 | merge verified |
| ⑧ | `/quality-analyst` | `release` | deploy proven to carry the commit |
| ⑨ | `/perf-budget` | `quality-analyst`, step 9.5 | after the visual pass, before the verdict |
| ⑩ | `/sre` + `/docs` | `quality-analyst`, step 10 | on PASS → Done |

### Stages vs interrupts

③ `/test-strategy`, ⑥ `/security-review`, and ⑨ `/perf-budget` are **not stages between
skills** — they fire *inside* their host skill, part-way through, and can send the whole
ticket backwards. That is why the diagram shows them on branch arrows. Reading them as
sequential steps is the most common misreading of this pipeline.

### Three skills reverse the chain

| Reversal | Sends the ticket | Then re-invokes |
|---|---|---|
| `/security-review` → **BLOCK** | back to In Progress | `/developer` with the blocking findings |
| `/release` → stale deploy / red CI | back to In Progress | `/developer` — **QA never starts** |
| `/quality-analyst` or `/perf-budget` → **FAIL** | back to In Progress | `/developer`, then the loop repeats |

The repair loop is `/developer → /pr-review-and-merge → /security-review → /release →
/quality-analyst`, cycling until green. Every hop in it is automatic.

### Entry points you invoke yourself

These are **not** links in the chain. They change direction rather than advance a
ticket, so each one stops and waits for you.

| Skill | When | Waits for |
|---|---|---|
| `/em --plan` | before `/architect` — decides *what* to work on | your approval of the order |
| `/design-system --init` | once per project; `--audit` on a cadence | your call on the drift register |
| `/refactor --register` | between tickets, never inside one | you to pick a register item |
| `/agent-eval --gaps` | after several tickets, once rework accumulates | you to approve a skill edit |

### Never invoked directly

`jira-workflow` and `ponytail-mode` declare no trigger command — they are reference data
other skills read.

`local-ai-bridge` is different: it is a **dependency**, loaded via
`skill_view('local-ai-bridge')` as the mandatory first step of any Figma extraction in
`ba`, `qa`, `developer`, and `design-system`.

It covers a **separate application** — a Figma Desktop plugin plus an Express server on
port 47291 — whose source **ships with this bundle** under `bridge/` and is installed and
built by `./install.sh`. Three steps stay manual because Figma requires them: import the
plugin from its manifest, start the server, and open the plugin — **keeping it open**,
since closing it makes the server serve stale data.

If the bridge is absent or its plugin is closed, those four skills **halt and say so**.
They never estimate a design value. The other fourteen are unaffected.

### The shortest real run

Prerequisite for anything Figma-touching: **Figma Desktop** running with your design
file open, the bridge server started, and its plugin imported and left open. The browser
version of Figma cannot load a dev plugin and cannot reach `localhost`. Confirm with:

```bash
curl -s http://localhost:47291/api/whoami | jq '.pluginConnected'   # must be true
```

```bash
/em --plan            # you approve the order
/architect EPIC-12    # you accept the ADR  → /ba authors the tickets
/developer BC-190     # you pick one ticket
                      # → /test-strategy, /pr-review-and-merge, /security-review,
                      #   /release, /quality-analyst, /perf-budget, /sre, /docs
                      #   all chain themselves to Done, soak, and document
```

Three commands per ticket. Everything after `/developer` is wiring.

## Roles

| Skill | Command | Invoked by | Owns | Blocks? |
|---|---|---|---|---|
| `eng-manager` | `/em` | **you** | backlog, sprint scope, WIP, flow metrics, release notes | no — recommends |
| `architect` | `/architect` | **you** | ADRs, frozen API/data contracts | yes — epic cannot start without an Accepted ADR |
| `ba` | `/ba` | `architect` | tickets, BDD ACs, Figma references | yes — no ticket, no work |
| `test-strategy` | `/test-strategy` | `developer` ⟨interrupt⟩ | test contract, RED evidence, visual baseline | yes — no implementation before RED |
| `developer-agent-ecosystem` | `/developer` | **you** (pick a ticket) | implementation via scoped sub-agents | yes — DOD |
| `security-review` | `/security-review` | `pr-review-and-merge` ⟨interrupt⟩ | app + harness security | **yes — merge gate** |
| `pr-review-and-merge` | `/pr-review-and-merge` | `developer` | AC review, verdict, merge | yes |
| `release-engineer` | `/release` | `pr-review-and-merge` | CI→Netlify, deploy proof, tags, rollback | **yes — QA gate** |
| `qa` | `/quality-analyst` | `release` | Figma parity, a11y, states, X-Ray TCs | yes — Done gate |
| `perf-budget` | `/perf` | `quality-analyst` ⟨sub-gate⟩ | CWV, bundle, image weight | yes — QA sub-gate |
| `sre-watch` | `/sre` | `quality-analyst` | post-deploy soak, incidents, rollback call | no — escalates |
| `tech-writer` | `/docs` | `quality-analyst` | changelog, ADR status, README, onboarding | no — never blocks a release |
| `design-system` | `/design-system` | **you** | tokens, breakpoints, assets | no — feeds three skills |
| `refactor-debt` | `/refactor` | **you** | duplication, dead code, debt register | no — cadence |
| `agent-eval` | `/agent-eval` | **you** | the pipeline itself: missing gates, skill drift | no — proposes |
| `jira-workflow` | — | never — reference | assignee account per state | reference |
| `local-ai-bridge` | — | `ba`, `qa`, `developer`, `design-system` | Figma read access on port 47291; source ships in `bridge/` | **dependency** — no bridge, no design facts |
| `ponytail-mode` | — | never — reference | persona flag | reference |

**Directory name vs command name.** Three skills differ, which trips up greps: directory
`ba` = `/ba` = Hermes `business-analyst-workflow`; directory `qa` = `/quality-analyst` =
Hermes `quality-analyst`; directory `pr-review-and-merge` = Hermes `mr-code-review`. The
first column above is the **directory** — the thing `Skill(skill="…")` takes.

## Enforcement — which invariants the harness holds

Most invariants below are prose a skill must choose to follow. Six are enforced by
`hooks/guard.py` at the harness level, so they cannot be missed when context is long —
and they override the permission allowlist.

| Invariant | Enforced by |
|---|---|
| 1 · never push/commit to `main` | **hook** (blocks) |
| 7 · token separation | **hook** (blocks) |
| 12 · `--body-file`, never `--body` | **hook** (blocks) |
| visual baseline only in its own PR | **hook** (blocks) |
| tokens not raw values | **hook** (warns on edit) |
| 14 · ADF-only JIRA content | `scripts/adf.py --validate` before posting |
| everything else | skill prose + review |

`rules/ADF.md` is the canonical JIRA content spec; `rules/AGENTS.md` is the always-on layer: copy it to a repo root as `AGENTS.md` or
`CLAUDE.md` so the hardest rules are in context every turn, before any skill loads.
Skills are progressively disclosed; that file is not, which is why it stays under
50 lines.

Off switch: `touch ~/.claude/skills/hooks/DISABLED`. See `hooks/README.md`.

## Invariants — true across every skill

1. **Never push to `main`.** Branch, PR, explicit approval.
2. **Deployed URL only** for any evidence about behaviour: `/quality-analyst`,
   `/perf-budget`, `/sre`, `/test-strategy` visual baselines. Never `localhost`.
   (The Local AI Bridge on `:47291` is a Figma *data source*, not a subject under test.)
3. **A 200 is not proof of deploy.** Served-HTML token proof, owned by `/release`.
4. **Never auto-file.** A measurement is not a defect. Every audit and register is a
   report the user prioritises. When the user bounds the effort, that bound is binding.
5. **Only `/quality-analyst` may transition a ticket to `Done`.**
6. **Assignee follows state on every transition** — see `jira-workflow`.
7. **Token separation:** `GITHUB_TOKEN` (dev) and `GITHUB_REVIEWER_TOKEN` (review/merge)
   never appear in the same command.
8. **`test-automation/` is SDET-owned.** Frontend/Backend/Integration dev sub-agents
   never touch it.
9. **The design's frame list is the complete set of gradeable widths.** Read once from
   the Local AI Bridge; `/design-system`, `/test-strategy`, and `/quality-analyst` must
   all use the same list.
10. **Hard delegation.** A main agent never performs work assigned to a sub-agent.
11. **No agent-attribution disclaimer** in JIRA comments or PR bodies.
12. **`gh ... --body-file`, never `--body`** with untrusted or backtick-bearing text.
13. **Design facts are read, never estimated.** Which reader is `FIGMA_READ_PATH` in
    `project-config.local.md` — `bridge` (Local AI Bridge, port 47291, requires Figma
    **Desktop** with the file open and the plugin running; the browser cannot serve
    this) or `figma-mcp` (the official `plugin:figma` server). Skills read that key and
    **never ask which to use**. If neither is available, **halt and say so**. Colours,
    spacing, type, tokens, and frame widths are read as data from `localhost:47291`
    (`/api/node/:id/context`, `/api/variables`, `/api/frames`). Port 47291 is mandatory.
    If the bridge is down or its plugin is closed, **halt and say so** — an estimated
    design value is the defect this pipeline exists to prevent. Pixel sampling is a last
    resort for flattened rasters only.
14. **All JIRA content is ADF v3 JSON.** Every description, comment, reply, and subtask
    body, from every skill, no exceptions. Never wiki markup, HTML, or raw Markdown —
    all three render as broken literal text. Templates in the skills are Markdown for
    readability, not the wire format: convert with `scripts/adf.py` and validate before
    posting. Every posting skill owns ready-made templates at
    `<skill>/templates/adf/*.adf.json` — load, substitute, validate, post; never
    compose ADF by hand. Verdicts open with a coloured panel. See `rules/ADF.md`.
15. **No identifying values are hardcoded.** Account ids, site hosts, project keys,
    repo owners, emails, and deployed URLs appear only as `{{PLACEHOLDER}}`, resolved
    from `project-config.local.md` at setup time. A skill that cannot resolve one
    **asks the user and never guesses.** See `PROJECT-CONFIG.md`.

## Where the recurring defect families are now closed

| Family | Previously caught by | Now closed by |
|---|---|---|
| Breakpoint leak (`laptop:` with no `desktop:`) | QA, at the end | `/design-system` tokens + `/test-strategy` visual baseline at all frames |
| Constant drift into test fixtures | follow-up PR | `/test-strategy` contract + `/refactor --register` drift scan |
| QA grading a stale build | nobody | `/release` served-HTML proof |
| Raw hex drift | review, sometimes | `/design-system --audit` |
| Unowned security surface | one review heading | `/security-review` blocking gate |
| Live breakage after Done | the user noticing | `/sre` soak |
| Doc drift | nobody | `/docs --audit` |
| A repeated defect with no owner | manual skill edits | `/agent-eval --gaps` |
