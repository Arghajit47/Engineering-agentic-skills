# JIRA content format — ADF only. No exceptions.

**Every** JIRA description, comment, reply, and subtask body written by **any** skill in
this pipeline is Atlassian Document Format (ADF) v3 JSON. There is no skill, no mode, no
"quick comment" exempt from this.

## The rule

| Endpoint | Body format |
|---|---|
| `/rest/api/3/…` and Rovo MCP (`addCommentToJiraIssue`, `createJiraIssue`, `editJiraIssue`) | **ADF v3 JSON** |
| `/rest/api/2/…` (legacy fallback only) | plain text — **never** wiki markup |

**Never send, in any field, on any endpoint:**

- Jira wiki markup — `h2.`, `||header||`, `|cell|`, `{code}`, `{panel}`, `*bold*`
- HTML — `<table>`, `<b>`, `<br>`
- Raw Markdown — `## heading`, `| a | b |`, `` `code` ``, `**bold**`

All three render as broken literal text in the modern issue view. A table pasted as
Markdown pipes is the single most common instance and looks like a formatting bug to
whoever reads the ticket.

**Templates in the skills are written in Markdown for human readability.** They define
*which sections appear, in what order, and what they must contain*. They are **not** the
wire format. Convert before sending — never paste a template body into a v3 payload.

## Start from your skill's template

Do not compose ADF from scratch. Every JIRA-posting skill owns ready-made, valid ADF
templates:

```
<skill>/templates/adf/description.adf.json
<skill>/templates/adf/comment.adf.json
<skill>/templates/adf/reply.adf.json
<skill>/templates/adf/<artifact>.adf.json
```

Load, substitute the `{{PLACEHOLDER}}` tokens, drop sections the ticket does not need,
validate, post. Never leave a placeholder in a posted body.

They are **generated**, not hand-written: sources are
`templates/adf/_src/<skill>/<artifact>.adf.md` and `templates/adf/build.sh` rebuilds and
validates all of them. Edit the source, rebuild — never the JSON, or the two drift.

## Build it, do not hand-write it

```bash
# Markdown subset -> ADF v3 JSON
python3 ~/.claude/skills/scripts/adf.py --in comment.md --out comment.adf.json

# Reject anything that is not valid ADF, or that smells of wiki/HTML/Markdown
python3 ~/.claude/skills/scripts/adf.py --validate comment.adf.json
```

Supported Markdown subset: headings, paragraphs, bullet and ordered lists, **tables**,
fenced code blocks, blockquotes, horizontal rules, and inline `code`, **bold**, *italic*,
links. That covers every template in this pipeline.

Then post the JSON as the body:

```python
# Rovo MCP
addCommentToJiraIssue(issueIdOrKey=KEY, commentBody=<the ADF object>)

# REST v3
{"body": <the ADF object>}                       # comment
{"fields": {"description": <the ADF object>}}    # description
```

## Minimum viable ADF

```json
{
  "type": "doc",
  "version": 1,
  "content": [
    { "type": "heading", "attrs": {"level": 2},
      "content": [{"type": "text", "text": "Security Review — PR #42"}] },
    { "type": "paragraph",
      "content": [
        {"type": "text", "text": "Verdict: "},
        {"type": "text", "text": "PASS", "marks": [{"type": "strong"}]}
      ] }
  ]
}
```

Rules that trip people up:

- Top level is always `{"type":"doc","version":1,"content":[…]}` — `version` is required.
- A `text` node must be non-empty. An empty string is invalid ADF and the API rejects the
  whole request.
- Marks go on the text node (`strong`, `em`, `code`, `link`, `strike`), never as syntax
  inside the string.
- Tables are `table` → `tableRow` → `tableHeader`/`tableCell` → `paragraph` → `text`.
  A cell cannot contain bare text; it needs a block child.
- `codeBlock` takes `attrs.language` and one plain `text` child with no marks.
- Status colours: `panel` with `attrs.panelType` of `info`, `note`, `success`, `warning`,
  or `error`. Use `error` for a BLOCK verdict and `success` for a PASS — the colour is
  the first thing a human sees.

## Verdict panels — required

Any skill posting a verdict opens with a panel, so the outcome is visible without
reading:

| Verdict | `panelType` |
|---|---|
| PASS / SOAK PASS / APPROVED | `success` |
| PASS WITH NOTES | `info` |
| FAIL / BLOCK / INCIDENT | `error` |
| Advisory, no action required | `note` |

## Required structure by artifact

Every one of these starts with an H2 naming the artifact and the ticket, then the
verdict panel where a verdict exists.

| Skill | Artifact | Must contain |
|---|---|---|
| `architect` | ADR comment on the epic | Context · Options · Decision · Consequences · **Frozen contracts** (code blocks + table) |
| `ba` | Ticket description | the KAN-6 section set, tables as ADF `table`, screenshots as attachments |
| `developer-agent-ecosystem` | Execution plan / status comment | heading naming who instructs whom · plan · verification table |
| `test-strategy` | RED evidence comment | contract table · command · failed/passed counts |
| `security-review` | Verdict comment | panel · scans table · blocking findings · non-blocking notes |
| `pr-review-and-merge` | Review verdict | panel · AC-by-AC table · verification table |
| `release-engineer` | Deploy verification | panel · gate table with commands and results · rollback paragraph |
| `quality-analyst` | QA results | panel · TC results table · evidence table · defects |
| `perf-budget` | Budget sub-gate | panel · metric/budget/baseline/measured/Δ table |
| `sre-watch` | Soak or incident | panel · route/width/status table, or timeline · impact · cause · what-would-have-caught-it |
| `tech-writer` | Doc update note | changed docs list · PR link |
| `eng-manager` | Board or flow report | tables only; never a ticket |

## Never

- **No agent-attribution disclaimer.** No "generated by", no tool footer. Standing rule.
- **No secrets.** Tokens, account ids, and full filesystem paths never go in a comment.
- **No empty text nodes**, no `null` in `content`, no trailing empty paragraph.
- **No unvalidated post.** Run `--validate` before sending. A malformed body fails the
  whole API call, and a half-posted comment is worse than none.

## When ADF is genuinely unavailable

If only `/rest/api/2/` works (v3 outage, or a tool that will not take an object), send
**plain text** — no markup of any kind — and say in the comment that it is a plain-text
fallback. Never substitute wiki markup for ADF. Then note it in the ticket so the comment
can be reformatted later.
