---
name: architect
description: "Technical Architect (/architect): runs BEFORE /ba on any epic or multi-ticket feature. Produces an Architecture Decision Record (ADR) and frozen API/data contracts so downstream Frontend/Backend/Integration tickets cannot diverge. Uses /custom-agent Explore for codebase survey and /custom-agent Plan for option analysis. Enforces hard delegation: main agent must not write implementation code. Output is a JIRA epic-level document, never a code change."
version: 1.0.0
author: Arghajit Singha
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [architecture, adr, contracts, epic, design, planning, jira, workflow]
    related_skills: [business-analyst-workflow, developer-agent-ecosystem, design-system, pr-review-and-merge, jira, behavior, custom-agent, claude-opus-5, Explore, Plan]
---

# Technical Architect (/architect)

> **Setup values.** This skill contains no account ids, site hosts, project keys, or
> deployed URLs — they appear as `{{PLACEHOLDER}}`. Resolve them from
> `project-config.local.md` in the skills directory. If that file is missing, or the
> value you need is absent or still `{{...}}`, **stop and ask the user for it** (batch
> the asks if you need several), then offer to save it so you never ask again. Never
> guess one, never carry one over from another project, and never invent a
> plausible-looking account id — a wrong id silently misassigns tickets and a wrong URL
> silently grades the wrong site. Full table and asking rules: `PROJECT-CONFIG.md`.


**Behavior/agent wiring:** Main agent runs `/behavior claude-opus-5`. Codebase survey via `/custom-agent Explore`; option analysis via `/custom-agent Plan`; parallel option branches coordinate via `/custom-agent teammate`.

**Trigger Commands:** `/architect <JIRA_EPIC_OR_TICKET_ID>`, or `/architect "<free-text feature description>"`

**Position in the lifecycle:** `/architect` → `/ba` → `/developer` → `/pr-review-and-merge` → `/release` → `/quality-analyst` → `/sre-watch`

## Why this skill exists

`/ba` splits work by **component** — `[Frontend]`, `[Backend]`, `[Integration]`. That
split is correct for parallelising delivery, but nothing above it owns **coherence**:
the schema shape, the state boundary, the API contract, the error model. Without an
architect pass those get decided implicitly by whichever ticket happens to be picked
up first, and the Integration ticket pays for it.

This skill exists to make those decisions **once, in writing, before tickets are
authored** — so the BA has a contract to write ACs against and the developer
sub-agents have a shape they cannot each reinvent.

## When to use

- **Mandatory** before `/ba` Mode A on any feature spanning more than one component
  (i.e. anything that will produce a `[Backend]` *and* an `[Integration]` ticket).
- Any change to a shared data model, an existing API response shape, an auth path,
  or a cross-page state container.
- A new third-party dependency, service, or persistence layer.
- The user asks "how should we build X" rather than "build X".

## When NOT to use

- `/ba` Mode B (enriching an existing ticket) and Mode C (a single Bug from measured
  Figma deviation). Those are append-only and carry no architectural surface.
- A single `[Frontend]` ticket that consumes an already-frozen contract.
- A copy/colour/spacing fix. Do not manufacture an ADR for a one-line diff.

## Hard rules

1. **This skill writes documents, never code.** No file in `src/` is touched by
   `/architect`. If an implementation is needed to prove an option is viable, build
   it in a throwaway branch, record the finding in the ADR, and delete the branch.
2. **No new JIRA tickets.** `/architect` produces an ADR and contracts attached to
   the epic. Ticket authoring belongs to `/ba`. This respects the standing rule that
   a measurement is not a defect and nothing auto-files.
3. **Exactly one recommendation.** Options are enumerated to show the work, but the
   ADR ends with one decision and its consequences. A menu handed to the BA is a
   failure of this skill.
4. **Contracts are frozen artifacts.** Once the ADR is Accepted, the contract block
   is copy-pasted verbatim into every child ticket by `/ba`. A developer who needs to
   change it must come back through `/architect`, not edit it in a PR.

## Workflow

### 1. Load context

```bash
# JIRA epic / parent
# mcp: getJiraIssue(issueIdOrKey=<KEY>)
```

Survey the existing code before proposing anything. Dispatch `/custom-agent Explore`:

> Survey how `<domain>` is currently modelled in this repo. Report: the Prisma/SQL
> schema entities involved, every API route that reads or writes them, the client-side
> state owner (SWR hook / context / props), and the existing error-handling idiom.
> Excerpts only — do not propose changes.

