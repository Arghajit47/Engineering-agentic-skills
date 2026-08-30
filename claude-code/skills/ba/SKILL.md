---
name: business-analyst-workflow
description: "Business Analyst Workflow (/ba, /ba-reply): THREE MODES — Mode A authors new tickets from a Figma design; Mode B enriches an EXISTING ticket (e.g. a Bug) with Figma node references, append-only, no scope split / no retitle / no story points / no reworded issues; Mode C authors ONE new Bug from measured Figma-vs-deployed deviations on an already-shipped implementation (no scope split, no 12-section feature structure, mandatory Protected-values section). Orchestrate a 3-agent pipeline — @BA manager agent (Main) running under /behavior claude-opus-5, @designerAgent via /custom-agent visualize, @technicalSeniorBA via /custom-agent Plan — to break down Figma design components into sprint-ready JIRA tickets with BDD acceptance criteria, API data contracts, and visual acceptance criteria. Uses /custom-agent teammate for parallel sub-agent coordination. /ba-reply handles developer unblock requests. Uses the Local AI Bridge at http://localhost:47291 only; port 47291 is mandatory, never 3001 or 3000. Strict PNG screenshots required for every Frontend and Integration ticket. Frontend and Integration tickets MUST include a 'Logos & Icons' section with confirmed asset table, copy-paste export script, and Local AI Bridge endpoints table. Story points set via JIRA API field {{STORY_POINT_FIELD}}: Frontend=5, Backend=3, Integration=3. Enforces hard delegation: main agent must not perform sub-agent work."
version: 1.19.0
author: Arghajit Singha
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags:
      [
        business-analyst,
        jira,
        figma,
        design-to-ticket,
        bdd,
        agile,
        sprint,
        workflow,
        local-ai-bridge,
      ]
    related_skills:
      [
        local-ai-bridge,
        jira,
        subagent-driven-development,
        behavior,
        custom-agent,
        claude-opus-5,
        visualize,
        Plan,
        teammate,
      ]
---

# Business Analyst Workflow (/ba)

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

**Start from this skill's own template — do not compose ADF by hand:**

| Template | Use for |
|---|---|
| `templates/adf/bug-description.adf.json` | a Bug authored from measured deviations (Mode C) |
| `templates/adf/comment.adf.json` | any other comment on a ticket |
| `templates/adf/description.adf.json` | a new ticket description (Mode A) |
| `templates/adf/reply.adf.json` | answering a developer unblock request (/ba-reply) |

Each is valid ADF v3 with `{{PLACEHOLDER}}` tokens. Load it, substitute, post the
object as the body — `commentBody` for Rovo MCP, `{"body": …}` or
`{"fields": {"description": …}}` for REST v3. Delete any row or section the ticket
genuinely does not need; never leave a `{{PLACEHOLDER}}` in a posted body.

```bash
python3 ~/.claude/skills/scripts/adf.py --validate <filled>.adf.json   # before posting
```

**Never** send Jira wiki markup (`h2.`, `||header||`, `{code}`), HTML (`<table>`), or raw
Markdown (`## heading`, `| a | b |`, `**bold**`). All three render as broken literal text
in the modern issue view.

Templates are generated from `templates/adf/_src/ba/*.adf.md` by
`templates/adf/build.sh` — edit the source and rebuild, never the JSON. Full node spec:
`rules/ADF.md`. Which template a skill uses at which gate, for the whole
pipeline: `templates/TEMPLATES.md` (generated — do not edit by hand).

## Figma read path — bridge or Figma MCP

Read **`FIGMA_READ_PATH`** from `project-config.local.md` and use it. **Never ask the
user which path to take** — the decision was recorded at install.

| Value | Use |
|---|---|
| `bridge` | Local AI Bridge on `http://localhost:47291` (port mandatory) |
| `figma-mcp` | the official `plugin:figma` MCP server |

Same facts, different transport:

| Need | `bridge` | `figma-mcp` |
|---|---|---|
| Tokens / variables | `GET /api/variables` | `get_variable_defs` |
| Frame list, structure | `GET /api/frames`, `/api/document` | `get_metadata` |
| Per-node CSS, layout, fills | `GET /api/node/:id/context`, `/css` | `get_design_context` |
| Vector export | `GET /api/node/:id/svg` | `download_assets` |
| Rendered image | bridge screenshot endpoints | `get_screenshot` |

**Key missing?** Probe once — `curl -s --max-time 2 http://localhost:47291/api/whoami`
— use `bridge` if it answers, `figma-mcp` if not. State which you picked and offer to
record it. Do not interrogate the user.

**`bridge` selected but unreachable, or its plugin closed?** Say so, fall back to
`figma-mcp` for this run if it is available, and suggest they either start the bridge or
set `FIGMA_READ_PATH: figma-mcp`. Do not silently switch every run.

**Neither available?** **Halt and say so.** Never estimate a design value — that is
invariant 13. Degraded bridge (plugin closed) still gives geometry, layout, and text, but
**not** CSS, tokens, or SVG export; label anything you cannot verify as UNAVAILABLE.


Orchestrate a three-agent pipeline that transforms a Figma design component into sprint-ready JIRA tickets with full BDD acceptance criteria, API data contracts, and visual references.

**Trigger Commands:** `/ba`, `/ba-reply <JIRA_KEY_ID> <COMMENT_URL>`

## Pipeline position and gates

```
/em --plan → /architect → **/ba** → /developer → /pr-review-and-merge → /release → /quality-analyst → /sre → /docs
```

Full map: `PIPELINE.md` in the Skills bundle.

### Upstream gate — /architect (Mode A only)

**Before Phase 1, check whether the epic has an Accepted ADR.**

- If the feature spans more than one component — i.e. it will produce a `[Backend]`
  *and* an `[Integration]` ticket — an Accepted ADR is a **precondition**. If none
  exists, STOP and invoke `Skill(skill="architect", args="<EPIC_KEY>")`, then resume.
- If an Accepted ADR exists, its **Frozen contracts** block is copied **verbatim** into
  every child ticket's API data contract section. Do **not** re-derive contracts from
  the design when a contract already exists — divergence between the ADR and the
  tickets is the exact failure this gate prevents.
- A developer who reports a contract as unimplementable escalates back to `/architect`
  via `/ba-reply`. Never patch a Frozen contract inside a ticket.

This gate does **not** apply to Mode B (enrichment) or Mode C (one bug from measured
deviations) — neither carries architectural surface.

### Cross-cutting — /design-system

Acceptance criteria cite **token names and named breakpoints**, not raw values:

- ✅ `background is --color-brand-primary`, `laptop:grid-cols-3 desktop:grid-cols-4`
- ❌ `background is #0a2540`, `lg:grid-cols-3`

Token-named ACs survive a design refresh; raw-value ACs go stale the moment Figma
changes. If a value the design uses has no token yet, say so in the ticket and flag it
for `/design-system --sync` — do not silently inline the hex.

The breakpoint list in any AC is the design's real frame list (for `{{PROJECT_NAME}}`:
390 / 1440 / 1920) and nothing else. This is the same enumeration `/design-system` and
`/quality-analyst` use; all three must agree or a ticket becomes ungradeable.

### Downstream

- **`/ba` does not auto-invoke `/developer`.** It authors several tickets; `/developer`
  builds one, so there is no unambiguous successor. Report the authored ticket keys and
  stop — the user picks which to build. This is one of only two deliberate pauses in the
  pipeline (the other is ADR acceptance).
- Once picked, the developer pipeline runs `/test-strategy` against these ACs **before**
  implementing, so an AC that cannot be turned into a falsifiable assertion will bounce
  back. Write ACs that are measurable.


## Quality Reference Files

Keep these reference files up to date and read the relevant one before drafting tickets:

