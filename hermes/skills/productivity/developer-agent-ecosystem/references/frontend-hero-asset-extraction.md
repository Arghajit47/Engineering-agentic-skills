# Frontend Hero Section Asset Extraction Checklist

Use this checklist when preparing a [Frontend] Home Page Hero Section ticket (or any large Frontend section with many Figma assets) before dispatching the Frontend Developer sub-agent.

## Required pre-sub-agent artifacts

| Artifact | How to obtain | Where to place |
|----------|---------------|----------------|
| Full-frame screenshot of the section | `curl -s http://localhost:47291/api/node/{section-node-id}/screenshot -o /tmp/{key}-section.png` | Attach to JIRA + copy to repo root for sub-agent |
| **Style spec (CSS)** | `curl -s "http://localhost:47291/api/node/{section-node-id}/css?format=text" -o /tmp/{key}.css` | **Paste real values into `instructions.txt`** — never let the sub-agent guess styling |
| **Structured context** | `curl -s "http://localhost:47291/api/node/{section-node-id}/context" -o /tmp/{key}-context.json` | Auto-layout → flexbox, sizing, type metrics, token + component names |
| **Design tokens** | `curl -s "http://localhost:47291/api/variables?format=css" -o /tmp/design-tokens.css` | Quote token names instead of raw hex |
| Scene tree JSON | `curl -s http://localhost:47291/api/document -o /tmp/{key}_doc.json` | Attach to JIRA + make path known to sub-agent |
| List of text nodes and dimensions | Parse `/api/document` with a recursive walker | Include in execution plan |
| All icon/logos/illustration SVGs | Sequential `GET /api/node/{id}/svg` loop | `public/assets/icons/` and `public/assets/illustrations/` |

## Sequential SVG export loop

```bash
mkdir -p public/assets/icons public/assets/illustrations

assets=(
  "5:86783:icon_hero_badge.svg:icons"
  "5:86740:icon_stat_1.svg:icons"
  "5:86748:icon_feature_1.svg:icons"
  "5:86751:icon_feature_2.svg:icons"
  "5:86755:icon_feature_3.svg:icons"
  "5:86761:icon_feature_4.svg:icons"
  "5:86805:abstract_design_hero_illustration.svg:illustrations"
  "71:1910:abstract_design_background_group.svg:illustrations"
)

for spec in "${assets[@]}"; do
  IFS=':' read -r node_id filename dir <<< "$spec"
  curl -s "http://localhost:47291/api/node/${node_id}/svg" \
    -o "public/assets/${dir}/${filename}"
  sleep 0.5
done
```

## Text extraction from scene tree

```python
import json

def extract_text(node, path=''):
    results = []
    name = node.get('name', '')
    text = node.get('text', '')
    full = (path + '/' + name).lstrip('/')
    if text:
        results.append((node.get('id'), full, text))
    for child in node.get('children', []):
        results.extend(extract_text(child, full))
    return results

with open('/tmp/bc19_doc.json') as f:
    d = json.load(f)

hero = find_hero_node(d['tree'], '5:86791')
for nid, full, text in extract_text(hero):
    print(f"[{nid}] {full}: {text}")
```

## Sub-agent preparation

Before dispatching the Frontend Developer sub-agent, copy the execution plan text into the repo root so the sub-agent can read it directly even if JIRA attachments are unreachable:

```bash
cp /tmp/frontend-instructions-bc19.txt $REPO_ROOT/frontend-instructions-bc19.txt
```

Then provide both the JIRA attachment name and the local file path in the sub-agent context, and tell the sub-agent to read the local file first if `web_extract` fails on JIRA attachments.

## Sanity checks before dispatch

- [ ] Every SVG is > 100 bytes and starts with `<svg`.
- [ ] The screenshot is a valid PNG (> 50 KB).
- [ ] The execution plan references the exact output paths (`/assets/icons/...`, `/assets/illustrations/...`).
- [ ] The repo copy of assets exists and is staged/committed so the sub-agent can see them.
- [ ] A repo-local copy of the instructions exists (e.g. `frontend-instructions-bc19.txt`) so the sub-agent is not blocked by JIRA attachment access.

## JIRA attachment gotcha

`mcp__jira__jira_upload_attachment` may report success but with a tiny `size` if the base64 payload is truncated. Always verify the returned size matches the file size. If it does not, use the Jira REST v2 multipart upload:

```bash
JIRA_API_KEY=$(grep '^JIRA_API_KEY=' ~/.env | cut -d= -f2- | tr -d '"')
JIRA_EMAIL=$(grep '^JIRA_EMAIL=' ~/.env | cut -d= -f2- | tr -d '"')

curl -s -u "$JIRA_EMAIL:$JIRA_API_KEY" \
  -H 'X-Atlassian-Token: no-check' \
  -X POST \
  'https://{{ATLASSIAN_SITE}}/rest/api/2/issue/{KEY}/attachments' \
  -F 'file=@/tmp/hero-section.png;filename=hero-section-local-ai-bridge.png'
```

Do not source `~/.env` inside a curl pipeline; read values into variables first.