If the feature has a design, pull the Figma facts through the **Local AI Bridge on
`http://localhost:47291`** (port 47291 is mandatory) rather than eyeballing a
screenshot — an architect decision that contradicts the design's actual data shape is
worse than no ADR.

### 2. Enumerate options

Dispatch `/custom-agent Plan` per candidate option, in parallel via
`/custom-agent teammate` when there are three or more. Each option must state:

- The data shape (schema diff, if any).
- The API surface (routes, methods, request/response types).
- The state boundary (server component vs client component vs SWR hook).
- What it costs: migration risk, test surface, bundle impact, rollback difficulty.

### 3. Decide and write the ADR

Write to `docs/adr/NNNN-<slug>.md` in the target repo, and attach the same content
as a JIRA comment on the epic.

```markdown
# ADR NNNN: <Title>

- **Status:** Proposed | Accepted | Superseded by ADR-NNNN
- **Date:** <YYYY-MM-DD>
- **Epic:** <JIRA-KEY>
- **Deciders:** <user>

## Context
<The forces. What in the current codebase makes this a decision rather than a default.>

## Options considered
### A. <name>
Cost / benefit / rollback story.
### B. <name>
...

## Decision
<One option. Stated as an imperative: "We will ...">

## Consequences
- Positive: ...
- Negative: ...
- Follow-up required: ...

## Frozen contracts
<See §4 — the block /ba must copy verbatim.>
```

### 4. Freeze the contracts

The contract block is the load-bearing output. It must be precise enough that the
Frontend and Backend tickets can be built by different agents on different days and
still meet in the middle.

````markdown
## Frozen contracts

### Data model
```prisma
model Foo {
  id        String   @id @default(cuid())
  ...
}
```

### API
| Method | Route | Request | Response (200) | Errors |
|---|---|---|---|---|
| GET | `/api/foo` | — | `Foo[]` | 500 `{error:string}` |
| POST | `/api/foo` | `CreateFooInput` | `Foo` | 400 validation, 500 |

### Types (single source of truth — declare in `src/types/foo.ts`)
```ts
export interface Foo { id: string; /* ... */ }
export interface CreateFooInput { /* ... */ }
```

### State ownership
- Server-rendered: <which route segments>
- Client SWR hook: `useFoo()` in `src/hooks/useFoo.ts`
- Hydration guard required: yes/no (see developer-agent-ecosystem
  `references/swr-hydration-mismatch-fix.md`)

### Error model
<The single shape every route returns on failure, and what the UI renders for it.>

### Out of scope for this epic
<Explicit non-goals, so /ba does not invent tickets for them.>
````

### 5. Hand off

Post the ADR as a JIRA comment on the epic, set the ADR status to **Accepted** only
after the user confirms, then auto-invoke the next hop without asking:

```
Skill(skill="ba", args="<EPIC_KEY>")
```

Per the standing workflow-handoff rule, do not pause to ask whether to continue to
`/ba` — invoke it. Do pause if the user has not yet accepted the ADR.

## Interaction with other skills

- **`/ba`** — reads the Frozen contracts block and copies it verbatim into each child
  ticket's "API data contract" section. `/ba` must not re-derive contracts when an
  Accepted ADR exists on the epic.
- **`/developer`** — sub-agents treat the contract as read-only input. A sub-agent that
  finds the contract unimplementable must halt and trigger `/ba-reply`, which escalates
  to `/architect`, not patch around it.
- **`/pr-review-and-merge`** — a PR that changes a type or route named in a Frozen
  contract without a superseding ADR is a **blocking** review finding.
- **`/design-system`** — token and breakpoint decisions live there, not here. An ADR
  references the token names; it does not define hex values.

## Pitfalls

- **Writing an ADR for a decision that was never in question.** If both options are
  the same effort and one is obviously idiomatic for the repo, just pick it and note
  it in the ticket. ADRs are for decisions with real consequences.
- **Contracts that describe the happy path only.** The error model is the half that
  Integration tickets actually fight over. Always specify it.
- **Leaving the ADR in `Proposed` forever.** An unaccepted ADR does not bind anyone.
  Chase the acceptance or delete the file.
- **Deriving the data shape from a screenshot.** Use the Local AI Bridge node context
  (`/api/node/:id/context`) for real field names and content, per the standing rule
  that Figma facts come from the bridge, not from pixels.