- `references/figma-design-inventory.md` — mandatory design inventory questionnaire.
- `references/kan6-kan50-design-fidelity-case-study.md` — prior visual-fidelity failures.
- `references/bc74-quality-failure-case-study.md` — placeholder copy, wrong assets, invisible text, and missed mobile states ({{PROJECT_NAME}}/{{PROJECT_NAME}} project).
- `references/figma-chrome-profile-screenshot-fallback.md` — browser screenshot fallback recipe.

## Required pre-ticket reading

Before writing the questionnaire in Phase 1, the @BA manager agent MUST read **all four** reference files listed above and explicitly cite them in the design questionnaire. Skipping a reference is a workflow violation.

## Agents and Roles

|| Agent              | Role                                                                                                      | Invocation |
|| ------------------ | --------------------------------------------------------------------------------------------------------- | ---------- |
|| @BA manager agent  | Main orchestrator — isolates components, formulates questionnaire, drafts user story wrapper              | `/behavior claude-opus-5` (main session assumes this behavior) |
|| @designerAgent     | Sub-Agent 1 — validates Local AI Bridge, answers component questions across all states, captures screenshots | `/behavior claude-sonnet-5` then `/custom-agent visualize` |
|| @technicalSeniorBA | Sub-Agent 2 — writes the final unified ticket with BDD AC, API contracts, NFRs, automation clauses        | `/behavior claude-sonnet-5` then `/custom-agent Plan` |

## Behavior and Agent Invocation Rules

1. **Main agent behavior:** At the start of every `/ba` and `/ba-reply` invocation, the main session MUST run `/behavior claude-opus-5`.
2. **Sub-agent behaviors:** Each sub-agent leaf dispatch MUST first load `/behavior claude-sonnet-5`, then its custom agent:
   - `@designerAgent`: `/behavior claude-sonnet-5` → `/custom-agent visualize`
   - `@technicalSeniorBA`: `/behavior claude-sonnet-5` → `/custom-agent Plan`
3. **Planning work:** Delegate via `/custom-agent Plan`.
4. **Design analysis work:** Delegate via `/custom-agent visualize`. The visual agent uses the Local AI Bridge at `http://localhost:47291` only.
5. **Parallel sub-agents:** Coordinate via `/custom-agent teammate` using the `SendMessage` tool.
6. **Agent switching:** Only one custom agent active at a time, or delegate each to a separate `delegate_task` leaf.

### HARD DELEGATION RULE

**The main agent is forbidden from executing work assigned to a sub-agent.**

- If `delegate_task` is available and a sub-agent role is defined for a task, the main agent MUST dispatch that task via `delegate_task`. It is a workflow violation for the main agent to perform the sub-agent's work directly.
- Phase 2 (designer analysis) and Phase 3 (technical BA ticket drafting) MUST be dispatched to `@designerAgent` and `@technicalSeniorBA` respectively. The main agent must not write the design inventory, must not extract Figma assets, and must not draft the final JIRA ticket body itself.
- The main agent's job is: setup, component isolation, questionnaire formulation, artifact attachment, validator execution, JIRA creation/transition, and orchestration. Anything labeled with a sub-agent role in the Agents and Roles table is off-limits to the main agent.
- If a sub-agent times out, fails, or returns incomplete output, the main agent must re-dispatch with clearer instructions or escalate to the user — not finish the work itself. "I'll just do it quickly" is the failure mode that produced BC-74.
- The only exception is when the tool runtime literally does not provide `delegate_task` or the required behavior/custom-agent infrastructure is unavailable. In that case, document the fallback in the JIRA comment and proceed manually, but never silently.

## Mode Selection (do this FIRST)

`/ba` has **three** modes. Choosing the wrong one is a workflow violation — Mode A's mandatory rules will corrupt an existing ticket, and they will bloat a bug report into three tickets nobody asked for.

| | **Mode A — New Ticket Authoring** | **Mode B — Bug Enrichment** | **Mode C — New Bug Authoring** |
|---|---|---|---|
| Trigger | A Figma component/section needs sprint-ready tickets | An **existing** ticket (usually a Bug) needs Figma node references, asset IDs, or spec values added | A **built and deployed** implementation measurably deviates from its design, and no ticket exists yet |
| Input | Figma URL / node | An existing JIRA key with issues already written | Measured Figma-vs-deployed findings |
| Output | New `[Frontend]`/`[Backend]`/`[Integration]` tickets | The **same** ticket, description enriched | **One** new Bug |
| Workflow | Phases 0–4 below | **Phase B** below | **Phase C** below |

**Decide with two questions:**
1. **Does the ticket already exist and already state its issues?** → **Mode B**.
2. If not: **are you specifying work not yet built, or reporting a deviation in something already shipped?**
   - Not yet built, from a design → **Mode A**.
   - Already shipped and measurably wrong → **Mode C**.

Mode C exists because A and B between them left a real gap: A authors *feature* tickets and mandates a scope split plus a 12-section user-story structure; B assumes the ticket is already there. Neither fits "raise one Bug for measured deviations against a live build" — the most common request after a QA pass. Forcing that into Mode A produces three scope-split tickets nobody asked for; forcing it into Mode B has nothing to enrich.

### Ticket-Worthiness Gate (applies to BOTH modes, and to any bug you are asked to raise)

**A measured difference is not automatically a ticket.** `/ba` was used on
`{{PROJECT_NAME}}` to convert QA measurements into bug tickets, and because nothing here
bounded what counted as a defect, the loop ran 34 tickets deep before the user stopped it
("why this endless loop is going on?"). Apply these four tests before drafting any bug:

1. **Is there a specification it contradicts?** A defect needs a stated expectation — a
   value read from a real Figma frame, or an explicit acceptance criterion. First enumerate
   the design's frames (`/api/document`, parsed locally). For `{{PROJECT_NAME}}` there are
   exactly **three: 390, 1440, 1920**. **At a width with no frame there is no
   specification**, so a measurement there is data, not a defect. Do not ticket the fluid
   result of a correct implementation.
2. **Is it above the noise floor?** Sub-pixel differences, and differences that trace to
   the design's own rounding, are not tickets. A Figma frame that places a container at
   x=17 width=357 inside a 390 frame has a 17px left and a 16px right gutter — a symmetric
   `px-4` will differ by 1px forever. Document it in the existing ticket; do not raise one.
3. **Is it distinct from an open ticket?** If it shares a root cause with something already
   open, **fold it in and say you did** — do not open a sibling. One `laptop:`-leak root
   cause was legitimately worth one audit ticket, not eight.
4. **Has the user bounded the effort?** If the user has said a set of tickets is the last,
   or has questioned the volume, that is binding. Fold genuinely in-scope discoveries into
   an open ticket; report the rest as observations. **Never auto-file.** Findings go to the
   human, who decides what becomes a ticket.

**When drafting a bug that does pass all four:** cite the **node ID and the frame width**
for every value. A bug that says "the navbar should be 95px" is unusable; "node `5:27272`
@1920 = 95px tall, pill 100×51" is checkable — and a ticket I wrote once compared a 1920
implementation against the **laptop** frame precisely because the frame width was implicit.
Also state the values that must **not** change, so the fix cannot regress a neighbouring
breakpoint while satisfying the one in the ticket.

### Phase B: Bug Enrichment on an Existing Ticket (@BA manager agent)

Use when the user says "find the Figma nodes and attach them to this ticket", "update the description with node references", or similar, on a ticket that already exists.

