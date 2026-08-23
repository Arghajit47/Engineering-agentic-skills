# Figma Screenshot Render Fallback (Developer Hard Gate)

When the BA workflow's `figma-spec-{RESOLUTION}-{section-slug}.json` files are missing from a Frontend ticket, the developer-agent-ecosystem skill's hard gate cannot be satisfied. This reference unblocks the pipeline by rendering Figma node screenshots directly.

## When to use

Use ONLY when:
- Frontend ticket has no `figma-spec-*.json` attachments
- Ticket description still has per-resolution Figma node URLs
- User explicitly overrides the hard gate (e.g. "use attached UI snippets, replicate them perfectly")

Otherwise halt and request JSON specs via `/ba-reply`.

## Step 1: Render screenshots via Figma REST API

Extract the `FILE_KEY` from any ticket Figma URL (`https://www.figma.com/file/<FILE_KEY>?node-id=...`). Collect node IDs in `id-id-id` format from the same URLs (`?node-id=60-3125` becomes `60:3125`).

```bash
FIGMA_API_KEY=$(grep '^FIGMA_API_KEY=' ~/.env | cut -d'=' -f2- | tr -d '"'"'"'')
FILE_KEY="mkozkfJX2EGUIFcbl43EuD"  # from ticket Figma URLs
IDS="60:3125,139:6239,4459:4,4460:1786,139:7903,89:4284,139:6688,4459:394,4460:2543,139:8345"

curl -s -H "X-Figma-Token: $FIGMA_API_KEY" \
  "https://api.figma.com/v1/images/${FILE_KEY}?ids=${IDS}&format=png&scale=2" | python3 -m json.tool
```

Returns `node_id -> temporary S3 PNG URL`. If 429, wait 60s and retry; do not loop tightly. Download immediately — S3 URLs expire quickly.

## Step 2: Download and attach to JIRA

Download each rendered PNG immediately (S3 URLs expire). Attach to the ticket with the developer account credentials. If the MCP server or another client returns "Issue does not exist or you do not have permission", switch to a direct JIRA REST call using the dev account email/token from `~/.env`:

```bash
JIRA_EMAIL=$(grep '^JIRA_EMAIL=' ~/.env | cut -d'=' -f2- | tr -d '"'"'"'')
JIRA_API_KEY=$(grep '^JIRA_API_KEY=' ~/.env | cut -d'=' -f2- | tr -d '"'"'"'')
KEY="KAN-12"
FILE="/tmp/screenshot-1920-navigation.png"

curl -s -X POST "https://{{ATLASSIAN_SITE}}/rest/api/3/issue/${KEY}/attachments" \
  -u "${JIRA_EMAIL}:${JIRA_API_KEY}" \
  -H "X-Atlassian-Token: no-check" \
  -F "file=@${FILE};filename=$(basename ${FILE});type=image/png"
```

One screenshot per (resolution × section) pair. Verify count matches expected.

See `references/jira-rest-attachment-upload.md` for full credential/debugging notes.

## Step 3: Extract visual details

Use `vision_analyze` or `@mainDevAgentVision` (background PTY with llama3.2-vision) to extract exact text strings, colors, layout, and states from the screenshots.

## Step 4: Flag the gap in instructions.txt

Build the required resolution table but set status to MISSING and point at the attached PNG screenshot filenames. Do not fabricate JSON specs.

## Step 5: Dispatch Frontend Developer sub-agent

Include in sub-agent context:
- Exact visible strings from screenshots
- DESIGN THEME (background, text, accent colors)
- Clear statement that screenshots are source of truth, JSON specs unavailable

## Pitfalls

- Mobile node IDs may render wrong section; use desktop as primary source.
- Figma image URLs expire quickly — download and attach immediately.
- Do not create fake JSON files.
- JIRA attachment upload can fail with "Issue does not exist" when the wrong JIRA account is used. The MCP server and REST API may resolve different identities; use the dev account email/token explicitly (see Step 2).
- Some Figma node IDs for mobile breakpoints may point to page content instead of the target section; visually verify each downloaded PNG before treating it as source of truth.

## Related

- `references/jira-rest-attachment-upload.md` — direct REST fallback when MCP attachment tools fail or use the wrong JIRA identity
- `references/figma-pixel-sampling.md` — PIL color fallback when vision is unavailable
- `cached-json-fallback.md` (business-analyst-workflow) — extract from `/tmp/figma_full.json`