**⛔ DO NOT APPLY THESE MODE A RULES IN MODE B — every one of them changes the ticket:**
- Do **NOT** split into `[Frontend]`/`[Backend]`/`[Integration]`, and do **NOT** create sibling tickets.
- Do **NOT** retitle to `[Scope] {Page} {Section}`.
- Do **NOT** set `{{STORY_POINT_FIELD}}` story points on a Bug that did not have them.
- Do **NOT** impose the 12-section KAN-6 structure over the reporter's existing content.
- Do **NOT** reword, renumber, merge, split, or "improve" any stated issue. The reporter's observations are the specification; you are adding evidence, not editing findings.
- The **STRICT screenshot rule does not apply.** A bug reported against a live deployment is evidenced by the deployed rendering; a Figma screenshot is optional supporting material, not a completeness gate.

**Steps:**
1. Run `/behavior claude-opus-5`. Load `local-ai-bridge`. Validate the bridge exactly as in Phase 1 steps 1–8 (bridge-only rule still fully applies).
2. Fetch the ticket and **preserve its description verbatim** as the base. Copy the original into `/tmp/{KEY}-description-before.txt` before editing, so the diff is auditable and reversible.
3. Dispatch **@designerAgent** (hard delegation still applies — the main agent must not do the extraction) with the ticket's observations, asking for the exact node ID behind **each** observation.
4. **Append**, never overwrite. Add only additive sections, for example:
   - `h2. 🎨 Figma Node References` — a table mapping each numbered observation to its node ID, size, type and Figma URL
   - `h2. 🖼️ Assets Referenced` — asset table (Asset / Node ID / Size / Format / Output path) plus the export script, **only if** the ticket's issues involve assets
   - `h2. 🔌 Local AI Bridge Endpoints` — only if assets must be exported
5. Keep the reporter's numbering. If observation 3 is about `hero-monthly-income`, the reference row must say "Observation 3" so the mapping is unambiguous.
6. If a node genuinely cannot be resolved, write **UNRESOLVED** with the reason in the table. Never guess a node ID, and never quietly drop an observation.
7. Post a JIRA comment recording what was added, what remains unavailable, and why. Do not transition the ticket or change its assignee unless the user asked.
8. Validation: `validate-ba-ticket.py` is a **Mode A** gate and will fail a Bug on structural grounds that do not apply. Run it only if the user asks; if you do, report its output as informational and state plainly which failures are Mode A artifacts rather than real defects.

### Phase C: New Bug Authoring from Measured Deviations (@BA manager agent)

Use when the user says "raise a bug for these mismatches", "create a single bug ticket covering all this", or similar, against an implementation that is already deployed.

**Run the Ticket-Worthiness Gate above first.** Mode C is the mode most likely to be abused into a ticket mill — it is fed by measurement output. A finding that fails any of the four tests does not enter the ticket.

**⛔ MODE A RULES THAT DO NOT APPLY HERE:**
- Do **NOT** split into `[Frontend]`/`[Backend]`/`[Integration]`. Mode C produces **one** Bug. Scope-splitting a defect report fragments the evidence.
- Do **NOT** impose the 12-section KAN-6 feature structure. A Bug has no User Story, no API contract, and no sibling cross-links.
- The `🌈 Design Theme`, `🖼️ Logos & Icons` (with export script) and `🔌 Bridge Endpoints` sections are **Mode A completeness gates** — include them only where the bug's own findings involve those things.
- `validate-ba-ticket.py` is a Mode A gate; it will fail a Bug on structural grounds that do not apply. Run only on request and label failures as Mode A artifacts.

**Required structure (in this order):**
1. `h2. 🐞 Summary` — what deviates, and the single most quantified headline (e.g. total page height +19.8%).
2. `h2. 🎯 Environment` — Figma frame node ID + size, file URL, **deployed URL + commit SHA**, viewport tested, and **the full list of frame widths that exist in the design**. Add a scope guard sentence: findings are graded only against real frames.
3. **One `h2.` per finding group**, each a table with `Element | Figma (frame) | Deployed` columns. Group by kind (spacing, type, colour, box metrics, assets), not by section — a developer fixes all the font sizes in one pass.
4. `h2. ✅ Acceptance Criteria` — BDD, one per finding group, plus: no-overflow regression check, **unit tests updated in the same commit**, and **evidence from the deployed URL only, never localhost**.
5. `h2. 🛡️ Protected values — must NOT change` — everything measured as already correct. **This section is mandatory in Mode C** and is the single highest-value part of the ticket: it is what stops a fix regressing a neighbouring value or breakpoint. State values by class string or computed value. Include the explicit warning that a fix at one breakpoint must not leak into the others.
6. `h2. 🚫 Out of scope / already resolved` — accepted deviations (with the ticket that accepted them), anything fixed on the design side rather than in code, and every suspicion you *investigated and cleared*. Recording a cleared suspicion prevents the next reader re-raising it.
7. `h2. 🔬 Method` — how each side was measured, so a disagreement is resolvable without redoing the work.
8. `h2. 📎 Attachments`.

**Steps:**
1. Validate the bridge per Phase 1 steps 1–8, including the 2a liveness check.
2. **Duplicate scan before drafting** — query open issues in the project and confirm nothing already covers this surface. If something does, fold in and say so (Gate test 3).
3. Cite the **node ID and frame width for every Figma value**. A value without both is unusable.
4. Attach *comparable* evidence: the Figma frame and the deployed page **at the same scale**, so they can be flipped between, plus the raw measurement data as JSON.
5. Fields: `issuetype` Bug, a scope label (`Frontend`/`Backend`/`Integration`), and a priority. Story points are optional on a Bug — if you set one, say in the ticket that it is a BA estimate; never drop the field silently.
6. Do not transition or assign unless asked.

**Placement discipline:** a directive belongs in the section whose heading it agrees with. A "change X" instruction inside `Protected values — must NOT change` reads as a contradiction to whoever picks the ticket up, whatever the intent. If a finding moves from out-of-scope to in-scope, **move the bullet into a findings group and add an acceptance criterion for it** — do not just flip the verb where it sits.

### Phase 0: Behavior Activation

1. Run `/behavior claude-opus-5`.
2. Load `local-ai-bridge` (via `skill_view('local-ai-bridge')`) and `jira` skills.
3. If first `/ba` in session, optionally run `/custom-agent Plan` for plan-first mode.

### Phase 1: Setup and Component Isolation (@BA manager agent)

1. **STRICT — Local AI Bridge only.** Do NOT use `figma-extractor`, direct Figma REST API calls (`api.figma.com`), browser plugins, or any other extraction method. The Local AI Bridge at `http://localhost:47291` is the only approved source.
2. **Load the canonical bridge skill first.** Before any Figma node fetch, screenshot download, or asset export, call `skill_view('local-ai-bridge')` and follow **all** instructions in that skill for server startup, health checks, endpoint usage, and sequential SVG fetching. The inline bridge notes below are a summary; the loaded skill is the source of truth.
3. Ask the user **only what you cannot already determine**:
   - "Do you want to use the Figma URL already in context, or paste a new one?" — **skip** if a Figma URL/file is unambiguous from the conversation or the ticket.
   - "Is the Local AI Bridge server running on http://localhost:47291?" — **skip and just check it**: `curl -s http://localhost:47291/` answers this in one call, faster and more reliably than asking. Only escalate to the user if it is down or unsynced.
   Asking a question you can answer yourself costs the user a round-trip; asking when the answer is genuinely ambiguous is correct.
4. Start the Local AI Bridge server if needed per the loaded skill. Summary:
   ```bash
   cd "$LOCAL_AI_BRIDGE_HOME/server"
   ./node_modules/.bin/ts-node server.ts
   ```
   Port 47291 is non-negotiable (3000 is reserved for Next.js, 3001 is the old bridge port and must never be used). If `npx ts-node` is intercepted by a conda plugin, use the direct `node_modules/.bin/ts-node` path.
5. Validate bridge access:
   ```bash
   curl -s http://localhost:47291/ | python3 -m json.tool
   ```
   Do not proceed until it returns `status: "running"`.
6. **If the bridge is not running or not synced, stop.** Ask the user to start the server and run the Figma Desktop plugin sync (Plugins > Development > Local AI Bridge). Do NOT work around a down bridge with `figma-extractor`, direct Figma REST API calls, browser screenshots, or any other bypass. There is no fallback extraction path.
7. **Check for synced data.** Query `/api/document`. If it returns 503 / `No design synced yet`, you MUST ask the user to run the Figma Desktop plugin: **Plugins > Development > Local AI Bridge** on the open file. Do NOT fall back to `figma-extractor` or direct Figma REST API calls to "get the data quickly" — that violates the strict extraction rule and will hit rate limits.
8. Trigger a Figma sync if data is stale: Plugins > Development > Local AI Bridge in Figma Desktop.
9. Isolate a specific, granular component or section. Use the sitemap as the source of truth. Do NOT analyze the entire design at once.
10. Formulate a targeted questionnaire for @designerAgent. **Before drafting it, read `references/figma-design-inventory.md`, `references/kan6-kan50-design-fidelity-case-study.md`, and `references/bc74-quality-failure-case-study.md` — mandatory.** The questionnaire MUST ask about:
   - Layout, spacing, typography, colors, interactive behavior across ALL resolutions
   - **MANDATORY dark/light theme question with exact RGB values** for page background, section backgrounds, card backgrounds, heading/body/muted text, accent colors, ring/border colors
   - **MANDATORY complete Figma Design Inventory:** text content, alignment, navigation controls, card count per breakpoint, card fields in order, card border/style, buttons, label-value pairs
   - **MANDATORY brand/copy guard:** exact logo/icon asset node IDs, exact text copy per layer, and explicit confirmation that no placeholder or template copy remains
   - **MANDATORY interactive-state inventory:** default, hover, focus, active/selected, disabled, loading, mobile-open, mobile-closed for every nav, button, CTA, and icon. No state is optional.
   - **MANDATORY asset-shape guard:** for every logo/icon/illustration, either (a) export SVG via `/api/node/:id/svg` and attach/paste the exact `<path>` data, or (b) paste the verbatim SVG `path` elements exported from Figma. A node ID alone is insufficient.
   - **MANDATORY contrast guard:** list the exact foreground RGB and background RGB for every text element on dark or tinted backgrounds; state the WCAG AA ratio in the ticket.
   - All states: Default, Hover/Focus, Disabled, Loading (skeleton), Empty, Error
   - Animations/transitions
   - Responsive behavior per breakpoint (390px, 1440px, 1920px minimum)
   - Analytics/tracking
   - Accessibility (keyboard, screen reader, focus)
11. **Backend Structure Mandate**: If backend/API integration is involved, ask the user for the backend structure document and do NOT proceed to Phase 3 without it.
12. **Canvas node guard**: If the supplied node is a CANVAS containing whole page frames, do NOT ticket the whole canvas. Ask the user which page and section, or default to the smallest isolated component.

### Phase 2: Designer Analysis (@designerAgent — via /custom-agent visualize)

Dispatch @designerAgent via `delegate_task`:

```
delegate_task(
  goal="Run /behavior claude-sonnet-5, then load /custom-agent visualize. You are @designerAgent. Analyze a specific Figma component using only the Local AI Bridge at http://localhost:47291 and answer a detailed questionnaire.",
  context="""
  BEHAVIOR: /behavior claude-sonnet-5 must be active.

  FIGMA FILE: {FIGMA_URL}
  COMPONENT TO ANALYZE: {component_name}
  LOCAL AI BRIDGE SERVER: http://localhost:47291

  INSTRUCTIONS:
  0. **Load the canonical bridge skill first.** Call `skill_view('local-ai-bridge')` before any Figma fetch. Follow all instructions in that skill for server startup, health checks, endpoint usage, and sequential SVG fetching. If the bridge is not running or not synced, stop and ask the main agent/user to start it. Do NOT use figma-extractor or api.figma.com. There is no fallback extraction path.
  1. Verify the server is reachable per the loaded skill:
     ```bash
     curl -s http://localhost:47291/ | python3 -m json.tool
     ```
  2. Retrieve the full scene tree:
     ```bash
     curl -s http://localhost:47291/api/document > /tmp/local-ai-bridge-tree.json
     ```
     Note `meta.deepMode` in the response. `false` (large page) means per-node `css` is not in the snapshot and must be fetched per node in step 2b — it does NOT mean styling data is unavailable.
  2a. **CHECK PLUGIN LIVENESS BEFORE RELYING ON LIVE ENDPOINTS.** `curl -s http://localhost:47291/`:
     - **`pluginConnected`** — `true` = the plugin polled within the last 6s and live endpoints work. `false` = it has stopped polling; the window is almost certainly closed. `"unknown"` = it has not polled since the server started.
     - `pluginLastPollMsAgo` — how stale that signal is.
     - `nodesWithCss` — `0` means per-node CSS is **not** in the *snapshot* (live fetch may still work — see below).
     - `variableCollections` — `0` means design tokens are **not** in the snapshot.

     ⚠️ **Do NOT infer liveness from queue depth, and do not treat `nodesWithCss: 0` as "the plugin is closed".** An earlier revision of this step told you to read `pluginConnected: "unknown (idle)"` as *closed*. That string was derived from queue depth, so a **healthy idle plugin and a closed one produced the identical value** — following it literally meant declaring CSS, tokens and SVG unavailable and writing a weaker ticket while the plugin was serving requests fine. The field now reports real liveness (2026-08-22, bridge server change); if you are on an older bridge that still returns `"unknown (idle)"`, **probe instead of guessing**:
     ```bash
     curl -s -m 30 http://localhost:47291/api/whoami   # cheap live round-trip; returns file + page if the plugin is alive
     ```
     A successful response proves the plugin is live. A timeout proves it is not. Never decide this from a static field alone.

     **A `false`/timed-out probe is a routine state, not a failure.**

     **Degraded mode (plugin genuinely closed) — permitted and explicitly documented:**
     - `/api/document` and `/api/node/:id/context` are served from the **snapshot** and still return genuine Figma data: geometry, `layout` (mode/itemSpacing/padding/alignment), `sizing`, `fills`, `strokes`, `cornerRadius`, `effects`, and full `text` metrics (family, size, lineHeight, weight, letterSpacing). **These are sufficient for most spec work.**
     - Flattened Inspect-panel CSS and token *names* are **not** available. Report them as **UNAVAILABLE with the reason**; never substitute an estimate, and never read a value off a screenshot.
     - SVG asset export is **impossible** in this state. If the ticket needs asset paths, stop and ask the user to open the Figma plugin window. Do not reconstruct, hand-trace, or approximate shapes.
     - State the degraded mode explicitly in your output so the reader knows which values are missing rather than assumed absent.

  2b. **MANDATORY — pull the real style spec for this component.** Never derive colours, spacing, radii, type or shadows from a screenshot or from `x/y/width/height`; the bridge returns exact values (subject to 2a's plugin-state check):
     ```bash
     # Figma's own Inspect-panel CSS for the node + subtree, paste-ready
     curl -s "http://localhost:47291/api/node/{NODE_ID}/css?format=text" > /tmp/{component-slug}.css
     # Full structured truth: auto-layout, sizing, fills, effects, type metrics, tokens, component identity
     curl -s "http://localhost:47291/api/node/{NODE_ID}/context" > /tmp/{component-slug}-context.json
     # Design tokens as custom properties
     curl -s "http://localhost:47291/api/variables?format=css" > /tmp/design-tokens.css
     ```
     From `context`, read: `layout` (flex direction, `itemSpacing` → gap, `padding`), `sizing` (FIXED/HUG/FILL), `fills`/`strokes`, `cornerRadius`, `effects[].css`, `text` (family/size/weight/lineHeight/letterSpacing), `tokens` and `styles` (token and style names), and `component.mainComponent` + `variantProperties`. Quote **token names** wherever they exist rather than raw hex. Check `inferredTokens` to flag values the designer left un-tokenised.
  3. Identify the node ID for this component at every resolution in the synced tree. Output a table:
     | Resolution | Node ID | Figma Node URL |
     |-----------|---------|----------------|
     | 1920px (Desktop) | ... | https://www.figma.com/design/{FILE_KEY}/...?node-id={NODE_ID_DASH} |
     ...
     Node IDs use dash format in URLs.
  4. Download PNG screenshots for each resolution per the loaded bridge skill (sequential fetches only):
     ```bash
     curl -s "http://localhost:47291/api/node/{NODE_ID}/screenshot" -o "/tmp/{component-slug}-{resolution}.png"
     ```
     Screenshots render at **2x** by default; add `?scale=1` only if a comparison needs 1x pixel dimensions.
  5. Answer every questionnaire item. **Structural and behavioural answers** (card counts per breakpoint, field order, button labels, alignment) come from the tree and screenshots. **Every numeric style answer** (colours, fonts, sizes, weights, line-heights, letter-spacing, padding, gap, radii, borders, shadows) MUST be quoted from step 2b's `css`/`context` output — not read off a screenshot. If a value is not in the bridge data, say so explicitly rather than estimating it.
  6. **Sequential SVG fetching.** When exporting many SVG assets, fetch them one at a time with a small delay (≈0.1s) between requests. The bridge export queue processes one job at a time; parallel requests will timeout. Follow the sequential fetching rule in the loaded `local-ai-bridge` skill.
  7. Return: per-resolution node table, local screenshot file paths, completed design inventory, and all questionnaire answers.
  """
)
```

### Phase 3: Technical BA Ticket Drafting (@technicalSeniorBA — via /custom-agent Plan)

Dispatch @technicalSeniorBA per scope:

```
delegate_task(
  goal="Run /behavior claude-sonnet-5, then load /custom-agent Plan. Write a comprehensive, sprint-ready JIRA ticket.",
  context="""
  BEHAVIOR: /behavior claude-sonnet-5 must be active.

  HIGH-LEVEL STORY:
  Title: {title}
  Scope: {Frontend | Backend | Integration}

  DESIGNER ANALYSIS: {designer agent output}
  SCREENSHOT PATHS: {list of /tmp/*.png files}
  BACKEND GUIDELINES: {backend doc content or 'not applicable'}

  REQUIRED TICKET FORMAT:
  - Title: [Frontend|Backend|Integration] {Page} {Section}
  - Story Points: 1-8 (set via the JIRA API `{{STORY_POINT_FIELD}}`, not only in description body)
  - Native JIRA label matching the scope exactly
  - Description: valid Atlassian Document Format (ADF) JSON only. Every table must be a native ADF `table` node. Never HTML `<table>` tags and never Jira wiki markup `||` / `|` syntax — those render as broken plain text in the modern issue view.
    **Note on the KAN-6 template below:** the `## Story Description Format (KAN-6 Standard)` section is written in wiki markup for human readability. It defines the **required sections, their order, and their content** — it is NOT the wire format. When writing to the API, convert it to ADF (`/rest/api/3/`) or send it as a plain-text body via `/rest/api/2/`. Do not paste the `h2.` / `||header||` syntax into a v3 ADF payload.
  - Description sections (h2. with emoji):
    1. 📬 User Story
    2. 🔆 Scope
    3. 🎨 Figma Design References (per-resolution node URLs from Local AI Bridge; native ADF table)
    4. 🌈 Design Theme (exact RGB, mandatory for Frontend/Integration; native ADF table)
    5. 🖼️ Logos & Icons (mandatory for Frontend/Integration; see Rule 2 below)
    6. 📷 Figma Screenshots (Attached) — must state screenshots are attached for every resolution
    7. ✅ Acceptance Criteria (BDD-style numbered list)
    8. 💻 Technical Notes
    9. 🔌 Local AI Bridge Endpoints (mandatory for Frontend/Integration; see Rule 5 below)
    10. 🚫 Out of Scope
    11. 📊 Story Points
    12. 🔗 Related Tickets (cross-links to sibling Frontend/Backend/Integration tickets)

  MANDATORY STORY POINTS RULE: In every `createJiraIssue` or `editJiraIssue` call, set the API field directly:
  - `[Frontend]` → `"{{STORY_POINT_FIELD}}": 5`
  - `[Backend]` → `"{{STORY_POINT_FIELD}}": 3`
  - `[Integration]` → `"{{STORY_POINT_FIELD}}": 3`
  If `{{STORY_POINT_FIELD}}` is rejected (screen not configured), post a JIRA admin note on the issue and log the failure — never silently drop the value.

  MANDATORY ASSET SECTION RULE (Frontend/Integration only): Before writing any Frontend or Integration ticket, query the Local AI Bridge scene tree (`/api/document`) and confirm section identity by reading heading text, not by assuming container names. Perform a depth-10 recursive scan for icon/logo/image assets. The `🖼️ Logos & Icons` section must contain, in exact order:
  1. A STRICT RULE blockquote: "No external icon libraries, no placeholder SVGs — every asset comes from Figma only."
  2. A confirmed asset table (Rule 4 format) sourced from the live bridge scan.
  3. **For every logo/icon/illustration in the table, the exact SVG path data must be included** either as an attached `.svg` file or as a verbatim code block of the exported `<path>` elements. A node ID alone is not enough.
  4. A note on export method: cached PNG screenshots work without the plugin; SVG exports via `/api/node/:id/svg` require the Figma plugin window to stay open. If the plugin cannot stay open, stop and tell the user the bridge must remain open; do **not** reconstruct, hand-trace, or approximate assets from screenshots.
  5. A copy-paste export script bash block (Rule 8 format). Fetch SVG assets sequentially (one at a time, ≈0.1s delay) as described in the loaded `local-ai-bridge` skill.
  6. Step 1 — discovery script for any assets missed by the BA scan.
  7. Step 2 — PNG and SVG export commands.
  8. Step 3 — next/image usage with SVG preferred.
  9. Rules enforced at code review — bullet list.
  If zero assets are found after a depth-10 scan, replace the table with: "No discrete icon or logo nodes found — this section uses text-only cards. No asset exports required."

  MANDATORY DESIGN THEME / CONTRAST RULE (Frontend/Integration only): The `🌈 Design Theme` section must list exact RGB values for every text/background pairing on dark, tinted, or accent backgrounds. At minimum: nav text, footer text, headings, body, muted/legal, placeholders, active-pill text/bg, hover states, button text/bg. Each row must state whether the pairing meets WCAG AA (4.5:1 for normal text).

  MANDATORY INTERACTIVE STATE RULE (Frontend/Integration only): The questionnaire and the `✅ Acceptance Criteria` must enumerate default, hover, focus, active/selected, disabled, loading, mobile-open, and mobile-closed states for every interactive element (nav links, buttons, hamburger, CTAs, icons). A component without documented interactive states is not ready for implementation.

  MANDATORY PLACEHOLDER / COPY GUARD (all Frontend/Integration): The `✅ Acceptance Criteria` must include a bullet requiring a pre-PR codebase search for banned placeholder strings: "Banking Company", "starter", "template", "Skillbridge", "YourBank" defaults, lorem ipsum, and any string explicitly called out as placeholder in the Figma file. The search must return zero results before the PR is opened.

  MANDATORY RESPONSIVE / OVERFLOW GUARD (Frontend/Integration only): The `✅ Acceptance Criteria` must require that every image, hero, and full-bleed section is verified at 390px, 768px, 1440px, and 1920px for overflow, max-width, and container containment. Spilling outside the viewport at any breakpoint is a FAIL.

  MANDATORY BRIDGE ENDPOINTS TABLE (Frontend/Integration only): Include a `🔌 Local AI Bridge Endpoints` section with this exact table and note:
  | Endpoint | Returns |
  | GET /api/document | Full scene tree — node names, types, x/y/w/h, text |
  | GET /api/screenshots | List of all cached PNGs with download URLs |
  | GET /api/node/:id/screenshot | PNG — cached or on-demand |
  | GET /api/node/:id/svg | SVG vector export — on-demand; plugin must stay open in Figma |
  Note: "The Figma plugin must stay open to serve on-demand SVG exports; otherwise developers will get a 60-second timeout with no explanation."

  STRICT SCREENSHOT RULE: For Frontend and Integration tickets, every Figma Design References table MUST have a corresponding screenshot. If the Local AI Bridge did not generate screenshots, re-run the plugin sync or escalate to the user. Do NOT create a Frontend/Integration ticket without at least one attached PNG screenshot per (resolution × section) pair.
  """
)
```

### Phase 4: Ticket Creation, Attachment, and Validation

1. Create tickets via Jira MCP. Set labels including the exact native scope label (`Frontend`, `Backend`, or `Integration`).
2. **Attach required artifacts:**
   - **Frontend**: PNG screenshots for every resolution × section (STRICT — no exceptions), Local AI Bridge tree JSON (recommended)
   - **Integration**: PNG screenshots for every resolution × section (STRICT — no exceptions), `backend-structure-source.txt` (if backend involved), Local AI Bridge tree JSON (recommended)
   - **Backend**: `backend-structure-source.txt` only
   - **Tooling/Infrastructure exception**: Developer tooling tickets (e.g., Local AI Bridge itself) do NOT require Figma screenshots or design specs. Attach the provided plan/spec document (e.g., `plan.txt`) instead.
3. **STRICT Screenshot Requirement**: A Frontend or Integration ticket without attached PNG screenshots is incomplete. If the Local AI Bridge did not generate screenshots, re-run the plugin sync or escalate to the user. Do not skip the attachment.
4. Run the validator:
   ```bash
   python3 $HOME/.claude/skills/ba/scripts/validate-ba-ticket.py {KEY}
   ```
   Fix any FAIL before proceeding.
5. Log the outcome:
   ```bash
   python3 $HOME/.claude/skills/ba/scripts/log-ba-outcome.py log {KEY} PASS --scope {SCOPE} --story-points {N}
   ```
6. Cross-link sibling tickets for the same component.
7. Transition to appropriate status and update assignees per memory rules.

## Scope-Split Ticket Strategy

Every component becomes up to 3 tickets:

1. **[Frontend]** — UI components, mock data, no API calls (≤8 pts; `{{STORY_POINT_FIELD}}: 5`)
2. **[Backend]** — API endpoints, DB queries, validation (≤8 pts; `{{STORY_POINT_FIELD}}: 3`)
3. **[Integration]** — Wiring frontend to backend (≤8 pts; `{{STORY_POINT_FIELD}}: 3`)

## Artifact Matrix

| Artifact | Frontend | Backend | Integration | Tooling/Infrastructure |
|----------|----------|---------|-------------|------------------------|
| PNG screenshots per resolution × section | YES | NO | YES | NO |
| Local AI Bridge tree JSON | recommended | NO | recommended | NO |
| backend-structure-source.txt | NO | YES | YES | NO |
| plan/spec document | optional | optional | optional | YES |
| Logos & Icons section with asset table + export script | YES | NO | YES | NO |
| Local AI Bridge endpoints table | YES | NO | YES | NO |
| Story points via `{{STORY_POINT_FIELD}}` API field | 5 | 3 | 3 | N/A |

## Story Description Format (KAN-6 Standard)

> **Format vs. wire format.** The block below is written in Jira **wiki markup for human readability only**. It is the authoritative source for *which sections appear, in what order, and what they must contain*. It is **not** the payload format. Convert to ADF for `/rest/api/3/`, or send plain text via `/rest/api/2/`. Pasting `h2.` / `||header||` into a v3 ADF description renders as broken plain text — the failure Phase 3 warns about.

```
h2. 📬 User Story

*   {role}
*   {action}
*   {benefit}

h2. 🔆 Scope

— {scope-specific text}

h2. 🎨 Figma Design References — {Section}

||Resolution||Figma Node URL||
|1920px (Desktop)|[https://www.figma.com/design/{FILE_KEY}?node-id={NODE_ID_DASH}|Figma — {Section} 1920px]|
...

h2. 🌈 Design Theme

||Property||Value||
|Page background|{dark|light}, rgb({R},{G},{B})|
...

h2. 🖼️ Logos & Icons

> STRICT RULE: No external icon libraries, no placeholder SVGs — every asset comes from Figma only.

Confirmed assets (sourced from Local AI Bridge `/api/document` depth-10 scan):

||Asset||Node ID||Size||Format||Output path||
|Logo|5:27273|155×40|SVG|public/assets/logos/logo.svg|
|Icon (feature 1)|41:93|34×34|SVG|public/assets/icons/icon_feature_1.svg|
|Hero Image|58:1544|968×716|PNG|public/assets/images/hero_image.png|
|Abstract Design|62:1671|505×480|SVG|public/assets/illustrations/abstract_design.svg|

*If zero assets are found after a depth-10 scan, replace the table with: "No discrete icon or logo nodes found — this section uses text-only cards. No asset exports required."*

Export script (run verbatim after plugin is open in Figma):

```bash
mkdir -p public/assets/logos public/assets/icons public/assets/illustrations public/assets/images

curl "http://localhost:47291/api/node/5:27273/svg"       --output public/assets/logos/logo.svg
curl "http://localhost:47291/api/node/41:93/svg"         --output public/assets/icons/icon_feature_1.svg
curl "http://localhost:47291/api/node/62:1671/svg"       --output public/assets/illustrations/abstract_design.svg
curl "http://localhost:47291/api/node/58:1544/screenshot" --output public/assets/images/hero_image.png
```

**Faster alternative for a whole section** — one job instead of N, so it sidesteps the sequential-fetch rule entirely. Returns a manifest of written files, and keeps raster content raster automatically:

```bash
curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"dir":"public/assets/icons","format":"SVG","scale":2}' \
  "http://localhost:47291/api/node/{SECTION_NODE_ID}/assets" | python3 -m json.tool
```

Still list every asset explicitly in the ticket table — the bulk export is a convenience, not a substitute for the confirmed asset inventory.

Step 1 — discovery (run if BA scan missed assets).

Note the tree shape: `/api/document` returns `{syncedAt, meta, tree}` — walk `d['tree']`, not `d`. Bounds are on `absolute` (`{x,y,width,height}`) with plain `width`/`height` always present; the old `absoluteBoundingBox` key no longer exists. The bridge also sets `isAsset` on nodes Figma itself considers exportable assets, which beats keyword matching.

```bash
python3 -c "
import json, re
d = json.load(open('/tmp/local-ai-bridge-tree.json'))
tree = d.get('tree', d)
keywords = re.compile(r'logo|icon|arrow|check|star|badge|graphic|illustration|avatar|abstract|image|background image', re.I)
exclude = re.compile(r'container', re.I)
def size(n):
    b = n.get('absolute') or {}
    return b.get('width', n.get('width', 0)), b.get('height', n.get('height', 0))
def walk(n, depth=0):
    if depth > 10: return
    name = n.get('name','')
    t = n.get('type','')
    if t in ('TEXT','ELLIPSE','LINE'): return
    w, h = size(n)
    is_asset = bool(n.get('isAsset'))
    if t in ('FRAME','COMPONENT','INSTANCE','GROUP') and keywords.search(name) and not exclude.search(name): is_asset = True
    if t in ('VECTOR','BOOLEAN_OPERATION') and keywords.search(name): is_asset = True
    if t == 'RECTANGLE' and keywords.search(name) and w > 100: is_asset = True
    # An image fill means raster content — export as PNG, not SVG.
    fills = n.get('fills') or []
    has_image = isinstance(fills, list) and any(f.get('type') == 'IMAGE' for f in fills)
    if has_image: is_asset = True
    if is_asset:
        print(f\"{name}\t{n.get('id')}\t{int(w)}x{int(h)}\t{t}\t{'PNG' if has_image else 'SVG'}\")
    for c in n.get('children',[]): walk(c, depth+1)
walk(tree)
"
```

Step 2 — export any newly found assets:
- SVG assets: `curl "http://localhost:47291/api/node/{NODE_ID}/svg" --output {output_path}`
- PNG assets: `curl "http://localhost:47291/api/node/{NODE_ID}/screenshot" --output {output_path}`

Step 3 — usage:
- Prefer SVG for logos/icons/illustrations via `next/image` with `dangerouslyAllowSVG: true` in `next.config.js` and an `unoptimized` prop where appropriate.
- Use PNG only for raster image fills (hero/photo backgrounds).

Rules enforced at code review:
* No `lucide-react`, `react-icons`, or any third-party icon library unless explicitly approved.
* No inline placeholder SVGs in JSX.
* Every exported asset path matches the confirmed asset table exactly.
* SVGs are imported from `public/assets/...` and referenced through `next/image` or direct URL.
* **For logo/icon/illustration SVGs, the rendered `path` elements must byte-for-byte match the SVG path data attached/pasted in the ticket. Any shape difference is a reject.**
* **No placeholder strings ("Banking Company", "starter", "template", "Skillbridge", "YourBank" defaults, lorem ipsum) may remain in the component before approval.**

h2. 📷 Figma Screenshots (Attached)

Screenshots for all resolutions are attached to this ticket as PNG files.

h2. ✅ Acceptance Criteria

# {numbered items}
#* {sub-items}

h2. 💻 Technical Notes

* {tech stack bullets}

h2. 🔌 Local AI Bridge Endpoints

||Endpoint||Returns||
|GET /api/document|Full scene tree — node names, types, x/y/w/h, text|
|GET /api/screenshots|List of all cached PNGs with download URLs|
|GET /api/node/:id/screenshot|PNG — cached or on-demand|
|GET /api/node/:id/svg|SVG vector export — on-demand; plugin must stay open in Figma|

Note: The Figma plugin must stay open to serve on-demand SVG exports; otherwise developers will get a 60-second timeout with no explanation.

h2. 🚫 Out of Scope

* {explicitly excluded items}

h2. 📊 Story Points

{N} (also set on the issue object as `{{STORY_POINT_FIELD}}`)

h2. 🔗 Related Tickets

* {links to sibling Frontend/Backend/Integration tickets}
```

## /ba-reply: Developer Unblock Flow

When a developer comments on a ticket asking for clarification, missing screenshots, or missing specs:

1. Run `/behavior claude-opus-5`.
2. Load ticket via Jira MCP.
3. Identify missing artifact.
4. Re-run Local AI Bridge sync if needed.
5. Add missing artifact or update description.
6. Re-run `validate-ba-ticket.py`.
7. Log the outcome.

### /ba-reply: Screenshot fallback when Local AI Bridge has no PNGs

If the bridge `/api/screenshots` returns `count: 0` or the developer needs fresh screenshots, the only action is to ask the user to re-run the Figma Desktop plugin sync. There is no browser-based, `figma-extractor`, or direct `api.figma.com` fallback. If the user explicitly asks for a non-bridge capture, refuse and explain that the Local AI Bridge is the approved extraction source.

## Pitfalls

- **Using figma-extractor or api.figma.com**: NEVER. Only Local AI Bridge.
- **Wrong bridge port**: Port must be 47291. 3000 is reserved for Next.js. 3001 is the old port and must not appear in any command, instruction, or ticket.
- **Story points only in description**: Always set `{{STORY_POINT_FIELD}}` on the issue object. If the field is rejected, post a JIRA admin note and log it — never silently drop it.
- **Missing Logos & Icons section on Frontend/Integration**: Mandatory. Always query the bridge scene tree first; confirm section identity by reading heading text, not by assuming container names.
- **Main agent doing sub-agent work**: The leading cause of under-specified tickets. If a task is assigned to @designerAgent or @technicalSeniorBA, the main agent must dispatch it via `delegate_task` and must not perform the work itself, even if the sub-agent is slow or the main agent "knows the answer".
- **Asset table missing mandatory columns**: Every row must be Asset, Node ID, Size, Format, Output path.
- **Missing export script**: Frontend/Integration tickets must include the verbatim bash block with `mkdir -p`, one `curl` per asset, `/svg` for SVGs, `/screenshot` for PNGs, and exact output paths.
- **Missing bridge endpoints table**: Frontend/Integration tickets must document all four endpoints including the SVG endpoint and the mandatory timeout note.
- **Icon scan too shallow**: Icons are nested up to 9 levels deep; scan to depth 10 and skip only TEXT, ELLIPSE, and LINE.
- **A cached older skill revision is loaded**: Hermes may serve a stale copy. Verify the frontmatter `version:` matches the version in `MANIFEST.md`, and that the description mentions port `47291` and hard delegation; if not, re-patch the skill file on disk.
- **Missing screenshots on Frontend/Integration**: Not allowed. Re-run plugin sync until screenshots exist.
- **Wrong node IDs**: Verify in `/api/document` first.
- **Canvas node**: Ticket one component, not a whole canvas.
- **Backend doc missing**: Hard gate — never fabricate API contracts.
- **Combined tickets**: Always split by scope.
- **Ticketing a width the design never specifies**: The design's frame inventory bounds what can be a defect. Measure elsewhere, report it as data, do not raise it. See the Ticket-Worthiness Gate.
- **Auto-filing every measured difference**: This has no termination condition and it burned 34 tickets on `{{PROJECT_NAME}}`. Report findings; the human decides what becomes a ticket. When the user bounds the effort, that bound is binding.
- **A value without its node ID and frame width**: Unusable by the developer and the direct cause of a ticket that graded 1920 against the laptop frame. Every value in a bug or a spec table cites both.
- **Omitting what must not change**: A fix brief that states only the target value invites a regression at the neighbouring breakpoint. Always list the protected values by class string.
- **Story points > 8**: Split further.
- **Jira labels**: Must include exact native scope label.
- **Placeholder copy shipping**: Every ticket must explicitly call out that placeholder text ("Banking Company", "starter", "template", "YourBank", "Skillbridge", lorem ipsum, etc.) must be replaced with production copy before Done. Add an AC and a code-review checklist item.
- **Wrong brand assets / logo shape mismatch**: When the design specifies a logo/icon shape, the ticket asset table must name the exact Figma node, include the exported SVG path data verbatim, and forbid substitutions. The export script must use that node ID verbatim. A PR containing a different shape (e.g., diamond instead of pinwheel) must be rejected.
- **Invisible text on dark backgrounds / low contrast**: Frontend/Integration tickets must list exact text-color tokens per element (nav, footer, headings, body, muted, legal, placeholders). Every dark-background pairing must state its WCAG AA contrast ratio. Contrast is not optional.
- **Missing interactive states / bare icon instead of branded pill**: Active/hover/focus/mobile-open/mobile-closed states are mandatory in the design inventory and ACs. A hamburger that is a plain icon without the spec'd pill background is a failure.
- **Wrong social/brand icons**: Asset tables for social icons must include exact node IDs and exported SVG paths. Using a library X logo when the design specifies the Twitter bird is a brand violation.
- **Hero/image overflow at 768px or any breakpoint**: The ACs must require `overflow-hidden`, `max-w-full`, and explicit breakpoint verification at 390/768/1440/1920px. Overflow outside the container is a real defect, not a non-blocking observation.
- **On-demand SVG export requires the Figma plugin to stay open**: `GET /api/node/:id/svg` times out after 60 seconds if the Figma Desktop plugin window is closed. Before creating a Frontend/Integration ticket, verify the plugin is open. If it is closed, ask the user to open it. Do **not** reconstruct shapes from screenshots or prior assets.
- **Local AI Bridge server running but /api/document is empty**: Ask the user to run the Figma Desktop plugin sync. Do NOT bypass with direct Figma REST API calls — the bridge exists precisely to avoid 429 rate limits and API-key consent-guard issues.
- **conda intercepting npx**: If `npx ts-node` crashes with a conda plugin error, use `./node_modules/.bin/ts-node server.ts` directly.

## Icon/Logo Asset Scan Reference

When querying the bridge for assets, run a depth-10 scan that:

1. Fetches `/api/document` (walk `d['tree']`; bounds are on `absolute`, and `isAsset` marks Figma-recognised assets):
   ```bash
   curl -s http://localhost:47291/api/document > /tmp/figma_tree.json
   ```
2. Confirms section identity by reading the first heading text inside each container, not by assuming container names.
3. Recurses through `FRAME`, `COMPONENT`, `INSTANCE`, `GROUP`, `VECTOR`, `BOOLEAN_OPERATION`, and `RECTANGLE`.
4. Skips `TEXT`, `ELLIPSE`, and `LINE` nodes.
5. Detects assets by:
   - Named icon/logo nodes: `FRAME`/`COMPONENT`/`INSTANCE`/`GROUP` with keywords `logo`, `icon`, `arrow`, `check`, `star`, `badge`, `graphic`, `illustration`, `avatar`, `abstract` in the name (exclude nodes named `container`).
   - Vector illustrations: `VECTOR`/`BOOLEAN_OPERATION` with `abstract` or `illustration` in the name (no size limit).
   - Image placeholders: `RECTANGLE` named `image` or `background image` with width > 100px.
6. Maps formats/paths:
   - logo → SVG → `public/assets/logos/`
   - icon → SVG → `public/assets/icons/`
   - illustration / abstract design → SVG → `public/assets/illustrations/`
   - image (any node with an `IMAGE` fill) → PNG via `/screenshot` → `public/assets/images/`
7. For a whole section, prefer one `POST /api/node/{SECTION_ID}/assets {dir,format,scale}` call over N per-node fetches.

## Validation and Audit

> **Scope: these are Mode A gates.** Every rule in this section applies to **newly authored** `[Frontend]`/`[Backend]`/`[Integration]` tickets. In **Mode B (Bug Enrichment)** and **Mode C (New Bug Authoring)** they do **not** apply — a Bug will legitimately lack a User Story, Story Points, Design Theme and screenshots, and failing it on those grounds is a false negative. In Mode B, run the validator only on request and label any such failures as Mode A artifacts.

- `validate-ba-ticket.py` is a hard gate before ticket creation is considered complete.
- `log-ba-outcome.py` records every ticket outcome.
- A Frontend or Integration ticket without attached screenshots is never considered complete.
- A Frontend or Integration ticket without a `🖼️ Logos & Icons` section, confirmed asset table, **exported SVG path data for every vector asset**, export script, and bridge endpoints table is never considered complete.
- A Frontend or Integration ticket without a `🌈 Design Theme` section that lists exact RGB values and WCAG AA contrast status for every dark/tinted/accent text pairing is never considered complete.
- A Frontend or Integration ticket without interactive states (default, hover, focus, active, disabled, loading, mobile-open, mobile-closed) documented for every interactive element is never considered complete.
- A ticket of any scope without `{{STORY_POINT_FIELD}}` set via the API is never considered complete.

## Reference files

Every file in `references/` is listed here. Generated by
`scripts/refindex.py` — descriptions you write by hand are preserved.

- `references/bc74-quality-failure-case-study.md` — BC-74 Quality Failure Case Study.
- `references/figma-chrome-profile-screenshot-fallback.md` — Chrome Profile Screenshot Fallback for Figma (/ba-reply).
- `references/figma-design-inventory.md` — Figma Design Inventory Extraction.
- `references/kan6-kan50-design-fidelity-case-study.md` — KAN-6 → KAN-50 Design Fidelity Case Study.
- `references/kan6-kan50-followup-fixes.md` — the KAN-6 / KAN-50 follow-up design-fidelity fixes, and what the original tickets under-specified.
- `references/scope-split-ticket-pattern.md` — how to split one Figma component into `[Frontend]` / `[Backend]` / `[Integration]` tickets without overlapping scope.
- `references/story-description-template.md` — **the native ADF story-description structure** with a worked table example. Use with `templates/adf/description.adf.json`; this reference explains the sections, the template supplies the JSON.

## Remember

```
Mode A multi-component feature: an Accepted ADR from /architect is a PRECONDITION — copy its Frozen contracts VERBATIM
ACs cite TOKEN NAMES and NAMED BREAKPOINTS (laptop:/desktop:), never raw hex or default lg:/xl:
PICK THE MODE FIRST — A (new tickets from a design) / B (enrich an existing ticket) / C (one new Bug from measured deviations on a shipped build)
Mode B: never split scope, never retitle, never set story points, never reword an issue — APPEND ONLY
Mode B and C: the STRICT screenshot rule and validate-ba-ticket.py are Mode A gates only
Mode C: ONE Bug, never a scope split; group findings by kind; Protected-values section is MANDATORY; record cleared suspicions
Mode C: a directive must sit in a section whose heading agrees with it — never "change X" under "must NOT change"
NEVER infer plugin liveness from queue depth or nodesWithCss — read pluginConnected (true/false), or probe /api/whoami
Plugin genuinely closed = degraded mode: snapshot geometry+layout+text OK, CSS/tokens/SVG UNAVAILABLE (say so, never estimate)
The KAN-6 wiki-markup template defines SECTIONS, not the wire format — convert to ADF (v3) or plain text (v2)
Check the bridge yourself instead of asking the user whether it is running
Sitemap is source of truth
Isolate one component at a time
Mode A: ALWAYS split into [Frontend], [Backend], [Integration]
Max 8 story points per ticket
Story points via API field {{STORY_POINT_FIELD}}: Frontend=5, Backend=3, Integration=3
Title: [Scope] {Page} {Section}
Local AI Bridge only — never figma-extractor, never api.figma.com
Local AI Bridge port is 47291 — never 3001 or 3000
Style values come from /api/node/:id/css and /context — NEVER from a screenshot or x/y/w/h
Quote design token names (/api/variables) instead of raw hex wherever a token exists
Frontend/Integration tickets MUST include Logos & Icons section + asset table + SVG path data + export script + bridge endpoints table
Design Theme must list exact RGB values and WCAG AA contrast for every dark/tinted text pairing
Interactive states must cover default/hover/focus/active/disabled/loading/mobile-open/mobile-closed
Screenshots STRICT for Frontend and Integration tickets
backend-structure-source.txt for Backend and Integration
Native JIRA Labels: Frontend, Backend, Integration
Ask for all states
KAN-6 emoji-header format
Confirm section identity by reading heading text, not container names
Depth-10 icon/logo scan before writing Frontend/Integration ticket
Banned placeholder strings must be zero before PR is opened
HARD DELEGATION: main agent never performs @designerAgent or @technicalSeniorBA work
```
